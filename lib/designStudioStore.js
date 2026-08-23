'use strict';

const fs = require('fs');
const path = require('path');

const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/tiff': '.tif',
};

function resolveDataDir() {
  const explicit = String(process.env.DESIGN_STUDIO_DATA_DIR || '').trim();
  if (explicit) return path.resolve(explicit);
  const diskRoot = String(process.env.LAB007_DATA_DIR || process.env.LAB007_DISK_ROOT || '').trim();
  if (diskRoot) return path.join(path.resolve(diskRoot), 'design-studio');
  return path.join(__dirname, '..', 'data', 'design-studio');
}

function filesDir(dataDir) {
  return path.join(dataDir, 'files');
}

function libraryPath(dataDir) {
  return path.join(dataDir, 'library.json');
}

function ensureDirs(dataDir) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const files = filesDir(dataDir);
  if (!fs.existsSync(files)) fs.mkdirSync(files, { recursive: true });
}

function emptyLibrary() {
  return { cats: [], items: [], prefs: [] };
}

function readLibrary(dataDir) {
  ensureDirs(dataDir);
  const file = libraryPath(dataDir);
  if (!fs.existsSync(file)) return emptyLibrary();
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      cats: Array.isArray(parsed.cats) ? parsed.cats : [],
      items: Array.isArray(parsed.items) ? parsed.items : [],
      prefs: Array.isArray(parsed.prefs) ? parsed.prefs : [],
    };
  } catch (err) {
    console.warn('[DesignStudio] library.json unreadable, starting empty:', err.message);
    return emptyLibrary();
  }
}

function writeLibrary(dataDir, lib) {
  ensureDirs(dataDir);
  const file = libraryPath(dataDir);
  const tmp = `${file}.tmp`;
  const payload = JSON.stringify(
    {
      cats: lib.cats || [],
      items: lib.items || [],
      prefs: lib.prefs || [],
    },
    null,
    2
  );
  fs.writeFileSync(tmp, payload);
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {
    /* ignore */
  }
  fs.renameSync(tmp, file);
}

function safeId(id) {
  const value = String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  return value.slice(0, 80);
}

function extFor(item, originalName = '') {
  const fromName = path.extname(String(originalName || '')).toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  if (item?.ext) return String(item.ext).startsWith('.') ? item.ext : `.${item.ext}`;
  return MIME_EXT[String(item?.mime || '').toLowerCase()] || '.bin';
}

function filePathFor(dataDir, item, originalName) {
  const id = safeId(item.id);
  return path.join(filesDir(dataDir), `${id}${extFor(item, originalName)}`);
}

function findItemFile(dataDir, item) {
  const id = safeId(item.id);
  const preferred = filePathFor(dataDir, item);
  if (fs.existsSync(preferred)) return preferred;
  const dir = filesDir(dataDir);
  if (!fs.existsSync(dir)) return null;
  const hit = fs.readdirSync(dir).find((name) => name.startsWith(`${id}.`) || name === id);
  return hit ? path.join(dir, hit) : null;
}

module.exports = {
  resolveDataDir,
  filesDir,
  libraryPath,
  ensureDirs,
  readLibrary,
  writeLibrary,
  safeId,
  extFor,
  filePathFor,
  findItemFile,
  MIME_EXT,
};
