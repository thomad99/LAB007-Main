// AIMAIL backend: IMAP fetcher + API
const path = require('path');
const fs = require('fs');
const express = require('express');
const cron = require('node-cron');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const fetch = require('node-fetch');

const router = express.Router();

const DATA_DIR = process.env.AIMAIL_DATA_DIR || path.join(__dirname, 'aimail-data');
const STORE_PATH = path.join(DATA_DIR, 'aimail-store.json');

const POLL_SECONDS = parseInt(process.env.AIMAIL_POLL_SECONDS || '600', 10); // default 10 min

function getImapConfig() {
  const host = process.env.IMAP_MAIL_SERVER
    || process.env.IMAP_EMAIL_SERVER     // user-provided variant
    || process.env.IMPAP_MAIL_SERVER;    // common typo
  const user = process.env.MY_EMAIL_ADDRESS;
  const pass = process.env.MY_EMAIL_PASSWORD;
  const port = parseInt(process.env.IMAP_MAIL_PORT || '993', 10);
  const secure = (process.env.IMAP_MAIL_SECURE || 'true').toLowerCase() !== 'false';
  const authMethod = (process.env.IMAP_AUTH_METHOD || 'LOGIN').toUpperCase(); // LOGIN by default
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
  const methods = [];
  const preferred = cfg.authMethod || 'LOGIN';
  methods.push(preferred);
  if (!methods.includes('LOGIN')) methods.push('LOGIN');
  if (!methods.includes('PLAIN')) methods.push('PLAIN');

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

function upsertMessage({ fromAddress, subject, date, body, messageId, unread }) {
  if (!fromAddress || !messageId) return;
  const id = normalizeSenderId(fromAddress);
  if (!store.senders[id]) {
    const domain = (fromAddress.split('@')[1] || '').toLowerCase();
    store.senders[id] = {
      id,
      display: defaultDisplay(fromAddress),
      domain,
      logo: '/images/lab007 Icon.PNG',
      junk: false,
      emails: []
    };
  }
  const sender = store.senders[id];
  const exists = sender.emails.find(e => e.messageId === messageId);
  if (exists) return;
  sender.emails.push({
    id: messageId,
    messageId,
    subject: subject || '(no subject)',
    date: date ? new Date(date).toISOString() : new Date().toISOString(),
    body: body || '',
    favorite: false,
    unread: unread === true
  });
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
      // Limit to recent N to avoid huge first sync; adjust as needed
      const seq = '*:1';
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
        const msgId = msg.envelope?.messageId || `uid-${msg.uid}`;
        upsertMessage({
          fromAddress,
          subject,
          date,
          body: bodyText,
          messageId: msgId,
          unread
        });
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

async function testConnection() {
  const cfg = getImapConfig();
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
    return {
      id: s.id,
      display: s.display,
      domain: s.domain,
      logo: s.logo,
      junk: s.junk,
      unread,
      total: s.emails.length
    };
  });
  res.json({ channels });
});

router.get('/channel/:id', (req, res) => {
  const id = normalizeSenderId(req.params.id);
  const sender = store.senders[id];
  if (!sender) return res.status(404).json({ error: 'Not found' });
  res.json(sender);
});

router.post('/channel/:id/delete/:messageId', (req, res) => {
  const id = normalizeSenderId(req.params.id);
  const sender = store.senders[id];
  if (!sender) return res.status(404).json({ error: 'Not found' });
  sender.emails = sender.emails.filter(e => e.id !== req.params.messageId);
  saveStore();
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
  saveStore();
  res.json({ ok: true, sender });
});

router.post('/test-connection', async (_req, res) => {
  try {
    const info = await testConnection();
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
