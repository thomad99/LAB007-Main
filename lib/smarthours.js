'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday'
};

const TABLET = { width: 600, height: 1024 };

/**
 * Persistent data root for SmartHours.
 * Render: LAB007_DATA_DIR=/var/data/lab007 → /var/data/lab007/SmartHours/
 * Override: SMARTHOURS_DATA_DIR=<full path>
 * Local fallback: ./data/SmartHours/
 */
function resolveDataDir() {
  const explicit = String(process.env.SMARTHOURS_DATA_DIR || '').trim();
  if (explicit) return path.resolve(explicit);
  const diskRoot = String(process.env.LAB007_DATA_DIR || process.env.LAB007_DISK_ROOT || '').trim();
  if (diskRoot) return path.join(path.resolve(diskRoot), 'SmartHours');
  return path.join(__dirname, '..', 'data', 'SmartHours');
}

function storePath(dataDir) {
  return path.join(dataDir, 'smarthours.json');
}

function logosDir(dataDir) {
  return path.join(dataDir, 'logos');
}

function einkCacheDir(dataDir) {
  return path.join(dataDir, 'eink');
}

function ensureDirs(dataDir) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const logos = logosDir(dataDir);
  if (!fs.existsSync(logos)) fs.mkdirSync(logos, { recursive: true });
  const eink = einkCacheDir(dataDir);
  if (!fs.existsSync(eink)) fs.mkdirSync(eink, { recursive: true });
}

/** One-time move from legacy ./data/smarthours or $DISK/smarthours → SmartHours */
function migrateLegacyDataDir(dataDir) {
  ensureDirs(dataDir);
  const candidates = [];
  const diskRoot = String(process.env.LAB007_DATA_DIR || process.env.LAB007_DISK_ROOT || '').trim();
  if (diskRoot) candidates.push(path.join(path.resolve(diskRoot), 'smarthours'));
  candidates.push(path.join(__dirname, '..', 'data', 'smarthours'));

  const destStore = storePath(dataDir);
  if (fs.existsSync(destStore)) return;

  for (const legacy of candidates) {
    if (!legacy || path.resolve(legacy) === path.resolve(dataDir)) continue;
    const legacyStore = path.join(legacy, 'smarthours.json');
    if (!fs.existsSync(legacyStore)) continue;
    try {
      fs.copyFileSync(legacyStore, destStore);
      const legacyLogos = path.join(legacy, 'logos');
      if (fs.existsSync(legacyLogos)) {
        fs.readdirSync(legacyLogos).forEach((name) => {
          const from = path.join(legacyLogos, name);
          const to = path.join(logosDir(dataDir), name);
          if (fs.statSync(from).isFile() && !fs.existsSync(to)) fs.copyFileSync(from, to);
        });
      }
      console.log('[SmartHours] Migrated data:', legacy, '→', dataDir);
      return;
    } catch (err) {
      console.warn('[SmartHours] Legacy migrate failed from', legacy, err.message);
    }
  }
}

function emptyDay() {
  return { closed: true, open: '09:00', close: '17:00', open2: '', close2: '' };
}

function defaultHours() {
  const hours = {};
  DAYS.forEach((day) => {
    hours[day] = emptyDay();
    if (day !== 'sunday') {
      hours[day].closed = false;
      hours[day].open = '09:00';
      hours[day].close = '17:00';
    }
  });
  return hours;
}

function defaultLayout() {
  return [
    { id: 'logo', type: 'logo', x: 150, y: 36, w: 300, h: 100 },
    { id: 'title', type: 'title', x: 40, y: 160, w: 520, h: 70 },
    { id: 'status', type: 'status', x: 40, y: 240, w: 520, h: 48 },
    { id: 'hours', type: 'hours', x: 40, y: 310, w: 520, h: 620 }
  ];
}

function defaultDesign() {
  return {
    backgroundColor: '#0b1020',
    textColor: '#f6f8ff',
    accentColor: '#76f4c5',
    mutedColor: '#9aa7bd',
    fontFamily: 'Georgia, "Times New Roman", serif',
    titleFontSize: 34,
    hoursFontSize: 22,
    statusFontSize: 20,
    logoUrl: '',
    showLogo: true,
    showTitle: true,
    showStatus: true,
    showHours: true,
    layout: defaultLayout()
  };
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'customer';
}

function uniqueSlug(base, customers, exceptId) {
  let slug = slugify(base);
  let n = 2;
  const taken = (s) =>
    (customers || []).some((c) => c.slug === s && c.id !== exceptId);
  while (taken(slug)) {
    slug = `${slugify(base)}-${n}`;
    n += 1;
  }
  return slug;
}

function normalizeDay(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    closed: Boolean(src.closed),
    open: String(src.open || '09:00').slice(0, 5),
    close: String(src.close || '17:00').slice(0, 5),
    open2: String(src.open2 || '').slice(0, 5),
    close2: String(src.close2 || '').slice(0, 5)
  };
}

function normalizeHours(raw) {
  const hours = {};
  DAYS.forEach((day) => {
    hours[day] = normalizeDay(raw && raw[day]);
  });
  return hours;
}

function normalizeLayout(raw) {
  const defaults = defaultLayout();
  if (!Array.isArray(raw) || !raw.length) return defaults;
  const byType = new Map(raw.map((item) => [item.type, item]));
  return defaults.map((def) => {
    const hit = byType.get(def.type) || {};
    return {
      id: def.id,
      type: def.type,
      x: Math.max(0, Math.min(TABLET.width - 40, Number(hit.x ?? def.x) || def.x)),
      y: Math.max(0, Math.min(TABLET.height - 40, Number(hit.y ?? def.y) || def.y)),
      w: Math.max(40, Math.min(TABLET.width, Number(hit.w ?? def.w) || def.w)),
      h: Math.max(30, Math.min(TABLET.height, Number(hit.h ?? def.h) || def.h))
    };
  });
}

function normalizeDesign(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const base = defaultDesign();
  return {
    backgroundColor: String(src.backgroundColor || base.backgroundColor),
    textColor: String(src.textColor || base.textColor),
    accentColor: String(src.accentColor || base.accentColor),
    mutedColor: String(src.mutedColor || base.mutedColor),
    fontFamily: String(src.fontFamily || base.fontFamily),
    titleFontSize: Math.max(12, Math.min(72, Number(src.titleFontSize) || base.titleFontSize)),
    hoursFontSize: Math.max(12, Math.min(48, Number(src.hoursFontSize) || base.hoursFontSize)),
    statusFontSize: Math.max(12, Math.min(48, Number(src.statusFontSize) || base.statusFontSize)),
    logoUrl: String(src.logoUrl || ''),
    showLogo: src.showLogo !== false,
    showTitle: src.showTitle !== false,
    showStatus: src.showStatus !== false,
    showHours: src.showHours !== false,
    layout: normalizeLayout(src.layout)
  };
}

function defaultEink() {
  return {
    enabled: true,
    pollIntervalMinutes: 720,
    width: 800,
    height: 480,
    inverted: false
  };
}

function normalizeEink(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const base = defaultEink();
  const width = Math.max(200, Math.min(1200, Number(src.width) || base.width));
  const height = Math.max(120, Math.min(1200, Number(src.height) || base.height));
  const poll = Math.max(1, Math.min(60 * 24 * 14, Number(src.pollIntervalMinutes) || base.pollIntervalMinutes));
  return {
    enabled: src.enabled !== false,
    pollIntervalMinutes: poll,
    width,
    height,
    inverted: Boolean(src.inverted)
  };
}

function normalizeCustomer(raw, customers) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const id = String(src.id || crypto.randomUUID());
  const name = String(src.name || 'New Customer').trim() || 'New Customer';
  const slug = uniqueSlug(src.slug || name, customers || [], id);
  return {
    id,
    name,
    slug,
    googlePlaceId: String(src.googlePlaceId || '').trim(),
    googleMapsUrl: String(src.googleMapsUrl || '').trim(),
    useManualHours: Boolean(src.useManualHours),
    hours: normalizeHours(src.hours),
    googleHours: src.googleHours ? normalizeHours(src.googleHours) : null,
    googleDisplayName: String(src.googleDisplayName || '').trim(),
    lastSyncedAt: src.lastSyncedAt ? String(src.lastSyncedAt) : null,
    lastSyncError: src.lastSyncError ? String(src.lastSyncError) : null,
    design: normalizeDesign(src.design),
    eink: normalizeEink(src.eink),
    createdAt: String(src.createdAt || new Date().toISOString()),
    updatedAt: String(src.updatedAt || new Date().toISOString())
  };
}

function emptyStore() {
  return { version: 1, customers: [], updatedAt: new Date().toISOString() };
}

function loadStore(dataDir) {
  migrateLegacyDataDir(dataDir);
  ensureDirs(dataDir);
  const file = storePath(dataDir);
  try {
    if (!fs.existsSync(file)) return emptyStore();
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const customers = Array.isArray(parsed.customers)
      ? parsed.customers.map((c, _, arr) => normalizeCustomer(c, arr))
      : [];
    return { version: 1, customers, updatedAt: parsed.updatedAt || new Date().toISOString() };
  } catch (err) {
    console.error('[SmartHours] Failed to read store:', err.message);
    return emptyStore();
  }
}

function saveStore(dataDir, store) {
  ensureDirs(dataDir);
  const file = storePath(dataDir);
  const payload = {
    version: 1,
    customers: (store.customers || []).map((c, _, arr) => normalizeCustomer(c, arr)),
    updatedAt: new Date().toISOString()
  };
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return payload;
}

function extractPlaceId(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (/^ChIJ[\w-]+$/.test(raw)) return raw;
  const fromQuery = raw.match(/[?&]place_id=([^&]+)/i);
  if (fromQuery) return decodeURIComponent(fromQuery[1]);
  const fromPath = raw.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  if (fromPath) return fromPath[1];
  const chij = raw.match(/(ChIJ[\w-]+)/);
  if (chij) return chij[1];
  return '';
}

function googleDayIndexToKey(dayIndex) {
  // Google: 0 = Sunday … 6 = Saturday
  return DAYS[(dayIndex + 6) % 7];
}

function minutesToHhmm(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function periodsToHours(periods) {
  const hours = defaultHours();
  DAYS.forEach((day) => {
    hours[day] = emptyDay();
  });
  if (!Array.isArray(periods)) return hours;

  const byDay = {};
  DAYS.forEach((d) => {
    byDay[d] = [];
  });

  periods.forEach((period) => {
    const open = period.open || period.openTime;
    const close = period.close || period.closeTime;
    if (!open) return;
    const dayKey = googleDayIndexToKey(Number(open.day ?? open.dayOfWeek ?? 0));
    const openMin =
      open.hour != null
        ? Number(open.hour) * 60 + Number(open.minute || 0)
        : Number(open.hours || 0) * 60 + Number(open.minutes || 0);
    let closeMin = 24 * 60;
    if (close) {
      closeMin =
        close.hour != null
          ? Number(close.hour) * 60 + Number(close.minute || 0)
          : Number(close.hours || 0) * 60 + Number(close.minutes || 0);
    }
    byDay[dayKey].push({ open: openMin, close: closeMin });
  });

  DAYS.forEach((day) => {
    const slots = byDay[day].sort((a, b) => a.open - b.open);
    if (!slots.length) {
      hours[day] = emptyDay();
      return;
    }
    hours[day] = {
      closed: false,
      open: minutesToHhmm(slots[0].open),
      close: minutesToHhmm(slots[0].close % (24 * 60) || slots[0].close),
      open2: slots[1] ? minutesToHhmm(slots[1].open) : '',
      close2: slots[1] ? minutesToHhmm(slots[1].close % (24 * 60) || slots[1].close) : ''
    };
  });
  return hours;
}

function placesApiKey() {
  return String(
    process.env.GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.SMARTHOURS_GOOGLE_API_KEY ||
      ''
  ).trim();
}

async function fetchGooglePlaceHours(placeIdOrUrl) {
  const placeId = extractPlaceId(placeIdOrUrl);
  if (!placeId) {
    const err = new Error('Add a Google Place ID or Maps URL that includes a place_id.');
    err.status = 400;
    throw err;
  }
  const apiKey = placesApiKey();
  if (!apiKey) {
    const err = new Error(
      'Google Places API key is not configured. Set GOOGLE_PLACES_API_KEY (or GOOGLE_MAPS_API_KEY) on the server, or use manual hours.'
    );
    err.status = 503;
    throw err;
  }

  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
  const res = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'id,displayName,regularOpeningHours,currentOpeningHours'
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      data?.error?.message || data?.error?.status || `Google Places request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502;
    throw err;
  }

  const opening = data.regularOpeningHours || data.currentOpeningHours || {};
  const periods = opening.periods || [];
  const hours = periodsToHours(periods);
  return {
    placeId: data.id || placeId,
    displayName: data.displayName?.text || data.displayName || '',
    hours,
    rawWeekdayDescriptions: opening.weekdayDescriptions || []
  };
}

function effectiveHours(customer) {
  if (customer.useManualHours || !customer.googleHours) return customer.hours;
  return customer.googleHours;
}

function formatRange(open, close) {
  if (!open || !close) return '';
  return `${open} – ${close}`;
}

function formatDayHours(day) {
  if (!day || day.closed) return 'Closed';
  const primary = formatRange(day.open, day.close);
  const secondary = formatRange(day.open2, day.close2);
  return secondary ? `${primary}, ${secondary}` : primary || 'Closed';
}

function isOpenNow(hours, date = new Date()) {
  const dayKey = DAYS[(date.getDay() + 6) % 7];
  const day = hours[dayKey];
  if (!day || day.closed) return false;
  const mins = date.getHours() * 60 + date.getMinutes();
  const inSlot = (open, close) => {
    if (!open || !close) return false;
    const [oh, om] = open.split(':').map(Number);
    const [ch, cm] = close.split(':').map(Number);
    const start = oh * 60 + om;
    let end = ch * 60 + cm;
    if (end <= start) end += 24 * 60;
    const cur = mins < start && end > 24 * 60 ? mins + 24 * 60 : mins;
    return cur >= start && cur < end;
  };
  return inSlot(day.open, day.close) || inSlot(day.open2, day.close2);
}

function publicPayload(customer, reqBaseUrl) {
  const hours = effectiveHours(customer);
  const design = normalizeDesign(customer.design);
  let logoUrl = design.logoUrl || '';
  if (logoUrl.startsWith('/api/smarthours/') && reqBaseUrl) {
    logoUrl = logoUrl;
  }
  return {
    id: customer.id,
    name: customer.name,
    slug: customer.slug,
    hours,
    openNow: isOpenNow(hours),
    dayLabels: DAY_LABELS,
    days: DAYS,
    design: { ...design, logoUrl },
    eink: normalizeEink(customer.eink),
    tablet: TABLET,
    lastSyncedAt: customer.lastSyncedAt,
    useManualHours: customer.useManualHours,
    updatedAt: customer.updatedAt
  };
}

function hoursEqual(a, b) {
  return JSON.stringify(normalizeHours(a)) === JSON.stringify(normalizeHours(b));
}

async function syncCustomerGoogleHours(customer) {
  const source = customer.googlePlaceId || customer.googleMapsUrl;
  if (!source) {
    return { customer, changed: false, skipped: true, reason: 'No Google Place ID/URL set.' };
  }
  try {
    const fetched = await fetchGooglePlaceHours(source);
    const prev = customer.googleHours;
    customer.googlePlaceId = extractPlaceId(fetched.placeId) || customer.googlePlaceId;
    customer.googleDisplayName = fetched.displayName || customer.googleDisplayName;
    customer.googleHours = fetched.hours;
    if (!customer.useManualHours) {
      customer.hours = fetched.hours;
    }
    customer.lastSyncedAt = new Date().toISOString();
    customer.lastSyncError = null;
    customer.updatedAt = new Date().toISOString();
    const changed = !prev || !hoursEqual(prev, fetched.hours);
    return { customer, changed, skipped: false };
  } catch (err) {
    customer.lastSyncError = err.message || 'Sync failed';
    customer.updatedAt = new Date().toISOString();
    return { customer, changed: false, skipped: false, error: err.message };
  }
}

async function syncAllCustomers(dataDir) {
  const store = loadStore(dataDir);
  let synced = 0;
  let changed = 0;
  let errors = 0;
  for (let i = 0; i < store.customers.length; i += 1) {
    const result = await syncCustomerGoogleHours(store.customers[i]);
    store.customers[i] = result.customer;
    if (!result.skipped) synced += 1;
    if (result.changed) changed += 1;
    if (result.error) errors += 1;
  }
  saveStore(dataDir, store);
  return { synced, changed, errors, total: store.customers.length };
}

function saveLogoFile(dataDir, customerId, dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    const err = new Error('Logo must be a data URL image.');
    err.status = 400;
    throw err;
  }
  const mime = match[1].toLowerCase();
  const ext = mime.includes('png')
    ? 'png'
    : mime.includes('webp')
      ? 'webp'
      : mime.includes('gif')
        ? 'gif'
        : 'jpg';
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > 1.5 * 1024 * 1024) {
    const err = new Error('Logo image must be under 1.5MB.');
    err.status = 400;
    throw err;
  }
  ensureDirs(dataDir);
  const fileName = `${customerId}.${ext}`;
  fs.writeFileSync(path.join(logosDir(dataDir), fileName), buf);
  return `/api/smarthours/public/${encodeURIComponent(customerId)}/logo?v=${Date.now()}`;
}

function readLogoFile(dataDir, customerId) {
  const dir = logosDir(dataDir);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(`${customerId}.`));
  if (!files.length) return null;
  const file = path.join(dir, files[0]);
  const ext = path.extname(files[0]).toLowerCase();
  const type =
    ext === '.png'
      ? 'image/png'
      : ext === '.webp'
        ? 'image/webp'
        : ext === '.gif'
          ? 'image/gif'
          : 'image/jpeg';
  return { buffer: fs.readFileSync(file), type };
}

module.exports = {
  DAYS,
  DAY_LABELS,
  TABLET,
  resolveDataDir,
  storePath,
  logosDir,
  einkCacheDir,
  ensureDirs,
  migrateLegacyDataDir,
  loadStore,
  saveStore,
  normalizeCustomer,
  normalizeHours,
  normalizeDesign,
  normalizeEink,
  defaultEink,
  defaultHours,
  defaultDesign,
  slugify,
  uniqueSlug,
  extractPlaceId,
  fetchGooglePlaceHours,
  syncCustomerGoogleHours,
  syncAllCustomers,
  effectiveHours,
  formatDayHours,
  isOpenNow,
  publicPayload,
  saveLogoFile,
  readLogoFile,
  placesApiKey
};
