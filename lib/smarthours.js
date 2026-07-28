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
  const mediaRoot = path.join(dataDir, 'media');
  if (!fs.existsSync(mediaRoot)) fs.mkdirSync(mediaRoot, { recursive: true });
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
    { id: 'logo', type: 'logo', x: 150, y: 28, w: 300, h: 90 },
    { id: 'title', type: 'title', x: 40, y: 130, w: 520, h: 60 },
    { id: 'status', type: 'status', x: 40, y: 200, w: 520, h: 120 },
    { id: 'hours', type: 'hours', x: 40, y: 640, w: 520, h: 340 }
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
    statusFontSize: 48,
    logoUrl: '',
    showLogo: true,
    showTitle: true,
    showStatus: true,
    showHours: true,
    showSlideshow: false,
    statusMode: 'badge', // text | badge | image
    openMediaId: '',
    closedMediaId: '',
    slideshowIntervalSec: 8,
    slideshowMediaIds: [],
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

const LAYOUT_TYPES = new Set(['logo', 'title', 'status', 'slideshow', 'hours', 'text', 'image']);

function normalizeLayoutItem(raw, index) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const type = LAYOUT_TYPES.has(String(src.type || '')) ? String(src.type) : 'text';
  const id = String(src.id || `${type}-${index + 1}-${Math.random().toString(36).slice(2, 7)}`);
  const item = {
    id,
    type,
    x: Math.max(0, Math.min(TABLET.width - 40, Number(src.x) || 40)),
    y: Math.max(0, Math.min(TABLET.height - 40, Number(src.y) || 40)),
    w: Math.max(40, Math.min(TABLET.width, Number(src.w) || (type === 'text' ? 400 : 280))),
    h: Math.max(24, Math.min(TABLET.height, Number(src.h) || (type === 'text' ? 48 : 200)))
  };
  if (type === 'text') {
    item.text = String(src.text != null ? src.text : 'New text').slice(0, 500);
    item.fontSize = Math.max(10, Math.min(120, Number(src.fontSize) || 28));
    item.color = String(src.color || '').trim();
    item.align = ['left', 'center', 'right'].includes(src.align) ? src.align : 'center';
    item.bold = src.bold !== false;
  }
  if (type === 'image') {
    item.mediaId = String(src.mediaId || '').trim();
    item.fit = src.fit === 'contain' ? 'contain' : 'cover';
  }
  return item;
}

function normalizeLayout(raw) {
  if (!Array.isArray(raw) || !raw.length) return defaultLayout();
  return raw.map((item, index) => normalizeLayoutItem(item, index)).slice(0, 40);
}

function normalizeMediaList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const id = String(item.id || '').trim();
      if (!id) return null;
      return {
        id,
        name: String(item.name || id).trim().slice(0, 120),
        fileName: String(item.fileName || '').trim(),
        createdAt: String(item.createdAt || new Date().toISOString())
      };
    })
    .filter(Boolean);
}

function normalizeDesign(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const base = defaultDesign();
  const statusMode = ['text', 'badge', 'image'].includes(src.statusMode) ? src.statusMode : base.statusMode;
  const slideshowMediaIds = Array.isArray(src.slideshowMediaIds)
    ? src.slideshowMediaIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  let layout = normalizeLayout(src.layout);
  // Legacy designs kept all slots in layout and hid them with show* flags.
  if (src.showLogo === false) layout = layout.filter((e) => e.type !== 'logo');
  if (src.showTitle === false) layout = layout.filter((e) => e.type !== 'title');
  if (src.showStatus === false) layout = layout.filter((e) => e.type !== 'status');
  if (src.showHours === false) layout = layout.filter((e) => e.type !== 'hours');
  if (src.showSlideshow === false) layout = layout.filter((e) => e.type !== 'slideshow');
  return {
    backgroundColor: String(src.backgroundColor || base.backgroundColor),
    textColor: String(src.textColor || base.textColor),
    accentColor: String(src.accentColor || base.accentColor),
    mutedColor: String(src.mutedColor || base.mutedColor),
    fontFamily: String(src.fontFamily || base.fontFamily),
    titleFontSize: Math.max(12, Math.min(72, Number(src.titleFontSize) || base.titleFontSize)),
    hoursFontSize: Math.max(12, Math.min(48, Number(src.hoursFontSize) || base.hoursFontSize)),
    statusFontSize: Math.max(12, Math.min(120, Number(src.statusFontSize) || base.statusFontSize)),
    logoUrl: String(src.logoUrl || ''),
    showLogo: layout.some((e) => e.type === 'logo'),
    showTitle: layout.some((e) => e.type === 'title'),
    showStatus: layout.some((e) => e.type === 'status'),
    showHours: layout.some((e) => e.type === 'hours'),
    showSlideshow: layout.some((e) => e.type === 'slideshow'),
    statusMode,
    openMediaId: String(src.openMediaId || ''),
    closedMediaId: String(src.closedMediaId || ''),
    slideshowIntervalSec: Math.max(2, Math.min(300, Number(src.slideshowIntervalSec) || base.slideshowIntervalSec)),
    slideshowMediaIds,
    layout
  };
}

function defaultEink() {
  return {
    enabled: true,
    pollIntervalMinutes: 720,
    width: 600,
    height: 1024,
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
    media: normalizeMediaList(src.media),
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

function extractPlaceId(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (/^ChIJ[\w-]+$/.test(raw)) return raw;
  if (/^places\/ChIJ[\w-]+$/i.test(raw)) return raw.replace(/^places\//i, '');
  const fromQuery = raw.match(/[?&](?:place_id|placeid)=([^&]+)/i);
  if (fromQuery) return decodeURIComponent(fromQuery[1]);
  const chij = raw.match(/(ChIJ[\w-]+)/);
  if (chij) return chij[1];
  return '';
}

function extractMapsHexId(input) {
  const raw = String(input || '').trim();
  const hit = raw.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  return hit ? hit[1] : '';
}

function extractBusinessNameHint(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const q = u.searchParams.get('q');
    if (q && !/^https?:/i.test(q) && !/^\d+(\.\d+)?\s*,\s*-?\d+/.test(q)) {
      return decodeURIComponent(q.replace(/\+/g, ' ')).trim();
    }
    const placePath = u.pathname.match(/\/maps\/place\/([^/]+)/i);
    if (placePath) {
      return decodeURIComponent(placePath[1].replace(/\+/g, ' ')).trim();
    }
  } catch (_) {
    /* ignore */
  }
  const noscriptQ = raw.match(/\/search\?q=([^"'&]+)/i);
  if (noscriptQ) {
    return decodeURIComponent(noscriptQ[1].replace(/\+/g, ' ')).trim();
  }
  const title = raw.match(/<title>([^<]+)<\/title>/i);
  if (title) {
    const t = title[1].replace(/\s*[-|].*$/, '').replace(/Google Search/i, '').trim();
    if (t && t.length > 2) return t;
  }
  return '';
}

async function fetchTextFollowRedirects(url, options = {}) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent':
        options.userAgent ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
  const text = await res.text();
  return { url: res.url || url, status: res.status, text };
}

/**
 * Resolve Place ID / business query from Place ID, Maps URL, or share.google short link.
 */
async function resolveGooglePlaceRef(placeIdOrUrl) {
  const raw = String(placeIdOrUrl || '').trim();
  if (!raw) {
    const err = new Error('Add a Google Place ID, Maps URL, or share.google link.');
    err.status = 400;
    throw err;
  }

  let placeId = extractPlaceId(raw);
  if (placeId) return { placeId, query: '', sourceUrl: raw };

  let hexId = extractMapsHexId(raw);
  let query = '';
  let sourceUrl = raw;

  const looksLikeUrl = /^https?:\/\//i.test(raw) || /share\.google|maps\.app\.goo\.gl|goo\.gl\/maps|google\.[^/]+\/maps/i.test(raw);
  if (looksLikeUrl) {
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const page = await fetchTextFollowRedirects(href);
      sourceUrl = page.url || href;
      placeId = extractPlaceId(sourceUrl) || extractPlaceId(page.text);
      hexId = hexId || extractMapsHexId(sourceUrl) || extractMapsHexId(page.text);
      query =
        extractBusinessNameHint(sourceUrl) ||
        extractBusinessNameHint(page.text) ||
        extractBusinessNameHint(href);
    } catch (err) {
      query = extractBusinessNameHint(raw);
      if (!query) {
        const wrapped = new Error(`Could not open Google link: ${err.message}`);
        wrapped.status = 502;
        throw wrapped;
      }
    }
  } else if (!/^ChIJ/i.test(raw) && raw.length > 2) {
    // Treat plain text as a business search query
    query = raw;
  }

  if (placeId) return { placeId, query, sourceUrl, hexId };

  if (query) return { placeId: '', query, sourceUrl, hexId };

  const err = new Error(
    'Could not find a Google Place from that link. Paste a Maps place URL, a Place ID (ChIJ…), or a share.google business link.'
  );
  err.status = 400;
  throw err;
}

async function placesSearchText(query, apiKey) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.regularOpeningHours,places.currentOpeningHours,places.formattedAddress'
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: 'en'
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      data?.error?.message || data?.error?.status || `Google Places search failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502;
    throw err;
  }
  const place = Array.isArray(data.places) && data.places[0] ? data.places[0] : null;
  if (!place) {
    const err = new Error(`No Google Business Profile found for “${query}”.`);
    err.status = 404;
    throw err;
  }
  return place;
}

async function placesGetById(placeId, apiKey) {
  const id = String(placeId || '').replace(/^places\//i, '');
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'id,displayName,regularOpeningHours,currentOpeningHours,formattedAddress'
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
  return data;
}

function parseClockToMinutes(raw) {
  const s = String(raw || '')
    .replace(/\u202f|\u00a0/g, ' ')
    .replace(/\./g, '')
    .trim();
  if (!s) return null;
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = Number(m24[1]);
    const min = Number(m24[2]);
    if (h >= 0 && h < 24 && min >= 0 && min < 60) return h * 60 + min;
  }
  const m12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!m12) return null;
  let h = Number(m12[1]);
  const min = Number(m12[2] || 0);
  const ap = m12[3].toUpperCase();
  if (h === 12) h = 0;
  if (ap === 'PM') h += 12;
  if (h >= 0 && h < 24 && min >= 0 && min < 60) return h * 60 + min;
  return null;
}

function parseHoursRangeText(raw) {
  const text = String(raw || '')
    .replace(/\u202f|\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || /^closed\b/i.test(text)) {
    return { closed: true, open: '09:00', close: '17:00', open2: '', close2: '' };
  }
  if (/24\s*hours|open\s*24/i.test(text)) {
    return { closed: false, open: '00:00', close: '23:59', open2: '', close2: '' };
  }
  const parts = text.split(/,|;/).map((p) => p.trim()).filter(Boolean);
  const slots = [];
  parts.forEach((part) => {
    const range = part.match(
      /(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*[–—−-]\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)/i
    );
    if (!range) return;
    const openMin = parseClockToMinutes(range[1]);
    const closeMin = parseClockToMinutes(range[2]);
    if (openMin == null || closeMin == null) return;
    slots.push({ open: minutesToHhmm(openMin), close: minutesToHhmm(closeMin) });
  });
  if (!slots.length) {
    return { closed: true, open: '09:00', close: '17:00', open2: '', close2: '' };
  }
  return {
    closed: false,
    open: slots[0].open,
    close: slots[0].close,
    open2: slots[1] ? slots[1].open : '',
    close2: slots[1] ? slots[1].close : ''
  };
}

function weekdayDescriptionsToHours(descriptions) {
  const hours = defaultHours();
  DAYS.forEach((day) => {
    hours[day] = emptyDay();
  });
  (descriptions || []).forEach((line) => {
    const raw = String(line || '').trim();
    if (!raw) return;
    const day = DAYS.find((d) => new RegExp(`^${DAY_LABELS[d]}\\b`, 'i').test(raw));
    if (!day) return;
    const rest = raw.replace(new RegExp(`^${DAY_LABELS[day]}\\s*[:\\-–]?\\s*`, 'i'), '').trim();
    hours[day] = parseHoursRangeText(rest);
  });
  return hours;
}

function hoursHaveAnyOpen(hours) {
  return DAYS.some((day) => hours[day] && !hours[day].closed);
}

async function launchSmartHoursBrowser() {
  const args = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];

  try {
    const chromium = require('@sparticuz/chromium');
    const puppeteer = require('puppeteer-core');
    chromium.setGraphicsMode = false;
    return puppeteer.launch({
      args: [...chromium.args, ...args],
      defaultViewport: { width: 1280, height: 900 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless ?? true
    });
  } catch (_) {
    /* try next */
  }

  try {
    const { chromium } = require('playwright');
    return chromium.launch({ headless: true, args });
  } catch (_) {
    /* try next */
  }

  try {
    const puppeteer = require('puppeteer');
    return puppeteer.launch({ headless: true, args });
  } catch (err) {
    const wrapped = new Error(
      'Could not open a browser to read Google hours (install Chrome/Puppeteer on the server), or set GOOGLE_PLACES_API_KEY.'
    );
    wrapped.status = 503;
    wrapped.cause = err;
    throw wrapped;
  }
}

async function scrapeGoogleHoursFromLink(placeIdOrUrl) {
  const resolved = await resolveGooglePlaceRef(placeIdOrUrl);
  const target =
    resolved.sourceUrl ||
    (resolved.query
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(resolved.query)}`
      : String(placeIdOrUrl));

  const browser = await launchSmartHoursBrowser();
  let page;
  try {
    // Playwright and Puppeteer both support newPage()
    page = await browser.newPage();
    if (typeof page.setUserAgent === 'function') {
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      );
    } else if (typeof page.setExtraHTTPHeaders === 'function') {
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    }
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
    try {
      await page.waitForTimeout?.(2500);
    } catch (_) {
      await new Promise((r) => setTimeout(r, 2500));
    }
    // Expand hours if collapsed
    try {
      await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('button, [role="button"], div[aria-label]'));
        const hit = nodes.find((el) => {
          const label = String(el.getAttribute('aria-label') || el.textContent || '').trim();
          return /^hours\b|opening hours|see more hours/i.test(label);
        });
        if (hit) hit.click();
      });
      await new Promise((r) => setTimeout(r, 900));
    } catch (_) {
      /* ignore */
    }

    const scraped = await page.evaluate(() => {
      const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const text = document.body ? document.body.innerText || '' : '';
      const lines = text
        .split(/\n+/)
        .map((s) => s.replace(/\u202f|\u00a0/g, ' ').trim())
        .filter(Boolean);
      const descriptions = [];
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const day = dayNames.find(
          (d) => line === d || line.startsWith(d + ' ') || line.startsWith(d + '\t') || line.startsWith(d + ':')
        );
        if (!day) continue;
        let rest = line.slice(day.length).replace(/^[\s:–-]+/, '').trim();
        if (!rest) {
          const next = lines[i + 1] || '';
          if (next && !dayNames.includes(next)) rest = next;
        }
        if (rest) descriptions.push(`${day} ${rest}`);
      }
      // Fallback: single-line "Monday 9 AM–5 PM" already captured above
      let title = document.title || '';
      title = title.replace(/\s*[-–|].*$/, '').replace(/Google Maps/i, '').trim();
      const h1 = document.querySelector('h1');
      const name = (h1 && h1.textContent ? h1.textContent.trim() : '') || title;
      return {
        name,
        url: location.href,
        descriptions,
        sample: lines.filter((l) => /Monday|Tuesday|AM|PM|Closed|Hours|Open/i.test(l)).slice(0, 40)
      };
    });

    const hours = weekdayDescriptionsToHours(scraped.descriptions);
    if (!hoursHaveAnyOpen(hours)) {
      const err = new Error(
        `Could not read opening hours from Google for “${scraped.name || resolved.query || 'business'}”. Make sure the Business Profile hours are public, or set GOOGLE_PLACES_API_KEY.`
      );
      err.status = 422;
      err.sample = scraped.sample;
      throw err;
    }

    const placeId = extractPlaceId(scraped.url) || resolved.placeId || '';
    return {
      placeId,
      displayName: scraped.name || resolved.query || '',
      formattedAddress: '',
      hours,
      rawWeekdayDescriptions: scraped.descriptions,
      resolvedFrom: scraped.url || resolved.sourceUrl || placeIdOrUrl,
      resolvedQuery: resolved.query || '',
      source: 'link-scrape'
    };
  } finally {
    try {
      if (page && typeof page.close === 'function') await page.close();
    } catch (_) {
      /* ignore */
    }
    try {
      await browser.close();
    } catch (_) {
      /* ignore */
    }
  }
}

async function fetchGooglePlaceHoursViaApi(placeIdOrUrl, apiKey) {
  const resolved = await resolveGooglePlaceRef(placeIdOrUrl);
  let place = null;
  if (resolved.placeId) {
    try {
      place = await placesGetById(resolved.placeId, apiKey);
    } catch (err) {
      if (!resolved.query) throw err;
      place = await placesSearchText(resolved.query, apiKey);
    }
  } else {
    place = await placesSearchText(resolved.query, apiKey);
  }

  const opening = place.regularOpeningHours || place.currentOpeningHours || {};
  const periods = opening.periods || [];
  let hours = periodsToHours(periods);
  if (!hoursHaveAnyOpen(hours) && Array.isArray(opening.weekdayDescriptions) && opening.weekdayDescriptions.length) {
    hours = weekdayDescriptionsToHours(opening.weekdayDescriptions);
  }
  if (!hoursHaveAnyOpen(hours) && !periods.length) {
    const err = new Error(
      `Found “${place.displayName?.text || resolved.query || 'business'}” but Google did not return opening hours. Check the Business Profile hours are public.`
    );
    err.status = 422;
    throw err;
  }
  const placeId = String(place.id || resolved.placeId || '')
    .replace(/^places\//i, '')
    .trim();
  return {
    placeId,
    displayName: place.displayName?.text || place.displayName || resolved.query || '',
    formattedAddress: place.formattedAddress || '',
    hours,
    rawWeekdayDescriptions: opening.weekdayDescriptions || [],
    resolvedFrom: resolved.sourceUrl || placeIdOrUrl,
    resolvedQuery: resolved.query || '',
    source: 'places-api'
  };
}

async function fetchGooglePlaceHours(placeIdOrUrl) {
  const apiKey = placesApiKey();
  if (apiKey) {
    try {
      return await fetchGooglePlaceHoursViaApi(placeIdOrUrl, apiKey);
    } catch (err) {
      // Fall through to link scrape when Places API fails (billing, wrong key, etc.)
      console.warn('[SmartHours] Places API failed, trying link scrape:', err.message);
    }
  }

  try {
    return await scrapeGoogleHoursFromLink(placeIdOrUrl);
  } catch (err) {
    if (!apiKey) {
      const wrapped = new Error(
        err.message ||
          'Could not fetch Google hours from that link. Set GOOGLE_PLACES_API_KEY for more reliable sync, or use manual hours.'
      );
      wrapped.status = err.status || 502;
      throw wrapped;
    }
    throw err;
  }
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

function mediaDir(dataDir, customerId) {
  return path.join(dataDir, 'media', String(customerId || '').trim());
}

function mediaPublicUrl(customerId, mediaId, version) {
  const v = version ? `?v=${encodeURIComponent(version)}` : '';
  return `/api/smarthours/public/${encodeURIComponent(customerId)}/media/${encodeURIComponent(mediaId)}${v}`;
}

function listMediaFiles(dataDir, customer) {
  const items = normalizeMediaList(customer.media);
  return items.map((item) => ({
    ...item,
    url: mediaPublicUrl(customer.id, item.id, item.createdAt)
  }));
}

function saveMediaFile(dataDir, customerId, dataUrl, originalName) {
  const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    const err = new Error('Media must be a data URL image.');
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
  if (buf.length > 2.5 * 1024 * 1024) {
    const err = new Error('Image must be under 2.5MB.');
    err.status = 400;
    throw err;
  }
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const dir = mediaDir(dataDir, customerId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const fileName = `${id}.${ext}`;
  fs.writeFileSync(path.join(dir, fileName), buf);
  const createdAt = new Date().toISOString();
  return {
    id,
    name: String(originalName || fileName).replace(/\.[^.]+$/, '').slice(0, 120) || id,
    fileName,
    createdAt,
    url: mediaPublicUrl(customerId, id, createdAt)
  };
}

function readMediaFile(dataDir, customerId, mediaId) {
  const dir = mediaDir(dataDir, customerId);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(`${mediaId}.`));
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
  return { buffer: fs.readFileSync(file), type, fileName: files[0] };
}

function deleteMediaFile(dataDir, customer, mediaId) {
  const id = String(mediaId || '').trim();
  const dir = mediaDir(dataDir, customer.id);
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir)
      .filter((f) => f.startsWith(`${id}.`))
      .forEach((f) => {
        try {
          fs.unlinkSync(path.join(dir, f));
        } catch (_) {
          /* ignore */
        }
      });
  }
  const media = normalizeMediaList(customer.media).filter((m) => m.id !== id);
  const design = normalizeDesign(customer.design);
  if (design.openMediaId === id) design.openMediaId = '';
  if (design.closedMediaId === id) design.closedMediaId = '';
  design.slideshowMediaIds = design.slideshowMediaIds.filter((x) => x !== id);
  design.layout = design.layout.map((el) => {
    if (el.type === 'image' && el.mediaId === id) return { ...el, mediaId: '' };
    return el;
  });
  return { media, design };
}

function publicPayload(customer, options = {}) {
  const hours = effectiveHours(customer);
  const design = normalizeDesign(customer.design);
  let logoUrl = design.logoUrl || '';
  const dataDir = options.dataDir || resolveDataDir();
  const media = listMediaFiles(dataDir, customer);
  const mediaById = new Map(media.map((m) => [m.id, m]));
  const openMedia = design.openMediaId ? mediaById.get(design.openMediaId) : null;
  const closedMedia = design.closedMediaId ? mediaById.get(design.closedMediaId) : null;
  const slideshow = design.slideshowMediaIds
    .map((id) => mediaById.get(id))
    .filter(Boolean);
  return {
    id: customer.id,
    name: customer.name,
    slug: customer.slug,
    hours,
    openNow: isOpenNow(hours),
    dayLabels: DAY_LABELS,
    days: DAYS,
    design: {
      ...design,
      logoUrl,
      openImageUrl: openMedia ? openMedia.url : '',
      closedImageUrl: closedMedia ? closedMedia.url : '',
      slideshowUrls: slideshow.map((m) => m.url),
      layout: design.layout.map((el) => {
        if (el.type !== 'image') return el;
        const m = el.mediaId ? mediaById.get(el.mediaId) : null;
        return { ...el, imageUrl: m ? m.url : '' };
      })
    },
    media,
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
  const source = customer.googleMapsUrl || customer.googlePlaceId;
  if (!source) {
    return { customer, changed: false, skipped: true, reason: 'No Google Place ID/URL set.' };
  }
  try {
    const fetched = await fetchGooglePlaceHours(source);
    const prev = customer.googleHours;
    customer.googlePlaceId = extractPlaceId(fetched.placeId) || customer.googlePlaceId;
    if (fetched.resolvedFrom && /^https?:/i.test(String(customer.googleMapsUrl || source))) {
      customer.googleMapsUrl = customer.googleMapsUrl || String(source);
    }
    customer.googleDisplayName = fetched.displayName || customer.googleDisplayName;
    customer.googleHours = fetched.hours;
    if (!customer.useManualHours) {
      customer.hours = fetched.hours;
    }
    customer.lastSyncedAt = new Date().toISOString();
    customer.lastSyncError = null;
    customer.updatedAt = new Date().toISOString();
    const changed = !prev || !hoursEqual(prev, fetched.hours);
    return {
      customer,
      changed,
      skipped: false,
      displayName: fetched.displayName,
      resolvedQuery: fetched.resolvedQuery
    };
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
  normalizeMediaList,
  normalizeEink,
  defaultEink,
  defaultHours,
  defaultDesign,
  slugify,
  uniqueSlug,
  extractPlaceId,
  resolveGooglePlaceRef,
  fetchGooglePlaceHours,
  syncCustomerGoogleHours,
  syncAllCustomers,
  effectiveHours,
  formatDayHours,
  isOpenNow,
  publicPayload,
  saveLogoFile,
  readLogoFile,
  saveMediaFile,
  readMediaFile,
  deleteMediaFile,
  listMediaFiles,
  mediaPublicUrl,
  placesApiKey
};
