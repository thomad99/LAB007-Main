// AIMAIL backend: IMAP fetcher + API
const path = require('path');
const fs = require('fs');
const express = require('express');
const cron = require('node-cron');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const fetch = require('node-fetch');
const multer = require('multer');

const router = express.Router();

const DATA_DIR = process.env.AIMAIL_DATA_DIR || path.join(__dirname, 'aimail-data');
const STORE_PATH = path.join(DATA_DIR, 'aimail-store.json');
const LOGO_DIR = path.join(DATA_DIR, 'logos');
const SELF_ADDR = (process.env.MY_EMAIL_ADDRESS || '').toLowerCase();
const MAX_MESSAGES = parseInt(process.env.AIMAIL_MAX_MESSAGES || `${Number.MAX_SAFE_INTEGER}`, 10);
const MAX_FETCH_PER_CHANNEL = parseInt(process.env.AIMAIL_FETCH_MAX_PER_CHANNEL || `${Number.MAX_SAFE_INTEGER}`, 10);
const MAX_SENDER_SCAN = parseInt(process.env.AIMAIL_SENDER_SCAN_MAX || `${Number.MAX_SAFE_INTEGER}`, 10);
const SCAN_RECENT = parseInt(process.env.AIMAIL_SCAN_RECENT || '200', 10);
const EMAIL_TOSCAN = (process.env.EMAIL_TOSCAN || '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);
const BODY_MAX_CHARS = parseInt(process.env.AIMAIL_BODY_MAX_CHARS || '50000', 10); // cap body length per message

const POLL_SECONDS = parseInt(process.env.AIMAIL_POLL_SECONDS || '600', 10); // default 10 min

function getImapConfig(override = {}) {
  const host = override.host
    || process.env.IMAP_MAIL_SERVER
    || process.env.IMAP_EMAIL_SERVER     // user-provided variant
    || process.env.IMPAP_MAIL_SERVER;    // common typo
  const user = override.user || process.env.MY_EMAIL_ADDRESS;
  const pass = override.pass || process.env.MY_EMAIL_PASSWORD;
  const port = parseInt(override.port || process.env.IMAP_MAIL_PORT || '993', 10);
  const secure = typeof override.secure === 'boolean'
    ? override.secure
    : (process.env.IMAP_MAIL_SECURE || 'true').toLowerCase() !== 'false';
  const authMethod = (override.authMethod || process.env.IMAP_AUTH_METHOD || 'LOGIN').toUpperCase(); // preferred, but we will always try LOGIN first
  const missing = [];
  if (!host) missing.push('IMAP_MAIL_SERVER');
  if (!user) missing.push('MY_EMAIL_ADDRESS');
  if (!pass) missing.push('MY_EMAIL_PASSWORD');
  return { host, user, pass, port, secure, authMethod, missing };
}

function buildClient(cfg, method) {
  return new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass, method }
  });
}

async function authWithFallback(cfg) {
  // Force trying LOGIN first, then PLAIN. If user provided something else, try that last.
  const methods = ['LOGIN', 'PLAIN'];
  const preferred = cfg.authMethod || 'LOGIN';
  if (!methods.includes(preferred)) methods.push(preferred);

  let lastErr;
  for (const m of methods) {
    const client = buildClient(cfg, m);
    try {
      await client.connect();
      return { client, method: m };
    } catch (err) {
      lastErr = err;
      try { await client.logout(); } catch (_) {}
      if (err.authenticationFailed) {
        continue; // try next method
      } else {
        break; // non-auth error, break
      }
    }
  }
  throw lastErr || new Error('Authentication failed');
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(LOGO_DIR)) {
  fs.mkdirSync(LOGO_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, LOGO_DIR),
    filename: (req, file, cb) => {
      const id = (req.params.id || 'logo').replace(/[^a-z0-9._-]+/gi, '_').toLowerCase();
      const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
      cb(null, `${id}-${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

let store = {
  senders: {}
};

function loadStore() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    }
  } catch (err) {
    console.warn('AIMAIL: Failed to load store:', err.message);
  }
}

function saveStore() {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.warn('AIMAIL: Failed to save store:', err.message);
  }
}

function normalizeSenderId(address) {
  return (address || '').toLowerCase();
}

function defaultDisplay(address) {
  const domain = (address.split('@')[1] || '').toLowerCase();
  return domain ? `e-${domain}` : address;
}

function upsertMessage({ fromAddress, subject, date, body, messageId, unread, imapUid }) {
  if (!fromAddress || !messageId) return;
  const emailId = normalizeSenderId(fromAddress);
  const domain = (fromAddress.split('@')[1] || '').toLowerCase();
  if (!store.senders[emailId]) {
    store.senders[emailId] = {
      id: emailId,
      display: fromAddress,
      domain,
      logo: '/images/lab007 Icon.PNG',
      junk: false,
      favorite: false,
      emails: [],
      total: 0,
      lastDate: null
    };
  }
  const sender = store.senders[emailId];
  const exists = sender.emails.find(e => e.messageId === messageId);
  if (exists) return;
  sender.emails.push({
    id: messageId,
    messageId,
    from: fromAddress,
    isMine: SELF_ADDR && fromAddress.toLowerCase() === SELF_ADDR,
    subject: subject || '(no subject)',
    date: date ? new Date(date).toISOString() : new Date().toISOString(),
    body: body || '',
    mailbox: 'INBOX',
    imapUid: imapUid || null,
    favorite: false,
    unread: unread === true
  });
  sender.emails.sort((a, b) => new Date(b.date) - new Date(a.date));
  sender.total = Math.max(sender.total || 0, sender.emails.length);
  sender.lastDate = sender.emails.length ? new Date(sender.emails[0].date).getTime() : sender.lastDate;
  if (sender.emails.length > MAX_MESSAGES) {
    sender.emails = sender.emails.slice(0, MAX_MESSAGES);
  }
}

async function fetchMailboxOnce() {
  const cfg = getImapConfig();
  if (cfg.missing.length) {
    console.warn('AIMAIL: IMAP env vars missing; skipping fetch. Missing:', cfg.missing.join(', '));
    return;
  }
  let client, methodUsed;
  try {
    ({ client, method: methodUsed } = await authWithFallback(cfg));
    let lock = await client.getMailboxLock('INBOX');
    try {
      const seq = '*:1';
      let count = 0;
      for await (let msg of client.fetch(seq, { envelope: true, flags: true, internalDate: true, source: true }, { uid: true })) {
        const fromAddress = msg.envelope?.from?.[0]?.address || '';
        const subject = msg.envelope?.subject || '';
        const date = msg.internalDate || new Date();
        const unread = !msg.flags?.has('\\Seen');
        let bodyText = '';
        try {
          const parsed = await simpleParser(msg.source);
          bodyText = parsed.text || parsed.html || '';
        } catch (e) {
          bodyText = '';
        }
        if (bodyText.length > BODY_MAX_CHARS) bodyText = bodyText.slice(0, BODY_MAX_CHARS) + '…';
        const msgId = msg.envelope?.messageId || `uid-${msg.uid}`;
        upsertMessage({
          fromAddress,
          subject,
          date,
          body: bodyText,
          messageId: msgId,
          unread,
          imapUid: msg.uid || null
        });
        count += 1;
        if (count >= SCAN_RECENT) break;
      }
    } finally {
      lock.release();
    }
    saveStore();
    console.log(`AIMAIL: fetch complete (auth method ${methodUsed}).`);
  } catch (err) {
    console.warn('AIMAIL: IMAP fetch failed:', err.message);
  } finally {
    try { if (client) await client.logout(); } catch (_) {}
  }
}

async function fetchMessagesForSender(domainOrId) {
  const cfg = getImapConfig();
  if (cfg.missing.length) throw new Error('IMAP env vars missing');
  const client = (await authWithFallback(cfg)).client;
  const target = (domainOrId || '').toLowerCase().trim();
  if (!target) throw new Error('Empty target email');
  if (EMAIL_TOSCAN.length && !EMAIL_TOSCAN.includes(target)) throw new Error('Target not in EMAIL_TOSCAN allowlist');
  const messages = [];
  try {
    let lock = await client.getMailboxLock('INBOX');
    try {
      // Do three searches and union results to avoid IMAP OR syntax issues
      const uidsFrom = await client.search({ from: target }).catch(() => []);
      const uidsTo = await client.search({ to: target }).catch(() => []);
      const uidsCc = await client.search({ cc: target }).catch(() => []);
      const uids = Array.from(new Set([...(uidsFrom || []), ...(uidsTo || []), ...(uidsCc || [])]));
      const limited = MAX_FETCH_PER_CHANNEL && MAX_FETCH_PER_CHANNEL !== Number.MAX_SAFE_INTEGER
        ? (uids || []).slice(-MAX_FETCH_PER_CHANNEL)
        : (uids || []);
      for await (let msg of client.fetch(limited, { envelope: true, flags: true, internalDate: true, source: true }, { uid: true })) {
        const fromAddress = msg.envelope?.from?.[0]?.address || '';
        const subject = msg.envelope?.subject || '';
        const date = msg.internalDate || new Date();
        const unread = !msg.flags?.has('\\Seen');
        let bodyText = '';
        try {
          const parsed = await simpleParser(msg.source);
          bodyText = parsed.text || parsed.html || '';
        } catch (e) {
          bodyText = '';
        }
        if (bodyText.length > BODY_MAX_CHARS) bodyText = bodyText.slice(0, BODY_MAX_CHARS) + '…';
        const msgId = msg.envelope?.messageId || `uid-${msg.uid}`;
        messages.push({
          id: msgId,
          messageId: msgId,
          from: fromAddress,
          isMine: SELF_ADDR && fromAddress.toLowerCase() === SELF_ADDR,
          subject: subject || '(no subject)',
          date: date ? new Date(date).toISOString() : new Date().toISOString(),
          body: bodyText || '',
          mailbox: 'INBOX',
          imapUid: msg.uid || null,
          favorite: false,
          unread
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    try { await client.logout(); } catch (_) {}
  }
  messages.sort((a, b) => new Date(b.date) - new Date(a.date));
  return messages;
}

async function scanSendersEnvelope() {
  const cfg = getImapConfig();
  if (cfg.missing.length) throw new Error('IMAP env vars missing');
  const client = (await authWithFallback(cfg)).client;
  const counts = {};
  const order = [...EMAIL_TOSCAN];
  try {
    let lock = await client.getMailboxLock('INBOX');
    try {
      const allUids = await client.search({ all: true });
      const slice = (allUids || []).slice(-MAX_SENDER_SCAN);
      for await (let msg of client.fetch(slice, { envelope: true }, { uid: true })) {
        const fromAddress = msg.envelope?.from?.[0]?.address || '';
        const emailId = normalizeSenderId(fromAddress);
        if (EMAIL_TOSCAN.length && !EMAIL_TOSCAN.includes(emailId)) continue;
        counts[emailId] = (counts[emailId] || 0) + 1;
        if (!order.includes(emailId)) order.push(emailId);
      }
    } finally {
      lock.release();
    }
  } finally {
    try { await client.logout(); } catch (_) {}
  }
  // merge into store metadata (respect order)
  order.forEach((id) => {
    const total = counts[id] || 0;
    if (!store.senders[id]) {
      store.senders[id] = {
        id,
        display: id,
        domain: (id.split('@')[1] || '').toLowerCase(),
        logo: '/images/lab007 Icon.PNG',
        junk: false,
        favorite: false,
        emails: []
      };
    }
    store.senders[id].total = total;
    // update lastDate to keep sort usable
    const sender = store.senders[id];
    sender.lastDate = sender.emails.length
      ? Math.max(...sender.emails.map(e => new Date(e.date || 0).getTime()))
      : null;
  });
  saveStore();
  return Object.values(store.senders).map(s => ({
    id: s.id,
    display: s.display,
    domain: s.domain,
    logo: s.logo,
    junk: s.junk,
    favorite: !!s.favorite,
    unread: (s.emails || []).filter(e => e.unread).length,
    total: s.total || (s.emails ? s.emails.length : 0),
    lastDate: s.lastDate || null
  }));
}

async function testConnection(override = {}) {
  const cfg = getImapConfig(override);
  if (cfg.missing.length) {
    const err = new Error('IMAP env vars missing');
    err.missing = cfg.missing;
    throw err;
  }
  let client, methodUsed;
  try {
    ({ client, method: methodUsed } = await authWithFallback(cfg));
    let lock = await client.getMailboxLock('INBOX');
    try {
      const status = await client.status('INBOX', { messages: true, unseen: true });
      return { messages: status.messages || 0, unseen: status.unseen || 0, method: methodUsed };
    } finally {
      lock.release();
    }
  } finally {
    try { if (client) await client.logout(); } catch (_) {}
  }
}

async function runLlmSearch({ query, senderId }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  if (!query) throw new Error('Query is required');

  // Collect messages for context
  let messages = [];
  if (senderId) {
    const sender = store.senders[normalizeSenderId(senderId)];
    if (sender) messages = sender.emails || [];
  } else {
    // global: flatten all emails
    Object.values(store.senders).forEach(s => {
      (s.emails || []).forEach(e => messages.push({ ...e, senderId: s.id, senderDisplay: s.display }));
    });
  }

  // Sort newest first and limit to reduce token size
  messages = messages.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 50);

  const contextText = messages.map(m => {
    const fromLine = m.senderDisplay || m.senderId || '';
    return `From: ${fromLine}\nDate: ${m.date}\nSubject: ${m.subject}\nBody: ${m.body}\n---`;
  }).join('\n');

  const prompt = `
You are an assistant helping search email context. Answer based only on the email snippets below.
User query: "${query}"
Provide a concise answer and include any dates/companies/locations you find. If uncertain, say so.

Emails:
${contextText}
`;

  const body = {
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You summarize and search over provided emails. Do not invent facts.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 400,
    temperature: 0.2
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error HTTP ${res.status}: ${text}`);
  }
  const json = await res.json();
  const answer = json.choices?.[0]?.message?.content || '(no answer)';
  return { answer, used: messages.length };
}

// API routes
router.get('/channels', (req, res) => {
  const channels = Object.values(store.senders).map(s => {
    const unread = s.emails.filter(e => e.unread).length;
    const lastDate = s.emails.length ? Math.max(...s.emails.map(e => new Date(e.date || 0).getTime())) : (s.lastDate || null);
    return {
      id: s.id,
      display: s.display,
      domain: s.domain,
      logo: s.logo,
      junk: s.junk,
      favorite: !!s.favorite,
      unread,
      total: s.total || s.emails.length,
      lastDate
    };
  });
  res.json({ channels });
});

// Refresh channel list by scanning envelopes only
router.get('/channels/refresh', async (_req, res) => {
  try {
    const channels = await scanSendersEnvelope();
    res.json({ channels });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/channel/:id', (req, res) => {
  const id = normalizeSenderId(req.params.id);
  const sender = store.senders[id];
  if (!sender) return res.status(404).json({ error: 'Not found' });
  res.json(sender);
});

// Fetch messages on-demand for a channel (by domain/id)
router.get('/channel/:id/fetch', async (req, res) => {
  const id = normalizeSenderId(req.params.id);
  try {
    const messages = await fetchMessagesForSender(id);
    if (!store.senders[id]) {
      store.senders[id] = {
        id,
        display: `e-${id}`,
        domain: id,
        logo: '/images/lab007 Icon.PNG',
        junk: false,
        favorite: false,
        emails: []
      };
    }
    store.senders[id].emails = messages;
    store.senders[id].total = messages.length;
    store.senders[id].lastDate = messages.length ? Math.max(...messages.map(e => new Date(e.date || 0).getTime())) : null;
    saveStore();
    res.json(store.senders[id]);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/channel/:id/delete/:messageId', (req, res) => {
  const id = normalizeSenderId(req.params.id);
  const sender = store.senders[id];
  if (!sender) return res.status(404).json({ error: 'Not found' });
  const msgId = req.params.messageId;
  const msg = sender.emails.find(e => e.id === msgId);
  // Remove from store regardless
  sender.emails = sender.emails.filter(e => e.id !== msgId);
  saveStore();

  // Fire-and-forget IMAP delete
  (async () => {
    if (!msg) return;
    const cfg = getImapConfig();
    if (cfg.missing.length) return;
    let client, methodUsed;
    try {
      ({ client, method: methodUsed } = await authWithFallback(cfg));
      let lock = await client.getMailboxLock(msg.mailbox || 'INBOX');
      try {
        if (msg.imapUid) {
          await client.messageDelete(msg.imapUid, { uid: true });
        } else if (msg.messageId) {
          const uids = await client.search({ header: { 'message-id': msg.messageId } });
          if (uids && uids.length) {
            await client.messageDelete(uids, { uid: true });
          }
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      console.warn('AIMAIL: IMAP delete failed:', err.message);
    } finally {
      try { if (client) await client.logout(); } catch (_) {}
    }
  })();

  res.json({ ok: true });
});

router.post('/channel/:id/favorite/:messageId', (req, res) => {
  const id = normalizeSenderId(req.params.id);
  const sender = store.senders[id];
  if (!sender) return res.status(404).json({ error: 'Not found' });
  const msg = sender.emails.find(e => e.id === req.params.messageId);
  if (msg) {
    msg.favorite = !msg.favorite;
    saveStore();
  }
  res.json({ ok: true, favorite: msg ? msg.favorite : false });
});

router.post('/channel/:id/mark-read/:messageId', (req, res) => {
  const id = normalizeSenderId(req.params.id);
  const sender = store.senders[id];
  if (!sender) return res.status(404).json({ error: 'Not found' });
  const msg = sender.emails.find(e => e.id === req.params.messageId);
  if (msg) {
    msg.unread = false;
    saveStore();
  }
  res.json({ ok: true });
});

router.post('/channel/:id/config', (req, res) => {
  const id = normalizeSenderId(req.params.id);
  const sender = store.senders[id];
  if (!sender) return res.status(404).json({ error: 'Not found' });
  sender.display = req.body.display || sender.display;
  sender.logo = req.body.logo || sender.logo;
  if (typeof req.body.junk === 'boolean') sender.junk = req.body.junk;
   if (typeof req.body.favorite === 'boolean') sender.favorite = req.body.favorite;
  saveStore();
  res.json({ ok: true, sender });
});

// Upload channel logo
router.post('/channel/:id/logo', upload.single('file'), (req, res) => {
  try {
    const id = normalizeSenderId(req.params.id);
    const sender = store.senders[id];
    if (!sender) return res.status(404).json({ error: 'Not found' });
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const url = `/aimail-logos/${req.file.filename}`;
    sender.logo = url;
    saveStore();
    res.json({ ok: true, url });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/test-connection', async (req, res) => {
  try {
    const info = await testConnection(req.body || {});
    res.json({ ok: true, ...info });
  } catch (err) {
    const details = {
      ok: false,
      error: err.message,
      missing: err.missing || []
    };
    if (err.code) details.code = err.code;
    if (err.command) details.command = err.command;
    if (err.response) details.response = err.response;
    res.status(500).json(details);
  }
});

router.post('/llm-search', async (req, res) => {
  try {
    const { query, senderId } = req.body || {};
    const result = await runLlmSearch({ query, senderId });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Initialize
loadStore();
// Run initial fetch shortly after start
setTimeout(fetchMailboxOnce, 3000);
// Schedule periodic fetch
if (POLL_SECONDS > 0) {
  cron.schedule(`*/${Math.max(1, Math.floor(POLL_SECONDS / 60))} * * * *`, () => {
    fetchMailboxOnce();
  });
}

module.exports = {
  router,
  fetchMailboxOnce,
  testConnection
};
