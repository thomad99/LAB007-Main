/**
 * SPAMBLOK — scan inbox for List-Unsubscribe headers and bulk-unsubscribe.
 * Env: SPAMBLOK_IMAP_* / SPAMBLOK_SMTP_* or Render-style IMAP_EMAIL_SERVER + IMAP_MAIL_PORT +
 * MY_EMAIL_ADDRESS + MY_EMAIL_PASSWORD (or IMAP_MAIL_SERVER / IMAP_* / SMTP_* / etc.).
 */

const path = require('path');
const fs = require('fs');
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
const KEEP_DOMAINS_PATH = path.join(__dirname, '..', 'data', 'spamblok-keep-domains.json');

function normalizeDomain(input) {
  return String(input || '').trim().toLowerCase().replace(/^@+/, '');
}

function readKeepDomains() {
  try {
    if (!fs.existsSync(KEEP_DOMAINS_PATH)) return [];
    const raw = fs.readFileSync(KEEP_DOMAINS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.map(normalizeDomain).filter(Boolean))).sort();
  } catch (err) {
    console.error('[SPAMBLOK] Failed reading keep domains:', err.message || err);
    return [];
  }
}

function writeKeepDomains(domains) {
  const unique = Array.from(new Set((domains || []).map(normalizeDomain).filter(Boolean))).sort();
  const dir = path.dirname(KEEP_DOMAINS_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(KEEP_DOMAINS_PATH, JSON.stringify(unique, null, 2) + '\n', 'utf8');
  return unique;
}

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
  if (typeof fromRaw === 'object' && fromRaw.address) {
    return {
      name: fromRaw.name || '',
      address: fromRaw.address || '',
    };
  }
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

function extractBodyUnsubscribeTargets(rawText) {
  const text = String(rawText || '');
  const lower = text.toLowerCase();
  const hasKeyword = /\bunsubscribe\b|\bopt[\s-]?out\b|\bremove me\b/.test(lower);
  if (!hasKeyword) return { http: [], mailto: [] };

  const httpSet = new Set();
  const mailtoSet = new Set();

  const urlMatches = text.match(/\bhttps?:\/\/[^\s<>"')]+/gi) || [];
  for (const u of urlMatches) {
    if (/unsubscribe|optout|opt-out|remove/i.test(u)) httpSet.add(u.trim());
  }

  const mailtoMatches = text.match(/\bmailto:[^\s<>"')]+/gi) || [];
  for (const m of mailtoMatches) {
    const cleaned = m.trim();
    const addr = cleaned.replace(/^mailto:/i, '').split('?')[0];
    if (addr) {
      mailtoSet.add(JSON.stringify({ address: addr, subject: 'unsubscribe', body: 'unsubscribe' }));
    }
  }

  const emailMatches = text.match(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi) || [];
  for (const e of emailMatches) {
    if (/unsubscribe|remove|optout|opt-out/i.test(text.slice(Math.max(0, text.indexOf(e) - 80), text.indexOf(e) + e.length + 80))) {
      mailtoSet.add(JSON.stringify({ address: e, subject: 'unsubscribe', body: 'unsubscribe' }));
    }
  }

  return {
    http: Array.from(httpSet),
    mailto: Array.from(mailtoSet).map((v) => JSON.parse(v)),
  };
}

async function getRecentMailboxMessages(cfg, mailbox = 'INBOX', limit = 25) {
  const client = new ImapFlow(cfg);
  await client.connect();
  const rows = [];

  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      const total = client.mailbox ? client.mailbox.exists : 0;
      if (!total) return { mailbox, totalMessages: 0, rows: [] };

      const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 200));
      const start = Math.max(1, total - safeLimit + 1);
      const range = `${start}:${total}`;

      for await (const msg of client.fetch(range, {
        envelope: true,
        headers: ['list-unsubscribe', 'list-unsubscribe-post', 'from'],
        source: true,
        uid: true,
      })) {
        const from = parseFromHeader(msg.envelope?.from?.[0] || null);
        const senderAddr = (from.address || '').toLowerCase();
        const headerStr = msg.headers ? msg.headers.toString('utf8') : '';
        const sourceStr = msg.source ? msg.source.toString('utf8') : '';
        const hasHeaderUnsub = /^list-unsubscribe:\s*\S/im.test(headerStr);
        const bodyTargets = extractBodyUnsubscribeTargets(sourceStr);
        const luMatch = headerStr.match(/^list-unsubscribe:\s*([\s\S]*?)(?=\r?\n[a-zA-Z-]+:|\r?\n\r?\n|$)/im);
        const luParsed = luMatch ? parseListUnsubscribe(luMatch[1].replace(/\r?\n\s+/g, ' ').trim()) : { http: [], mailto: [] };
        const allHttp = [...luParsed.http, ...bodyTargets.http];
        const allMailto = [...luParsed.mailto, ...bodyTargets.mailto];
        const unsubTarget = allHttp[0] || (allMailto[0] ? `mailto:${allMailto[0].address}` : '');
        rows.push({
          uid: msg.uid,
          senderName: from.name || senderAddr.split('@')[0] || '(unknown)',
          senderAddress: senderAddr || '(unknown)',
          subject: msg.envelope?.subject || '(no subject)',
          date: msg.envelope?.date || null,
          hasUnsubscribeClue: Boolean(unsubTarget),
          clueSource: unsubTarget ? (allHttp[0] ? 'header/body link' : 'header/body email') : 'none',
          unsubTarget: unsubTarget || '',
        });
      }

      rows.sort((a, b) => (b.uid || 0) - (a.uid || 0));
      return { mailbox, totalMessages: total, rows };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Verify IMAP credentials, list folders, open a mailbox, and report counts.
 * Helps debug "no emails" — SPAMBLOK only surfaces messages with List-Unsubscribe headers.
 */
async function testImapConnection(cfg, mailbox = 'INBOX') {
  const started = Date.now();
  const summary = {
    ok: false,
    connected: false,
    imap: {
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      user: cfg.auth.user,
    },
    mailboxRequested: mailbox,
    mailboxOpened: null,
    messageCount: null,
    mailboxes: null,
    mailboxListError: null,
    sample: null,
    note:
      'Scan inbox only lists senders that have a usable List-Unsubscribe header (HTTP or mailto). A full inbox with zero matches is normal if messages lack that header.',
    error: null,
    latencyMs: null,
  };

  const client = new ImapFlow(cfg);
  try {
    await client.connect();
    summary.connected = true;

    try {
      const listResult = await client.list();
      summary.mailboxes = listResult.map((m) => m.path).filter(Boolean).sort();
    } catch (e) {
      summary.mailboxListError = e.message || String(e);
    }

    const lock = await client.getMailboxLock(mailbox);
    try {
      summary.mailboxOpened = mailbox;
      const total = client.mailbox ? client.mailbox.exists : 0;
      summary.messageCount = total;

      if (total > 0) {
        const sampleSize = Math.min(100, total);
        const start = Math.max(1, total - sampleSize + 1);
        let withLu = 0;
        for await (const msg of client.fetch(`${start}:${total}`, {
          headers: ['list-unsubscribe'],
          uid: true,
        })) {
          const headerBuf = msg.headers;
          if (!headerBuf) continue;
          if (/^list-unsubscribe:\s*\S/im.test(headerBuf.toString('utf8'))) withLu++;
        }
        summary.sample = {
          range: `${start}:${total}`,
          messagesChecked: sampleSize,
          withListUnsubscribeHeader: withLu,
        };
      }
    } finally {
      lock.release();
    }

    summary.ok = true;
  } catch (err) {
    summary.error = err.message || String(err);
    summary.ok = false;
    console.error('[SPAMBLOK] test-connection failed:', err.message || err);
  } finally {
    summary.latencyMs = Date.now() - started;
    await client.logout().catch(() => {});
  }

  if (summary.ok) {
    console.log(
      `[SPAMBLOK] test-connection ok user=${summary.imap.user} mailbox=${summary.mailboxOpened} messages=${summary.messageCount} latencyMs=${summary.latencyMs}`
    );
  }
  return summary;
}

async function scanMailbox(cfg, mailbox = 'INBOX', limit = 500) {
  const client = new ImapFlow(cfg);
  await client.connect();

  const items = [];

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
        source: true,
        uid: true,
      })) {
        const headerBuf = msg.headers;
        if (!headerBuf) continue;
        const headerStr = headerBuf.toString('utf8');

        const luMatch = headerStr.match(/^list-unsubscribe:\s*([\s\S]*?)(?=\r?\n[a-zA-Z-]+:|\r?\n\r?\n|$)/im);
        const luValue = luMatch ? luMatch[1].replace(/\r?\n\s+/g, ' ').trim() : '';
        const unsubFromHeader = luValue ? parseListUnsubscribe(luValue) : { http: [], mailto: [] };
        const sourceStr = msg.source ? msg.source.toString('utf8') : '';
        const unsubFromBody = extractBodyUnsubscribeTargets(sourceStr);
        const unsub = {
          http: [...unsubFromHeader.http, ...unsubFromBody.http],
          mailto: [...unsubFromHeader.mailto, ...unsubFromBody.mailto],
        };
        if (unsub.http.length === 0 && unsub.mailto.length === 0) continue;

        const oneClick = /one-click/i.test(headerStr.match(/list-unsubscribe-post:\s*([^\r\n]+)/i)?.[1] || '');

        const from = parseFromHeader(msg.envelope?.from?.[0] || null);
        const senderAddr = from.address.toLowerCase();
        if (!senderAddr) continue;

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
      imapHost: IMAP_CONFIG.host || null,
      imapPort: IMAP_CONFIG.port,
      imapUser: IMAP_CONFIG.auth.user || null,
    });
  });

  app.post('/spamblok/api/test-connection', async (req, res) => {
    if (!IMAP_CONFIG.host || !IMAP_CONFIG.auth.user || !IMAP_CONFIG.auth.pass) {
      return res.status(400).json({
        ok: false,
        error:
          'IMAP not configured. Set IMAP_EMAIL_SERVER / MY_EMAIL_ADDRESS / MY_EMAIL_PASSWORD or SPAMBLOK_IMAP_* / IMAP_*.',
      });
    }
    const mailbox = String((req.body && req.body.mailbox) || 'INBOX').trim() || 'INBOX';
    try {
      const result = await testImapConnection(IMAP_CONFIG, mailbox);
      res.json(result);
    } catch (err) {
      console.error('[SPAMBLOK] test-connection error:', err);
      res.status(500).json({ ok: false, error: err.message || 'Test failed' });
    }
  });

  app.post('/spamblok/api/scan', async (req, res) => {
    if (!IMAP_CONFIG.host || !IMAP_CONFIG.auth.user || !IMAP_CONFIG.auth.pass) {
      return res.status(400).json({
        error:
          'IMAP not configured. On Render use IMAP_EMAIL_SERVER, IMAP_MAIL_PORT (optional), MY_EMAIL_ADDRESS, MY_EMAIL_PASSWORD — or SPAMBLOK_IMAP_* / IMAP_* / IMAP_MAIL_SERVER.',
      });
    }
    const mailbox = (req.body && req.body.mailbox) || 'INBOX';
    const limit = Math.min(parseInt(req.body?.limit || '25', 10), 5000);
    const dedupeByDomain = String(req.body?.dedupeByDomain ?? 'true') !== 'false';
    const keepDomains = readKeepDomains();
    const keepSet = new Set(keepDomains);
    try {
      let items = await scanMailbox(IMAP_CONFIG, mailbox, limit);
      items = items.filter((i) => !keepSet.has(normalizeDomain(i.domain)));
      if (dedupeByDomain) {
        const seenDomains = new Set();
        items = items.filter((i) => {
          const d = normalizeDomain(i.domain);
          if (!d || seenDomains.has(d)) return false;
          seenDomains.add(d);
          return true;
        });
      }
      lastScan = { mailbox, scannedAt: new Date().toISOString(), items };
      res.json(lastScan);
    } catch (err) {
      console.error('[SPAMBLOK] Scan error:', err);
      res.status(500).json({ error: err.message || 'Scan failed' });
    }
  });

  app.get('/spamblok/api/keep-domains', (req, res) => {
    res.json({ ok: true, domains: readKeepDomains() });
  });

  app.post('/spamblok/api/keep-domains', (req, res) => {
    const incoming = Array.isArray(req.body?.domains) ? req.body.domains : [];
    if (incoming.length === 0) return res.status(400).json({ ok: false, error: 'No domains provided' });
    const current = readKeepDomains();
    const updated = writeKeepDomains(current.concat(incoming));
    res.json({ ok: true, domains: updated });
  });

  app.delete('/spamblok/api/keep-domains', (req, res) => {
    const removeList = Array.isArray(req.body?.domains) ? req.body.domains.map(normalizeDomain).filter(Boolean) : [];
    if (removeList.length === 0) return res.status(400).json({ ok: false, error: 'No domains provided' });
    const removeSet = new Set(removeList);
    const updated = writeKeepDomains(readKeepDomains().filter((d) => !removeSet.has(d)));
    res.json({ ok: true, domains: updated });
  });

  app.post('/spamblok/api/recent', async (req, res) => {
    if (!IMAP_CONFIG.host || !IMAP_CONFIG.auth.user || !IMAP_CONFIG.auth.pass) {
      return res.status(400).json({
        error:
          'IMAP not configured. Set IMAP_EMAIL_SERVER / MY_EMAIL_ADDRESS / MY_EMAIL_PASSWORD or SPAMBLOK_IMAP_* / IMAP_*.',
      });
    }

    const mailbox = String((req.body && req.body.mailbox) || 'INBOX').trim() || 'INBOX';
    const limit = Math.max(1, Math.min(parseInt(req.body?.limit || '25', 10), 200));

    try {
      const result = await getRecentMailboxMessages(IMAP_CONFIG, mailbox, limit);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error('[SPAMBLOK] Recent message preview error:', err);
      res.status(500).json({ ok: false, error: err.message || 'Recent preview failed' });
    }
  });

  app.post('/spamblok/api/unsubscribe', async (req, res) => {
    const uids = Array.isArray(req.body?.uids) ? req.body.uids : [];
    if (uids.length === 0) return res.status(400).json({ error: 'No items selected' });

    const targets = lastScan.items.filter((i) => uids.includes(i.uid));
    if (targets.length === 0) {
      return res.status(400).json({ error: 'No matching items in last scan — run Scan spam first.' });
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
