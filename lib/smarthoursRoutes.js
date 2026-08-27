'use strict';

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const nodemailer = require('nodemailer');
const smarthours = require('./smarthours');

function registerSmartHoursRoutes(app) {
  // Persistent disk: $LAB007_DATA_DIR/SmartHours (Render e.g. /var/data/lab007/SmartHours)
  const dataDir = smarthours.resolveDataDir();
  smarthours.migrateLegacyDataDir(dataDir);
  smarthours.ensureDirs(dataDir);

  const assetsDir = path.join(__dirname, '..', 'public', 'smarthours-assets');
  app.use('/SmartHours/assets', express.static(assetsDir, { index: false, maxAge: '1d' }));
  app.use('/smarthours-assets', express.static(assetsDir, { index: false, maxAge: '1d' }));

  console.log('[SmartHours] data dir:', dataDir);
  console.log('[SmartHours] store file:', smarthours.storePath(dataDir));
  console.log(
    '[SmartHours] Places API key:',
    smarthours.placesApiKey() ? 'configured' : 'missing (Maps scrape may only get “today”)'
  );
  console.log('[SmartHours] hours lookup: Places API (New) text search + Place Details');
  if (process.env.LAB007_DATA_DIR) {
    console.log('[SmartHours] LAB007_DATA_DIR:', process.env.LAB007_DATA_DIR);
  } else if (process.env.LAB007_DISK_ROOT) {
    console.log('[SmartHours] LAB007_DISK_ROOT:', process.env.LAB007_DISK_ROOT);
  } else {
    console.warn('[SmartHours] No LAB007_DATA_DIR set — using local folder (not persistent on Render).');
  }

  function noIndex(res) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  }

  const ADMIN_COOKIE = 'sh_admin';
  const ADMIN_SESSION_MS = 7 * 24 * 60 * 60 * 1000;

  function adminPassword() {
    return String(
      process.env.SMARTHOURS_ADMIN_PASSWORD || process.env.MARKETING_MANAGER_PASSWORD || ''
    ).trim();
  }

  function adminSessionSecret() {
    const explicit = String(process.env.SMARTHOURS_ADMIN_SESSION_SECRET || '').trim();
    if (explicit) return explicit;
    const pwd = adminPassword();
    if (pwd) return crypto.createHash('sha256').update(`sh-admin:${pwd}`).digest('hex');
    return '';
  }

  function parseReqCookie(req, name) {
    const raw = req.headers.cookie;
    if (!raw) return '';
    for (const part of raw.split(';')) {
      const idx = part.indexOf('=');
      if (idx < 0) continue;
      const k = part.slice(0, idx).trim();
      if (k !== name) continue;
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return part.slice(idx + 1).trim();
      }
    }
    return '';
  }

  function signAdminToken() {
    const secret = adminSessionSecret();
    if (!secret) return '';
    const exp = String(Date.now() + ADMIN_SESSION_MS);
    const sig = crypto.createHmac('sha256', secret).update(exp).digest('hex');
    return `${exp}.${sig}`;
  }

  function verifyAdminToken(token) {
    const secret = adminSessionSecret();
    if (!secret || !token) return false;
    const parts = String(token).split('.');
    if (parts.length !== 2) return false;
    const [expStr, sig] = parts;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() > exp) return false;
    const expected = crypto.createHmac('sha256', secret).update(expStr).digest('hex');
    try {
      const a = Buffer.from(sig, 'hex');
      const b = Buffer.from(expected, 'hex');
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  function isAdminAuthed(req) {
    if (!adminPassword()) return false;
    return verifyAdminToken(parseReqCookie(req, ADMIN_COOKIE));
  }

  function setAdminAuthCookie(res, token) {
    const secure =
      process.env.NODE_ENV === 'production' ||
      String(process.env.SMARTHOURS_ADMIN_COOKIE_SECURE || '').trim() === '1';
    const maxAgeSec = Math.floor(ADMIN_SESSION_MS / 1000);
    const parts = [
      `${ADMIN_COOKIE}=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${maxAgeSec}`
    ];
    if (secure) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
  }

  function clearAdminAuthCookie(res) {
    const secure =
      process.env.NODE_ENV === 'production' ||
      String(process.env.SMARTHOURS_ADMIN_COOKIE_SECURE || '').trim() === '1';
    const parts = [`${ADMIN_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
    if (secure) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
  }

  function requireAdmin(req, res, next) {
    if (!adminPassword()) {
      return res.status(503).json({
        error:
          'SmartHours admin password is not configured (SMARTHOURS_ADMIN_PASSWORD or MARKETING_MANAGER_PASSWORD).'
      });
    }
    if (!isAdminAuthed(req)) {
      return res.status(401).json({ error: 'Authentication required.', code: 'SH_AUTH_REQUIRED' });
    }
    next();
  }

  const STUDIO_COOKIE = 'sh_studio';
  const STUDIO_SESSION_MS = smarthours.STUDIO_LINK_MS || 10 * 24 * 60 * 60 * 1000;

  function studioSessionSecret() {
    const explicit = String(process.env.SMARTHOURS_STUDIO_SESSION_SECRET || '').trim();
    if (explicit) return explicit;
    const admin = adminSessionSecret();
    if (admin) return crypto.createHash('sha256').update(`sh-studio:${admin}`).digest('hex');
    return crypto.createHash('sha256').update('sh-studio:lab007').digest('hex');
  }

  function signStudioToken(customerId) {
    const id = String(customerId || '').trim();
    if (!id) return '';
    const exp = String(Date.now() + STUDIO_SESSION_MS);
    const sig = crypto.createHmac('sha256', studioSessionSecret()).update(`${id}.${exp}`).digest('hex');
    return `${id}.${exp}.${sig}`;
  }

  function verifyStudioToken(token) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const [id, expStr, sig] = parts;
    const exp = Number(expStr);
    if (!id || !Number.isFinite(exp) || Date.now() > exp) return null;
    const expected = crypto.createHmac('sha256', studioSessionSecret()).update(`${id}.${expStr}`).digest('hex');
    try {
      const a = Buffer.from(sig, 'hex');
      const b = Buffer.from(expected, 'hex');
      if (a.length !== b.length) return null;
      if (!crypto.timingSafeEqual(a, b)) return null;
      return { customerId: id, exp };
    } catch {
      return null;
    }
  }

  function isCookieSecure() {
    return (
      process.env.NODE_ENV === 'production' ||
      String(process.env.SMARTHOURS_ADMIN_COOKIE_SECURE || '').trim() === '1'
    );
  }

  function setStudioAuthCookie(res, token) {
    const maxAgeSec = Math.floor(STUDIO_SESSION_MS / 1000);
    const parts = [
      `${STUDIO_COOKIE}=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${maxAgeSec}`
    ];
    if (isCookieSecure()) parts.push('Secure');
    res.append('Set-Cookie', parts.join('; '));
  }

  function studioSessionFromReq(req) {
    return verifyStudioToken(parseReqCookie(req, STUDIO_COOKIE));
  }

  function canAccessCustomer(req, customer) {
    if (!customer) return false;
    if (isAdminAuthed(req)) return true;
    const session = studioSessionFromReq(req);
    return Boolean(session && session.customerId === customer.id);
  }

  function requireCustomerAccess(req, res, next) {
    if (isAdminAuthed(req)) return next();
    const session = studioSessionFromReq(req);
    if (!session) {
      return res.status(401).json({
        error: 'Enter the email used at signup to receive a secured link to your portal.',
        code: 'SH_STUDIO_AUTH'
      });
    }
    req.studioCustomerId = session.customerId;
    next();
  }

  function requestBaseUrl(req) {
    const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
    const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
    return host ? `${proto}://${host}` : '';
  }

  function studioMailer() {
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';
    if (!user || !pass) return null;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpSecure =
      process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1' || smtpPort === 465;
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: smtpPort,
      secure: smtpSecure,
      auth: { user, pass },
      requireTLS: !smtpSecure
    });
  }

  function escapeEmailHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function studioAccessEmailContent(customer, link, expiresAt, logoUrl) {
    const name = String(customer.name || 'there').trim() || 'there';
    const exp = expiresAt ? new Date(expiresAt) : new Date(Date.now() + STUDIO_SESSION_MS);
    const expLabel = exp.toUTCString();
    const safeName = escapeEmailHtml(name);
    const safeLink = escapeEmailHtml(link);
    const safeLogo = escapeEmailHtml(logoUrl);
    return {
      subject: 'Your SmartHours confirmation',
      text:
        `Hi ${name},\n\n` +
        `Please use this email as confirmation that you can manage your SmartHours display.\n\n` +
        `Open your page here. This link stays valid for 10 days:\n${link}\n\n` +
        `Need it on another phone or computer? Enter this email on the SmartHours page and we will send a fresh link.\n\n` +
        `Link expires: ${expLabel}\n\n` +
        `Smart hours. Always accurate.\n`,
      html:
        `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0b0f18;">` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f18;">` +
        `<tr><td align="center" style="padding:24px 12px;">` +
        `<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;border-collapse:collapse;">` +
        `<tr><td style="background:#000000;padding:20px 24px;">` +
        `<img src="${safeLogo}" alt="SmartHours" width="280" style="display:block;width:280px;max-width:100%;height:auto;border:0;">` +
        `</td></tr>` +
        `<tr><td style="padding:28px 24px 8px;font-family:Arial,Helvetica,sans-serif;color:#f4f7fb;">` +
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;">Hi ${safeName},</p>` +
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;">Please use this email as confirmation that you can manage your SmartHours display.</p>` +
        `<p style="margin:0 0 24px;font-size:16px;line-height:1.55;">This link stays valid for <strong>10 days</strong>.</p>` +
        `<p style="margin:0 0 24px;">` +
        `<a href="${safeLink}" style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;">Open SmartHours</a>` +
        `</p>` +
        `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#9aa3b2;">If the button does not work, copy this link:<br>` +
        `<a href="${safeLink}" style="color:#9ec4ff;word-break:break-all;">${safeLink}</a></p>` +
        `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#9aa3b2;">Need it on another phone or computer? Enter this email on the SmartHours page and we will send a fresh link.</p>` +
        `<p style="margin:20px 0 0;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#9aa3b2;">Smart hours. Always accurate.</p>` +
        `<p style="margin:10px 0 0;font-size:12px;color:#6b7385;">Link expires: ${escapeEmailHtml(expLabel)}</p>` +
        `</td></tr>` +
        `</table></td></tr></table></body></html>`
    };
  }

  async function sendStudioAccessEmail(req, customer, token, expiresAt) {
    const mailer = studioMailer();
    if (!mailer) {
      const err = new Error('Email is not configured on the server, so the access link could not be sent.');
      err.status = 503;
      throw err;
    }
    const base = requestBaseUrl(req) || 'https://www.lab007.ai';
    const link = `${base}/SmartHours/${encodeURIComponent(customer.slug)}?k=${encodeURIComponent(token)}`;
    const logoPath = path.join(assetsDir, 'smarthours-lockup.png');
    const logoUrl = fs.existsSync(logoPath)
      ? 'cid:smarthours-lockup'
      : `${base}/SmartHours/assets/smarthours-lockup.png`;
    const from = process.env.SMTP_FROM
      ? `${process.env.SMTP_FROM} <${process.env.SMTP_USER}>`
      : process.env.SMTP_USER;
    const content = studioAccessEmailContent(customer, link, expiresAt, logoUrl);
    const mail = {
      from,
      to: customer.email,
      subject: content.subject,
      text: content.text,
      html: content.html
    };
    if (logoUrl.indexOf('cid:') === 0) {
      mail.attachments = [
        {
          filename: 'smarthours-lockup.png',
          path: logoPath,
          cid: 'smarthours-lockup'
        }
      ];
    }
    await mailer.sendMail(mail);
    return link;
  }

  async function issueAndEmailAccess(req, store, customer) {
    const issued = smarthours.issueAccessToken(customer);
    customer.accessTokens = issued.accessTokens;
    customer.updatedAt = new Date().toISOString();
    const idx = store.customers.findIndex((c) => c.id === customer.id);
    if (idx >= 0) store.customers[idx] = customer;
    smarthours.saveStore(dataDir, store);
    const link = await sendStudioAccessEmail(req, customer, issued.token, issued.expiresAt);
    return { ...issued, link };
  }

  function studioMeta(store) {
    const library = smarthours.listTemplateLibrary(store || smarthours.loadStore(dataDir));
    return {
      googleConfigured: true,
      googlePlacesApiConfigured: Boolean(smarthours.placesApiKey()),
      tablet: smarthours.DEFAULT_SCREEN || smarthours.TABLET,
      colorPalettes: smarthours.COLOR_MODES,
      days: smarthours.DAYS,
      dayLabels: smarthours.DAY_LABELS,
      templates: library.templates,
      templateCategories: library.categories
    };
  }

  function sendSmartHoursApp(res) {
    noIndex(res);
    res.sendFile(path.join(__dirname, '..', 'public', 'smarthours.html'));
  }

  app.get('/SmartHours', (req, res) => sendSmartHoursApp(res));
  app.get('/smarthours', (req, res) => {
    noIndex(res);
    res.redirect(301, '/SmartHours');
  });
  app.get('/SmartHours-Admin', (req, res) => sendSmartHoursApp(res));
  app.get('/smarthours-admin', (req, res) => {
    noIndex(res);
    res.redirect(301, '/SmartHours-Admin');
  });
  app.get('/SmartHours/e/:slug', (req, res) => {
    noIndex(res);
    res.redirect(301, `/SmartHours/${encodeURIComponent(req.params.slug)}`);
  });
  app.get('/smarthours/e/:slug', (req, res) => {
    noIndex(res);
    res.redirect(301, `/SmartHours/${encodeURIComponent(req.params.slug)}`);
  });

  app.get('/api/smarthours/admin/auth/status', (req, res) => {
    if (!adminPassword()) return res.json({ ok: false, configured: false });
    return res.json({ ok: isAdminAuthed(req), configured: true });
  });

  app.post('/api/smarthours/admin/auth/login', (req, res) => {
    const expected = adminPassword();
    if (!expected) {
      return res.status(503).json({
        ok: false,
        error:
          'SmartHours admin password is not configured (SMARTHOURS_ADMIN_PASSWORD or MARKETING_MANAGER_PASSWORD).'
      });
    }
    const given = String(req.body?.password || '');
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    let match = false;
    if (a.length === b.length) {
      try {
        match = crypto.timingSafeEqual(a, b);
      } catch {
        match = false;
      }
    }
    if (!match) return res.status(401).json({ ok: false, error: 'Incorrect password.' });
    const token = signAdminToken();
    if (!token) return res.status(503).json({ ok: false, error: 'Could not create session token.' });
    setAdminAuthCookie(res, token);
    return res.json({ ok: true });
  });

  app.post('/api/smarthours/admin/auth/logout', (req, res) => {
    clearAdminAuthCookie(res);
    return res.json({ ok: true });
  });

  app.post('/api/smarthours/auth/request-link', async (req, res) => {
    try {
      const email = smarthours.normalizeEmail(req.body && req.body.email);
      if (!email) return res.status(400).json({ error: 'Enter the email address used at signup.' });
      const store = smarthours.loadStore(dataDir);
      const matches = smarthours.findCustomersByEmail(store, email);
      if (!matches.length) {
        return res.json({
          ok: true,
          message: 'If that email is on file, a 10-day access link is on its way.'
        });
      }
      const sent = [];
      for (const customer of matches) {
        try {
          await issueAndEmailAccess(req, store, customer);
          sent.push(customer.slug);
        } catch (err) {
          console.error('[SmartHours] request-link email failed:', err.message);
          return res.status(err.status || 500).json({ error: err.message });
        }
      }
      res.json({
        ok: true,
        message:
          sent.length > 1
            ? 'We emailed a SmartHours confirmation for each of your pages. The link is valid for 10 days.'
            : 'We emailed a SmartHours confirmation. The link is valid for 10 days.'
      });
    } catch (err) {
      console.error('[SmartHours] request-link error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/smarthours/templates', (req, res) => {
    try {
      const store = smarthours.loadStore(dataDir);
      res.json(smarthours.listTemplateLibrary(store));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/smarthours/admin/template-categories', requireAdmin, (req, res) => {
    try {
      const store = smarthours.loadStore(dataDir);
      const name = String(req.body && req.body.name || '').trim().slice(0, 60);
      if (!name) return res.status(400).json({ error: 'Category name is required.' });
      const id = smarthours.requestedSlug(req.body.id || name).slice(0, 40);
      if (!id) return res.status(400).json({ error: 'Category name is required.' });
      if ((store.templateCategories || []).some((c) => c.id === id)) {
        return res.status(409).json({ error: 'That category already exists.' });
      }
      store.templateCategories = [...(store.templateCategories || []), { id, name }];
      smarthours.saveStore(dataDir, store);
      res.status(201).json(smarthours.listTemplateLibrary(store));
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.delete('/api/smarthours/admin/template-categories/:id', requireAdmin, (req, res) => {
    try {
      const store = smarthours.loadStore(dataDir);
      const id = String(req.params.id || '');
      store.templateCategories = (store.templateCategories || []).filter((c) => c.id !== id);
      store.templates = (store.templates || []).map((t) =>
        t.categoryId === id ? { ...t, categoryId: '' } : t
      );
      smarthours.saveStore(dataDir, store);
      res.json(smarthours.listTemplateLibrary(store));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/smarthours/admin/templates', requireAdmin, (req, res) => {
    try {
      const store = smarthours.loadStore(dataDir);
      const item = smarthours.saveTemplateFile(
        dataDir,
        req.body && (req.body.dataUrl || req.body.imageDataUrl),
        req.body && req.body.name,
        {
          name: req.body && req.body.name,
          categoryId: req.body && req.body.categoryId,
          pairId: req.body && req.body.pairId,
          pairRole: req.body && req.body.pairRole
        }
      );
      store.templates = [...(store.templates || []).filter((t) => t.id !== item.id), item];
      smarthours.saveStore(dataDir, store);
      res.status(201).json({
        item: { ...item, url: smarthours.templatePublicUrl(item.id, item.updatedAt) },
        ...smarthours.listTemplateLibrary(store)
      });
    } catch (err) {
      console.error('[SmartHours] template upload error:', err);
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.put('/api/smarthours/admin/templates/:id', requireAdmin, (req, res) => {
    try {
      const store = smarthours.loadStore(dataDir);
      const idx = (store.templates || []).findIndex((t) => t.id === req.params.id);
      if (idx < 0) return res.status(404).json({ error: 'Template not found.' });
      const prev = store.templates[idx];
      const body = req.body || {};
      const pairRole = body.pairRole === 'open' || body.pairRole === 'closed' ? body.pairRole : body.pairRole === '' ? '' : prev.pairRole;
      store.templates[idx] = {
        ...prev,
        name: body.name != null ? String(body.name).trim().slice(0, 80) || prev.name : prev.name,
        categoryId:
          body.categoryId != null ? smarthours.requestedSlug(body.categoryId).slice(0, 40) : prev.categoryId,
        pairId: body.pairId != null ? String(body.pairId).trim().slice(0, 40) : prev.pairId,
        pairRole,
        updatedAt: new Date().toISOString()
      };
      smarthours.saveStore(dataDir, store);
      res.json(smarthours.listTemplateLibrary(store));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/smarthours/admin/templates/:id', requireAdmin, (req, res) => {
    try {
      const store = smarthours.loadStore(dataDir);
      const prev = (store.templates || []).find((t) => t.id === req.params.id);
      if (!prev) return res.status(404).json({ error: 'Template not found.' });
      store.templates = (store.templates || []).filter((t) => t.id !== req.params.id);
      if (prev.fileName) {
        const file = path.join(smarthours.templatesDir(dataDir), prev.fileName);
        try {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        } catch (_) {
          /* ignore */
        }
      }
      smarthours.saveStore(dataDir, store);
      res.json(smarthours.listTemplateLibrary(store));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/smarthours/public/templates/:id', (req, res) => {
    try {
      const store = smarthours.loadStore(dataDir);
      const tpl = (store.templates || []).find((t) => t.id === req.params.id);
      const file = smarthours.readTemplateFile(dataDir, tpl || req.params.id);
      if (!file) return res.status(404).end();
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.type(file.type).send(file.buffer);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/smarthours/slug-available', (req, res) => {
    try {
      const store = smarthours.loadStore(dataDir);
      const exceptId = String(req.query.exceptId || '').trim() || undefined;
      const check = smarthours.checkSlugAvailable(req.query.slug, store.customers, exceptId);
      res.json(check);
    } catch (err) {
      res.status(500).json({ available: false, error: err.message });
    }
  });

  app.get('/api/smarthours/studio/:slug', async (req, res) => {
    try {
      const store = smarthours.loadStore(dataDir);
      const customer = store.customers.find(
        (c) => c.slug === req.params.slug || c.id === req.params.slug
      );
      if (!customer) return res.status(404).json({ error: 'Customer not found.' });
      const magic = String(req.query.k || req.query.token || '').trim();
      if (magic && smarthours.accessTokenValid(customer, magic)) {
        setStudioAuthCookie(res, signStudioToken(customer.id));
      } else if (!canAccessCustomer(req, customer)) {
        if (customer.email) {
          return res.status(401).json({
            error: 'Enter the email used at signup to receive a secured link to your portal.',
            code: 'SH_STUDIO_AUTH',
            slug: customer.slug
          });
        }
        // Legacy pages without email keep working from the unique URL.
        setStudioAuthCookie(res, signStudioToken(customer.id));
      }
      const devices = smarthours
        .listDevices(dataDir)
        .filter((d) => smarthours.deviceMatchesSlug(d, customer.slug));
      res.json({
        customer: {
          ...smarthours.customerFacing(customer),
          media: smarthours.listMediaFiles(dataDir, customer)
        },
        devices,
        ...studioMeta(store)
      });
    } catch (err) {
      console.error('[SmartHours] studio error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/SmartHours/about', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'smarthours-about.html'));
  });
  app.get('/smarthours/about', (req, res) => {
    res.redirect(301, '/SmartHours/about');
  });

  app.get('/SmartHours/v/:slug', (req, res) => {
    noIndex(res);
    res.sendFile(path.join(__dirname, '..', 'public', 'smarthours-display.html'));
  });
  app.get('/smarthours/v/:slug', (req, res) => {
    noIndex(res);
    res.redirect(301, `/SmartHours/v/${encodeURIComponent(req.params.slug)}`);
  });
  app.get('/SmartHours/:slug', (req, res, next) => {
    const slug = String(req.params.slug || '');
    if (/^(about|assets|e|v)$/i.test(slug)) return next();
    sendSmartHoursApp(res);
  });
  app.get('/smarthours/:slug', (req, res, next) => {
    const slug = String(req.params.slug || '');
    if (/^(about|assets|e|v)$/i.test(slug)) return next();
    noIndex(res);
    res.redirect(301, `/SmartHours/${encodeURIComponent(slug)}`);
  });

  app.get('/api/smarthours/customers', requireAdmin, (req, res) => {
    try {
      const store = smarthours.loadStore(dataDir);
      const customers = store.customers.map((c) => ({
        ...smarthours.customerFacing(c),
        media: smarthours.listMediaFiles(dataDir, c)
      }));
      res.json({
        customers,
        devices: smarthours.listDevices(dataDir),
        settings: store.settings || smarthours.defaultSettings(),
        ...studioMeta(store)
      });
    } catch (err) {
      console.error('[SmartHours] list error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/smarthours/customers', async (req, res) => {
    try {
      const store = smarthours.loadStore(dataDir);
      const body = req.body || {};
      const email = smarthours.normalizeEmail(body.email);
      if (!isAdminAuthed(req) && !email) {
        return res.status(400).json({ error: 'Email address is required so we can send your secured portal link.' });
      }
      const wanted = smarthours.requestedSlug(body.slug || body.name);
      const check = smarthours.checkSlugAvailable(wanted, store.customers);
      if (!check.available) {
        return res.status(409).json({ error: check.error, slug: check.slug });
      }
      const customer = smarthours.normalizeCustomer(
        {
          ...body,
          email,
          slug: check.slug,
          eink: {
            ...(body.eink && typeof body.eink === 'object' ? body.eink : {}),
            orientation:
              body.eink && body.eink.orientation === 'landscape' ? 'landscape' : 'portrait'
          },
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        store.customers
      );

      if (req.body?.logoDataUrl) {
        const logoUrl = smarthours.saveLogoFile(dataDir, customer.id, req.body.logoDataUrl);
        customer.design = { ...customer.design, logoUrl };
        customer.designs = (customer.designs || []).map((slot) =>
          slot.id === customer.liveDesignId
            ? { ...slot, design: { ...slot.design, logoUrl } }
            : slot
        );
      }

      store.customers.unshift(customer);
      let accessLink = '';
      if (customer.email) {
        try {
          const issued = await issueAndEmailAccess(req, store, customer);
          accessLink = issued.link;
        } catch (mailErr) {
          smarthours.saveStore(dataDir, store);
          console.error('[SmartHours] access email failed:', mailErr.message);
          setStudioAuthCookie(res, signStudioToken(customer.id));
          return res.status(201).json({
            ...smarthours.customerFacing(customer),
            emailSent: false,
            emailError: mailErr.message
          });
        }
      } else {
        smarthours.saveStore(dataDir, store);
      }
      if (customer.email) setStudioAuthCookie(res, signStudioToken(customer.id));
      res.status(201).json({
        ...smarthours.customerFacing(customer),
        emailSent: Boolean(customer.email),
        accessLink: isAdminAuthed(req) ? accessLink : undefined
      });
    } catch (err) {
      console.error('[SmartHours] create error:', err);
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.put('/api/smarthours/customers/:id', async (req, res) => {
    try {
      const store = smarthours.loadStore(dataDir);
      const index = store.customers.findIndex((c) => c.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: 'Customer not found.' });
      if (!canAccessCustomer(req, store.customers[index])) {
        return res.status(401).json({ error: 'Authentication required.', code: 'SH_STUDIO_AUTH' });
      }

      const prev = store.customers[index];
      const body = req.body || {};
      body.slug = prev.slug;
      body.accessTokens = prev.accessTokens;
      if (body.email == null) body.email = prev.email;
      let designsInput = Array.isArray(body.designs) ? body.designs : prev.designs;
      let liveDesignId = body.liveDesignId != null ? body.liveDesignId : prev.liveDesignId;

      // Legacy clients: only send `design` — write it into the live (or editing) slot
      if (!Array.isArray(body.designs) && body.design) {
        const editingId = String(body.editingDesignId || liveDesignId || '');
        const slots = Array.isArray(prev.designs) && prev.designs.length
          ? prev.designs.map((s) => ({ ...s }))
          : null;
        if (slots) {
          designsInput = slots.map((slot) => {
            if (slot.id !== editingId && slot.id !== liveDesignId) return slot;
            return {
              ...slot,
              design: { ...slot.design, ...body.design },
              updatedAt: new Date().toISOString()
            };
          });
        } else {
          designsInput = undefined;
        }
      }

      const merged = smarthours.normalizeCustomer(
        {
          ...prev,
          ...body,
          id: prev.id,
          createdAt: prev.createdAt,
          updatedAt: new Date().toISOString(),
          hours: Object.prototype.hasOwnProperty.call(body, 'hours') ? body.hours : prev.hours,
          media: Array.isArray(body.media) ? body.media : prev.media,
          designs: designsInput,
          liveDesignId,
          design: Array.isArray(body.designs)
            ? body.design || prev.design
            : { ...prev.design, ...(body.design || {}) }
        },
        store.customers
      );

      if (body.logoDataUrl) {
        const logoUrl = smarthours.saveLogoFile(dataDir, merged.id, body.logoDataUrl);
        const targetId = String(body.editingDesignId || merged.liveDesignId);
        merged.designs = merged.designs.map((slot) =>
          slot.id === targetId
            ? { ...slot, design: { ...slot.design, logoUrl }, updatedAt: new Date().toISOString() }
            : slot
        );
        if (targetId === merged.liveDesignId) {
          merged.design = { ...merged.design, logoUrl };
        } else {
          const live = merged.designs.find((d) => d.id === merged.liveDesignId);
          if (live) merged.design = live.design;
        }
      }

      store.customers[index] = merged;
      smarthours.saveStore(dataDir, store);
      res.json(smarthours.customerFacing(merged));
    } catch (err) {
      console.error('[SmartHours] update error:', err);
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.delete('/api/smarthours/customers/:id', requireAdmin, (req, res) => {
    try {
      const store = smarthours.loadStore(dataDir);
      const next = store.customers.filter((c) => c.id !== req.params.id);
      if (next.length === store.customers.length) {
        return res.status(404).json({ error: 'Customer not found.' });
      }
      store.customers = next;
      smarthours.saveStore(dataDir, store);
      res.json({ ok: true });
    } catch (err) {
      console.error('[SmartHours] delete error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/smarthours/customers/:id/sync', async (req, res) => {
    try {
      const store = smarthours.loadStore(dataDir);
      const index = store.customers.findIndex((c) => c.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: 'Customer not found.' });
      if (!canAccessCustomer(req, store.customers[index])) {
        return res.status(401).json({ error: 'Authentication required.', code: 'SH_STUDIO_AUTH' });
      }
      const result = await smarthours.syncCustomerGoogleHours(store.customers[index]);
      store.customers[index] = result.customer;
      smarthours.saveStore(dataDir, store);
      if (result.error) {
        return res.status(502).json({
          error: result.error,
          customer: smarthours.customerFacing(result.customer)
        });
      }
      res.json({ ...result, customer: smarthours.customerFacing(result.customer) });
    } catch (err) {
      console.error('[SmartHours] sync error:', err);
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.post('/api/smarthours/sync-all', requireAdmin, async (req, res) => {
    try {
      const result = await smarthours.syncAllCustomers(dataDir);
      res.json(result);
    } catch (err) {
      console.error('[SmartHours] sync-all error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/smarthours/settings', requireAdmin, (req, res) => {
    try {
      const hours = req.body && req.body.autoSyncIntervalHours;
      const settings = smarthours.setAutoSyncIntervalHours(dataDir, hours);
      if (typeof scheduleAutoSync === 'function') scheduleAutoSync();
      res.json({ settings });
    } catch (err) {
      console.error('[SmartHours] settings error:', err);
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.get('/api/smarthours/public/:slug', (req, res) => {
    try {
      const store = smarthours.loadStore(dataDir);
      const customer = store.customers.find(
        (c) => c.slug === req.params.slug || c.id === req.params.slug
      );
      if (!customer) return res.status(404).json({ error: 'Customer not found.' });
      res.json(smarthours.publicPayload(customer, { dataDir }));
    } catch (err) {
      console.error('[SmartHours] public error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/smarthours/customers/:id/media', (req, res) => {
    try {
      const store = smarthours.loadStore(dataDir);
      const index = store.customers.findIndex((c) => c.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: 'Customer not found.' });
      if (!canAccessCustomer(req, store.customers[index])) {
        return res.status(401).json({ error: 'Authentication required.', code: 'SH_STUDIO_AUTH' });
      }
      const customer = store.customers[index];
      const item = smarthours.saveMediaFile(
        dataDir,
        customer.id,
        req.body?.dataUrl || req.body?.imageDataUrl,
        req.body?.name
      );
      const media = [...(customer.media || []).filter((m) => m.id !== item.id), item];
      store.customers[index] = smarthours.normalizeCustomer(
        { ...customer, media, updatedAt: new Date().toISOString() },
        store.customers
      );
      smarthours.saveStore(dataDir, store);
      res.status(201).json({
        media: smarthours.listMediaFiles(dataDir, store.customers[index]),
        item: { ...item, url: smarthours.mediaPublicUrl(customer.id, item.id, item.createdAt) }
      });
    } catch (err) {
      console.error('[SmartHours] media upload error:', err);
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.delete('/api/smarthours/customers/:id/media/:mediaId', (req, res) => {
    try {
      const store = smarthours.loadStore(dataDir);
      const index = store.customers.findIndex((c) => c.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: 'Customer not found.' });
      if (!canAccessCustomer(req, store.customers[index])) {
        return res.status(401).json({ error: 'Authentication required.', code: 'SH_STUDIO_AUTH' });
      }
      const result = smarthours.deleteMediaFile(dataDir, store.customers[index], req.params.mediaId);
      store.customers[index] = smarthours.normalizeCustomer(
        {
          ...store.customers[index],
          media: result.media,
          design: result.design,
          designs: result.designs,
          liveDesignId: result.liveDesignId,
          updatedAt: new Date().toISOString()
        },
        store.customers
      );
      smarthours.saveStore(dataDir, store);
      res.json({
        ok: true,
        media: smarthours.listMediaFiles(dataDir, store.customers[index]),
        customer: smarthours.customerFacing(store.customers[index])
      });
    } catch (err) {
      console.error('[SmartHours] media delete error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/smarthours/public/:id/media/:mediaId', (req, res) => {
    try {
      const media = smarthours.readMediaFile(dataDir, req.params.id, req.params.mediaId);
      if (!media) return res.status(404).end();
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.type(media.type).send(media.buffer);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/smarthours/public/:slug/eink.json', (req, res) => {
    try {
      const eink = require('./smarthoursEink');
      const display = require('./smarthoursDisplayRender');
      const store = smarthours.loadStore(dataDir);
      const customer = store.customers.find(
        (c) => c.slug === req.params.slug || c.id === req.params.slug
      );
      if (!customer) return res.status(404).json({ error: 'Customer not found.' });
      const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
      const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
      const baseUrl = host ? `${proto}://${host}` : '';
      const meta = {
        ...eink.einkMeta(customer, baseUrl),
        ...display.displayMeta(customer, baseUrl)
      };
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('ETag', `"${meta.version}"`);
      res.json(meta);
    } catch (err) {
      console.error('[SmartHours] eink meta error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/smarthours/public/:slug/display.json', (req, res) => {
    try {
      const display = require('./smarthoursDisplayRender');
      const store = smarthours.loadStore(dataDir);
      const customer = store.customers.find(
        (c) => c.slug === req.params.slug || c.id === req.params.slug
      );
      if (!customer) return res.status(404).json({ error: 'Customer not found.' });
      const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
      const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
      const baseUrl = host ? `${proto}://${host}` : '';
      const meta = display.displayMeta(customer, baseUrl);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('ETag', `"${meta.version}"`);
      res.json(meta);
    } catch (err) {
      console.error('[SmartHours] display meta error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/smarthours/public/:slug/display.png', async (req, res) => {
    try {
      const display = require('./smarthoursDisplayRender');
      const store = smarthours.loadStore(dataDir);
      const customer = store.customers.find(
        (c) => c.slug === req.params.slug || c.id === req.params.slug
      );
      if (!customer) return res.status(404).json({ error: 'Customer not found.' });
      const version = display.displayContentVersion(customer);
      const etag = `"${version}"`;
      const inm = String(req.get('If-None-Match') || '').trim();
      if (inm && (inm === etag || inm.replace(/^W\//i, '') === etag || inm === version)) {
        res.status(304);
        res.setHeader('ETag', etag);
        res.setHeader('X-SmartHours-Version', version);
        res.setHeader('Cache-Control', 'no-cache');
        return res.end();
      }
      const rendered = await display.renderDisplayPng(customer, {
        dataDir,
        force: String(req.query.refresh || '') === '1'
      });
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('ETag', `"${rendered.version}"`);
      res.setHeader('X-SmartHours-Version', rendered.version);
      res.send(rendered.buffer);
    } catch (err) {
      console.error('[SmartHours] display png error:', err);
      res.status(500).json({ error: err.message || 'Could not render display image.' });
    }
  });

  app.get('/api/smarthours/public/:slug/eink.bmp', (req, res) => {
    try {
      const eink = require('./smarthoursEink');
      const store = smarthours.loadStore(dataDir);
      const customer = store.customers.find(
        (c) => c.slug === req.params.slug || c.id === req.params.slug
      );
      if (!customer) return res.status(404).json({ error: 'Customer not found.' });
      const rendered = eink.renderEinkBmp(customer, { dataDir });
      res.setHeader('Content-Type', 'image/bmp');
      res.setHeader('Cache-Control', 'public, max-age=120');
      res.setHeader('ETag', `"${rendered.version}"`);
      res.setHeader('X-SmartHours-Version', rendered.version);
      res.send(rendered.buffer);
    } catch (err) {
      console.error('[SmartHours] eink bmp error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/smarthours/customers/:id/esp32-sketch', (req, res) => {
    try {
      const eink = require('./smarthoursEink');
      const store = smarthours.loadStore(dataDir);
      const customer = store.customers.find((c) => c.id === req.params.id);
      if (!customer) return res.status(404).json({ error: 'Customer not found.' });
      if (!canAccessCustomer(req, customer)) {
        return res.status(401).json({ error: 'Authentication required.', code: 'SH_STUDIO_AUTH' });
      }
      const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
      const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
      const baseUrl = String(req.query.baseUrl || (host ? `${proto}://${host}` : '')).replace(/\/$/, '');
      const rendered = eink.renderEinkBmp(customer, { dataDir });
      const sketch = eink.buildEsp32Sketch(customer, {
        baseUrl: baseUrl || 'https://your-lab007-host',
        wifiSsid: req.query.wifiSsid,
        wifiPass: req.query.wifiPass,
        pollIntervalMinutes: req.query.pollIntervalMinutes,
        dataDir,
        bmpBuffer: rendered.buffer,
        version: rendered.version
      });
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="SmartHours_${customer.slug}.ino"`
      );
      res.setHeader('X-SmartHours-Version', rendered.version);
      res.setHeader('X-SmartHours-Bmp-Bytes', String(rendered.buffer.length));
      res.send(sketch);
    } catch (err) {
      console.error('[SmartHours] esp32 sketch error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/smarthours/public/:id/logo', (req, res) => {
    try {
      const logo = smarthours.readLogoFile(dataDir, req.params.id);
      if (!logo) return res.status(404).end();
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.type(logo.type).send(logo.buffer);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/smarthours/devices/checkin', (req, res) => {
    try {
      const body = req.body || {};
      const device = smarthours.checkinDevice(dataDir, {
        deviceId: body.deviceId || body.id,
        name: body.deviceName || body.name,
        wifiSsid: body.wifiSsid || body.wifi,
        wifiRssi:
          body.wifiRssi != null ? body.wifiRssi : body.rssi != null ? body.rssi : body.wifiPower,
        reportedSlug: body.customerId || body.customerSlug,
        fwVersion: body.fwVersion,
        ip: body.ip || body.localIp,
        localIp: body.localIp || body.ip,
        batteryPercent: body.batteryPercent != null ? body.batteryPercent : body.battery,
        batteryMv: body.batteryMv || body.batteryMilliVolts,
        reportedPollMinutes: body.reportedPollMinutes || body.pollIntervalMinutes
      });
      const reset = Boolean(device.reset);
      const reported = String(device.reportedSlug || '');
      const poll =
        device.pollIntervalMinutes != null
          ? device.pollIntervalMinutes
          : smarthours.pollIntervalForDevice
            ? smarthours.pollIntervalForDevice(device, smarthours.loadStore(dataDir).customers)
            : null;
      res.json({
        ok: true,
        deviceId: device.id,
        customerId: reset ? '' : reported,
        reset,
        command: reset ? 'setup' : '',
        changed: false,
        lastSeen: device.lastSeen,
        pollIntervalMinutes: poll,
        ip: device.ip || '',
        batteryPercent: device.batteryPercent,
        wifiRssi: device.wifiRssi
      });
    } catch (err) {
      console.error('[SmartHours] device checkin error:', err);
      res.status(err.status || 500).json({ ok: false, error: err.message });
    }
  });

  app.get('/api/smarthours/devices', requireAdmin, (req, res) => {
    try {
      res.json({ devices: smarthours.listDevices(dataDir) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/smarthours/devices/:id', requireCustomerAccess, (req, res) => {
    try {
      const store = smarthours.loadStore(dataDir);
      const key = String(req.params.id || '')
        .toLowerCase()
        .replace(/[^a-f0-9]/g, '');
      const existing = (store.devices || []).find((d) => d.id === key);
      if (!existing) return res.status(404).json({ error: 'Device not found.' });
      if (!isAdminAuthed(req)) {
        const customer = store.customers.find((c) => c.id === req.studioCustomerId);
        if (!customer || !smarthours.deviceMatchesSlug(existing, customer.slug)) {
          return res.status(403).json({ error: 'Not allowed to rename this device.' });
        }
      }
      const device = smarthours.updateDevice(dataDir, key, req.body || {});
      res.json(device);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.post('/api/smarthours/devices/:id/reset', (req, res) => {
    try {
      const store = smarthours.loadStore(dataDir);
      const key = String(req.params.id || '')
        .toLowerCase()
        .replace(/[^a-f0-9]/g, '');
      const device = (store.devices || []).find((d) => d.id === key);
      if (!device) return res.status(404).json({ error: 'Device not found.' });
      const slug = smarthours.requestedSlug(req.body?.customerSlug || '');
      if (!isAdminAuthed(req)) {
        if (!slug || device.customerSlug !== slug) {
          return res.status(403).json({ error: 'Not allowed to reset this device.' });
        }
      }
      const updated = smarthours.queueDeviceReset(dataDir, key);
      res.json(updated);
    } catch (err) {
      console.error('[SmartHours] device reset error:', err);
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Auto Google hours sync: per-customer interval (default 60 minutes)
  let autoSyncTimer = null;
  let autoSyncRunning = false;
  const runAutoSync = async () => {
    if (autoSyncRunning) return;
    autoSyncRunning = true;
    try {
      const result = await smarthours.syncDueCustomers(dataDir);
      if (result.synced || result.errors) {
        console.log('[SmartHours] auto sync', result);
      }
    } catch (err) {
      console.error('[SmartHours] auto sync failed:', err.message);
    } finally {
      autoSyncRunning = false;
    }
  };
  function scheduleAutoSync() {
    if (autoSyncTimer) {
      clearInterval(autoSyncTimer);
      autoSyncTimer = null;
    }
    if (/^(0|false|off|no)$/i.test(String(process.env.SMARTHOURS_SYNC_ENABLED || 'true'))) {
      console.log('[SmartHours] auto sync disabled via SMARTHOURS_SYNC_ENABLED');
      return;
    }
    const hours = smarthours.getAutoSyncIntervalHours(dataDir);
    if (!hours || hours <= 0) {
      console.log('[SmartHours] auto sync disabled (interval 0)');
      return;
    }
    const tickMs = 60 * 1000;
    console.log('[SmartHours] auto sync tick every 1m (per-customer Google hours interval, default 60m)');
    autoSyncTimer = setInterval(runAutoSync, tickMs);
  }
  setTimeout(runAutoSync, 45 * 1000);
  scheduleAutoSync();
}

module.exports = { registerSmartHoursRoutes };
