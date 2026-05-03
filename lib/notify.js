/**
 * LAB007 outbound notifications (Telegram first; structured for more channels later).
 *
 * Render / production env (set in dashboard → Environment):
 *
 *   TELEGRAM_BOT_TOKEN   — from @BotFather (required for Telegram)
 *   TELEGRAM_CHAT_ID     — YOUR Telegram user id (digits, e.g. 123456789), or group/channel id.
 *                          Do NOT use your bot’s @username here — that causes “chat not found”.
 *                          DM your bot /start first; get your id from @userinfobot or @getidsbot.
 *   TELEGRAM_NOTIFICATIONS — optional: "0" | "false" | "off" to disable sends
 *
 * Public URLs in messages (clickable links from Telegram):
 *
 *   PUBLIC_BASE_URL      — preferred explicit site root, e.g. https://your-app.onrender.com
 *   RENDER_EXTERNAL_URL  — auto-set on Render; used if PUBLIC_BASE_URL is empty
 *   LAB007_PUBLIC_URL    — alternate fallback same meaning as PUBLIC_BASE_URL
 *
 * Other server routes can call notifyWorkstream({ ... }) when a job finishes.
 */

'use strict';

const fetchFn =
  global.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

function publicBaseUrl() {
  const raw = String(
    process.env.PUBLIC_BASE_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      process.env.LAB007_PUBLIC_URL ||
      ''
  ).trim();
  return raw.replace(/\/+$/, '');
}

function absoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return '';
  const s = String(pathOrUrl).trim();
  if (/^https?:\/\//i.test(s)) return s;
  const base = publicBaseUrl();
  if (!base) return s.startsWith('/') ? s : `/${s}`;
  const path = s.startsWith('/') ? s : `/${s}`;
  return `${base}${path}`;
}

function telegramNotificationsOff() {
  const v = String(process.env.TELEGRAM_NOTIFICATIONS || '').toLowerCase();
  return v === '0' || v === 'false' || v === 'off' || v === 'no';
}

function telegramToken() {
  return String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

function telegramChatIds() {
  const raw = String(process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!raw) return [];
  return raw.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
}

function isTelegramConfigured() {
  return Boolean(telegramToken() && telegramChatIds().length && !telegramNotificationsOff());
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(text) {
  return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function hintForTelegramSendFailure(description, chat_id) {
  const d = String(description || '').toLowerCase();
  const c = String(chat_id ?? '').trim();
  if (d.includes('chat not found')) {
    if (/^@\w+/i.test(c) || (c.length > 0 && !/^-?\d+$/.test(c))) {
      return (
        'TELEGRAM_CHAT_ID looks like a username, not your user id. Use your numeric id from @userinfobot — not your bot’s @name.'
      );
    }
    return 'Open Telegram, send /start to your bot, then use your numeric user id as TELEGRAM_CHAT_ID.';
  }
  if (d.includes('bot was blocked')) {
    return 'Unblock the bot in Telegram or use a different TELEGRAM_CHAT_ID.';
  }
  if (d.includes('have no rights') || d.includes('not enough rights')) {
    return 'Bot may lack permission in that group/channel.';
  }
  return '';
}

/**
 * Generic Telegram notification for any LAB007 workstream.
 *
 * @param {object} opts
 * @param {string} opts.source — Label shown in the header, e.g. "CursorAI", "GGPPI"
 * @param {string} opts.event — Short description, e.g. "Job complete", "Build failed"
 * @param {string} [opts.title] — Bold subtitle
 * @param {string[]} [opts.lines] — Extra detail lines (HTML-escaped)
 * @param {{ label: string, url?: string, path?: string }[]} [opts.links] — Links; use `path` for site-relative URLs
 */
async function notifyWorkstream(opts) {
  if (!isTelegramConfigured()) return { skipped: true, reason: 'not_configured' };

  const source = escapeHtml(opts.source || 'LAB007');
  const event = escapeHtml(opts.event || 'Notification');
  const title = opts.title ? escapeHtml(String(opts.title)) : '';

  const chunks = [`✅ <b>${source}</b> · ${event}`];
  if (title) chunks.push('', `<b>${title}</b>`);

  const lines = Array.isArray(opts.lines) ? opts.lines : [];
  for (const line of lines) {
    if (line != null && line !== '') chunks.push(escapeHtml(String(line)));
  }

  const links = Array.isArray(opts.links) ? opts.links : [];
  const base = publicBaseUrl();
  if (links.length) {
    chunks.push('');
    for (const link of links) {
      const rawUrl = link.url || link.path || '';
      const url = absoluteUrl(rawUrl);
      const label = escapeHtml(link.label || url || 'Link');
      if (url && /^https?:\/\//i.test(url)) {
        chunks.push(`• <a href="${escapeAttr(url)}">${label}</a>`);
      } else {
        chunks.push(`• ${label}: ${escapeHtml(url)}`);
      }
    }
  }

  if (!base && links.some((l) => l.path || (l.url && !/^https?:\/\//i.test(String(l.url || ''))))) {
    chunks.push(
      '',
      '<i>Add PUBLIC_BASE_URL or rely on RENDER_EXTERNAL_URL so links are clickable.</i>'
    );
  }

  const html = chunks.join('\n');
  return sendTelegramHtml(html);
}

async function sendTelegramHtml(html) {
  const token = telegramToken();
  const ids = telegramChatIds();
  if (!token || !ids.length || telegramNotificationsOff()) {
    return { skipped: true };
  }

  const apiUrl = `https://api.telegram.org/bot${token}/sendMessage`;
  const results = [];
  for (const chat_id of ids) {
    try {
      const res = await fetchFn(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id,
          text: html.slice(0, 4096),
          parse_mode: 'HTML',
          disable_web_page_preview: false
        })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.ok === false) {
        const errText = j.description || res.statusText || 'send failed';
        const hint = hintForTelegramSendFailure(errText, chat_id);
        console.error('[notify/telegram]', chat_id, errText + (hint ? ' → ' + hint : ''));
        results.push({ chat_id, ok: false, error: errText, hint });
      } else {
        results.push({ chat_id, ok: true });
      }
    } catch (e) {
      console.error('[notify/telegram]', chat_id, e.message);
      results.push({ chat_id, ok: false, error: e.message, hint: '' });
    }
  }
  return { skipped: false, results };
}

async function notifyCursorAiJobComplete({ kind, projectName, folderName, previewUrl }) {
  const displayName = String(projectName || folderName || '').trim();
  const previewAbs = absoluteUrl(previewUrl);
  const dashAbs = absoluteUrl('/cursorai/dashboard');

  const chunks = [
    '<b>LAB007-AI</b>',
    `Projectname : ${escapeHtml(displayName)}`,
    'Project Completed',
    ''
  ];

  if (previewAbs && /^https?:\/\//i.test(previewAbs)) {
    chunks.push(`<a href="${escapeAttr(previewAbs)}">Open preview</a>`);
  } else {
    chunks.push(`Open preview: ${escapeHtml(previewUrl)}`);
  }

  if (dashAbs && /^https?:\/\//i.test(dashAbs)) {
    chunks.push(`<a href="${escapeAttr(dashAbs)}">All Projects</a>`);
  } else {
    chunks.push(`All Projects: ${escapeHtml('/cursorai/dashboard')}`);
  }

  if (!publicBaseUrl()) {
    chunks.push('', '<i>Add PUBLIC_BASE_URL (or RENDER_EXTERNAL_URL) for clickable links.</i>');
  }

  return sendTelegramHtml(chunks.join('\n'));
}

/** Ping Telegram from the CursorAI UI to verify env vars and bot chat id. */
async function sendTelegramTest() {
  if (!isTelegramConfigured()) {
    return {
      ok: false,
      skipped: true,
      message:
        'Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID (and ensure TELEGRAM_NOTIFICATIONS is not off).'
    };
  }
  const iso = new Date().toISOString();
  const result = await notifyWorkstream({
    source: 'LAB007',
    event: 'Telegram test',
    title: 'Notifications OK',
    lines: [
      `Sent at ${iso}`,
      'If you see this, LAB007 → Telegram is wired correctly.'
    ],
    links: [{ label: 'CursorAI', path: '/cursorai' }]
  });
  if (result.skipped) {
    return { ok: false, skipped: true, message: 'Notification skipped unexpectedly.' };
  }
  const allOk = result.results && result.results.every((r) => r.ok);
  if (allOk) {
    return {
      ok: true,
      skipped: false,
      message: 'Test message sent — check your Telegram chat.',
      results: result.results
    };
  }
  const failed = (result.results || []).filter((r) => !r.ok);
  const first = failed[0] || {};
  let message =
    'Telegram error: ' + (first.error || 'delivery failed');
  if (first.hint) message += '. ' + first.hint;
  return {
    ok: false,
    skipped: false,
    message,
    results: result.results
  };
}

/**
 * Send a message to one chat (replies, inbound bot UX). Does not require TELEGRAM_CHAT_ID to match.
 * Ignores TELEGRAM_NOTIFICATIONS so operator replies still work when broadcast is muted.
 */
async function sendTelegramToChat(chatId, text, options = {}) {
  const token = telegramToken();
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN missing' };
  const apiUrl = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const payload = {
      chat_id: chatId,
      text: String(text).slice(0, 4096),
      disable_web_page_preview: options.disable_web_page_preview !== false
    };
    if (options.parse_mode) payload.parse_mode = options.parse_mode;
    const res = await fetchFn(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.ok === false) {
      const errText = j.description || res.statusText || 'send failed';
      console.error('[notify/telegram reply]', chatId, errText);
      return { ok: false, error: errText };
    }
    return { ok: true };
  } catch (e) {
    console.error('[notify/telegram reply]', chatId, e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = {
  publicBaseUrl,
  absoluteUrl,
  isTelegramConfigured,
  telegramChatIds,
  notifyWorkstream,
  notifyCursorAiJobComplete,
  sendTelegramTest,
  sendTelegramHtml,
  sendTelegramToChat
};
