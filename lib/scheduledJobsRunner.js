/**
 * Runs persisted jobs on cron schedules (node-cron). Env:
 *   SCHEDULED_JOBS_ENABLED — optional "0"|"false"|"off" to disable all timers
 *   CRON_DEFAULT_TIMEZONE — fallback IANA zone when a job has no timezone (default UTC)
 *
 * Task types (extend TASK_RUNNERS):
 *   news_headlines — lib/tasks/newsHeadlinesTask.js
 */

'use strict';

const cron = require('node-cron');
const { readJobs, jobsFilePath } = require('./scheduledJobsStore');
const { sendTelegramToChat } = require('./notify');
const { runNewsHeadlinesTask } = require('./tasks/newsHeadlinesTask');

const scheduled = new Map();

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

async function executeTask(job) {
  const chatId = job.telegramChatId;
  if (chatId == null || chatId === '') {
    console.warn('[scheduledJobs] job missing telegramChatId', job.id);
    return;
  }

  if (job.taskType === 'news_headlines') {
    const items = await runNewsHeadlinesTask(job.taskOptions || {});
    const lines = items.map((it, i) => {
      const n = i + 1;
      if (it.link && /^https?:\/\//i.test(it.link)) {
        return `${n}. <a href="${escapeAttr(it.link)}">${escapeHtml(it.title)}</a>`;
      }
      return `${n}. ${escapeHtml(it.title)}`;
    });
    const header = `<b>📰 Headlines</b>` + (job.label ? `\n<i>${escapeHtml(job.label)}</i>` : '');
    const html = `${header}\n\n${lines.join('\n')}`;
    await sendTelegramToChat(chatId, html.slice(0, 4096), { parse_mode: 'HTML' });
    return;
  }

  console.warn('[scheduledJobs] unknown taskType', job.taskType, job.id);
}

function stopAll() {
  for (const [, task] of scheduled) {
    try {
      task.stop();
    } catch {
      /* ignore */
    }
  }
  scheduled.clear();
}

function startScheduledJobsRunner() {
  stopAll();
  if (String(process.env.SCHEDULED_JOBS_ENABLED || '').match(/^(0|false|off|no)$/i)) {
    console.log('[scheduledJobs] disabled (SCHEDULED_JOBS_ENABLED)');
    return;
  }

  const jobs = readJobs();
  let n = 0;
  for (const job of jobs) {
    if (!job.enabled || !job.cronExpr) continue;
    const tz =
      job.timezone ||
      String(process.env.CRON_DEFAULT_TIMEZONE || '').trim() ||
      'UTC';
    try {
      if (typeof cron.validate === 'function' && !cron.validate(job.cronExpr)) {
        console.error('[scheduledJobs] invalid cron expression', job.id, job.cronExpr);
        continue;
      }
      const task = cron.schedule(
        job.cronExpr,
        async () => {
          try {
            console.log('[scheduledJobs] tick', job.id, job.taskType);
            await executeTask(job);
          } catch (e) {
            console.error('[scheduledJobs] job error', job.id, e.message);
            try {
              await sendTelegramToChat(
                job.telegramChatId,
                `❌ Scheduled job failed\n<b>${escapeHtml(job.label || job.id)}</b>\n${escapeHtml(e.message || String(e))}`.slice(
                  0,
                  4096
                ),
                { parse_mode: 'HTML' }
              );
            } catch {
              /* ignore */
            }
          }
        },
        { timezone: tz }
      );
      scheduled.set(job.id, task);
      n++;
    } catch (e) {
      console.error('[scheduledJobs] schedule failed', job.id, e.message);
    }
  }
  console.log('[scheduledJobs]', n, 'active job(s); store:', jobsFilePath());
}

function reloadScheduledJobs() {
  startScheduledJobsRunner();
}

module.exports = {
  startScheduledJobsRunner,
  reloadScheduledJobs,
  executeTask
};
