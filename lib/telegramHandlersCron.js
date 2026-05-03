/**
 * Telegram commands for LAB007 scheduled jobs (cron → Telegram feedback).
 * Register: registerCronTelegramHandlers(registerTelegramInboundHandler)
 */

'use strict';

const crypto = require('crypto');
const { addJob, readJobs, removeJob } = require('./scheduledJobsStore');
const { reloadScheduledJobs } = require('./scheduledJobsRunner');

const HELP = `LAB007 <b>Scheduled jobs</b>

<b>/cron_news TIME [timezone]</b>
Daily top headlines (RSS) at clock time.
• TIME = HH:MM (24h), e.g. 07:00
• timezone = optional IANA name, e.g. America/New_York
  (defaults to CRON_DEFAULT_TIMEZONE or UTC)

<b>/cron_list</b>
Jobs you created in this chat.

<b>/cron_remove JOB_ID</b>
Remove by id from /cron_list.

Feeds: set NEWS_RSS_URLS (comma URLs) on the server to customize sources.`;

function normalizeCmd(line) {
  return line.replace(/^\/([a-zA-Z0-9_]+)(@[a-zA-Z0-9_]+)?/i, '/$1');
}

function parseDailyTime(tokens) {
  if (tokens.length < 2) return null;
  const timeTok = tokens[1];
  const tm = timeTok.match(/^(\d{1,2}):(\d{2})$/);
  if (!tm) return null;
  const h = parseInt(tm[1], 10);
  const m = parseInt(tm[2], 10);
  if (h > 23 || m > 59 || Number.isNaN(h) || Number.isNaN(m)) return null;
  const tzExtra = tokens.slice(2).join(' ').trim();
  const timezone =
    tzExtra ||
    String(process.env.CRON_DEFAULT_TIMEZONE || '').trim() ||
    'UTC';
  return { hour: h, minute: m, timezone };
}

async function handleCronTelegram(ctx) {
  const raw = ctx.text.trim();
  if (!raw.startsWith('/')) return false;

  const lines = raw.split(/\r?\n/);
  const first = lines[0].trim();
  const line = normalizeCmd(first);
  const tokens = line.split(/\s+/).filter(Boolean);

  if (/^\/(cron_help|schedule_help)$/i.test(tokens[0])) {
    await ctx.replyHtml(HELP);
    return true;
  }

  if (/^\/cron_list$/i.test(tokens[0])) {
    const mine = readJobs().filter((j) => String(j.telegramChatId) === String(ctx.chatId));
    if (!mine.length) {
      await ctx.reply('No scheduled jobs for this chat. Use /cron_news 07:00');
      return true;
    }
    const rows = mine.map((j) => {
      const head = j.taskType === 'news_headlines' ? '📰 news' : j.taskType;
      return `• <code>${escapeHtml(j.id)}</code>\n  ${escapeHtml(j.label || '')} — ${escapeHtml(
        j.cronExpr
      )} (${escapeHtml(j.timezone || 'UTC')}) ${head}`;
    });
    await ctx.replyHtml(`<b>Your schedules</b>\n\n${rows.join('\n\n')}`.slice(0, 4000));
    return true;
  }

  if (/^\/cron_remove$/i.test(tokens[0])) {
    const id = tokens[1];
    if (!id) {
      await ctx.reply('Usage: /cron_remove JOB_ID');
      return true;
    }
    const jobs = readJobs();
    const job = jobs.find((j) => j.id === id);
    if (!job) {
      await ctx.reply('Job id not found.');
      return true;
    }
    if (String(job.telegramChatId) !== String(ctx.chatId)) {
      await ctx.reply('You can only remove jobs created in this chat.');
      return true;
    }
    removeJob(id);
    reloadScheduledJobs();
    await ctx.reply('Removed. Scheduler reloaded.');
    return true;
  }

  if (/^\/cron_news$/i.test(tokens[0])) {
    const parsed = parseDailyTime(tokens);
    if (!parsed) {
      await ctx.reply('Usage: /cron_news HH:MM [timezone]\nExample: /cron_news 07:00 America/New_York');
      return true;
    }
    const { hour, minute, timezone } = parsed;
    const cronExpr = `${minute} ${hour} * * *`;
    const label = `Daily news ${String(hour).padStart(2, '0')}:${String(minute).padStart(
      2,
      '0'
    )} ${timezone}`;
    const job = {
      id: crypto.randomUUID(),
      enabled: true,
      label,
      cronExpr,
      timezone,
      taskType: 'news_headlines',
      taskOptions: { count: 3 },
      telegramChatId: String(ctx.chatId),
      createdAt: new Date().toISOString()
    };
    addJob(job);
    reloadScheduledJobs();
    await ctx.reply(
      `Scheduled: ${label}\nCron: ${cronExpr}\nId: ${job.id}\n/cron_list to view, /cron_remove ${job.id} to cancel.`
    );
    return true;
  }

  if (/^\/cron_/i.test(tokens[0])) {
    await ctx.reply('Unknown command. Try /cron_help');
    return true;
  }

  return false;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function registerCronTelegramHandlers(register) {
  register(handleCronTelegram);
}

module.exports = { registerCronTelegramHandlers, HELP };
