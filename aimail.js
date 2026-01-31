// AIMAIL backend: IMAP fetcher + API
const path = require('path');
const fs = require('fs');
const express = require('express');
const cron = require('node-cron');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const router = express.Router();

const DATA_DIR = process.env.AIMAIL_DATA_DIR || path.join(__dirname, 'aimail-data');
const STORE_PATH = path.join(DATA_DIR, 'aimail-store.json');

// Accept common typo IMPAP_ for convenience
const IMAP_HOST = process.env.IMAP_MAIL_SERVER || process.env.IMPAP_MAIL_SERVER;
const IMAP_PORT = parseInt(process.env.IMAP_MAIL_PORT || '993', 10);
const IMAP_SECURE = (process.env.IMAP_MAIL_SECURE || 'true').toLowerCase() !== 'false';
const IMAP_USER = process.env.MY_EMAIL_ADDRESS;
const IMAP_PASS = process.env.MY_EMAIL_PASSWORD;
const POLL_SECONDS = parseInt(process.env.AIMAIL_POLL_SECONDS || '600', 10); // default 10 min

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
  if (!IMAP_HOST || !IMAP_USER || !IMAP_PASS) {
    console.warn('AIMAIL: IMAP env vars missing; skipping fetch.');
    return;
  }
  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: IMAP_SECURE,
    auth: { user: IMAP_USER, pass: IMAP_PASS }
  });
  try {
    await client.connect();
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
    console.log('AIMAIL: fetch complete.');
  } catch (err) {
    console.warn('AIMAIL: IMAP fetch failed:', err.message);
  } finally {
    try { await client.logout(); } catch (_) {}
  }
}

async function testConnection() {
  if (!IMAP_HOST || !IMAP_USER || !IMAP_PASS) throw new Error('IMAP env vars missing');
  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: IMAP_SECURE,
    auth: { user: IMAP_USER, pass: IMAP_PASS }
  });
  try {
    await client.connect();
    let lock = await client.getMailboxLock('INBOX');
    try {
      const status = await client.status('INBOX', { messages: true, unseen: true });
      return { messages: status.messages || 0, unseen: status.unseen || 0 };
    } finally {
      lock.release();
    }
  } finally {
    try { await client.logout(); } catch (_) {}
  }
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
