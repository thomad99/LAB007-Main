'use strict';

const path = require('path');
const crypto = require('crypto');
const smarthours = require('./smarthours');

function registerSmartHoursRoutes(app) {
  // Persistent disk: $LAB007_DATA_DIR/SmartHours (Render e.g. /var/data/lab007/SmartHours)
  const dataDir = smarthours.resolveDataDir();
  smarthours.migrateLegacyDataDir(dataDir);
  smarthours.ensureDirs(dataDir);

  console.log('[SmartHours] data dir:', dataDir);
  console.log('[SmartHours] store file:', smarthours.storePath(dataDir));
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

  app.get('/SmartHours', (req, res) => {
    noIndex(res);
    res.sendFile(path.join(__dirname, '..', 'public', 'smarthours.html'));
  });
  app.get('/smarthours', (req, res) => {
    noIndex(res);
    res.redirect(301, '/SmartHours');
  });

  app.get('/SmartHours/v/:slug', (req, res) => {
    noIndex(res);
    res.sendFile(path.join(__dirname, '..', 'public', 'smarthours-display.html'));
  });
  app.get('/smarthours/v/:slug', (req, res) => {
    noIndex(res);
    res.redirect(301, `/SmartHours/v/${encodeURIComponent(req.params.slug)}`);
  });

  app.get('/api/smarthours/customers', (req, res) => {
    try {
      const store = smarthours.loadStore(dataDir);
      const customers = store.customers.map((c) => ({
        ...c,
        media: smarthours.listMediaFiles(dataDir, c)
      }));
      res.json({
        customers,
        googleConfigured: true,
        googlePlacesApiConfigured: Boolean(smarthours.placesApiKey()),
        tablet: smarthours.TABLET,
        days: smarthours.DAYS,
        dayLabels: smarthours.DAY_LABELS
      });
    } catch (err) {
      console.error('[SmartHours] list error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/smarthours/customers', async (req, res) => {
    try {
      const store = smarthours.loadStore(dataDir);
      const customer = smarthours.normalizeCustomer(
        {
          ...req.body,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        store.customers
      );

      if (req.body?.logoDataUrl) {
        customer.design.logoUrl = smarthours.saveLogoFile(dataDir, customer.id, req.body.logoDataUrl);
      }

      // Do not sync Google hours on create — that can take a long time and blocks Save.
      // Users sync explicitly via "Sync Google hours".

      store.customers.unshift(customer);
      smarthours.saveStore(dataDir, store);
      res.status(201).json(customer);
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

      const prev = store.customers[index];
      const merged = smarthours.normalizeCustomer(
        {
          ...prev,
          ...req.body,
          id: prev.id,
          createdAt: prev.createdAt,
          updatedAt: new Date().toISOString(),
          // Keep existing hours when client omits them (e.g. sync saves URL first)
          hours: req.body && Object.prototype.hasOwnProperty.call(req.body, 'hours') ? req.body.hours : prev.hours,
          media: Array.isArray(req.body?.media) ? req.body.media : prev.media,
          design: { ...prev.design, ...(req.body?.design || {}) }
        },
        store.customers
      );

      if (req.body?.logoDataUrl) {
        merged.design.logoUrl = smarthours.saveLogoFile(dataDir, merged.id, req.body.logoDataUrl);
      }

      store.customers[index] = merged;
      smarthours.saveStore(dataDir, store);
      res.json(merged);
    } catch (err) {
      console.error('[SmartHours] update error:', err);
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.delete('/api/smarthours/customers/:id', (req, res) => {
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
      const result = await smarthours.syncCustomerGoogleHours(store.customers[index]);
      store.customers[index] = result.customer;
      smarthours.saveStore(dataDir, store);
      if (result.error) return res.status(502).json({ error: result.error, customer: result.customer });
      res.json(result);
    } catch (err) {
      console.error('[SmartHours] sync error:', err);
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  app.post('/api/smarthours/sync-all', async (req, res) => {
    try {
      const result = await smarthours.syncAllCustomers(dataDir);
      res.json(result);
    } catch (err) {
      console.error('[SmartHours] sync-all error:', err);
      res.status(500).json({ error: err.message });
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
      const result = smarthours.deleteMediaFile(dataDir, store.customers[index], req.params.mediaId);
      store.customers[index] = smarthours.normalizeCustomer(
        {
          ...store.customers[index],
          media: result.media,
          design: result.design,
          updatedAt: new Date().toISOString()
        },
        store.customers
      );
      smarthours.saveStore(dataDir, store);
      res.json({
        ok: true,
        media: smarthours.listMediaFiles(dataDir, store.customers[index]),
        customer: store.customers[index]
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
      const store = smarthours.loadStore(dataDir);
      const customer = store.customers.find(
        (c) => c.slug === req.params.slug || c.id === req.params.slug
      );
      if (!customer) return res.status(404).json({ error: 'Customer not found.' });
      const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
      const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
      const baseUrl = host ? `${proto}://${host}` : '';
      const meta = eink.einkMeta(customer, baseUrl);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('ETag', `"${meta.version}"`);
      res.json(meta);
    } catch (err) {
      console.error('[SmartHours] eink meta error:', err);
      res.status(500).json({ error: err.message });
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

  // 24-hour Google hours sync
  const syncMs = Number(process.env.SMARTHOURS_SYNC_INTERVAL_MS || 24 * 60 * 60 * 1000);
  if (!/^(0|false|off|no)$/i.test(String(process.env.SMARTHOURS_SYNC_ENABLED || 'true'))) {
    const run = async () => {
      try {
        const result = await smarthours.syncAllCustomers(dataDir);
        console.log('[SmartHours] daily sync', result);
      } catch (err) {
        console.error('[SmartHours] daily sync failed:', err.message);
      }
    };
    setTimeout(run, 45 * 1000);
    setInterval(run, Math.max(60 * 60 * 1000, syncMs));
  }
}

module.exports = { registerSmartHoursRoutes };
