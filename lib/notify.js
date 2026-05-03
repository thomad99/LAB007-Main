/**
 * LAB007 outbound notifications (Telegram first; structured for more channels later).
 *
 * Render / production env (set in dashboard → Environment):
 *
 *   TELEGRAM_BOT_TOKEN   — from @BotFather (required for Telegram)
 *   TELEGRAM_CHAT_ID     — your user id, group id, or comma-separated list (required)
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
        console.error('[notify/telegram]', chat_id, j.description || res.statusText);
        results.push({ chat_id, ok: false });
      } else {
        results.push({ chat_id, ok: true });
      }
    } catch (e) {
      console.error('[notify/telegram]', e.message);
      results.push({ chat_id, ok: false });
    }
  }
  return { skipped: false, results };
}

async function notifyCursorAiJobComplete({ kind, projectName, folderName, previewUrl }) {
  const event = kind === 'updated' ? 'Project updated' : 'Project created';
  return notifyWorkstream({
    source: 'CursorAI',
    event,
    title: projectName || folderName,
    lines: [`Folder: ${folderName}`],
    links: [
      { label: 'Open preview', path: previewUrl },
      { label: 'All projects', path: '/cursorai/dashboard' },
      { label: 'CursorAI', path: '/cursorai' }
    ]
  });
}

module.exports = {
  publicBaseUrl,
  absoluteUrl,
  isTelegramConfigured,
  notifyWorkstream,
  notifyCursorAiJobComplete,
  sendTelegramHtml
};
