'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const store = require('./designStudioStore');

function registerDesignStudioRoutes(app) {
  const dataDir = store.resolveDataDir();
  store.ensureDirs(dataDir);
  console.log('[DesignStudio] data dir:', dataDir);
  if (!process.env.LAB007_DATA_DIR && !process.env.LAB007_DISK_ROOT && !process.env.DESIGN_STUDIO_DATA_DIR) {
    console.warn('[DesignStudio] No LAB007_DATA_DIR set — using local ./data/design-studio (not persistent on Render).');
  }

  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, store.filesDir(dataDir)),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
        cb(null, `tmp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
      },
    }),
    limits: { fileSize: 40 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const mt = String(file.mimetype || '').toLowerCase();
      const name = String(file.originalname || '').toLowerCase();
      const ok = mt.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|tif{1,2})$/i.test(name);
      cb(ok ? null : new Error('Upload an image file.'), ok);
    },
  });

  function sendError(res, status, message) {
    return res.status(status).json({ ok: false, error: message });
  }

  app.get('/api/design-studio/library', (req, res) => {
    const lib = store.readLibrary(dataDir);
    res.json({ ok: true, ...lib });
  });

  app.get('/api/design-studio/file/:id', (req, res) => {
    const id = store.safeId(req.params.id);
    const lib = store.readLibrary(dataDir);
    const item = lib.items.find((row) => row.id === id);
    if (!item) return sendError(res, 404, 'Image not found.');
    const file = store.findItemFile(dataDir, item);
    if (!file) return sendError(res, 404, 'Image file missing.');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    if (item.mime) res.type(item.mime);
    return res.sendFile(path.resolve(file));
  });

  app.post('/api/design-studio/cats', (req, res) => {
    const cat = req.body || {};
    const id = store.safeId(cat.id);
    const label = String(cat.label || '').trim().slice(0, 42);
    if (!id || !label) return sendError(res, 400, 'Category needs an id and name.');
    const lib = store.readLibrary(dataDir);
    const next = {
      id,
      label,
      kind: 'images',
      custom: true,
      defaultFx: String(cat.defaultFx || 'kenburns').slice(0, 40),
    };
    const idx = lib.cats.findIndex((row) => row.id === id);
    if (idx >= 0) lib.cats[idx] = { ...lib.cats[idx], ...next };
    else lib.cats.push(next);
    store.writeLibrary(dataDir, lib);
    res.json({ ok: true, cat: next });
  });

  app.delete('/api/design-studio/cats/:id', (req, res) => {
    const id = store.safeId(req.params.id);
    const lib = store.readLibrary(dataDir);
    const gone = lib.items.filter((item) => item.catId === id);
    gone.forEach((item) => {
      const file = store.findItemFile(dataDir, item);
      if (file) {
        try {
          fs.unlinkSync(file);
        } catch {
          /* ignore */
        }
      }
    });
    lib.items = lib.items.filter((item) => item.catId !== id);
    lib.cats = lib.cats.filter((cat) => cat.id !== id);
    store.writeLibrary(dataDir, lib);
    res.json({ ok: true });
  });

  app.post('/api/design-studio/items', (req, res) => {
    upload.single('file')(req, res, (err) => {
      if (err) return sendError(res, 400, err.message || 'Upload failed.');
      let meta = {};
      try {
        meta = req.body?.meta ? JSON.parse(req.body.meta) : req.body || {};
      } catch {
        return sendError(res, 400, 'Invalid image metadata.');
      }
      const id = store.safeId(meta.id);
      if (!id) {
        if (req.file?.path) {
          try {
            fs.unlinkSync(req.file.path);
          } catch {
            /* ignore */
          }
        }
        return sendError(res, 400, 'Missing image id.');
      }
      const item = {
        id,
        catId: String(meta.catId || '').slice(0, 80),
        name: String(meta.name || 'Untitled').slice(0, 80),
        fx: String(meta.fx || 'kenburns').slice(0, 40),
        scene: meta.scene ? String(meta.scene).slice(0, 40) : undefined,
        speed: Number(meta.speed) || 1,
        intensity: meta.intensity == null ? 0.4 : Number(meta.intensity),
        pace: meta.pace == null ? 0.4 : Number(meta.pace),
        w: Number(meta.w) || 0,
        h: Number(meta.h) || 0,
        mime: String(meta.mime || req.file?.mimetype || 'image/png').slice(0, 80),
        created: Number(meta.created) || Date.now(),
        ext: store.extFor(meta, req.file?.originalname),
      };
      if (req.file?.path) {
        const dest = store.filePathFor(dataDir, item, req.file.originalname);
        try {
          if (fs.existsSync(dest) && dest !== req.file.path) fs.unlinkSync(dest);
          fs.renameSync(req.file.path, dest);
        } catch (moveErr) {
          return sendError(res, 500, moveErr.message || 'Could not store image.');
        }
      }
      const lib = store.readLibrary(dataDir);
      const idx = lib.items.findIndex((row) => row.id === id);
      if (idx >= 0) lib.items[idx] = { ...lib.items[idx], ...item };
      else lib.items.push(item);
      store.writeLibrary(dataDir, lib);
      res.json({ ok: true, item });
    });
  });

  app.patch('/api/design-studio/items/:id', (req, res) => {
    const id = store.safeId(req.params.id);
    const lib = store.readLibrary(dataDir);
    const idx = lib.items.findIndex((row) => row.id === id);
    if (idx < 0) return sendError(res, 404, 'Image not found.');
    const patch = req.body || {};
    const keep = ['name', 'fx', 'scene', 'speed', 'intensity', 'pace', 'catId'];
    const next = { ...lib.items[idx] };
    keep.forEach((key) => {
      if (patch[key] !== undefined) next[key] = patch[key];
    });
    lib.items[idx] = next;
    store.writeLibrary(dataDir, lib);
    res.json({ ok: true, item: next });
  });

  app.delete('/api/design-studio/items/:id', (req, res) => {
    const id = store.safeId(req.params.id);
    const lib = store.readLibrary(dataDir);
    const item = lib.items.find((row) => row.id === id);
    if (item) {
      const file = store.findItemFile(dataDir, item);
      if (file) {
        try {
          fs.unlinkSync(file);
        } catch {
          /* ignore */
        }
      }
    }
    lib.items = lib.items.filter((row) => row.id !== id);
    store.writeLibrary(dataDir, lib);
    res.json({ ok: true });
  });

  app.put('/api/design-studio/prefs', (req, res) => {
    const pref = req.body || {};
    const key = String(pref.key || '').slice(0, 120);
    if (!key) return sendError(res, 400, 'Missing pref key.');
    const lib = store.readLibrary(dataDir);
    const next = {
      key,
      fx: pref.fx,
      scene: pref.scene,
      speed: pref.speed,
      intensity: pref.intensity,
      pace: pref.pace,
    };
    const idx = lib.prefs.findIndex((row) => row.key === key);
    if (idx >= 0) lib.prefs[idx] = { ...lib.prefs[idx], ...next };
    else lib.prefs.push(next);
    store.writeLibrary(dataDir, lib);
    res.json({ ok: true, pref: next });
  });
}

module.exports = { registerDesignStudioRoutes };
