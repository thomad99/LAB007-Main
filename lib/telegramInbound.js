/**
 * Reusable Telegram Bot webhook → command handlers.
 *
 * Env:
 *   TELEGRAM_WEBHOOK_SECRET — required; must match Telegram setWebhook secret_token
 *                             (sent as header X-Telegram-Bot-Api-Secret-Token)
 *   TELEGRAM_INBOUND_CHAT_IDS — optional comma-separated allowlist; if empty, uses TELEGRAM_CHAT_ID
 *   TELEGRAM_INBOUND_ENABLED — optional "0"|"false"|"off" to disable processing (webhook still 403 if secret wrong)
 *
 * Register handlers from any module:
 *   const { registerTelegramInboundHandler } = require('./telegramInbound');
 *   registerTelegramInboundHandler(async (ctx) => { ... return true if handled });
 *
 * ctx: { chatId, messageId, text, fromId, reply(t), replyHtml(h) }
 */

'use strict';

const { sendTelegramToChat, telegramChatIds } = require('./notify');

const handlers = [];

function inboundDisabled() {
  const v = String(process.env.TELEGRAM_INBOUND_ENABLED || '').toLowerCase();
  return v === '0' || v === 'false' || v === 'off' || v === 'no';
}

function allowedInboundChatIds() {
  const raw = String(process.env.TELEGRAM_INBOUND_CHAT_IDS || '').trim();
  if (raw) return raw.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
  return telegramChatIds();
}

function isInboundChatAllowed(chatId) {
  const allowed = allowedInboundChatIds();
  if (!allowed.length) return false;
  const id = String(chatId);
  return allowed.some((a) => String(a) === id);
}

function verifyTelegramWebhookSecret(req) {
  const secret = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (!secret) return false;
  const got = String(req.get('X-Telegram-Bot-Api-Secret-Token') || '').trim();
  return got === secret;
}

function registerTelegramInboundHandler(handlerFn) {
  if (typeof handlerFn !== 'function') return;
  handlers.push(handlerFn);
}

function buildCtx(message) {
  const chatId = message.chat.id;
  const text = message.text || message.caption || '';
  return {
    chatId,
    messageId: message.message_id,
    text: typeof text === 'string' ? text : '',
    fromId: message.from && message.from.id,
    reply: (t) => sendTelegramToChat(chatId, t),
    replyHtml: (h) => sendTelegramToChat(chatId, h, { parse_mode: 'HTML' })
  };
}

async function dispatchTelegramUpdate(update) {
  const msg = update.message || update.edited_message;
  if (!msg || !msg.chat) return;
  const text = msg.text || msg.caption;
  if (!text || typeof text !== 'string') return;

  const chatId = msg.chat.id;
  if (!isInboundChatAllowed(chatId)) {
    const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
    if (token) {
      await sendTelegramToChat(
        chatId,
        '⛔ This chat is not allowed to use LAB007 bot commands. Add its chat id to TELEGRAM_INBOUND_CHAT_IDS or TELEGRAM_CHAT_ID.'
      );
    }
    return;
  }

  const ctx = buildCtx(msg);
  for (const h of handlers) {
    try {
      const handled = await h(ctx);
      if (handled) return;
    } catch (e) {
      console.error('[telegram/inbound] handler error:', e);
      await ctx.reply(`❌ ${e.message || 'Error'}`);
      return;
    }
  }
}

function handleTelegramWebhookExpress(req, res) {
  if (!verifyTelegramWebhookSecret(req)) {
    return res.status(403).send('forbidden');
  }
  if (inboundDisabled()) {
    return res.status(200).json({ ok: true, skipped: true });
  }
  res.status(200).json({ ok: true });
  const body = req.body;
  setImmediate(() => {
    dispatchTelegramUpdate(body).catch((err) => console.error('[telegram/inbound]', err));
  });
}

module.exports = {
  registerTelegramInboundHandler,
  dispatchTelegramUpdate,
  verifyTelegramWebhookSecret,
  handleTelegramWebhookExpress,
  isInboundChatAllowed,
  allowedInboundChatIds
};
