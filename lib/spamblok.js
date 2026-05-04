/**
 * SPAMBLOK — scan inbox for List-Unsubscribe headers and bulk-unsubscribe.
 * Env: SPAMBLOK_IMAP_* / SPAMBLOK_SMTP_* or Render-style IMAP_EMAIL_SERVER + IMAP_MAIL_PORT +
 * MY_EMAIL_ADDRESS + MY_EMAIL_PASSWORD (or IMAP_MAIL_SERVER / IMAP_* / SMTP_* / etc.).
 */

const path = require('path');
const express = require('express');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');

function imapAuthUser() {
  return (
    String(process.env.SPAMBLOK_IMAP_USER || '').trim() ||
    String(process.env.IMAP_USER || '').trim() ||
    String(process.env.MY_EMAIL_ADDRESS || '').trim()
  );
}

function imapAuthPass() {
  return (
    String(process.env.SPAMBLOK_IMAP_PASSWORD || '').trim() ||
    String(process.env.IMAP_PASSWORD || '').trim() ||
    String(process.env.MY_EMAIL_PASSWORD || '').trim()
  );
}

function buildImapConfig() {
  const host =
    String(process.env.SPAMBLOK_IMAP_HOST || '').trim() ||
    String(process.env.IMAP_HOST || '').trim() ||
    String(process.env.IMAP_EMAIL_SERVER || '').trim() ||
    String(process.env.IMAP_MAIL_SERVER || '').trim();
  const port = parseInt(
    process.env.SPAMBLOK_IMAP_PORT ||
      process.env.IMAP_MAIL_PORT ||
      process.env.IMAP_EMAIL_PORT ||
      process.env.IMAP_PORT ||
      '993',
    10
  );
  const secure = (process.env.SPAMBLOK_IMAP_SECURE || process.env.IMAP_MAIL_SECURE || process.env.IMAP_SECURE || 'true')
    .toLowerCase() !== 'false';

  return {
    host,
    port,
    secure,
    auth: {
      user: imapAuthUser(),
      pass: imapAuthPass(),
    },
    logger: false,
  };
}

function buildSmtpConfig() {
  const host =
    String(process.env.SPAMBLOK_SMTP_HOST || '').trim() ||
    String(process.env.SMTP_HOST || '').trim();
  const port = parseInt(process.env.SPAMBLOK_SMTP_PORT || process.env.SMTP_PORT || '587', 10);
  const secureRaw = process.env.SPAMBLOK_SMTP_SECURE || process.env.SMTP_SECURE || 'false';
  const secure = secureRaw === 'true' || secureRaw === '1';

  const user =
    String(process.env.SPAMBLOK_SMTP_USER || '').trim() ||
    String(process.env.SMTP_USER || '').trim() ||
    imapAuthUser();
  const pass =
    String(process.env.SPAMBLOK_SMTP_PASSWORD || '').trim() ||
    String(process.env.SMTP_PASSWORD || '').trim() ||
    String(process.env.SMTP_PASS || '').trim() ||
    imapAuthPass();

  return {
    host,
    port,
    secure,
    auth: { user, pass },
  };
}

let lastScan = { mailbox: null, scannedAt: null, items: [] };

function parseListUnsubscribe(headerValue) {
  if (!headerValue) return { http: [], mailto: [] };
  const result = { http: [], mailto: [] };
  const matches = headerValue.match(/<([^>]+)>/g) || [];
  for (const m of matches) {
    const url = m.slice(1, -1).trim();
    if (url.toLowerCase().startsWith('mailto:')) {
      try {
        const noScheme = url.slice(7);
        const [addr, query = ''] = noScheme.split('?');
        const params = new URLSearchParams(query);
        result.mailto.push({
          address: decodeURIComponent(addr),
          subject: params.get('subject') || 'unsubscribe',
          body: params.get('body') || 'unsubscribe',
        });
      } catch {
        /* ignore */
      }
    } else if (/^https?:/i.test(url)) {
      result.http.push(url);
    }
  }
  return result;
}

function extractDomain(emailAddress) {
  if (!emailAddress) return '';
  const match = emailAddress.match(/@([^>\s]+)/);
  return match ? match[1].toLowerCase() : '';
}

function parseFromHeader(fromRaw) {
  if (!fromRaw) return { name: '', address: '' };
  if (typeof fromRaw === 'object' && fromRaw.value && fromRaw.value[0]) {
    return {
      name: fromRaw.value[0].name || '',
      address: fromRaw.value[0].address || '',
    };
  }
  const match = String(fromRaw).match(/(?:"?([^"<]*)"?\s)?<?([^>\s]+@[^>\s]+)>?/);
  return {
    name: match ? (match[1] || '').trim() : '',
    address: match ? match[2].trim() : '',
  };
}

async function scanMailbox(cfg, mailbox = 'INBOX', limit = 500) {
  const client = new ImapFlow(cfg);
  await client.connect();

  const items = [];
  const seenSenders = new Map();

  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const status = client.mailbox;
      const total = status.exists;
      if (!total) return [];

      const start = Math.max(1, total - limit + 1);
      const range = `${start}:${total}`;

      for await (const msg of client.fetch(range, {
        envelope: true,
        headers: ['list-unsubscribe', 'list-unsubscribe-post', 'from'],
        uid: true,
      })) {
        const headerBuf = msg.headers;
        if (!headerBuf) continue;
        const headerStr = headerBuf.toString('utf8');

        const luMatch = headerStr.match(/^list-unsubscribe:\s*([\s\S]*?)(?=\r?\n[a-zA-Z-]+:|\r?\n\r?\n|$)/im);
        if (!luMatch) continue;

        const luValue = luMatch[1].replace(/\r?\n\s+/g, ' ').trim();
        const unsub = parseListUnsubscribe(luValue);
        if (unsub.http.length === 0 && unsub.mailto.length === 0) continue;

        const oneClick = /one-click/i.test(headerStr.match(/list-unsubscribe-post:\s*([^\r\n]+)/i)?.[1] || '');

        const from = parseFromHeader(msg.envelope?.from?.[0] || null);
        const senderAddr = from.address.toLowerCase();
        if (!senderAddr) continue;

        if (seenSenders.has(senderAddr)) continue;
        seenSenders.set(senderAddr, true);

        items.push({
          uid: msg.uid,
          senderName: from.name || senderAddr.split('@')[0],
          senderAddress: senderAddr,
          domain: extractDomain(senderAddr),
          subject: msg.envelope?.subject || '(no subject)',
          date: msg.envelope?.date || null,
          httpLinks: unsub.http,
          mailtoLinks: unsub.mailto,
          oneClick,
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  items.sort((a, b) => a.domain.localeCompare(b.domain));
  return items;
}

async function unsubscribeHttp(item) {
  const url = item.httpLinks[0];
  if (!url) throw new Error('No HTTP link');

  if (item.oneClick) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    return { ok: res.ok, status: res.status, method: 'POST one-click', url };
  }

  const res = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  return {
    ok: res.ok,
    status: res.status,
    method: 'GET (may need manual confirmation)',
    url,
  };
}

let smtpTransporter = null;

function getSmtp(smtpCfg) {
  if (!smtpTransporter && smtpCfg.host) {
    smtpTransporter = nodemailer.createTransport(smtpCfg);
  }
  return smtpTransporter;
}

async function unsubscribeMailto(item, smtpCfg) {
  const m = item.mailtoLinks[0];
  if (!m) throw new Error('No mailto link');
  const transporter = getSmtp(smtpCfg);
  if (!transporter) throw new Error('SMTP not configured (set SMTP_HOST or SPAMBLOK_SMTP_HOST)');

  const info = await transporter.sendMail({
    from: smtpCfg.auth.user,
    to: m.address,
    subject: m.subject,
    text: m.body,
  });
  return { ok: true, method: 'mailto', to: m.address, messageId: info.messageId };
}

async function unsubscribeOne(item, smtpCfg) {
  try {
    if (item.httpLinks.length > 0) {
      return await unsubscribeHttp(item);
    }
    if (item.mailtoLinks.length > 0) {
      return await unsubscribeMailto(item, smtpCfg);
    }
    return { ok: false, error: 'No unsubscribe method available' };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

function registerSpamblokRoutes(app) {
  const IMAP_CONFIG = buildImapConfig();
  const SMTP_CONFIG = buildSmtpConfig();

  app.get('/spamblok/api/health', (req, res) => {
    res.json({
      ok: true,
      name: 'SPAMBLOK',
      imapConfigured: Boolean(IMAP_CONFIG.host && IMAP_CONFIG.auth.user && IMAP_CONFIG.auth.pass),
      smtpConfigured: Boolean(SMTP_CONFIG.host),
    });
  });

  app.post('/spamblok/api/scan', async (req, res) => {
    if (!IMAP_CONFIG.host || !IMAP_CONFIG.auth.user || !IMAP_CONFIG.auth.pass) {
      return res.status(400).json({
        error:
          'IMAP not configured. On Render use IMAP_EMAIL_SERVER, IMAP_MAIL_PORT (optional), MY_EMAIL_ADDRESS, MY_EMAIL_PASSWORD — or SPAMBLOK_IMAP_* / IMAP_* / IMAP_MAIL_SERVER.',
      });
    }
    const mailbox = (req.body && req.body.mailbox) || 'INBOX';
    const limit = Math.min(parseInt(req.body?.limit || '500', 10), 5000);
    try {
      const items = await scanMailbox(IMAP_CONFIG, mailbox, limit);
      lastScan = { mailbox, scannedAt: new Date().toISOString(), items };
      res.json(lastScan);
    } catch (err) {
      console.error('[SPAMBLOK] Scan error:', err);
      res.status(500).json({ error: err.message || 'Scan failed' });
    }
  });

  app.post('/spamblok/api/unsubscribe', async (req, res) => {
    const uids = Array.isArray(req.body?.uids) ? req.body.uids : [];
    if (uids.length === 0) return res.status(400).json({ error: 'No items selected' });

    const targets = lastScan.items.filter((i) => uids.includes(i.uid));
    if (targets.length === 0) {
      return res.status(400).json({ error: 'No matching items in last scan — run Scan inbox first.' });
    }

    const results = [];
    for (const item of targets) {
      const r = await unsubscribeOne(item, SMTP_CONFIG);
      results.push({
        uid: item.uid,
        sender: item.senderAddress,
        domain: item.domain,
        ...r,
      });
    }
    res.json({ results });
  });

  // With Express default strict routing off, app.get('/spamblok') also matches /spamblok/ and
  // redirecting to /spamblok/ causes ERR_TOO_MANY_REDIRECTS. Only redirect bare /spamblok (no slash).
  app.use('/spamblok', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.url.startsWith('/')) return next();
    return res.redirect(302, '/spamblok/' + req.url);
  });
  app.use('/spamblok', express.static(path.join(__dirname, '..', 'public', 'spamblok')));

  console.log('[SPAMBLOK] Routes: /spamblok/ · API /spamblok/api/*');
}

module.exports = { registerSpamblokRoutes };
