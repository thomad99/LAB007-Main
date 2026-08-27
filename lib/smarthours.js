'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

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

/** Default panel size (landscape). Portrait uses these swapped. */
const DEFAULT_SCREEN = { width: 800, height: 480 };
/** @deprecated use tabletFromEink / DEFAULT_SCREEN — kept for older imports */
const TABLET = { width: DEFAULT_SCREEN.width, height: DEFAULT_SCREEN.height };

const COLOR_MODES = {
  '6color': {
    id: '6color',
    label: '6-color (Spectra 6)',
    // E Ink Spectra 6: black, white, red, yellow, blue, green
    colors: ['#000000', '#FFFFFF', '#FF0000', '#FFFF00', '#0000FF', '#00FF00']
  },
  '4color': {
    id: '4color',
    label: '4-color',
    colors: ['#000000', '#FFFFFF', '#FF0000', '#FFFF00']
  },
  grayscale: {
    id: 'grayscale',
    label: 'Grayscale',
    colors: ['#000000', '#555555', '#AAAAAA', '#FFFFFF']
  }
};

function parseHexRgb(hex, fallback = 0) {
  const m = String(hex || '').trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return { r: fallback, g: fallback, b: fallback };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function nearestPaletteColor(hex, palette) {
  const colors = Array.isArray(palette) && palette.length ? palette : COLOR_MODES['6color'].colors;
  const { r, g, b } = parseHexRgb(hex, 128);
  let best = colors[0];
  let bestDist = Infinity;
  colors.forEach((c) => {
    const p = parseHexRgb(c, 0);
    const d = (p.r - r) ** 2 + (p.g - g) ** 2 + (p.b - b) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  });
  return best;
}

function resolveColorMode(mode) {
  return COLOR_MODES[mode] ? mode : '6color';
}

function colorModePalette(mode) {
  return COLOR_MODES[resolveColorMode(mode)].colors.slice();
}

function defaultEink() {
  return {
    enabled: true,
    /** Devices should poll at least hourly so OPEN/CLOSED flips on opening times. */
    pollIntervalMinutes: 60,
    orientation: 'portrait',
    /** Extra mount rotation on top of orientation bake (0/90/180/270). */
    hangRotation: 0,
    colorMode: '6color',
    /** Physical panel framebuffer size (device cannot rotate — portrait is baked into the image). */
    width: DEFAULT_SCREEN.width,
    height: DEFAULT_SCREEN.height,
    inverted: false
  };
}

function normalizeHangRotation(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const r = ((Math.round(n) % 360) + 360) % 360;
  if (r === 90 || r === 180 || r === 270) return r;
  return 0;
}

function normalizeEink(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const base = defaultEink();
  const orientation =
    src.orientation === 'portrait' || src.orientation === 'landscape'
      ? src.orientation
      : base.orientation;
  const colorMode = resolveColorMode(src.colorMode);
  let width = Math.max(200, Math.min(2500, Number(src.width) || base.width));
  let height = Math.max(120, Math.min(2500, Number(src.height) || base.height));
  // Migrate older records that stored design (tall) size as width/height for portrait
  if (orientation === 'portrait' && width < height) {
    const t = width;
    width = height;
    height = t;
  }
  // Panel native size stays landscape-ordered (width = longer side for typical 800×480)
  if (orientation === 'landscape' && height > width) {
    const t = width;
    width = height;
    height = t;
  }
  const poll = Math.max(1, Math.min(60 * 24 * 14, Number(src.pollIntervalMinutes) || base.pollIntervalMinutes));
  return {
    enabled: src.enabled !== false,
    pollIntervalMinutes: poll,
    orientation,
    hangRotation: normalizeHangRotation(src.hangRotation),
    colorMode,
    width,
    height,
    inverted: Boolean(src.inverted)
  };
}

/** Physical panel framebuffer size (what the device draws). */
function panelFromEink(eink) {
  const e = normalizeEink(eink);
  return { width: e.width, height: e.height };
}

/**
 * Design canvas size — portrait is tall so you layout upright;
 * PNG output is then rotated for fixed panels that cannot rotate.
 */
function tabletFromEink(eink) {
  const e = normalizeEink(eink);
  if (e.orientation === 'portrait') {
    return { width: e.height, height: e.width };
  }
  return { width: e.width, height: e.height };
}

/**
 * Degrees to bake into display.png / device image.
 * Portrait => 90° so a non-rotating landscape panel shows upright content when hung in portrait.
 * Hang rotation is added on top.
 */
function outputRotationDegrees(eink) {
  const e = normalizeEink(eink);
  const orientRot = e.orientation === 'portrait' ? 90 : 0;
  return normalizeHangRotation(orientRot + e.hangRotation);
}

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

function templatesDir(dataDir) {
  return path.join(dataDir, 'templates');
}

function seedTemplatesDir() {
  return path.join(__dirname, '..', 'public', 'smarthours-assets', 'templates');
}

function ensureDirs(dataDir) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const logos = logosDir(dataDir);
  if (!fs.existsSync(logos)) fs.mkdirSync(logos, { recursive: true });
  const eink = einkCacheDir(dataDir);
  if (!fs.existsSync(eink)) fs.mkdirSync(eink, { recursive: true });
  const mediaRoot = path.join(dataDir, 'media');
  if (!fs.existsSync(mediaRoot)) fs.mkdirSync(mediaRoot, { recursive: true });
  const templates = templatesDir(dataDir);
  if (!fs.existsSync(templates)) fs.mkdirSync(templates, { recursive: true });
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

function defaultLayout(screen) {
  const w = Math.max(200, Number(screen && screen.width) || DEFAULT_SCREEN.width);
  const h = Math.max(120, Number(screen && screen.height) || DEFAULT_SCREEN.height);
  const font = '"DM Sans", system-ui, sans-serif';
  return [
    { id: 'title', type: 'title', x: 24, y: Math.round(h * 0.16), w: w - 48, h: Math.max(36, Math.round(h * 0.1)), fontSize: 28, fontFamily: font },
    { id: 'status', type: 'status', x: 24, y: Math.round(h * 0.28), w: w - 48, h: Math.max(56, Math.round(h * 0.16)), fontSize: 36, fontFamily: font, boxColor: '#FF0000', fontColor: '#000000', closedBoxColor: '#000000', closedFontColor: '#FFFFFF' },
    { id: 'hours', type: 'hours', x: 24, y: Math.round(h * 0.48), w: w - 48, h: Math.max(120, h - Math.round(h * 0.48) - 16), fontSize: 18, fontFamily: font }
  ];
}

function defaultDesign(screen) {
  const tablet = screen || DEFAULT_SCREEN;
  return {
    backgroundColor: '#FFFFFF',
    textColor: '#000000',
    accentColor: '#FF0000',
    mutedColor: '#555555',
    fontFamily: '"DM Sans", system-ui, sans-serif',
    titleFontSize: 28,
    hoursFontSize: 18,
    statusFontSize: 36,
    logoUrl: '',
    showLogo: false,
    showTitle: true,
    showStatus: true,
    showHours: true,
    showSlideshow: false,
    statusMode: 'badge', // text | badge | image
    openMediaId: '',
    closedMediaId: '',
    slideshowIntervalSec: 900, // 15 minutes — live HTML rotates slideshow images
    slideshowMediaIds: [],
    layout: defaultLayout(tablet)
  };
}

const RESERVED_SLUGS = new Set([
  'admin',
  'about',
  'v',
  'e',
  'studio',
  'public',
  'api',
  'assets',
  'display',
  'smarthours-admin',
  'smarthours'
]);

function requestedSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function slugify(value) {
  return requestedSlug(value) || 'customer';
}

function checkSlugAvailable(slug, customers, exceptId) {
  const value = requestedSlug(slug);
  if (!value || value.length < 2) {
    return {
      available: false,
      slug: value,
      error: 'Choose a URL name with at least 2 letters or numbers.'
    };
  }
  if (RESERVED_SLUGS.has(value)) {
    return {
      available: false,
      slug: value,
      error: 'That URL name is reserved. Choose another.'
    };
  }
  const taken = (customers || []).some((c) => c.slug === value && c.id !== exceptId);
  if (taken) {
    return {
      available: false,
      slug: value,
      error: 'That URL name is already taken. Choose another.'
    };
  }
  return { available: true, slug: value };
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

function normalizeTimeValue(raw, fallback) {
  const s = String(raw ?? '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h >= 0 && h < 24 && min >= 0 && min < 60) {
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
  }
  return fallback;
}

function normalizeDay(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    closed: Boolean(src.closed),
    open: normalizeTimeValue(src.open, '09:00'),
    close: normalizeTimeValue(src.close, '17:00'),
    open2: src.open2 ? normalizeTimeValue(src.open2, '') : '',
    close2: src.close2 ? normalizeTimeValue(src.close2, '') : ''
  };
}

function normalizeHours(raw) {
  const hours = {};
  DAYS.forEach((day) => {
    hours[day] = normalizeDay(raw && raw[day]);
  });
  return hours;
}

const LAYOUT_TYPES = new Set(['logo', 'title', 'status', 'slideshow', 'hours', 'text', 'image', 'sketch']);
const TEXT_LAYOUT_TYPES = new Set(['title', 'hours', 'status', 'text']);

function defaultFontSizeForType(type) {
  if (type === 'title') return 28;
  if (type === 'hours') return 18;
  if (type === 'status') return 36;
  return 28;
}

function resolveLayoutFontSize(el, design) {
  const n = Number(el && el.fontSize);
  if (Number.isFinite(n) && n > 0) return Math.max(10, Math.min(220, Math.round(n)));
  const d = design || {};
  if (el && el.type === 'title') return Math.max(10, Math.min(220, Number(d.titleFontSize) || 28));
  if (el && el.type === 'hours') return Math.max(10, Math.min(220, Number(d.hoursFontSize) || 18));
  if (el && el.type === 'status') return Math.max(10, Math.min(220, Number(d.statusFontSize) || 36));
  return 28;
}

function resolveLayoutFontFamily(el, design) {
  const fromEl = el && el.fontFamily ? String(el.fontFamily).trim() : '';
  if (fromEl) return fromEl;
  const fromDesign = design && design.fontFamily ? String(design.fontFamily).trim() : '';
  return fromDesign || '"DM Sans", system-ui, sans-serif';
}

function resolveStatusBadgeColors(el, design, openNow) {
  const accent = (design && design.accentColor) || '#FF0000';
  const boxOpen = (el && el.boxColor) || accent || '#FF0000';
  const fontOpen = (el && el.fontColor) || '#000000';
  const boxClosed = (el && el.closedBoxColor) || (el && el.boxColor) || '#000000';
  const fontClosed = (el && el.closedFontColor) || (el && el.fontColor) || '#FFFFFF';
  if (openNow) {
    return { box: String(boxOpen), font: String(fontOpen) };
  }
  return { box: String(boxClosed), font: String(fontClosed) };
}

function normalizeLayoutItem(raw, index, screen, designHints) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const type = LAYOUT_TYPES.has(String(src.type || '')) ? String(src.type) : 'text';
  const id = String(src.id || `${type}-${index + 1}-${Math.random().toString(36).slice(2, 7)}`);
  const maxW = Math.max(200, Number(screen && screen.width) || DEFAULT_SCREEN.width);
  const maxH = Math.max(120, Number(screen && screen.height) || DEFAULT_SCREEN.height);
  const w = Math.max(20, Math.min(maxW * 2, Number(src.w) || (type === 'text' ? Math.min(400, maxW) : Math.min(280, maxW))));
  const h = Math.max(16, Math.min(maxH * 2, Number(src.h) || (type === 'text' ? 48 : Math.min(200, maxH))));
  // Allow elements partly outside the tablet for alignment (match admin canvas drag)
  const item = {
    id,
    type,
    x: Math.max(-maxW, Math.min(maxW, Number(src.x) || 0)),
    y: Math.max(-maxH, Math.min(maxH, Number(src.y) || 0)),
    w,
    h
  };
  if (TEXT_LAYOUT_TYPES.has(type)) {
    const hints = designHints || {};
    let fallback = defaultFontSizeForType(type);
    if (type === 'title') fallback = Number(hints.titleFontSize) || fallback;
    if (type === 'hours') fallback = Number(hints.hoursFontSize) || fallback;
    if (type === 'status') fallback = Number(hints.statusFontSize) || fallback;
    item.fontSize = Math.max(10, Math.min(220, Number(src.fontSize) || fallback));
    item.fontFamily = String(src.fontFamily || hints.fontFamily || '"DM Sans", system-ui, sans-serif').trim().slice(0, 160);
  }
  if (type === 'status') {
    const boxColor = String(src.boxColor || '').trim();
    const fontColor = String(src.fontColor || '').trim();
    const closedBoxColor = String(src.closedBoxColor || '').trim();
    const closedFontColor = String(src.closedFontColor || '').trim();
    if (boxColor) item.boxColor = boxColor;
    if (fontColor) item.fontColor = fontColor;
    if (closedBoxColor) item.closedBoxColor = closedBoxColor;
    if (closedFontColor) item.closedFontColor = closedFontColor;
  }
  if (type === 'text') {
    item.text = String(src.text != null ? src.text : 'New text').slice(0, 500);
    item.color = String(src.color || '').trim();
    item.align = ['left', 'center', 'right'].includes(src.align) ? src.align : 'center';
    item.bold = src.bold !== false;
  }
  if (type === 'image') {
    item.mediaId = String(src.mediaId || '').trim();
    item.fit = src.fit === 'contain' ? 'contain' : 'cover';
  }
  if (type === 'sketch') {
    const dataUrl = String(src.dataUrl || '').trim();
    // Keep handwritten ink as a data URL (cap size so store stays reasonable)
    item.dataUrl =
      dataUrl.startsWith('data:image/') && dataUrl.length <= 900000 ? dataUrl : '';
    item.penColor = nearestPaletteColor(String(src.penColor || '#000000').trim(), COLOR_MODES['6color'].colors);
    item.penSize = Math.max(1, Math.min(24, Number(src.penSize) || 3));
  }
  return item;
}

function normalizeLayout(raw, screen, designHints) {
  if (!Array.isArray(raw) || !raw.length) return defaultLayout(screen);
  return raw.map((item, index) => normalizeLayoutItem(item, index, screen, designHints)).slice(0, 40);
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

function normalizeDesign(raw, screen, colorMode) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const tablet = screen || DEFAULT_SCREEN;
  const base = defaultDesign(tablet);
  const palette = colorModePalette(colorMode);
  const rawStatusMode = ['text', 'badge', 'image'].includes(src.statusMode) ? src.statusMode : base.statusMode;
  const statusMode = rawStatusMode === 'text' ? 'badge' : rawStatusMode;
  const slideshowMediaIds = Array.isArray(src.slideshowMediaIds)
    ? src.slideshowMediaIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  const designHints = {
    fontFamily: String(src.fontFamily || base.fontFamily),
    titleFontSize: Math.max(12, Math.min(220, Number(src.titleFontSize) || base.titleFontSize)),
    hoursFontSize: Math.max(12, Math.min(220, Number(src.hoursFontSize) || base.hoursFontSize)),
    statusFontSize: Math.max(12, Math.min(220, Number(src.statusFontSize) || base.statusFontSize))
  };
  let layout = normalizeLayout(src.layout, tablet, designHints);
  // Legacy designs kept all slots in layout and hid them with show* flags.
  if (src.showLogo === false) layout = layout.filter((e) => e.type !== 'logo');
  if (src.showTitle === false) layout = layout.filter((e) => e.type !== 'title');
  if (src.showStatus === false) layout = layout.filter((e) => e.type !== 'status');
  if (src.showHours === false) layout = layout.filter((e) => e.type !== 'hours');
  if (src.showSlideshow === false) layout = layout.filter((e) => e.type !== 'slideshow');
  layout = layout.map((el) => {
    if (el.type === 'text' && el.color) {
      return { ...el, color: nearestPaletteColor(el.color, palette) };
    }
    if (el.type === 'sketch' && el.penColor) {
      return { ...el, penColor: nearestPaletteColor(el.penColor, palette) };
    }
    if (el.type === 'status') {
      const next = { ...el };
      if (next.boxColor) next.boxColor = nearestPaletteColor(next.boxColor, palette);
      if (next.fontColor) next.fontColor = nearestPaletteColor(next.fontColor, palette);
      if (next.closedBoxColor) next.closedBoxColor = nearestPaletteColor(next.closedBoxColor, palette);
      if (next.closedFontColor) next.closedFontColor = nearestPaletteColor(next.closedFontColor, palette);
      return next;
    }
    return el;
  });
  return {
    backgroundColor: nearestPaletteColor(src.backgroundColor || base.backgroundColor, palette),
    textColor: nearestPaletteColor(src.textColor || base.textColor, palette),
    accentColor: nearestPaletteColor(src.accentColor || base.accentColor, palette),
    mutedColor: nearestPaletteColor(src.mutedColor || base.mutedColor, palette),
    fontFamily: String(src.fontFamily || base.fontFamily),
    titleFontSize: Math.max(12, Math.min(220, Number(src.titleFontSize) || base.titleFontSize)),
    hoursFontSize: Math.max(12, Math.min(220, Number(src.hoursFontSize) || base.hoursFontSize)),
    statusFontSize: Math.max(12, Math.min(220, Number(src.statusFontSize) || base.statusFontSize)),
    logoUrl: String(src.logoUrl || ''),
    showLogo: layout.some((e) => e.type === 'logo'),
    showTitle: layout.some((e) => e.type === 'title'),
    showStatus: layout.some((e) => e.type === 'status'),
    showHours: layout.some((e) => e.type === 'hours'),
    showSlideshow: layout.some((e) => e.type === 'slideshow'),
    statusMode,
    openMediaId: String(src.openMediaId || ''),
    closedMediaId: String(src.closedMediaId || ''),
    slideshowIntervalSec: Math.max(2, Math.min(86400, Number(src.slideshowIntervalSec) || base.slideshowIntervalSec)),
    slideshowMediaIds,
    layout
  };
}

function normalizeCustomer(raw, customers) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const id = String(src.id || crypto.randomUUID());
  const name = String(src.name || 'New Customer').trim() || 'New Customer';
  const slug = uniqueSlug(src.slug || name, customers || [], id);
  const eink = normalizeEink(src.eink);
  const tablet = tabletFromEink(eink);
  const bundle = normalizeDesignBundle(src, tablet, eink.colorMode);
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
    lastSyncAttemptAt: src.lastSyncAttemptAt ? String(src.lastSyncAttemptAt) : null,
    lastSyncError: src.lastSyncError ? String(src.lastSyncError) : null,
    lastSyncNote: src.lastSyncNote ? String(src.lastSyncNote) : null,
    googleSyncIntervalMinutes: normalizeGoogleSyncIntervalMinutes(src.googleSyncIntervalMinutes),
    design: bundle.design,
    designs: bundle.designs,
    liveDesignId: bundle.liveDesignId,
    media: normalizeMediaList(src.media),
    eink,
    email: normalizeEmail(src.email),
    accessTokens: normalizeAccessTokens(src.accessTokens),
    createdAt: String(src.createdAt || new Date().toISOString()),
    updatedAt: String(src.updatedAt || new Date().toISOString())
  };
}

const MAX_CUSTOMER_DESIGNS = 5;

function scrubMediaRefsFromDesign(design, mediaId) {
  const id = String(mediaId || '').trim();
  const next = design && typeof design === 'object' ? { ...design } : {};
  if (next.openMediaId === id) next.openMediaId = '';
  if (next.closedMediaId === id) next.closedMediaId = '';
  next.slideshowMediaIds = Array.isArray(next.slideshowMediaIds)
    ? next.slideshowMediaIds.filter((x) => x !== id)
    : [];
  next.layout = Array.isArray(next.layout)
    ? next.layout.map((el) => {
        if (el && el.type === 'image' && el.mediaId === id) return { ...el, mediaId: '' };
        return el;
      })
    : [];
  return next;
}

function normalizeDesignBundle(src, tablet, colorMode) {
  const raw = src && typeof src === 'object' ? src : {};
  const now = String(raw.updatedAt || new Date().toISOString());
  const fallbackDesign = normalizeDesign(raw.design, tablet, colorMode);
  let designs = Array.isArray(raw.designs) ? raw.designs.filter((d) => d && typeof d === 'object') : [];

  if (!designs.length) {
    const id = String(raw.liveDesignId || crypto.randomUUID());
    designs = [
      {
        id,
        name: 'Design1',
        design: fallbackDesign,
        updatedAt: now
      }
    ];
    return { designs, liveDesignId: id, design: fallbackDesign };
  }

  designs = designs.slice(0, MAX_CUSTOMER_DESIGNS).map((entry, i) => {
    const id = String(entry.id || crypto.randomUUID());
    const name = String(entry.name || `Design${i + 1}`)
      .trim()
      .slice(0, 40) || `Design${i + 1}`;
    const design = normalizeDesign(entry.design != null ? entry.design : i === 0 ? raw.design : {}, tablet, colorMode);
    return {
      id,
      name,
      design,
      updatedAt: String(entry.updatedAt || now)
    };
  });

  let liveDesignId = String(raw.liveDesignId || '');
  if (!designs.some((d) => d.id === liveDesignId)) liveDesignId = designs[0].id;

  const live = designs.find((d) => d.id === liveDesignId) || designs[0];
  return {
    designs,
    liveDesignId: live.id,
    design: live.design
  };
}

function emptyStore() {
  return {
    version: 1,
    settings: defaultSettings(),
    customers: [],
    devices: [],
    templateCategories: [],
    templates: [],
    updatedAt: new Date().toISOString()
  };
}

const STUDIO_LINK_MS = 10 * 24 * 60 * 60 * 1000;

function normalizeEmail(value) {
  const s = String(value || '')
    .trim()
    .toLowerCase()
    .slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return '';
  return s;
}

function normalizeAccessTokens(raw) {
  const now = Date.now();
  return (Array.isArray(raw) ? raw : [])
    .map((t) => {
      if (!t || typeof t !== 'object') return null;
      const hash = String(t.hash || '').trim().toLowerCase();
      const expiresAt = String(t.expiresAt || '');
      if (!/^[a-f0-9]{32,128}$/.test(hash) || !expiresAt) return null;
      if (Date.parse(expiresAt) <= now) return null;
      return {
        hash,
        expiresAt,
        createdAt: String(t.createdAt || expiresAt)
      };
    })
    .filter(Boolean)
    .slice(-8);
}

/** Bump this to re-apply new-customer defaults (portrait, layout, Google sync) to existing records. */
const CUSTOMER_CONFIG_VERSION = 2;

function defaultSettings() {
  return {
    autoSyncIntervalHours: 24,
    customerConfigVersion: CUSTOMER_CONFIG_VERSION
  };
}

const DEFAULT_GOOGLE_SYNC_MINUTES = 60;

function normalizeGoogleSyncIntervalMinutes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_GOOGLE_SYNC_MINUTES;
  return Math.max(0, Math.min(60 * 24 * 7, Math.round(n)));
}

function normalizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const n = Number(src.autoSyncIntervalHours);
  // 0 = disabled; 1–168 hours (1 week max)
  const hours = Number.isFinite(n) ? Math.max(0, Math.min(168, Math.round(n))) : 24;
  const ver = Number(src.customerConfigVersion);
  return {
    autoSyncIntervalHours: hours,
    customerConfigVersion: Number.isFinite(ver) ? Math.max(0, Math.round(ver)) : 0
  };
}

function portraitDefaultLayout(tablet, design) {
  const screen = tablet || DEFAULT_SCREEN;
  const w = Math.max(200, Number(screen.width) || DEFAULT_SCREEN.width);
  const h = Math.max(120, Number(screen.height) || DEFAULT_SCREEN.height);
  const hasLogo = Boolean(design && String(design.logoUrl || '').trim());
  const layout = defaultLayout(screen);
  if (!hasLogo) return layout;
  const logoH = Math.max(52, Math.round(h * 0.12));
  const shift = logoH + 8;
  return [
    { id: 'logo', type: 'logo', x: 24, y: 16, w: Math.min(200, w - 48), h: logoH },
    ...layout.map((el) => ({
      ...el,
      y: el.y + shift,
      h: el.type === 'hours' ? Math.max(80, el.h - shift) : el.h
    }))
  ];
}

function migrateExistingCustomerDefaults(raw) {
  const src = raw && typeof raw === 'object' ? { ...raw } : {};
  const einkIn = src.eink && typeof src.eink === 'object' ? { ...src.eink } : {};
  const oldPoll = Number(einkIn.pollIntervalMinutes);
  einkIn.orientation = 'portrait';
  if (!Number.isFinite(oldPoll) || oldPoll <= 0 || oldPoll === 720) {
    einkIn.pollIntervalMinutes = 60;
  }
  src.eink = einkIn;
  if (src.googleSyncIntervalMinutes == null || src.googleSyncIntervalMinutes === '') {
    src.googleSyncIntervalMinutes = DEFAULT_GOOGLE_SYNC_MINUTES;
  }
  const tablet = tabletFromEink(einkIn);
  const applyLayout = (design) => {
    const d = design && typeof design === 'object' ? { ...design } : {};
    d.layout = portraitDefaultLayout(tablet, d);
    return d;
  };
  src.design = applyLayout(src.design);
  if (Array.isArray(src.designs)) {
    src.designs = src.designs.map((slot) => {
      if (!slot || typeof slot !== 'object') return slot;
      return { ...slot, design: applyLayout(slot.design) };
    });
  }
  return src;
}

function deviceReportedCode(value) {
  return String(value || '').trim().slice(0, 64);
}

function normalizeWifiRssi(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n >= 0 || n < -120) return null;
  return Math.round(n);
}

function normalizeBatteryPercent(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normalizeBatteryMv(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(6000, Math.round(n)));
}

function normalizeReportedPoll(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(1, Math.min(60 * 24 * 14, Math.round(n)));
}

function deviceUrlCode(device) {
  if (!device || typeof device !== 'object') return '';
  return deviceReportedCode(device.reportedSlug || device.customerSlug);
}

function deviceMatchesSlug(device, slug) {
  const key = requestedSlug(slug);
  if (!key) return false;
  return requestedSlug(device && device.reportedSlug) === key || requestedSlug(device && device.customerSlug) === key;
}

function normalizeDevice(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const id = String(src.id || src.deviceId || '')
    .toLowerCase()
    .replace(/[^a-f0-9]/g, '')
    .slice(0, 16);
  const reported = deviceReportedCode(src.reportedSlug || src.customerId || '');
  const assigned = requestedSlug(src.customerSlug || '');
  const tail = id.length >= 6 ? id.slice(-6).toUpperCase() : id.toUpperCase();
  return {
    id,
    name: String(src.name || src.deviceName || '').trim().slice(0, 64) || (tail ? `SmartHours-${tail}` : ''),
    customName: String(src.customName || '').trim().slice(0, 40),
    wifiSsid: String(src.wifiSsid || src.wifi || '').trim().slice(0, 64),
    wifiRssi: normalizeWifiRssi(
      src.wifiRssi != null ? src.wifiRssi : src.rssi != null ? src.rssi : src.wifiPower
    ),
    customerSlug: assigned || requestedSlug(reported),
    reportedSlug: reported,
    fwVersion: String(src.fwVersion || '').trim().slice(0, 32),
    ip: String(src.ip || src.localIp || '').trim().slice(0, 64),
    batteryPercent: normalizeBatteryPercent(src.batteryPercent),
    batteryMv: normalizeBatteryMv(src.batteryMv),
    reportedPollMinutes: normalizeReportedPoll(src.reportedPollMinutes),
    lastSeen: String(src.lastSeen || ''),
    createdAt: String(src.createdAt || ''),
    pendingReset: Boolean(src.pendingReset),
    resetRequestedAt: String(src.resetRequestedAt || '')
  };
}

function pollIntervalForDevice(device, customers) {
  const match = (customers || []).find((c) => c && deviceMatchesSlug(device, c.slug));
  const poll = match && match.eink ? Number(match.eink.pollIntervalMinutes) : 0;
  return Number.isFinite(poll) && poll > 0 ? poll : null;
}

function enrichDevices(devices, customers) {
  return (devices || []).map((d) => {
    const row = normalizeDevice(d);
    return {
      ...row,
      pollIntervalMinutes: pollIntervalForDevice(row, customers)
    };
  });
}

function listDevices(dataDir) {
  const store = loadStore(dataDir);
  return enrichDevices(store.devices || [], store.customers || []);
}

function firmwareSupportsRemoteReset(ver) {
  const m = String(ver || '')
    .trim()
    .match(/^(\d+)\.(\d+)/);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  return major > 1 || (major === 1 && minor >= 3);
}

function checkinDevice(dataDir, payload) {
  const store = loadStore(dataDir);
  if (!Array.isArray(store.devices)) store.devices = [];
  const now = new Date().toISOString();
  const incoming = normalizeDevice({
    ...(payload || {}),
    lastSeen: now
  });
  if (!incoming.id) {
    const err = new Error('deviceId is required');
    err.status = 400;
    throw err;
  }
  const idx = store.devices.findIndex((d) => d.id === incoming.id);
  if (idx < 0) {
    incoming.createdAt = now;
    incoming.customerSlug = incoming.customerSlug || incoming.reportedSlug;
    store.devices.unshift(incoming);
  } else {
    const prev = store.devices[idx];
    store.devices[idx] = {
      ...prev,
      name: incoming.name || prev.name,
      customName: prev.customName || '',
      wifiSsid: incoming.wifiSsid || prev.wifiSsid,
      wifiRssi: incoming.wifiRssi != null ? incoming.wifiRssi : prev.wifiRssi,
      reportedSlug: incoming.reportedSlug || prev.reportedSlug,
      fwVersion: incoming.fwVersion || prev.fwVersion,
      ip: incoming.ip || prev.ip,
      batteryPercent:
        incoming.batteryPercent != null ? incoming.batteryPercent : prev.batteryPercent,
      batteryMv: incoming.batteryMv != null ? incoming.batteryMv : prev.batteryMv,
      reportedPollMinutes:
        incoming.reportedPollMinutes != null
          ? incoming.reportedPollMinutes
          : prev.reportedPollMinutes,
      lastSeen: now,
      // ESP32 unique URL code is the source of truth — do not keep a stale assigned slug.
      customerSlug: incoming.reportedSlug
        ? requestedSlug(incoming.reportedSlug)
        : prev.customerSlug || incoming.customerSlug
    };
  }
  const row = store.devices.find((d) => d.id === incoming.id);
  const reset = Boolean(row && row.pendingReset);
  if (reset && firmwareSupportsRemoteReset(row.fwVersion)) {
    row.pendingReset = false;
    row.resetRequestedAt = '';
    row.customerSlug = '';
    row.reportedSlug = '';
  }
  saveStore(dataDir, store);
  const pollIntervalMinutes = pollIntervalForDevice(row, store.customers);
  return { ...row, reset, pollIntervalMinutes };
}

function updateDevice(dataDir, id, patch) {
  const store = loadStore(dataDir);
  if (!Array.isArray(store.devices)) store.devices = [];
  const idx = store.devices.findIndex((d) => d.id === String(id || '').toLowerCase().replace(/[^a-f0-9]/g, ''));
  if (idx < 0) {
    const err = new Error('Device not found.');
    err.status = 404;
    throw err;
  }
  const next = { ...store.devices[idx] };
  if (patch && patch.customerSlug != null) {
    next.customerSlug = requestedSlug(String(patch.customerSlug));
  }
  if (patch && (patch.customName != null || patch.name != null)) {
    const raw = patch.customName != null ? patch.customName : patch.name;
    next.customName = String(raw || '').trim().slice(0, 40);
  }
  store.devices[idx] = normalizeDevice(next);
  saveStore(dataDir, store);
  return enrichDevices([store.devices[idx]], store.customers)[0];
}

function queueDeviceReset(dataDir, id) {
  const store = loadStore(dataDir);
  if (!Array.isArray(store.devices)) store.devices = [];
  const key = String(id || '')
    .toLowerCase()
    .replace(/[^a-f0-9]/g, '');
  const idx = store.devices.findIndex((d) => d.id === key);
  if (idx < 0) {
    const err = new Error('Device not found.');
    err.status = 404;
    throw err;
  }
  store.devices[idx] = normalizeDevice({
    ...store.devices[idx],
    pendingReset: true,
    resetRequestedAt: new Date().toISOString()
  });
  saveStore(dataDir, store);
  return store.devices[idx];
}

function loadStore(dataDir) {
  migrateLegacyDataDir(dataDir);
  ensureDirs(dataDir);
  const file = storePath(dataDir);
  try {
    if (!fs.existsSync(file)) {
      const seeded = seedTemplateLibrary(dataDir, emptyStore());
      return seeded.changed ? saveStore(dataDir, seeded.store) : seeded.store;
    }
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    let settings = normalizeSettings(parsed.settings);
    let customersRaw = Array.isArray(parsed.customers) ? parsed.customers : [];
    const needsDefaults = (settings.customerConfigVersion || 0) < CUSTOMER_CONFIG_VERSION;
    if (needsDefaults) {
      customersRaw = customersRaw.map((c) => migrateExistingCustomerDefaults(c));
      settings = { ...settings, customerConfigVersion: CUSTOMER_CONFIG_VERSION };
    }
    const customers = customersRaw.map((c, _, arr) => normalizeCustomer(c, arr));
    const store = {
      version: 1,
      settings,
      customers,
      devices: Array.isArray(parsed.devices)
        ? parsed.devices.map(normalizeDevice).filter((d) => d.id)
        : [],
      templateCategories: normalizeTemplateCategories(parsed.templateCategories),
      templates: normalizeTemplateList(parsed.templates),
      updatedAt: parsed.updatedAt || new Date().toISOString()
    };
    const seeded = seedTemplateLibrary(dataDir, store);
    if (needsDefaults) {
      console.log(
        `[SmartHours] migrated ${customers.length} customer(s) to portrait layout, 60-min Google sync, and current device defaults`
      );
    }
    if (needsDefaults || seeded.changed) return saveStore(dataDir, seeded.store);
    return seeded.store;
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
    settings: normalizeSettings(store && store.settings),
    customers: (store.customers || []).map((c, _, arr) => normalizeCustomer(c, arr)),
    devices: (store.devices || []).map(normalizeDevice).filter((d) => d.id),
    templateCategories: normalizeTemplateCategories(store.templateCategories),
    templates: normalizeTemplateList(store.templates),
    updatedAt: new Date().toISOString()
  };
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return payload;
}

function getAutoSyncIntervalHours(dataDir) {
  const store = loadStore(dataDir);
  return normalizeSettings(store.settings).autoSyncIntervalHours;
}

function setAutoSyncIntervalHours(dataDir, hours) {
  const store = loadStore(dataDir);
  store.settings = normalizeSettings({
    ...(store.settings || {}),
    autoSyncIntervalHours: hours
  });
  saveStore(dataDir, store);
  return store.settings;
}

function googleDayIndexToKey(dayIndex) {
  // Legacy Places / Maps: 0 = Sunday … 6 = Saturday
  const n = Number(dayIndex);
  if (!Number.isFinite(n)) return null;
  return DAYS[(n + 6) % 7];
}

/**
 * Places API (New) uses DayOfWeek enums ("MONDAY"…"SUNDAY") or numbers
 * (legacy 0–6 Sun–Sat, or proto 1–7 Mon–Sun).
 */
function googleDayToKey(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') {
    const s = raw.trim().toUpperCase().replace(/^DAY_OF_WEEK_/, '');
    const fromName = {
      MONDAY: 'monday',
      TUESDAY: 'tuesday',
      WEDNESDAY: 'wednesday',
      THURSDAY: 'thursday',
      FRIDAY: 'friday',
      SATURDAY: 'saturday',
      SUNDAY: 'sunday'
    };
    if (fromName[s]) return fromName[s];
    const asNum = Number(s);
    if (Number.isFinite(asNum)) return googleDayIndexToKey(asNum);
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  // Legacy 0–6 (Sun–Sat) and Places proto 1–7 (Mon–Sun): both map via (n+6)%7
  if (n >= 0 && n <= 7) return DAYS[(n + 6) % 7];
  return null;
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
    const dayKey = googleDayToKey(open.day ?? open.dayOfWeek);
    if (!dayKey || !byDay[dayKey]) return;
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
    // Days Google omits from periods are closed (tick the Closed checkbox).
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
  // Do not fall back to GOOGLE_MAPS_API_KEY — that is usually a browser key
  // with HTTP-referrer restrictions, which Places API (server) always rejects.
  return String(
    process.env.PLACES_API ||
      process.env.GOOGLE_PLACES_API_KEY ||
      process.env.SMARTHOURS_GOOGLE_API_KEY ||
      ''
  ).trim();
}

function placesApiReferer() {
  // Only send a Referer if explicitly configured. Defaulting to lab007.ai made Google
  // treat a server Places call as a website request and block HTTP-referrer keys.
  const raw = String(process.env.PLACES_API_REFERER || process.env.GOOGLE_API_HTTP_REFERER || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return u.origin + '/';
  } catch {
    return raw.endsWith('/') ? raw : `${raw}/`;
  }
}

function placesApiHeaders(apiKey, extra) {
  const headers = {
    'X-Goog-Api-Key': apiKey,
    ...(extra || {})
  };
  const referer = placesApiReferer();
  if (referer) {
    headers.Referer = referer;
    try {
      headers.Origin = new URL(referer).origin;
    } catch {
      /* ignore */
    }
  }
  return headers;
}

function placesRefererBlockKind(err) {
  const msg = String((err && err.message) || '');
  if (/cannot have referer restrictions|cannot have referrer restrictions/i.test(msg)) {
    return 'web_service';
  }
  if (/referer|referrer/i.test(msg)) return 'mismatch';
  return null;
}

function placesRefererBlockedMessage(kind, googleMessage) {
  if (kind === 'web_service') {
    return (
      'Google blocked this Places key because it is limited to websites. ' +
      'Create a second API key (Application restriction: None, or IP; API restriction: Places API) ' +
      'and set it as PLACES_API on Render. A website/HTTP-referrer key cannot sync hours from the server.'
    );
  }
  return (
    'Google blocked this Places key because it has HTTP-referrer (website) restrictions. ' +
    'In Google Cloud Console, create or edit the PLACES_API key: Application restrictions = None, API restrictions = Places API (New). ' +
    'Do not reuse the Maps JavaScript website key.' +
    (googleMessage ? ` Google: ${googleMessage}` : '')
  );
}

/** Places API (New) is called from the server; do not send a website Referer. */
function placesHttpsJson(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const body = options.body != null ? String(options.body) : '';
  const headers = { ...(options.headers || {}) };
  if (body && !headers['Content-Length']) headers['Content-Length'] = Buffer.byteLength(body);
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      reject(err);
      return;
    }
    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data = {};
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch {
            data = {};
          }
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode || 0,
            data
          });
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(20000, () => {
      req.destroy(new Error('Places API request timed out'));
    });
    if (body) req.write(body);
    req.end();
  });
}

function extractPlaceId(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (/^ChIJ[\w-]+$/.test(raw)) return raw;
  if (/^places\/ChIJ[\w-]+$/i.test(raw)) return raw.replace(/^places\//i, '');
  const fromQuery = raw.match(/[?&](?:place_id|placeid|query_place_id)=([^&]+)/i);
  if (fromQuery) return decodeURIComponent(fromQuery[1]);
  const chij = raw.match(/(ChIJ[\w-]+)/);
  if (chij) return chij[1];
  return '';
}

function extractMapsHexId(input) {
  const raw = String(input || '').trim();
  const hit = raw.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i) || raw.match(/\b(0x[0-9a-f]+:0x[0-9a-f]+)\b/i);
  return hit ? hit[1] : '';
}

function extractLatLng(input) {
  const raw = String(input || '');
  // Prefer the place pin (!3d!4d). /@lat,lng is the map viewport and can be
  // kilometers away at city zoom — that made text search pick a nearby namesake.
  const d3 = raw.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (d3) {
    const lat = Number(d3[1]);
    const lng = Number(d3[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  const at = raw.match(/\/@(-?\d+\.\d+),(-?\d+\.\d+)(?:,(\d+(?:\.\d+)?)z)?/i);
  if (at) {
    const zoom = at[3] != null ? Number(at[3]) : 16;
    // City-level viewport (e.g. 9z) is not the business pin — skip it.
    if (Number.isFinite(zoom) && zoom <= 12) return { lat: null, lng: null };
    const lat = Number(at[1]);
    const lng = Number(at[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return { lat: null, lng: null };
}

function stemPlaceToken(word) {
  const w = String(word || '');
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

function normalizePlaceNameTokens(name) {
  const s = String(name || '')
    .toLowerCase()
    .replace(/\b(?:[a-z]\.){2,}[a-z]\.?\b/g, (m) => m.replace(/\./g, ''))
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ');
  return s
    .split(/\s+/)
    .map(stemPlaceToken)
    .filter((w) => w.length > 1 && !/^(the|and|of|llc|inc|ltd|co|corp)$/.test(w));
}

const GENERIC_PLACE_TOKENS = new Set([
  'service',
  'company',
  'group',
  'studio',
  'shop',
  'store',
  'business'
]);

function leftoverPlaceTokens(from, into) {
  const intoSet = new Set(normalizePlaceNameTokens(into));
  return [...new Set(normalizePlaceNameTokens(from))].filter(
    (w) => !intoSet.has(w) && !GENERIC_PLACE_TOKENS.has(w)
  );
}

function namesLikelySamePlace(a, b) {
  const ta = normalizePlaceNameTokens(a);
  const tb = normalizePlaceNameTokens(b);
  if (!ta.length || !tb.length) return false;
  // Extra brand tokens (ECHO vs Services) mean a different listing.
  if (leftoverPlaceTokens(a, b).length || leftoverPlaceTokens(b, a).length) return false;
  const shorter = ta.length <= tb.length ? ta : tb;
  const longerSet = new Set(ta.length <= tb.length ? tb : ta);
  const covered = shorter.filter((w) => longerSet.has(w)).length / shorter.length;
  return placeNameMatchScore(a, b) >= 0.5 && covered >= 0.8;
}

function placeNameCoverage(required, candidate) {
  const req = [...new Set(normalizePlaceNameTokens(required))];
  const got = new Set(normalizePlaceNameTokens(candidate));
  if (!req.length) return 0;
  let hit = 0;
  req.forEach((w) => {
    if (got.has(w)) hit += 1;
  });
  return hit / req.length;
}

function placeNameMatchScore(a, b) {
  const ta = normalizePlaceNameTokens(a);
  const tb = normalizePlaceNameTokens(b);
  if (!ta.length || !tb.length) return 0;
  const setB = new Set(tb);
  let hit = 0;
  new Set(ta).forEach((w) => {
    if (setB.has(w)) hit += 1;
  });
  const union = new Set([...ta, ...tb]).size;
  if (!union) return 0;
  const score = hit / union;
  if (hit < 2 && Math.max(ta.length, tb.length) >= 3) return Math.min(score, 0.59);
  return score;
}

function cleanPlaceQueryName(name) {
  return String(name || '')
    .replace(/\+/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s*[•·|–—].*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isUsablePlaceQuery(name) {
  const s = String(name || '').trim();
  if (s.length < 2 || s.length > 80) return false;
  if (/^https?:/i.test(s)) return false;
  if (/^(near me|google maps|google search|google)$/i.test(s)) return false;
  if (/before you continue|privacy reminder|\bconsent\b|chrome\/|mozilla\//i.test(s)) return false;
  return true;
}

function googleUrlBusinessQuery(u) {
  const rawQ = String(u.searchParams.get('q') || u.searchParams.get('query') || '').trim();
  if (!rawQ || /^https?:/i.test(rawQ) || /^-?\d+(\.\d+)?\s*,\s*-?\d+/.test(rawQ)) return '';
  const name = cleanPlaceQueryName(rawQ.replace(/\+/g, ' ').replace(/\s+hours\s*$/i, ''));
  return isUsablePlaceQuery(name) ? name : '';
}

function extractBusinessNameHint(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const placePath = u.pathname.match(/\/maps\/place\/([^/]+)/i);
    if (placePath) {
      const fromPath = cleanPlaceQueryName(decodeURIComponent(placePath[1].replace(/\+/g, ' ')));
      if (isUsablePlaceQuery(fromPath)) return fromPath;
    }
    const fromParams = googleUrlBusinessQuery(u);
    if (fromParams) return fromParams;
  } catch (_) {
    /* ignore */
  }
  const noscriptQ = raw.match(/\/search\?q=([^"'&]+)/i);
  if (noscriptQ) {
    return cleanPlaceQueryName(
      decodeURIComponent(noscriptQ[1].replace(/\+/g, ' ')).replace(/\s+hours\s*$/i, '')
    );
  }
  const title = raw.match(/<title>([^<]+)<\/title>/i);
  if (title) {
    const t = cleanPlaceQueryName(
      title[1].replace(/\s*[-|].*$/, '').replace(/Google\s*Maps|Google\s*Search/gi, '')
    );
    if (isUsablePlaceQuery(t)) return t;
  }
  return '';
}

function extractLudocid(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const fromQuery = raw.match(/[?&]ludocid=(\d{6,})/i);
  if (fromQuery) return fromQuery[1];
  const fromCid = raw.match(/[?&]cid=(\d{6,})/i);
  if (fromCid) return fromCid[1];
  const bare = raw.match(/\bludocid[=:](\d{6,})/i);
  if (bare) return bare[1];
  // Maps feature id: 0x…:0xDEADBEEF → decimal CID
  const feature = raw.match(/0x[0-9a-f]+:0x([0-9a-f]+)/i);
  if (feature) {
    try {
      return BigInt(`0x${feature[1]}`).toString(10);
    } catch (_) {
      return '';
    }
  }
  return '';
}

/** Prefer a ChIJ that sits next to this CID on a Maps HTML page — not the first ChIJ on the page. */
function extractPlaceIdFromCidPage(text, cid) {
  const blob = String(text || '');
  const id = String(cid || '').trim();
  if (!blob || !/^\d{6,}$/.test(id)) return '';
  let hex = '';
  try {
    hex = BigInt(id).toString(16).toLowerCase();
  } catch (_) {
    return '';
  }
  const placeUrls = blob.match(
    /https?:\/\/(?:www\.)?(?:maps\.google\.[^/"'\s]+|google\.[^/"'\s]+)\/maps\/place\/[^"'<>\s]+/gi
  ) || [];
  for (const url of placeUrls) {
    const lower = url.toLowerCase();
    if (lower.includes(hex) || url.includes(id)) {
      const pid = extractPlaceId(url);
      if (pid) return pid;
    }
  }
  const markers = [];
  const lowerBlob = blob.toLowerCase();
  [id, '0x' + hex, ':0x' + hex].forEach((mk) => {
    let i = lowerBlob.indexOf(mk.toLowerCase());
    let n = 0;
    while (i >= 0 && n < 30) {
      markers.push(i);
      i = lowerBlob.indexOf(mk.toLowerCase(), i + mk.length);
      n += 1;
    }
  });
  if (!markers.length) return '';
  const re = /ChIJ[\w-]{10,}/g;
  let best = '';
  let bestDist = Infinity;
  let m;
  while ((m = re.exec(blob))) {
    for (const mi of markers) {
      const d = Math.abs(m.index - mi);
      if (d < bestDist && d < 1200) {
        bestDist = d;
        best = m[0];
      }
    }
  }
  return best;
}

function extractKgmid(input) {
  const raw = String(input || '');
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch (_) {
    /* ignore */
  }
  const direct = decoded.match(/\/g\/[a-z0-9_]+/i) || raw.match(/\/g\/[a-z0-9_]+/i);
  if (direct) return direct[0];
  try {
    const href = /^https?:\/\//i.test(raw) ? raw : '';
    if (href) {
      const k = new URL(href).searchParams.get('kgmid');
      if (k) {
        const id = decodeURIComponent(k).trim();
        if (/^\/g\//i.test(id)) return id;
        if (/^[a-z0-9_]+$/i.test(id)) return `/g/${id}`;
      }
    }
  } catch (_) {
    /* ignore */
  }
  return '';
}

function decodeBase64Url(value) {
  let b64 = decodeURIComponent(String(value || ''))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  try {
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch (_) {
    return '';
  }
}

/**
 * Pull kgmid / business name out of Google Search local-place viewer links (#sv=…).
 */
function extractGoogleSearchPlaceHints(input) {
  const hints = { kgmid: '', placeId: '', name: '', query: '', category: '' };
  const raw = String(input || '').trim();
  if (!raw) return hints;
  const badToken =
    /^(pvq|lqi|tbs|lcl|pv|sv|q|http|https|www|com|near|me|local|place|viewer|search|google|restaurant|cafe|bar|store|shop|maps)$/i;
  const usableName = (value) => {
    const s = String(value || '').trim();
    return s.length >= 3 && s.length <= 48 && !badToken.test(s) && !/^\d+$/.test(s);
  };
  try {
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(href);
    hints.query = googleUrlBusinessQuery(u) || (u.searchParams.get('q') || '').trim();
    hints.kgmid = extractKgmid(href) || extractKgmid(u.hash);
    hints.placeId = extractPlaceId(href);

    const sv = (u.hash || '').match(/(?:^#|&)?sv=([^&]+)/);
    const blobs = [];
    if (sv) blobs.push(decodeBase64Url(sv[1]));
    for (const blob of blobs.slice()) {
      for (const m of blob.matchAll(/[A-Za-z0-9+/=_-]{16,}/g)) {
        const inner = decodeBase64Url(m[0]);
        if (inner && inner.length > 4) blobs.push(inner);
      }
    }
    for (const blob of blobs) {
      if (!hints.kgmid) hints.kgmid = extractKgmid(blob);
      if (!hints.placeId) hints.placeId = extractPlaceId(blob);
      if (!hints.category) {
        const cat = blob.match(/\b(restaurant|cafe|bar|pub|store|shop|hotel|gym)\b/i);
        if (cat) hints.category = cat[1].toLowerCase();
      }
      if (!hints.name) {
        const named = blob.match(
          /\b([A-Za-z][A-Za-z0-9'& -]{1,40})\b(?=[\s\S]{0,40}restaurant|cafe|bar|store|shop)/i
        );
        if (named && usableName(named[1])) hints.name = named[1].trim();
      }
      if (!hints.name) {
        // Protobuf length-prefixed ascii names often appear as \x06geckos / \x0egeckos near me
        const lenPrefixed = blob.match(/[\x06-\x1f]([A-Za-z][A-Za-z0-9' &-]{2,40})/g) || [];
        for (const hit of lenPrefixed) {
          const name = hit.slice(1).trim();
          if (usableName(name) && !/near\s+me/i.test(name)) {
            hints.name = name;
            break;
          }
        }
      }
    }
  } catch (_) {
    /* ignore */
  }
  if (hints.query) {
    hints.query = hints.query.replace(/\s+near\s+me$/i, '').trim();
  }
  if (hints.name) {
    hints.name = hints.name.replace(/\s+near\s+me$/i, '').trim();
  }
  // Bias vague queries ("geckos") with the panel category so we don't match lawn care, etc.
  if (
    hints.query &&
    hints.category &&
    !new RegExp(`\\b${hints.category}\\b`, 'i').test(hints.query)
  ) {
    hints.query = `${hints.query} ${hints.category}`.trim();
  }
  if (!hints.query && usableName(hints.name)) hints.query = hints.name;
  if (!usableName(hints.name)) hints.name = '';
  return hints;
}

function mapsKgmidUrl(kgmid, query) {
  const id = String(kgmid || '').trim();
  if (!id) return '';
  const q = String(query || '').trim();
  if (q) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}&kgmid=${encodeURIComponent(id)}`;
  }
  return `https://www.google.com/maps?kgmid=${encodeURIComponent(id)}`;
}

function mapsCidUrl(ludocid) {
  const id = String(ludocid || '').trim();
  if (!id) return '';
  return `https://maps.google.com/?cid=${encodeURIComponent(id)}`;
}

function isCidOnlyMapsUrl(url) {
  const s = String(url || '').trim();
  return Boolean(extractLudocid(s) && !extractPlaceId(s) && !cleanMapsPlaceUrl(s));
}

function extractMapsPlaceUrlFromText(text) {
  const raw = String(text || '').replace(/&amp;/g, '&');
  const m = raw.match(
    /https?:\/\/(?:www\.)?(?:maps\.google\.[^/"'\s]+|google\.[^/"'\s]+)\/maps\/place\/[^"'<>\s]+/i
  );
  if (!m) return '';
  return m[0].replace(/[),.;]+$/, '');
}

function isShortMapsShareUrl(url) {
  return /maps\.app\.goo\.gl|share\.google|(?:^|\/\/)goo\.gl\/maps/i.test(String(url || ''));
}

function isGoogleSearchUrl(url) {
  try {
    const u = new URL(String(url || ''));
    return /google\./i.test(u.hostname) && /^\/search/i.test(u.pathname) && !/[?&]tbm=map\b/i.test(u.search);
  } catch (_) {
    return /google\.[^/]+\/search/i.test(String(url || ''));
  }
}

function applyListingTextToResolved(resolved, url, text) {
  const blob = `${url || ''}\n${text || ''}`;
  resolved.placeId = resolved.placeId || extractPlaceId(blob);
  resolved.hexId = resolved.hexId || extractMapsHexId(blob);
  resolved.ludocid = resolved.ludocid || extractLudocid(blob);
  const coords = extractLatLng(String(url || ''));
  if (coords.lat != null) {
    if (resolved.lat == null) resolved.lat = coords.lat;
    if (resolved.lng == null) resolved.lng = coords.lng;
  }
  if (!isUsablePlaceQuery(resolved.query)) {
    const name = extractBusinessNameHint(url) || extractBusinessNameHint(text);
    if (isUsablePlaceQuery(name)) resolved.query = cleanPlaceQueryName(name);
  }
  return resolved;
}

async function hydrateResolvedFromMapsListing(resolved) {
  if (!resolved || resolved.placeId) return resolved;
  // Do not fetch maps?cid= HTML from the server — Google serves a consent wall
  // and never a ChIJ. Places API (New) text search + Place Details is the path.
  const kgmid = String(resolved.kgmid || '').trim();
  const query = String(resolved.query || '').trim();
  if (!kgmid && !query) return resolved;
  const urls = [];
  const push = (url) => {
    const u = String(url || '').trim();
    if (u && !urls.includes(u)) urls.push(u);
  };
  if (kgmid) {
    push(mapsKgmidUrl(kgmid, query));
    push(`https://www.google.com/maps?hl=en&gl=us&kgmid=${encodeURIComponent(kgmid)}`);
    push(
      `https://www.google.com/search?tbm=map&hl=en&gl=us&q=${encodeURIComponent(query || kgmid)}&kgmid=${encodeURIComponent(kgmid)}`
    );
  }
  for (const url of urls) {
    try {
      const page = await fetchTextFollowRedirects(url);
      applyListingTextToResolved(resolved, page.url || url, page.text);
      if (resolved.placeId) return resolved;
    } catch (_) {
      /* keep trying */
    }
  }
  return resolved;
}

function decodeMapsEscapes(value) {
  return String(value || '')
    .replace(/\\u003d/gi, '=')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003f/gi, '?')
    .replace(/\\u002f/gi, '/');
}

async function expandMapsShareUrl(url) {
  let current = String(url || '').trim();
  if (!current) return '';
  const seen = new Set();
  for (let i = 0; i < 8; i += 1) {
    if (!current || seen.has(current)) break;
    seen.add(current);
    if (/\/maps\/place\//i.test(current)) return current;
    let res;
    try {
      res = await fetch(current, {
        redirect: 'manual',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
    } catch (_) {
      break;
    }
    const loc = res.headers.get('location');
    if (loc && res.status >= 300 && res.status < 400) {
      try {
        const next = new URL(loc, current);
        const nested = next.searchParams.get('q') || next.searchParams.get('u');
        current =
          nested && /^https?:\/\//i.test(nested) && /google\.|maps\.app/i.test(nested)
            ? nested
            : next.href;
      } catch (_) {
        break;
      }
      continue;
    }
    current = res.url || current;
    break;
  }
  return current;
}

async function fetchTextFollowRedirects(url, options = {}) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent':
        options.userAgent ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  const text = decodeMapsEscapes(await res.text());
  return { url: decodeMapsEscapes(res.url || url), status: res.status, text };
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

  const searchHints = extractGoogleSearchPlaceHints(raw);
  let placeId = extractPlaceId(raw) || searchHints.placeId;
  let { lat, lng } = extractLatLng(raw);
  if (placeId) {
    return {
      placeId,
      query: cleanPlaceQueryName(searchHints.query || searchHints.name || ''),
      sourceUrl: raw,
      kgmid: searchHints.kgmid,
      lat,
      lng
    };
  }

  let hexId = extractMapsHexId(raw);
  let ludocid = extractLudocid(raw);
  let kgmid = searchHints.kgmid || extractKgmid(raw);
  // Prefer the Maps place path name over a vague Search q= (share.google often lands on a similar business).
  let query =
    cleanPlaceQueryName(extractBusinessNameHint(raw)) ||
    cleanPlaceQueryName(searchHints.query || searchHints.name || '');
  let sourceUrl = raw;
  const inputIsMapsPlace = /\/maps\/place\//i.test(raw);

  const looksLikeUrl =
    /^https?:\/\//i.test(raw) ||
    /share\.google|maps\.app\.goo\.gl|goo\.gl\/maps|google\.[^/]+\/(?:maps|search)/i.test(raw);
  if (looksLikeUrl) {
    let href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    if (isShortMapsShareUrl(href)) {
      const expanded = await expandMapsShareUrl(href);
      if (expanded && expanded !== href) {
        console.log('[SmartHours] expanded short Maps URL →', expanded.slice(0, 180));
        href = expanded;
        sourceUrl = expanded;
        const fromExpand = extractBusinessNameHint(expanded);
        if (isUsablePlaceQuery(fromExpand)) query = fromExpand;
        const pin = extractLatLng(expanded);
        if (pin.lat != null) {
          lat = pin.lat;
          lng = pin.lng;
        }
        hexId = hexId || extractMapsHexId(expanded);
        ludocid = ludocid || extractLudocid(expanded);
        kgmid = kgmid || extractKgmid(expanded);
        placeId = placeId || extractPlaceId(expanded);
      }
    }
    // Expanded listing already has the Maps name + pin. Do not fetch HTML from
    // Render — Google returns a consent wall that overwrites the business name.
    if (/\/maps\/place\//i.test(href) && isUsablePlaceQuery(query)) {
      sourceUrl = href;
    } else {
    const alreadyIdentified = Boolean(kgmid && isUsablePlaceQuery(query));
    // Search knowledge-panel URLs already have q= + kgmid. Fetching them from a
    // datacenter often returns a consent wall and overwrites the business name.
    const fetchUrl =
      isGoogleSearchUrl(href) && alreadyIdentified
        ? mapsKgmidUrl(kgmid, query)
        : href.split('#')[0];
    try {
      const page = await fetchTextFollowRedirects(fetchUrl);
      sourceUrl = page.url || href;
      const nestedPlaceUrl = extractMapsPlaceUrlFromText(page.text) || extractMapsPlaceUrlFromText(sourceUrl);
      if (nestedPlaceUrl) {
        sourceUrl = nestedPlaceUrl;
        const fromPlace = extractBusinessNameHint(nestedPlaceUrl);
        if (isUsablePlaceQuery(fromPlace)) query = fromPlace;
      } else if (isShortMapsShareUrl(raw) && isGoogleSearchUrl(sourceUrl)) {
        // Keep the share link — Search redirects are not a Places listing.
        sourceUrl = href;
      }
      hexId = hexId || extractMapsHexId(sourceUrl) || extractMapsHexId(page.text);
      ludocid = ludocid || extractLudocid(sourceUrl) || extractLudocid(page.text) || extractLudocid(href);
      placeId =
        placeId ||
        extractPlaceId(sourceUrl) ||
        (ludocid
          ? extractPlaceIdFromCidPage(`${sourceUrl}\n${page.text}`, ludocid)
          : extractPlaceId(extractMapsPlaceUrlFromText(page.text)));
      kgmid = kgmid || extractKgmid(sourceUrl) || extractKgmid(page.text);
      const pageHints = extractGoogleSearchPlaceHints(href);
      kgmid = kgmid || pageHints.kgmid;
      placeId = placeId || pageHints.placeId;
      const coords = extractLatLng(sourceUrl);
      if (coords.lat != null) {
        lat = coords.lat;
        lng = coords.lng;
      }
      const mapsName = extractBusinessNameHint(sourceUrl) || extractBusinessNameHint(href);
      const searchName =
        pageHints.query || pageHints.name || extractBusinessNameHint(page.text) || '';
      if (inputIsMapsPlace && isUsablePlaceQuery(mapsName)) {
        query = cleanPlaceQueryName(mapsName);
      } else if (!isUsablePlaceQuery(query) && isUsablePlaceQuery(searchName || mapsName)) {
        query = cleanPlaceQueryName(searchName || mapsName);
      } else if (
        !inputIsMapsPlace &&
        !isGoogleSearchUrl(href) &&
        isUsablePlaceQuery(searchName)
      ) {
        // share.google → keep redirected business name
        query = cleanPlaceQueryName(searchName);
      }
    } catch (err) {
      query = query || extractBusinessNameHint(raw);
      ludocid = ludocid || extractLudocid(raw);
      if (!query && !ludocid && !kgmid) {
        const wrapped = new Error(`Could not open Google link: ${err.message}`);
        wrapped.status = 502;
        throw wrapped;
      }
    }
    }
  } else if (!/^ChIJ/i.test(raw) && raw.length > 2) {
    query = cleanPlaceQueryName(raw);
  }

  query = String(query || '')
    .replace(/\s+near\s+me$/i, '')
    .trim();
  if (!isUsablePlaceQuery(query)) query = '';

  if (placeId) return { placeId, query, sourceUrl, hexId, ludocid, kgmid, lat, lng };
  if (ludocid || kgmid || query) return { placeId: '', query, sourceUrl, hexId, ludocid, kgmid, lat, lng };

  const err = new Error(
    'Could not find a Google Place from that link. Paste a Maps place URL, share.google link, or a Search result that opens one business.'
  );
  err.status = 400;
  throw err;
}

async function placesSearchText(query, apiKey, options = {}) {
  const textQuery = String(query || '').trim();
  const body = {
    textQuery,
    languageCode: 'en',
    regionCode: 'us',
    maxResultCount: 20
  };
  const queryIsUrl = /^https?:\/\//i.test(textQuery);
  const lat = Number(options.lat);
  const lng = Number(options.lng);
  const radius = Number(options.radius);
  // Don't bias URL/CID lookups — the listing is already identified.
  if (!queryIsUrl && Number.isFinite(lat) && Number.isFinite(lng) && radius !== 0) {
    body.locationBias = {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: radius > 0 ? radius : 800
      }
    };
  }
  const res = await placesHttpsJson('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: placesApiHeaders(apiKey, {
      'Content-Type': 'application/json',
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.regularOpeningHours,places.currentOpeningHours,places.formattedAddress,places.location'
    }),
    body: JSON.stringify(body)
  });
  const data = res.data || {};
  if (!res.ok) {
    const message =
      data?.error?.message || data?.error?.status || `Google Places search failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502;
    throw err;
  }
  const places = Array.isArray(data.places) ? data.places : [];
  const preferName = String(options.preferName || '').trim();
  let place = places[0] || null;
  if (preferName && places.length) {
    let best = null;
    let bestScore = -1;
    for (const p of places) {
      const name = p.displayName?.text || p.displayName || '';
      const score = placeNameMatchScore(name, preferName) + placeNameCoverage(preferName, name);
      if (score > bestScore) {
        best = p;
        bestScore = score;
      }
    }
    const bestName = best && (best.displayName?.text || best.displayName);
    if (best && namesLikelySamePlace(bestName, preferName)) {
      place = best;
    } else {
      const names = places
        .slice(0, 5)
        .map((p) => p.displayName?.text || p.displayName)
        .filter(Boolean);
      const err = new Error(
        `Google did not return “${preferName}”. Closest: ${names.join('; ') || 'none'}. Paste the full Maps place URL for that listing.`
      );
      err.status = 422;
      throw err;
    }
  }
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
  const res = await placesHttpsJson(url, {
    headers: placesApiHeaders(apiKey, {
      'X-Goog-FieldMask': 'id,displayName,regularOpeningHours,currentOpeningHours,formattedAddress'
    })
  });
  const data = res.data || {};
  if (!res.ok) {
    const message =
      data?.error?.message || data?.error?.status || `Google Places request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status >= 400 && res.status < 600 ? res.status : 502;
    throw err;
  }
  return data;
}

function placeHasOpeningHours(place) {
  const regular = (place && place.regularOpeningHours) || {};
  const current = (place && place.currentOpeningHours) || {};
  const descriptions = [].concat(regular.weekdayDescriptions || [], current.weekdayDescriptions || []);
  const periods = [].concat(regular.periods || [], current.periods || []);
  return hoursDayCount(descriptions) >= 5 || periods.length > 0;
}

/** Maps HTML → ChIJ. Do not use Place Details / Find Place (legacy APIs). */
async function placesPlaceIdFromCid(cid, apiKey) {
  const id = String(cid || '').trim();
  if (!/^\d{6,}$/.test(id)) return '';
  void apiKey;
  const urls = [
    `https://www.google.com/maps?cid=${encodeURIComponent(id)}&hl=en`,
    `https://maps.google.com/?cid=${encodeURIComponent(id)}&hl=en`
  ];
  for (const url of urls) {
    try {
      const page = await fetchTextFollowRedirects(url);
      const blob = `${page.url || url}\n${page.text || ''}`;
      const placeId =
        extractPlaceIdFromCidPage(blob, id) ||
        extractPlaceId(page.url || '') ||
        extractPlaceId(extractMapsPlaceUrlFromText(page.text));
      if (placeId) {
        console.log('[SmartHours] CID', id, '→', placeId);
        return placeId;
      }
    } catch (err) {
      console.warn('[SmartHours] CID Maps lookup failed:', err.message);
    }
  }
  return '';
}

function mapsSearchUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(query || '').trim())}`;
}

function scrapeTargetUrls(resolved, placeIdOrUrl) {
  const targets = [];
  const push = (url) => {
    const u = String(url || '').trim();
    if (!u || targets.includes(u)) return;
    targets.push(u);
  };

  const hints = extractGoogleSearchPlaceHints(placeIdOrUrl);
  const query =
    String(resolved.query || '').trim() ||
    hints.name ||
    hints.query ||
    extractBusinessNameHint(resolved.sourceUrl) ||
    extractBusinessNameHint(placeIdOrUrl);
  const ludocid =
    String(resolved.ludocid || '').trim() ||
    extractLudocid(resolved.sourceUrl) ||
    extractLudocid(placeIdOrUrl);
  const kgmid = String(resolved.kgmid || '').trim() || hints.kgmid || extractKgmid(placeIdOrUrl);

  // Best: open the place directly by Google's local CID / knowledge graph id
  if (ludocid) push(mapsCidUrl(ludocid));
  if (kgmid) push(mapsKgmidUrl(kgmid, query));

  // Prefer Maps place/search pages — share.google / Search “near me” often hit captcha
  // or a limited panel. Never scrape google.com/search when we already have Maps targets.
  if (resolved.sourceUrl && /google\.[^/]+\/maps/i.test(resolved.sourceUrl)) {
    push(resolved.sourceUrl);
  }
  if (query) {
    push(mapsSearchUrl(query));
    push(`https://www.google.com/maps/place/${encodeURIComponent(query)}?hl=en`);
  }
  if (resolved.sourceUrl && !isGoogleSearchUrl(resolved.sourceUrl)) {
    push(resolved.sourceUrl);
  }
  if (!targets.length && resolved.sourceUrl && isGoogleSearchUrl(resolved.sourceUrl)) {
    push(String(placeIdOrUrl || resolved.sourceUrl).split('#')[0]);
  }
  if (!targets.length) push(String(placeIdOrUrl || ''));
  return targets;
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
  let text = String(raw || '')
    .replace(/[\u202f\u00a0\u2000-\u200b\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Normalize "9 AM to 5 PM" and odd dashes
  text = text.replace(/\bto\b/gi, '–').replace(/[\u2010-\u2015\u2212]/g, '–');
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
    let openRaw = range[1].trim();
    let closeRaw = range[2].trim();
    // "9 – 5 PM" → open shares close meridiem
    if (!/[ap]m/i.test(openRaw) && /[ap]m/i.test(closeRaw)) {
      const ap = closeRaw.match(/([ap]m)/i)[1];
      openRaw = `${openRaw} ${ap}`;
    }
    // "8 AM – 5" → if open is AM and close hour <= open hour, assume PM
    if (/[ap]m/i.test(openRaw) && !/[ap]m/i.test(closeRaw)) {
      const openTmp = parseClockToMinutes(openRaw);
      const closeNum = Number(String(closeRaw).match(/^(\d{1,2})/)?.[1]);
      if (openTmp != null && Number.isFinite(closeNum) && /am/i.test(openRaw) && closeNum <= openTmp / 60) {
        closeRaw = `${closeRaw} PM`;
      } else {
        const ap = openRaw.match(/([ap]m)/i)[1];
        closeRaw = `${closeRaw} ${ap}`;
      }
    }
    const openMin = parseClockToMinutes(openRaw);
    let closeMin = parseClockToMinutes(closeRaw);
    if (openMin == null || closeMin == null) return;
    // 8 AM–5 AM style mis-parse → treat close as PM when open is morning and close <= open
    if (openMin < 12 * 60 && closeMin <= openMin && closeMin < 12 * 60) {
      closeMin += 12 * 60;
    }
    slots.push({ open: minutesToHhmm(openMin), close: minutesToHhmm(closeMin % (24 * 60)) });
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

/**
 * Fix bad midnight/noon closes when Google text clearly has a later PM end time (e.g. 5 PM / 10 PM).
 */
function repairDayHours(dayHours, rawRest) {
  const day = dayHours && typeof dayHours === 'object' ? { ...dayHours } : emptyDay();
  if (day.closed) return day;
  const openMin = parseClockToMinutes(day.open);
  const closeMin = parseClockToMinutes(day.close);
  const rest = normalizeHourText(rawRest || '');
  const pmMatches = [...rest.matchAll(/(\d{1,2})(?::(\d{2}))?\s*PM\b/gi)];
  let pmCloseMin = null;
  if (pmMatches.length) {
    const last = pmMatches[pmMatches.length - 1];
    let h = Number(last[1]);
    if (h !== 12) h += 12;
    const min = Number(last[2] || 0);
    if (h > 0 && h < 24) pmCloseMin = h * 60 + min;
  }
  const looksBadClose =
    openMin != null &&
    openMin > 0 &&
    openMin < 14 * 60 &&
    (closeMin === 0 ||
      day.close === '00:00' ||
      (closeMin != null && pmCloseMin != null && closeMin < pmCloseMin && closeMin <= 12 * 60));
  if (looksBadClose && pmCloseMin != null) {
    day.close = minutesToHhmm(pmCloseMin);
    day.closed = false;
    return day;
  }
  if (looksBadClose) {
    const retry = parseHoursRangeText(rest);
    if (!retry.closed && retry.close && retry.close !== '00:00' && retry.close !== '12:00') {
      return { ...retry, open2: '', close2: '' };
    }
  }
  return day;
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
    hours[day] = repairDayHours(parseHoursRangeText(rest), rest);
  });
  return hours;
}

function hoursHaveAnyOpen(hours) {
  return DAYS.some((day) => hours[day] && !hours[day].closed);
}

function hoursDayCount(descriptions) {
  const days = new Set();
  (descriptions || []).forEach((line) => {
    const day = DAYS.find((d) => new RegExp(`^${DAY_LABELS[d]}\\b`, 'i').test(String(line || '')));
    if (day) days.add(day);
  });
  return days.size;
}

function periodsDayCount(periods) {
  const days = new Set();
  (periods || []).forEach((period) => {
    const open = period.open || period.openTime;
    if (!open) return;
    const key = googleDayToKey(open.day ?? open.dayOfWeek);
    if (key) days.add(key);
  });
  return days.size;
}

function descriptionsFromHours(hours) {
  return DAYS.map((day) => {
    const d = hours[day] || emptyDay();
    if (d.closed) return `${DAY_LABELS[day]}: Closed`;
    const primary = formatRange(d.open, d.close);
    const secondary = formatRange(d.open2, d.close2);
    return `${DAY_LABELS[day]}: ${secondary ? `${primary}, ${secondary}` : primary}`;
  });
}

/**
 * Build a week only from days Google actually returned.
 * Never copy one day across the whole week — that is inaccurate.
 */
function parseWeekDescriptions(descriptions) {
  const list = Array.isArray(descriptions) ? descriptions.filter(Boolean) : [];
  const hours = weekdayDescriptionsToHours(list);
  const dayCount = hoursDayCount(list);
  if (!hoursHaveAnyOpen(hours)) return null;
  if (dayCount >= 5) {
    return { hours, descriptions: list, inferred: false, incomplete: false, note: '' };
  }
  return {
    hours,
    descriptions: list,
    inferred: false,
    incomplete: true,
    note: `Google only returned ${dayCount} day(s) of hours; need the full week.`
  };
}

/** @deprecated use parseWeekDescriptions — kept name for older call sites */
function inferWeekFromPartialDescriptions(descriptions) {
  return parseWeekDescriptions(descriptions);
}

function buildHoursResult(resolved, scraped, placeIdOrUrl, placeId, parsed) {
  const scrapedSource = scraped && scraped.source ? String(scraped.source) : '';
  return {
    placeId: placeId || '',
    displayName: friendlyBusinessLabel(resolved, scraped),
    formattedAddress: '',
    hours: parsed.hours,
    rawWeekdayDescriptions: parsed.descriptions,
    resolvedFrom: (scraped && scraped.url) || resolved.sourceUrl || placeIdOrUrl,
    resolvedQuery: resolved.query || '',
    ludocid: (scraped && scraped.ludocid) || resolved.ludocid || '',
    source:
      scrapedSource === 'maps-tbm-json' || scrapedSource === 'dom-hours-table'
        ? scrapedSource
        : 'page-parse',
    syncNote: parsed.note || ''
  };
}

function friendlyBusinessLabel(resolved, scraped) {
  const candidates = [
    scraped && scraped.name,
    resolved && resolved.query,
    extractBusinessNameHint(scraped && scraped.url),
    extractBusinessNameHint(resolved && resolved.sourceUrl)
  ]
    .map((s) =>
      String(s || '')
        .replace(/\s+near\s+me$/i, '')
        .replace(/&amp;/g, '&')
        .trim()
    )
    .filter((s) => s && !/^https?:\/\//i.test(s) && !/google\.[^/]+\/search/i.test(s));
  // Prefer a real business title over a short search query like "geckos"
  candidates.sort((a, b) => {
    const score = (v) => (/\s/.test(v) ? 10 : 0) + Math.min(v.length, 40);
    return score(b) - score(a);
  });
  return candidates[0] || 'business';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeHourText(value) {
  return String(value || '')
    .replace(/[\u202f\u00a0\u2000-\u200b\ufeff]/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/ΓÇ»/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeHoursText(value) {
  const s = normalizeHourText(value);
  return /closed|24\s*hours|\d{1,2}(?::\d{2})?\s*[ap]m|\d{1,2}\s*[–—−-]\s*\d{1,2}/i.test(s);
}

/**
 * Parse weekday open/close times from rendered Google HTML / page text.
 * Looks for day names + ranges like "Monday 8 AM–5 PM" or aria-labels / table rows.
 */
function extractHoursFromPageContent(htmlOrText) {
  const raw = String(htmlOrText || '');
  const textWithBreaks = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  const lines = textWithBreaks
    .split(/\n+/)
    .map((s) => normalizeHourText(s))
    .filter(Boolean);
  const text = lines.join('\n');
  const descriptions = [];
  const seen = new Set();
  const add = (dayLabel, rest) => {
    const day = DAYS.find((d) => DAY_LABELS[d].toLowerCase() === String(dayLabel || '').toLowerCase());
    if (!day) return;
    const cleaned = normalizeHourText(String(rest || '').replace(/,?\s*Copy open hours.*$/i, ''));
    if (!cleaned || !looksLikeHoursText(cleaned) || cleaned.length > 80) return;
    if (seen.has(day)) return;
    seen.add(day);
    descriptions.push(`${DAY_LABELS[day]} ${cleaned}`);
  };

  // Google Search / Maps knowledge-panel hours table
  // Legacy Inspect: table.BRdld tr.XCUnmd
  // Current Maps: table.eK4R0e tr.y0skZc > td.ylH6lf + td.mxowUb
  for (const m of raw.matchAll(
    /<tr[^>]*(?:class="[^"]*(?:XCUnmd|BRdld|y0skZc)[^"]*"|jsname)[^>]*>[\s\S]*?<td[^>]*>\s*(?:<div[^>]*>)?\s*(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s*(?:<\/div>)?\s*<\/td>\s*<td[^>]*(?:aria-label="([^"]+)")?[^>]*>\s*(?:<[^>]+>)*\s*([^<]+?)\s*/gi
  )) {
    add(m[1], m[2] || m[3]);
  }
  for (const m of raw.matchAll(
    /<(?:td|div|span)[^>]*>\s*(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s*<\/(?:td|div|span)>\s*<(?:td|div|span)[^>]*>\s*((?:Closed|24\s*hours|\d{1,2}(?::\d{2})?\s*[AP]M\s*[–—−-]\s*\d{1,2}(?::\d{2})?\s*[AP]M)[^<]*)\s*<\/(?:td|div|span)>/gi
  )) {
    add(m[1], m[2]);
  }

  // aria-label="Wednesday, 8 AM to 5 PM, Copy open hours"
  for (const m of raw.matchAll(/aria-label="([^"]+)"/gi)) {
    const label = normalizeHourText(m[1]);
    const day = DAYS.map((d) => DAY_LABELS[d]).find((d) => new RegExp(`^${d}\\b`, 'i').test(label));
    if (!day) continue;
    add(day, label.replace(new RegExp(`^${day}\\s*[,:]?\\s*`, 'i'), ''));
  }

  // data-value="Wednesday, 8 AM–5 PM"
  for (const m of raw.matchAll(/data-value="([^"]+)"/gi)) {
    const label = normalizeHourText(m[1]);
    const day = DAYS.map((d) => DAY_LABELS[d]).find((d) => new RegExp(`^${d}\\b`, 'i').test(label));
    if (!day) continue;
    add(day, label.replace(new RegExp(`^${day}\\s*[,:]?\\s*`, 'i'), ''));
  }

  // Structured Google payload variants:
  // ["Wednesday",3,[2026,7,29],[["8 AM–5 PM",[[8],[17]]]],0,1]
  // ["Saturday",6,[2026,8,1],[["Closed"]],0,2]
  // ["Thursday",4,null,[["8 AM–5 PM",[[8],[17]]]]]
  for (const m of raw.matchAll(
    /\["(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)",\s*\d+(?:\s*,\s*(?:null|\[[\d,\s]*\]))?\s*,\s*(?:\[\["([^"\]]*)"(?:,\s*\[\[(\d+)(?:,\d+)?\],\[(\d+)(?:,\d+)?\]\])?\]\]|\[\])/gi
  )) {
    const day = m[1];
    const label = normalizeHourText(m[2] || '');
    const openH = m[3] != null ? Number(m[3]) : NaN;
    const closeH = m[4] != null ? Number(m[4]) : NaN;
    if (/^closed$/i.test(label) || (!label && !Number.isFinite(openH))) {
      add(day, 'Closed');
      continue;
    }
    // Prefer numeric hour indexes from Google ([[8],[17]] → 08:00–17:00) — more reliable than text
    if (Number.isFinite(openH) && Number.isFinite(closeH) && openH >= 0 && openH < 24 && closeH > 0 && closeH <= 24) {
      const closeMins = closeH === 24 ? 23 * 60 + 59 : closeH * 60;
      add(day, `${minutesToHhmm(openH * 60)} – ${minutesToHhmm(closeMins)}`);
      continue;
    }
    if (label && looksLikeHoursText(label)) {
      add(day, label);
    }
  }

  // Compact week block without repeating day labels in some Maps payloads:
  // [["Monday",1,..],["Tuesday",2,..],...] already handled above; also catch
  // consecutive day entries that use [[h],[h]] only after a day index list.
  if (descriptions.length < 5) {
    for (const m of raw.matchAll(
      /\[\[\[?"?(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)"?,?\s*\d*[\s\S]{0,40}?\[\[(\d+)(?:,\d+)?\],\[(\d+)(?:,\d+)?\]\]/gi
    )) {
      const openH = Number(m[2]);
      const closeH = Number(m[3]);
      if (Number.isFinite(openH) && Number.isFinite(closeH) && openH >= 0 && openH < 24 && closeH > 0 && closeH <= 24) {
        const closeMins = closeH === 24 ? 23 * 60 + 59 : closeH * 60;
        add(m[1], `${minutesToHhmm(openH * 60)} – ${minutesToHhmm(closeMins)}`);
      }
    }
  }

  // Plain lines / table-ish text
  const dayNameRe = /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/i;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const day = DAYS.map((d) => DAY_LABELS[d]).find(
      (d) => line === d || line.startsWith(`${d} `) || line.startsWith(`${d}:`) || line.startsWith(`${d},`)
    );
    if (!day) continue;
    let rest = line.slice(day.length).replace(/^[\s,:–-]+/, '');
    if (!rest || !looksLikeHoursText(rest)) {
      for (let j = 1; j <= 3; j += 1) {
        const next = lines[i + j] || '';
        if (!next || /^[\[{]/.test(next) || dayNameRe.test(next)) break;
        if (looksLikeHoursText(next) && next.length < 80) {
          rest = next;
          break;
        }
      }
    }
    add(day, rest);
  }

  // Compact "Wednesday 8 AM–5 PM" / "Monday, 9 AM to 5 PM" / "Saturday Closed"
  for (const m of text.matchAll(
    /\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s*[,:]?\s*(Closed|24\s*hours|\d{1,2}(?::\d{2})?\s*[AP]M?\s*(?:[–—−-]|to)\s*\d{1,2}(?::\d{2})?\s*[AP]M)/gi
  )) {
    add(m[1], m[2]);
  }

  const nameMatch =
    raw.match(/property="og:title"\s+content="([^"]+)"/i) ||
    raw.match(/"([A-Z][^"\\]{2,80})",null,\["/) ||
    raw.match(/<title>([^<]+)<\/title>/i);
  let name = nameMatch ? normalizeHourText(nameMatch[1]) : '';
  name = name.replace(/\s*[-–|].*$/, '').replace(/Google Maps|Google Search/gi, '').trim();
  if (/^https?:\/\//i.test(name) || /^\+?\d[\d\s()-]{6,}$/.test(name)) name = '';

  return {
    name,
    descriptions,
    sample: lines.filter((l) => /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|AM|PM|Closed|Hours|Open/i.test(l)).slice(0, 60)
  };
}

function resolveChromeExecutableSync() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.GOOGLE_CHROME_BIN,
    process.env.CHROMIUM_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);
  return candidates.find((p) => {
    try {
      return fs.existsSync(p);
    } catch (_) {
      return false;
    }
  });
}

async function resolveChromeExecutable() {
  const syncPath = resolveChromeExecutableSync();
  if (syncPath) return syncPath;
  try {
    const puppeteer = require('puppeteer');
    if (typeof puppeteer.executablePath === 'function') {
      const p = puppeteer.executablePath();
      if (p && fs.existsSync(p)) return p;
    }
  } catch (_) {
    /* optional */
  }
  try {
    const chromium = require('@sparticuz/chromium');
    return await chromium.executablePath();
  } catch (_) {
    return '';
  }
}

function waitForChromeCdp(port, tries = 50) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/json/version' }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        n += 1;
        if (n >= tries) reject(new Error('Chrome DevTools not ready'));
        else setTimeout(tick, 150);
      });
    };
    tick();
  });
}

async function withChromeCdpPage(fn) {
  const { spawn } = require('child_process');
  const exe = await resolveChromeExecutable();
  if (!exe) {
    const err = new Error(
      'No Chrome/Chromium found to read Google hours from the page. Install Chrome on the server, or set CHROME_PATH.'
    );
    err.status = 503;
    throw err;
  }
  if (typeof WebSocket === 'undefined') {
    const err = new Error('WebSocket is required to read Google hours from Chrome.');
    err.status = 503;
    throw err;
  }

  const port = 9200 + Math.floor(Math.random() * 600);
  const userDataDir = path.join(
    require('os').tmpdir(),
    `smarthours-chrome-${process.pid}-${port}`
  );
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
  } catch (_) {
    /* ignore */
  }
  const proc = spawn(
    exe,
    [
      '--headless=new',
      '--disable-blink-features=AutomationControlled',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1440,1200',
      '--lang=en-US',
      'about:blank'
    ],
    { stdio: 'ignore' }
  );

  try {
    await waitForChromeCdp(port);
    const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
    const page = (list || []).find((t) => t.type === 'page') || (list || [])[0];
    if (!page || !page.webSocketDebuggerUrl) {
      throw new Error('Chrome opened but no page target was available.');
    }
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    });

    let nextId = 1;
    const pending = new Map();
    const networkHits = [];
    const networkTextsEager = [];
    const pendingBodyIds = new Set();
    let cdpRef = null;
    const looksLikeHoursPayload = (t) =>
      t &&
      (/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/i.test(t) ||
        /\[\[\d{1,2}(?:,\d+)?\],\[\d{1,2}(?:,\d+)?\]\]/.test(t));
    const pullBody = (requestId) => {
      if (!cdpRef || !requestId || pendingBodyIds.has(requestId)) return;
      pendingBodyIds.add(requestId);
      cdpRef('Network.getResponseBody', { requestId })
        .then((body) => {
          let t = body && body.body != null ? String(body.body) : '';
          if (body && body.base64Encoded) t = Buffer.from(t, 'base64').toString('utf8');
          if (looksLikeHoursPayload(t)) {
            networkTextsEager.push(t);
          }
        })
        .catch(() => {})
        .finally(() => pendingBodyIds.delete(requestId));
    };
    const onMessage = (event) => {
      try {
        const raw = event && event.data != null ? event.data : event;
        const text = typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8');
        const msg = JSON.parse(text);
        if (msg.method === 'Network.responseReceived') {
          const url = (msg.params && msg.params.response && msg.params.response.url) || '';
          const status = msg.params && msg.params.response ? msg.params.response.status : 0;
          const mime =
            (msg.params &&
              msg.params.response &&
              (msg.params.response.mimeType || msg.params.response.headersMediaType)) ||
            '';
          // Keep Maps place payloads (preview/place, tbm=map, batchexecute, rpc).
          // Expanding hours often hits preview/place again with a richer pb=.
          if (
            status >= 200 &&
            status < 400 &&
            /google\.(com|[a-z.]+)/i.test(url) &&
            !/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|css|mp4|webm)(\?|$)/i.test(url) &&
            (/tbm=map|maps\/preview\/place|\/maps\/preview\/|\/maps\/rpc\/|batchexecute|\/search\?/i.test(
              url
            ) ||
              /json|javascript|text/i.test(mime))
          ) {
            networkHits.push({ requestId: msg.params.requestId, url });
          }
        }
        if (msg.method === 'Network.loadingFinished') {
          const requestId = msg.params && msg.params.requestId;
          if (requestId && networkHits.some((h) => h.requestId === requestId)) {
            pullBody(requestId);
          }
        }
        if (msg.id && pending.has(msg.id)) {
          const { resolve, reject } = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || 'CDP error'));
          else resolve(msg.result);
        }
      } catch (_) {
        /* ignore event noise */
      }
    };
    ws.addEventListener('message', onMessage);

    const cdp = (method, params = {}) => {
      const id = nextId;
      nextId += 1;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            reject(new Error(`CDP timeout: ${method}`));
          }
        }, 60000);
      });
    };
    cdpRef = cdp;

    await cdp('Page.enable');
    await cdp('Runtime.enable');
    await cdp('Network.enable');
    await cdp('Page.addScriptToEvaluateOnNewDocument', {
      source: `Object.defineProperty(navigator, 'webdriver', { get: () => undefined });`
    }).catch(() => {});

    const api = {
      async goto(url) {
        await cdp('Page.navigate', { url });
        await sleep(5500);
      },
      /** Trusted mouse click via CDP Input (Maps ignores many DOM .click() calls). */
      async clickXy(x, y) {
        const cx = Number(x);
        const cy = Number(y);
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) return false;
        await cdp('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: cx,
          y: cy,
          button: 'none'
        });
        await sleep(40);
        await cdp('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: cx,
          y: cy,
          button: 'left',
          clickCount: 1
        });
        await sleep(40);
        await cdp('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: cx,
          y: cy,
          button: 'left',
          clickCount: 1
        });
        return true;
      },
      async setContent(html, opts = {}) {
        const width = Math.max(200, Number(opts.width) || 800);
        const height = Math.max(120, Number(opts.height) || 480);
        // Use explicit pixel viewport only — do NOT set screenOrientation.
        // LandscapePrimary/angle 90 made Chrome capture content sideways.
        await cdp('Emulation.setDeviceMetricsOverride', {
          width,
          height,
          deviceScaleFactor: Number(opts.deviceScaleFactor) || 1,
          mobile: false,
          screenWidth: width,
          screenHeight: height,
          screenOrientation: { type: 'portraitPrimary', angle: 0 }
        });
        await cdp('Page.navigate', { url: 'about:blank' });
        await sleep(100);
        const tree = await cdp('Page.getFrameTree');
        const frameId =
          (tree && tree.frameTree && tree.frameTree.frame && tree.frameTree.frame.id) ||
          (tree && tree.frameTree && tree.frameTree.id);
        if (!frameId) throw new Error('No Chrome frame for display render');
        await cdp('Page.setDocumentContent', {
          frameId,
          html: String(html || '')
        });
        await sleep(Number(opts.waitMs) || 500);
      },
      async screenshotPng(opts = {}) {
        const result = await cdp('Page.captureScreenshot', {
          format: 'png',
          fromSurface: true,
          captureBeyondViewport: false,
          clip: opts.clip || undefined
        });
        const data = result && result.data ? result.data : '';
        return Buffer.from(data, 'base64');
      },
      async evaluate(expression) {
        const result = await cdp('Runtime.evaluate', {
          expression: `(${expression})()`,
          returnByValue: true,
          awaitPromise: true
        });
        if (result && result.exceptionDetails) {
          throw new Error(result.exceptionDetails.text || 'Page evaluate failed');
        }
        return result && result.result ? result.result.value : null;
      },
      async content() {
        const result = await cdp('Runtime.evaluate', {
          expression: 'document.documentElement.outerHTML',
          returnByValue: true
        });
        return result && result.result ? result.result.value : '';
      },
      async networkTexts() {
        // Give late preview/place responses (after hours expand) time to finish.
        await sleep(1200);
        for (const hit of networkHits.slice(-24)) pullBody(hit.requestId);
        await sleep(900);
        return [...networkTextsEager];
      }
    };

    return await fn(api);
  } finally {
    try {
      proc.kill();
    } catch (_) {
      /* ignore */
    }
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (_) {
      /* ignore */
    }
  }
}

async function fetchGooglePreviewHours(resolved) {
  const ludocid = resolved.ludocid || extractLudocid(resolved.sourceUrl);
  const hexId =
    resolved.hexId ||
    extractMapsHexId(resolved.sourceUrl) ||
    extractMapsHexId(resolved.sourceUrl || '') ||
    (ludocid ? `0x0:0x${BigInt(ludocid).toString(16)}` : '');
  const placeId = String(resolved.placeId || '').trim();
  const kgmid = String(resolved.kgmid || '').trim();
  const urls = [];
  if (hexId) {
    urls.push(
      `https://www.google.com/maps/preview/place?authuser=0&hl=en&gl=us&pb=!1m14!1s${encodeURIComponent(hexId)}!3m12!1m3!1d10000!2d0!3d0!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1`
    );
    // Richer place preview (often includes the full week when lat/lng + name are set)
    const q = String(resolved.query || '').trim();
    const lat = Number(resolved.lat);
    const lng = Number(resolved.lng);
    if (q && Number.isFinite(lat) && Number.isFinite(lng)) {
      urls.unshift(
        `https://www.google.com/maps/preview/place?authuser=0&hl=en&gl=us&q=${encodeURIComponent(q)}&pb=!1m17!1s${encodeURIComponent(hexId)}!2s${encodeURIComponent(q)}!3m8!1m3!1d3500!2d${lng}!3d${lat}!3m2!1i1024!2i768!4f13.1!4m2!3d${lat}!4d${lng}`
      );
    }
  }
  if (ludocid) {
    urls.push(mapsCidUrl(ludocid));
  }
  if (placeId) {
    urls.push(
      `https://www.google.com/maps/preview/place?authuser=0&hl=en&gl=us&pb=!1m14!1s${encodeURIComponent(placeId)}!3m12!1m3!1d10000!2d0!3d0!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1`
    );
  }
  if (kgmid) {
    const q = resolved.query || '';
    urls.push(
      `https://www.google.com/search?tbm=map&hl=en&gl=us&q=${encodeURIComponent(q || kgmid)}&kgmid=${encodeURIComponent(kgmid)}`
    );
    if (q) urls.push(mapsKgmidUrl(kgmid, q));
  }
  if (resolved.query && !/^google maps$/i.test(resolved.query)) {
    urls.push(
      `https://www.google.com/search?tbm=map&hl=en&gl=us&q=${encodeURIComponent(resolved.query)}`
    );
    urls.push(
      `https://www.google.com/maps/preview/place?authuser=0&hl=en&gl=us&q=${encodeURIComponent(resolved.query)}`
    );
  }

  let best = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      if (!res.ok) continue;
      const text = await res.text();
      const parsed = extractHoursFromPageContent(text);
      const foundPlaceId = extractPlaceId(text) || placeId;
      const foundLudocid = extractLudocid(text) || ludocid;
      const candidate = {
        ...parsed,
        placeId: foundPlaceId,
        ludocid: foundLudocid,
        url,
        source: 'preview-json'
      };
      if (hoursDayCount(parsed.descriptions) >= 5) return candidate;
      if (
        parsed.descriptions.length &&
        (!best || hoursDayCount(parsed.descriptions) > hoursDayCount(best.descriptions || []))
      ) {
        best = candidate;
      } else if (!best && (foundPlaceId || foundLudocid)) {
        best = candidate;
      }
    } catch (err) {
      console.warn('[SmartHours] preview fetch failed:', err.message);
    }
  }
  return best;
}

async function scrapeRenderedHours(targetUrl) {
  return withChromeCdpPage(async (page) => {
    await page.goto(targetUrl);

    // Open place card from search/feed if needed (DOM click is fine here).
    await page.evaluate(`async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const link =
        document.querySelector('a[href*="/maps/place/"]') ||
        document.querySelector('[role="feed"] a[href*="/maps/place/"]');
      if (link) {
        try { link.click(); } catch (_) {}
        await sleep(2800);
      }
      return true;
    }`);

    // Prefer the main hours row first — it triggers the weekly preview/place fetch.
    // The chevron alone is flaky in headless.
    const expandTargets = await page.evaluate(`() => {
      const norm = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
      const boxOf = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (!r.width && !r.height) return null;
        return {
          x: r.left + Math.min(Math.max(r.width / 2, 4), 40),
          y: r.top + Math.min(Math.max(r.height / 2, 4), 20),
          label: norm(el.getAttribute('aria-label') || el.textContent || '').slice(0, 80)
        };
      };
      const scored = [];
      const push = (el, score) => {
        const box = boxOf(el);
        if (!box) return;
        scored.push({ ...box, score });
      };
      push(document.querySelector('[jsaction*="openhours"][jsaction*="dropdown"]'), 50);
      push(document.querySelector('[aria-label="Show open hours for the week"]'), 40);
      for (const el of Array.from(document.querySelectorAll('[jsaction*="openhours"], [role="button"], button, [aria-label]'))) {
        const aria = norm(el.getAttribute('aria-label') || '');
        const text = norm(el.textContent || '').slice(0, 100);
        const jsaction = el.getAttribute('jsaction') || '';
        let score = 0;
        if (/openhours/i.test(jsaction) && /dropdown/i.test(jsaction)) score += 30;
        if (/show open hours for the week/i.test(aria)) score += 28;
        if (/Open\\s*[·•∙].*Clos/i.test(aria + ' ' + text)) score += 18;
        if (/see more hours|opening hours|hours for the week/i.test(aria + ' ' + text)) score += 12;
        if (/^Hours$/i.test(aria) || /^Hours$/i.test(text)) score += 6;
        if (/Suggest new hours|Suggest an edit|Copy open hours/i.test(aria + ' ' + text)) score -= 25;
        if (score > 0) push(el, score);
      }
      scored.sort((a, b) => b.score - a.score);
      const seen = new Set();
      const out = [];
      for (const item of scored) {
        const key = Math.round(item.x) + ':' + Math.round(item.y);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
        if (out.length >= 5) break;
      }
      return out;
    }`);

    for (const target of Array.isArray(expandTargets) ? expandTargets : []) {
      try {
        await page.clickXy(target.x, target.y);
        await sleep(2200);
      } catch (err) {
        console.warn('[SmartHours] hours expand click failed:', err.message);
      }
    }
    // Second pass: click again after UI settles (Maps sometimes ignores the first input).
    if (Array.isArray(expandTargets) && expandTargets[0]) {
      try {
        await page.clickXy(expandTargets[0].x, expandTargets[0].y);
        await sleep(2500);
      } catch (_) {
        /* ignore */
      }
    }
    await sleep(2000);

    // Re-fetch preview/place URLs from the page context (cookies/session). Expanding
    // hours often registers a richer pb= URL; a bare server-side fetch of that URL 400s.
    const sessionPreviewTexts = await page.evaluate(`async () => {
      const urls = [];
      const seen = new Set();
      const push = (u) => {
        const s = String(u || '');
        if (!s || seen.has(s) || !/maps\\/preview\\/place/i.test(s)) return;
        seen.add(s);
        urls.push(s);
      };
      try {
        performance.getEntriesByType('resource').forEach((e) => push(e.name));
      } catch (_) {}
      const out = [];
      for (const url of urls.slice(-6)) {
        try {
          const res = await fetch(url, { credentials: 'include' });
          if (!res.ok) continue;
          out.push(await res.text());
        } catch (_) {}
      }
      return out;
    }`);

    // Preferred: read hours table rows (legacy BRdld + current Maps eK4R0e)
    const tableHours = await page.evaluate(`() => {
      const norm = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
      const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const rows = Array.from(
        document.querySelectorAll(
          'table.BRdld tr.XCUnmd, table.eK4R0e tr.y0skZc, div[jsname="ICUAND"] table tr, table.BRdld tr, table.eK4R0e tr'
        )
      );
      const out = [];
      const seen = new Set();
      for (const row of rows) {
        const dayCell = row.querySelector('td.ylH6lf, td:first-child');
        const timeCell = row.querySelector('td.mxowUb, td:nth-child(2)');
        const dayText = norm(dayCell && dayCell.textContent);
        const day = days.find((d) => dayText === d || dayText.startsWith(d));
        if (!day || seen.has(day)) continue;
        const rest =
          norm((timeCell && (timeCell.getAttribute('aria-label') || timeCell.textContent)) || '') ||
          norm(Array.from(row.querySelectorAll('td')).slice(1).map((td) => td.textContent).join(' '));
        if (!rest) continue;
        seen.add(day);
        out.push(day + ' ' + rest);
      }
      return out;
    }`);

    const networkTexts = await page.networkTexts();
    const html = await page.content();
    const bodyText = await page.evaluate(`() => (document.body && document.body.innerText) || ''`);
    const fromHtml = extractHoursFromPageContent(html);
    const fromText = extractHoursFromPageContent(bodyText);
    const fromNetwork = [];
    for (const blob of [
      ...(Array.isArray(sessionPreviewTexts) ? sessionPreviewTexts : []),
      ...networkTexts
    ]) {
      const parsed = extractHoursFromPageContent(blob);
      (parsed.descriptions || []).forEach((line) => fromNetwork.push(line));
    }
    const descriptions = [];
    const seen = new Set();
    for (const line of [
      ...fromNetwork,
      ...(Array.isArray(tableHours) ? tableHours : []),
      ...(fromHtml.descriptions || []),
      ...(fromText.descriptions || [])
    ]) {
      const day = String(line || '').split(/\s+/)[0].toLowerCase();
      if (!day || seen.has(day)) continue;
      seen.add(day);
      descriptions.push(line);
    }
    const meta = await page.evaluate(`() => {
      const h1 = document.querySelector('h1');
      let name = (h1 && h1.textContent) || document.title || '';
      name = String(name).replace(/\\s*[-–|].*$/, '').replace(/Google Maps|Google Search/gi, '').trim();
      if (/^https?:\\/\\//i.test(name)) name = '';
      return { name, url: location.href };
    }`);
    const source =
      fromNetwork.length && hoursDayCount(fromNetwork) >= 5
        ? 'maps-tbm-json'
        : Array.isArray(tableHours) && tableHours.length >= 5
          ? 'dom-hours-table'
          : 'page-parse';
    return {
      name: fromHtml.name || fromText.name || (meta && meta.name) || '',
      url: (meta && meta.url) || targetUrl,
      descriptions,
      sample: fromText.sample || fromHtml.sample,
      html,
      source
    };
  });
}

async function scrapeGoogleHoursFromLink(placeIdOrUrl) {
  const resolved = await resolveGooglePlaceRef(placeIdOrUrl);
  if (/^google(\s+maps)?$/i.test(resolved.query || '')) resolved.query = '';
  const targets = scrapeTargetUrls(resolved, placeIdOrUrl);
  let lastScraped = null;
  let placeId = resolved.placeId || '';
  let bestDescriptions = [];

  const consider = (scraped) => {
    if (!scraped || !scraped.descriptions || !scraped.descriptions.length) return;
    lastScraped = scraped;
    if (hoursDayCount(scraped.descriptions) > hoursDayCount(bestDescriptions)) {
      bestDescriptions = scraped.descriptions;
    }
  };

  // Fast path: Maps preview payload (full week only — don't skip browser on inferred "today")
  const preview = await fetchGooglePreviewHours(resolved);
  if (preview) {
    placeId = preview.placeId || placeId;
    if (preview.ludocid) resolved.ludocid = preview.ludocid;
    consider(preview);
    const fromPreview = parseWeekDescriptions(preview.descriptions || []);
    // Only trust preview when it already has a real multi-day week
    if (
      fromPreview &&
      !fromPreview.incomplete &&
      hoursDayCount(preview.descriptions || []) >= 5 &&
      hoursHaveAnyOpen(fromPreview.hours)
    ) {
      return buildHoursResult(resolved, preview, placeIdOrUrl, placeId, fromPreview);
    }
  }

  // Browser path: expand Hours and read table.BRdld / jsname=ICUAND rows (as in Inspect)
  for (const target of targets) {
    try {
      const scraped = await scrapeRenderedHours(target);
      placeId = extractPlaceId(scraped.url) || placeId;
      let descriptions = scraped.descriptions || [];
      if (bestDescriptions.length) {
        const have = new Set(descriptions.map((d) => String(d || '').split(/\s+/)[0].toLowerCase()));
        bestDescriptions.forEach((line) => {
          const day = String(line || '').split(/\s+/)[0].toLowerCase();
          if (!have.has(day)) descriptions.push(line);
        });
      }
      scraped.descriptions = descriptions;
      consider(scraped);
      const full = parseWeekDescriptions(descriptions);
      // Require a real week (≥5 distinct days). Never invent missing days from "today".
      if (full && !full.incomplete && hoursHaveAnyOpen(full.hours)) {
        return buildHoursResult(resolved, scraped, placeIdOrUrl, placeId, full);
      }
    } catch (err) {
      console.warn('[SmartHours] page scrape failed:', target, err.message);
    }
  }

  const parsed = parseWeekDescriptions(bestDescriptions);
  if (parsed && !parsed.incomplete && hoursHaveAnyOpen(parsed.hours)) {
    return buildHoursResult(resolved, lastScraped, placeIdOrUrl, placeId, parsed);
  }

  const label = friendlyBusinessLabel(resolved, lastScraped);
  const partialNote =
    bestDescriptions && bestDescriptions.length
      ? ` Only found ${hoursDayCount(bestDescriptions)} day(s): ${bestDescriptions.join('; ')}.`
      : '';
  const err = new Error(
    `Could not read a full week of hours on Google for “${label}”. Google often only exposes “today” until the week is expanded — sync retries that in Chrome. Paste a Maps place URL, confirm weekly hours are public, or set PLACES_API for a reliable Places lookup.${partialNote}`
  );
  err.status = 422;
  err.sample = lastScraped && lastScraped.sample;
  err.tried = targets;
  throw err;
}

async function fetchGooglePlaceHoursViaApi(placeIdOrUrl, apiKey, options = {}) {
  const resolved = await resolveGooglePlaceRef(placeIdOrUrl);
  await hydrateResolvedFromMapsListing(resolved);
  const mapsName = isUsablePlaceQuery(resolved.query) ? String(resolved.query).trim() : '';
  const customerName = String(options.preferName || '').trim();
  // Do not search the customer legal name when the source is a Maps link.
  // "E.C.H.O. Elite Cleaning LLC" is a different GBP than the Maps listing
  // "Elite Cleaning Services" on the same short link.
  const sourceLooksLikeMaps =
    isShortMapsShareUrl(placeIdOrUrl) ||
    /\/maps\/place\/|maps\.google\.|google\.[^/]+\/maps/i.test(String(placeIdOrUrl));
  let query = mapsName;
  if (!query && !sourceLooksLikeMaps && isUsablePlaceQuery(customerName)) {
    query = customerName;
  }
  if (query) resolved.query = query;
  let place = null;
  let usedTextSearch = false;
  const nameHint = mapsName || customerName;

  if (resolved.placeId) {
    try {
      place = await placesGetById(resolved.placeId, apiKey);
      const got = place && (place.displayName?.text || place.displayName || '');
      if (place && mapsName && got && !namesLikelySamePlace(got, mapsName)) {
        console.warn('[SmartHours] ignoring Place ID', resolved.placeId, JSON.stringify(got), '≠', JSON.stringify(mapsName));
        place = null;
        resolved.placeId = '';
      }
    } catch (err) {
      if (!query && !resolved.ludocid && !resolved.kgmid) throw err;
      console.warn('[SmartHours] Places get-by-id failed, trying name search:', err.message);
      place = null;
    }
  }

  // Places Text Search only accepts a business name or a ChIJ Place ID — never a Maps/Search URL.
  if (!place && query) {
    try {
      const pin =
        Number.isFinite(resolved.lat) && Number.isFinite(resolved.lng)
          ? ` @${resolved.lat.toFixed(5)},${resolved.lng.toFixed(5)}`
          : '';
      console.log('[SmartHours] Places text search:', query + pin);
      place = await placesSearchText(query, apiKey, {
        lat: resolved.lat,
        lng: resolved.lng,
        radius: Number.isFinite(resolved.lat) ? 2500 : 0,
        preferName: nameHint
      });
      usedTextSearch = true;
    } catch (err) {
      if (!resolved.ludocid && !resolved.kgmid) throw err;
      console.warn('[SmartHours] Places name search failed:', query, err.message);
    }
  }

  if (!place && (resolved.ludocid || resolved.kgmid)) {
    const err = new Error('USE_SCRAPE');
    err.code = 'USE_SCRAPE';
    throw err;
  }
  if (!place) {
    const err = new Error(
      'Could not resolve a Google Place from that link. Paste a full Google Maps place URL (maps.google.com/maps/place/…), not only a share.google short link.'
    );
    err.status = 400;
    throw err;
  }

  if (place && place.id) {
    try {
      const detailed = await placesGetById(place.id, apiKey);
      if (detailed) place = Object.assign({}, place, detailed);
    } catch (err) {
      console.warn('[SmartHours] Places details for hours failed:', err.message);
    }
  }

  const matchedName = place.displayName?.text || place.displayName || '';
  if (nameHint && !namesLikelySamePlace(matchedName, nameHint)) {
    const err = new Error(
      `Google Maps is “${nameHint}” but Places returned “${matchedName}” — a different listing. Paste the full Maps place URL for the correct business.`
    );
    err.status = 422;
    throw err;
  }

  // Prefer the richer of regular vs current opening hours (regular = normal week).
  const regular = place.regularOpeningHours || {};
  const current = place.currentOpeningHours || {};
  const openingScore = (o) =>
    (Array.isArray(o.weekdayDescriptions) ? hoursDayCount(o.weekdayDescriptions) * 10 : 0) +
    (Array.isArray(o.periods) ? periodsDayCount(o.periods) : 0);
  const opening = openingScore(regular) >= openingScore(current) ? regular : current;
  const periods = Array.isArray(opening.periods) ? opening.periods : [];
  const descriptions = Array.isArray(opening.weekdayDescriptions)
    ? opening.weekdayDescriptions
    : [];

  let hours = null;
  let usedDescriptions = descriptions;
  // weekdayDescriptions usually list all 7 days including "Closed".
  if (hoursDayCount(descriptions) >= 5) {
    hours = weekdayDescriptionsToHours(descriptions);
  } else if (periods.length > 0) {
    // periods omit closed days — those stay closed:true (Google's full week, not a copy).
    hours = periodsToHours(periods);
    usedDescriptions = descriptionsFromHours(hours);
  } else if (descriptions.length > 0) {
    // Partial text only (e.g. today) — do not invent the rest of the week.
    const err = new Error('USE_SCRAPE');
    err.code = 'USE_SCRAPE';
    err.message = `Places API only returned ${hoursDayCount(descriptions)} day(s) of hours for “${
      place.displayName?.text || query || 'business'
    }”; need a full week.`;
    throw err;
  }

  if (!hours || !hoursHaveAnyOpen(hours)) {
    const err = new Error(
      `Found “${place.displayName?.text || query || 'business'}” but Google did not return opening hours. Check the Business Profile hours are public.`
    );
    err.status = 422;
    throw err;
  }

  const placeId = String(place.id || resolved.placeId || '')
    .replace(/^places\//i, '')
    .trim();
  const displayName = place.displayName?.text || place.displayName || query || '';
  const dayBits =
    hoursDayCount(descriptions) >= 5
      ? `${hoursDayCount(descriptions)} weekday labels`
      : `${periodsDayCount(periods)} open day(s) from periods`;
  let syncNote = `Full week from Places API (${dayBits}).`;
  if (/share\.google|maps\.app\.goo\.gl/i.test(String(placeIdOrUrl)) && usedTextSearch) {
    syncNote += ` Resolved short link to “${displayName}”.`;
  }
  console.log(
    '[SmartHours] Hours',
    JSON.stringify(displayName),
    placeId || '(no id)',
    dayBits
  );
  // Prefer keeping a precise Maps place URL when the user already provided one
  const resolvedFrom = isStableGooglePlaceUrl(placeIdOrUrl)
    ? String(placeIdOrUrl).trim()
    : isStableGooglePlaceUrl(resolved.sourceUrl)
      ? resolved.sourceUrl
      : isShortMapsShareUrl(placeIdOrUrl)
        ? String(placeIdOrUrl).trim()
        : resolved.sourceUrl || placeIdOrUrl;
  return {
    placeId,
    displayName,
    formattedAddress: place.formattedAddress || '',
    hours,
    rawWeekdayDescriptions: usedDescriptions,
    resolvedFrom,
    resolvedQuery: query,
    ludocid: resolved.ludocid || '',
    kgmid: resolved.kgmid || '',
    source: 'places-api',
    syncNote
  };
}

async function fetchGooglePlaceHours(placeIdOrUrl, options = {}) {
  const apiKey = placesApiKey();
  if (apiKey) {
    try {
      return await fetchGooglePlaceHoursViaApi(placeIdOrUrl, apiKey, options);
    } catch (err) {
      const refererKind = placesRefererBlockKind(err);
      if (refererKind) {
        const friendly = placesRefererBlockedMessage(refererKind, err.message);
        console.warn('[SmartHours]', friendly);
        const wrapped = new Error(friendly);
        wrapped.status = err.status || 403;
        throw wrapped;
      }
      if (err && err.code !== 'USE_SCRAPE') {
        // Fall through to link scrape when Places API fails (billing, wrong key, etc.)
        console.warn('[SmartHours] Places API failed, trying link scrape:', err.message);
      }
    }
  }

  try {
    return await scrapeGoogleHoursFromLink(placeIdOrUrl);
  } catch (err) {
    if (!apiKey) {
      const wrapped = new Error(
        err.message ||
          'Could not fetch Google hours from that link. Set PLACES_API (Google Places API key), or paste a Maps / share.google link.'
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

function resolveSmartHoursTimeZone(timeZone) {
  const explicit = String(timeZone || process.env.SMARTHOURS_TIMEZONE || '').trim();
  // Default Eastern — SmartHours customers are primarily Florida / East Coast.
  return explicit || 'America/New_York';
}

function isOpenNow(hours, date = new Date(), timeZone) {
  const tz = resolveSmartHoursTimeZone(timeZone);
  let dayKey;
  let mins;
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      })
        .formatToParts(date)
        .map((p) => [p.type, p.value])
    );
    const weekMap = {
      Mon: 'monday',
      Tue: 'tuesday',
      Wed: 'wednesday',
      Thu: 'thursday',
      Fri: 'friday',
      Sat: 'saturday',
      Sun: 'sunday'
    };
    dayKey = weekMap[parts.weekday] || DAYS[(date.getDay() + 6) % 7];
    const hour = Number(parts.hour);
    const minute = Number(parts.minute);
    mins = (Number.isFinite(hour) ? hour % 24 : date.getHours()) * 60 + (Number.isFinite(minute) ? minute : date.getMinutes());
  } catch (_) {
    dayKey = DAYS[(date.getDay() + 6) % 7];
    mins = date.getHours() * 60 + date.getMinutes();
  }
  const day = hours && hours[dayKey];
  if (!day || day.closed) return false;
  const inSlot = (open, close) => {
    if (!open || !close) return false;
    const [oh, om] = String(open).split(':').map(Number);
    const [ch, cm] = String(close).split(':').map(Number);
    if (![oh, om, ch, cm].every(Number.isFinite)) return false;
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
  const eink = normalizeEink(customer.eink);
  const tablet = tabletFromEink(eink);
  const bundle = normalizeDesignBundle(customer, tablet, eink.colorMode);
  const designs = bundle.designs.map((slot) => ({
    ...slot,
    design: scrubMediaRefsFromDesign(slot.design, id)
  }));
  const live = designs.find((d) => d.id === bundle.liveDesignId) || designs[0];
  return {
    media,
    design: live.design,
    designs,
    liveDesignId: live.id
  };
}

const SEED_TEMPLATE_CATEGORIES = [
  { id: 'cat-fall', name: 'Fall' },
  { id: 'cat-halloween', name: 'Halloween' },
  { id: 'cat-christmas', name: 'Christmas' },
  { id: 'cat-easter', name: 'Easter' },
  { id: 'cat-shops', name: 'Shops' }
];

const SEED_TEMPLATES = [
  { id: 'tpl-fall', name: 'Fall', categoryId: 'cat-fall', fileName: 'fall.png' },
  { id: 'tpl-fall-2', name: 'Fall 2', categoryId: 'cat-fall', fileName: 'fall-2.png' },
  { id: 'tpl-fall-classic', name: 'Fall Classic', categoryId: 'cat-fall', fileName: 'fall-classic.png' },
  { id: 'tpl-fall-neon', name: 'Fall Neon', categoryId: 'cat-fall', fileName: 'fall-neon.png' },
  {
    id: 'tpl-halloween-classic',
    name: 'Halloween Classic',
    categoryId: 'cat-halloween',
    fileName: 'halloween-classic.png'
  },
  {
    id: 'tpl-halloween-neon',
    name: 'Halloween Neon',
    categoryId: 'cat-halloween',
    fileName: 'halloween-neon.png'
  },
  {
    id: 'tpl-christmas-landscape',
    name: 'Christmas Landscape',
    categoryId: 'cat-christmas',
    fileName: 'christmas-landscape.png'
  },
  { id: 'tpl-xmas', name: 'Christmas', categoryId: 'cat-christmas', fileName: 'xmas.png' },
  { id: 'tpl-easter', name: 'Easter', categoryId: 'cat-easter', fileName: 'easter.png' },
  { id: 'tpl-barber-1', name: 'Barber 1', categoryId: 'cat-shops', fileName: 'barber-1.png' },
  { id: 'tpl-barber-2', name: 'Barber 2', categoryId: 'cat-shops', fileName: 'barber-2.png' },
  { id: 'tpl-barber-3', name: 'Barber 3', categoryId: 'cat-shops', fileName: 'barber-3.png' },
  { id: 'tpl-bike-shop', name: 'Bike Shop', categoryId: 'cat-shops', fileName: 'bike-shop.png' },
  { id: 'tpl-coffee', name: 'Coffee', categoryId: 'cat-shops', fileName: 'coffee.png' },
  { id: 'tpl-florist', name: 'Florist', categoryId: 'cat-shops', fileName: 'florist.png' },
  { id: 'tpl-gift-shop', name: 'Gift Shop', categoryId: 'cat-shops', fileName: 'gift-shop.png' },
  { id: 'tpl-gift-shop-2', name: 'Gift Shop 2', categoryId: 'cat-shops', fileName: 'gift-shop-2.png' },
  { id: 'tpl-ice-cream', name: 'Ice Cream', categoryId: 'cat-shops', fileName: 'ice-cream.png' },
  { id: 'tpl-nails', name: 'Nails', categoryId: 'cat-shops', fileName: 'nails.png' },
  { id: 'tpl-nails-2', name: 'Nails 2', categoryId: 'cat-shops', fileName: 'nails-2.png' },
  { id: 'tpl-nails-3', name: 'Nails 3', categoryId: 'cat-shops', fileName: 'nails-3.png' },
  { id: 'tpl-pet-groomer', name: 'Pet Groomer', categoryId: 'cat-shops', fileName: 'pet-groomer.png' },
  { id: 'tpl-pizza', name: 'Pizza', categoryId: 'cat-shops', fileName: 'pizza.png' },
  { id: 'tpl-tattoo-shop', name: 'Tattoo Shop', categoryId: 'cat-shops', fileName: 'tattoo-shop.png' }
];

function normalizeTemplateCategory(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const id = requestedSlug(src.id || src.name).slice(0, 40);
  const name = String(src.name || '').trim().slice(0, 60);
  if (!id || !name) return null;
  return { id, name };
}

function normalizeTemplateCategories(raw) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : [])
    .map(normalizeTemplateCategory)
    .filter((c) => {
      if (!c || seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
}

function normalizeTemplateItem(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const id = String(src.id || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 40);
  const fileName = String(src.fileName || '')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 80);
  const name = String(src.name || fileName || id).trim().slice(0, 80);
  if (!id || !fileName || !name) return null;
  const pairRole = src.pairRole === 'open' || src.pairRole === 'closed' ? src.pairRole : '';
  return {
    id,
    name,
    categoryId: requestedSlug(src.categoryId).slice(0, 40),
    fileName,
    pairId: String(src.pairId || '').trim().slice(0, 40),
    pairRole,
    createdAt: String(src.createdAt || ''),
    updatedAt: String(src.updatedAt || src.createdAt || '')
  };
}

function normalizeTemplateList(raw) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : [])
    .map(normalizeTemplateItem)
    .filter((t) => {
      if (!t || seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
}

function templatePublicUrl(id, version) {
  const v = version ? `?v=${encodeURIComponent(version)}` : '';
  return `/api/smarthours/public/templates/${encodeURIComponent(id)}${v}`;
}

function copySeedTemplateFile(dataDir, fileName) {
  const destDir = templatesDir(dataDir);
  const dest = path.join(destDir, fileName);
  if (fs.existsSync(dest)) return false;
  const src = path.join(seedTemplatesDir(), fileName);
  if (!fs.existsSync(src)) return false;
  fs.copyFileSync(src, dest);
  return true;
}

function seedTemplateLibrary(dataDir, store) {
  ensureDirs(dataDir);
  const next = store && typeof store === 'object' ? store : emptyStore();
  let categories = normalizeTemplateCategories(next.templateCategories);
  let templates = normalizeTemplateList(next.templates);
  let changed = false;
  SEED_TEMPLATE_CATEGORIES.forEach((cat) => {
    if (!categories.some((c) => c.id === cat.id)) {
      categories.push(cat);
      changed = true;
    }
  });
  const now = new Date().toISOString();
  SEED_TEMPLATES.forEach((item) => {
    copySeedTemplateFile(dataDir, item.fileName);
    if (!templates.some((t) => t.id === item.id)) {
      templates.push({
        ...item,
        pairId: item.pairId || '',
        pairRole: item.pairRole || '',
        createdAt: now,
        updatedAt: now
      });
      changed = true;
    }
  });
  next.templateCategories = categories;
  next.templates = templates;
  return { store: next, changed };
}

function readTemplateFile(dataDir, templateOrId) {
  const tpl =
    templateOrId && typeof templateOrId === 'object'
      ? templateOrId
      : null;
  const fileName = tpl ? tpl.fileName : '';
  const id = tpl ? tpl.id : String(templateOrId || '').trim();
  const names = [];
  if (fileName) names.push(fileName);
  if (id) {
    ['.png', '.jpg', '.jpeg', '.webp'].forEach((ext) => names.push(`${id}${ext}`));
  }
  const dirs = [templatesDir(dataDir), seedTemplatesDir()];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of names) {
      const file = path.join(dir, name);
      if (!fs.existsSync(file)) continue;
      const ext = path.extname(file).toLowerCase();
      const type =
        ext === '.png'
          ? 'image/png'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.gif'
              ? 'image/gif'
              : 'image/jpeg';
      return { buffer: fs.readFileSync(file), type, fileName: name };
    }
  }
  return null;
}

function listTemplateLibrary(storeOrDir) {
  const store =
    storeOrDir && typeof storeOrDir === 'object' && Array.isArray(storeOrDir.templates)
      ? storeOrDir
      : loadStore(storeOrDir);
  return {
    categories: normalizeTemplateCategories(store.templateCategories),
    templates: normalizeTemplateList(store.templates).map((t) => ({
      ...t,
      url: templatePublicUrl(t.id, t.updatedAt || t.createdAt)
    }))
  };
}

function resolveImageUrl(customer, mediaId, templates) {
  const id = String(mediaId || '').trim();
  if (!id) return '';
  const tpl = (templates || []).find((t) => t.id === id);
  if (tpl) return tpl.url || templatePublicUrl(tpl.id, tpl.updatedAt || tpl.createdAt);
  const media = (customer && customer.media) || [];
  const m = media.find((item) => item.id === id);
  if (!m) return '';
  return m.url || mediaPublicUrl(customer.id, m.id, m.createdAt);
}

function resolveImageFile(dataDir, customer, mediaId, templates) {
  const id = String(mediaId || '').trim();
  if (!id) return null;
  if (customer && customer.id) {
    const owned = readMediaFile(dataDir, customer.id, id);
    if (owned) return owned;
  }
  const list = Array.isArray(templates)
    ? templates
    : listTemplateLibrary(dataDir).templates;
  const tpl = list.find((t) => t.id === id);
  if (!tpl) return null;
  return readTemplateFile(dataDir, tpl);
}

function saveTemplateFile(dataDir, dataUrl, originalName, meta = {}) {
  const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    const err = new Error('Template must be a data URL image.');
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
  if (buf.length > 4 * 1024 * 1024) {
    const err = new Error('Image must be under 4MB.');
    err.status = 400;
    throw err;
  }
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const fileName = `${id}.${ext}`;
  const dir = templatesDir(dataDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), buf);
  const now = new Date().toISOString();
  const pairRole = meta.pairRole === 'open' || meta.pairRole === 'closed' ? meta.pairRole : '';
  return {
    id,
    name: String(meta.name || originalName || fileName).replace(/\.[^.]+$/, '').slice(0, 80) || id,
    categoryId: requestedSlug(meta.categoryId).slice(0, 40),
    fileName,
    pairId: String(meta.pairId || '').trim().slice(0, 40),
    pairRole,
    createdAt: now,
    updatedAt: now
  };
}

function customerFacing(customer) {
  if (!customer || typeof customer !== 'object') return customer;
  const copy = { ...customer };
  delete copy.accessTokens;
  return copy;
}

function hashAccessToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function issueAccessToken(customer) {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + STUDIO_LINK_MS).toISOString();
  const entry = {
    hash: hashAccessToken(token),
    expiresAt,
    createdAt: new Date().toISOString()
  };
  const accessTokens = normalizeAccessTokens([...(customer.accessTokens || []), entry]);
  return { token, expiresAt, accessTokens };
}

function accessTokenValid(customer, token) {
  const hash = hashAccessToken(token);
  if (!hash || !customer) return false;
  const now = Date.now();
  return (customer.accessTokens || []).some(
    (t) => t.hash === hash && Date.parse(t.expiresAt) > now
  );
}

function findCustomersByEmail(store, email) {
  const key = normalizeEmail(email);
  if (!key) return [];
  return (store.customers || []).filter((c) => normalizeEmail(c.email) === key);
}

function publicPayload(customer, options = {}) {
  const hours = effectiveHours(customer);
  const eink = normalizeEink(customer.eink);
  const tablet = tabletFromEink(eink);
  const design = normalizeDesign(customer.design, tablet, eink.colorMode);
  let logoUrl = design.logoUrl || '';
  const dataDir = options.dataDir || resolveDataDir();
  const media = listMediaFiles(dataDir, customer);
  const mediaById = new Map(media.map((m) => [m.id, m]));
  const templates = options.templates || listTemplateLibrary(dataDir).templates;
  const imageUrlFor = (id) => {
    if (!id) return '';
    const m = mediaById.get(id);
    if (m) return m.url;
    return resolveImageUrl(customer, id, templates);
  };
  const slideshow = (design.slideshowMediaIds || []).map(imageUrlFor).filter(Boolean);
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
      openImageUrl: imageUrlFor(design.openMediaId),
      closedImageUrl: imageUrlFor(design.closedMediaId),
      slideshowUrls: slideshow,
      layout: design.layout.map((el) => {
        if (el.type !== 'image') return el;
        return { ...el, imageUrl: imageUrlFor(el.mediaId) };
      })
    },
    media,
    eink,
    tablet,
    panel: panelFromEink(eink),
    outputRotation: outputRotationDegrees(eink),
    colorPalettes: COLOR_MODES,
    lastSyncedAt: customer.lastSyncedAt,
    useManualHours: customer.useManualHours,
    updatedAt: customer.updatedAt
  };
}

function hoursEqual(a, b) {
  return JSON.stringify(normalizeHours(a)) === JSON.stringify(normalizeHours(b));
}

function cleanMapsPlaceUrl(url) {
  try {
    const u = new URL(String(url || ''));
    if (!/google\./i.test(u.hostname) || !/\/maps\/place\//i.test(u.pathname)) return '';
    return `${u.origin}${u.pathname}`;
  } catch (_) {
    return '';
  }
}

function isStableGooglePlaceUrl(url) {
  const s = String(url || '').trim();
  if (!s) return false;
  if (cleanMapsPlaceUrl(s)) return true;
  if (extractMapsHexId(s) && /google\./i.test(s)) return true;
  if (extractKgmid(s) && /\/maps\/place\//i.test(s)) return true;
  if (/[?&](?:cid|ludocid)=\d{6,}/i.test(s)) return true;
  if (/[?&]query_place_id=ChIJ[\w-]+/i.test(s)) return true;
  return false;
}

function ludocidFromMapsHex(input) {
  const hex = extractMapsHexId(input);
  const m = String(hex || '').match(/0x[0-9a-f]+:(0x[0-9a-f]+)/i);
  if (!m) return '';
  try {
    return BigInt(m[1]).toString();
  } catch (_) {
    return '';
  }
}

async function syncCustomerGoogleHours(customer) {
  const source = customer.googleMapsUrl || customer.googlePlaceId;
  if (!source) {
    return { customer, changed: false, skipped: true, reason: 'No Google Place ID/URL set.' };
  }
  try {
    // Prefer the Maps/Place URL; if it's only a vague name, bias with customer name.
    const storedPlaceId = extractPlaceId(customer.googlePlaceId);
    const sourceWasStable = isStableGooglePlaceUrl(customer.googleMapsUrl || source);
    let fetchSource = source;
    const looksLikeUrl = /^https?:\/\//i.test(String(source)) || /maps\.app\.goo\.gl|share\.google|google\./i.test(String(source));
    if (storedPlaceId && isCidOnlyMapsUrl(source)) {
      // Places Text Search cannot resolve maps?cid= URLs. Use the Place ID we already stored.
      fetchSource = storedPlaceId;
    } else if (isShortMapsShareUrl(source) || /\/maps\/place\//i.test(String(source))) {
      fetchSource = source;
    } else if (storedPlaceId && !extractPlaceId(source) && !sourceWasStable) {
      // Search/kgmid links don't resolve in Places API — reuse a Place ID from a previous sync.
      fetchSource = storedPlaceId;
    } else if (!looksLikeUrl && customer.name && !new RegExp(customer.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(String(source))) {
      fetchSource = `${customer.name} ${source}`.trim();
    }
    const fetched = await fetchGooglePlaceHours(fetchSource, { preferName: customer.name });
    const prev = customer.googleHours;
    const scrapedPlaceId = extractPlaceId(fetched.placeId) || extractPlaceId(fetched.resolvedFrom);
    const scrapedLudocid =
      fetched.ludocid ||
      ludocidFromMapsHex(fetched.resolvedFrom) ||
      extractLudocid(fetched.resolvedFrom);
    const stableMapsUrl =
      cleanMapsPlaceUrl(fetched.resolvedFrom) ||
      (scrapedLudocid ? mapsCidUrl(scrapedLudocid) : '');

    const originalUrl = String(customer.googleMapsUrl || source || '').trim();
    const keepOriginalShare = isShortMapsShareUrl(originalUrl);
    const persistable =
      cleanMapsPlaceUrl(fetched.resolvedFrom) ||
      (scrapedPlaceId
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            fetched.displayName || customer.name || 'place'
          )}&query_place_id=${encodeURIComponent(scrapedPlaceId)}`
        : '');

    // Keep the short link the customer pasted. Expanding it to a /maps/place/ data URL
    // is noisy and often includes a city-level viewport, not a better listing id.
    if (keepOriginalShare) {
      customer.googleMapsUrl = originalUrl;
    } else if (sourceWasStable) {
      customer.googleMapsUrl =
        cleanMapsPlaceUrl(customer.googleMapsUrl || source) || String(customer.googleMapsUrl || source);
    } else if (persistable) {
      customer.googleMapsUrl = persistable;
    } else if (scrapedLudocid && !isGoogleSearchUrl(originalUrl)) {
      customer.googleMapsUrl = mapsCidUrl(scrapedLudocid);
    } else {
      customer.googleMapsUrl = originalUrl || customer.googleMapsUrl;
    }
    if (isGoogleSearchUrl(customer.googleMapsUrl)) {
      customer.googleMapsUrl = keepOriginalShare ? originalUrl : persistable || originalUrl;
    }

    // Place ID from Places API is fine; avoid locking onto a wrong ChIJ from an ambiguous share link
    // when the user already pasted a stable Maps place URL.
    if (scrapedPlaceId && (!sourceWasStable || fetched.source === 'places-api')) {
      customer.googlePlaceId = scrapedPlaceId;
    } else if (sourceWasStable && !scrapedPlaceId) {
      // Keep existing place id if any; Maps URL remains source of truth
    } else if (stableMapsUrl || scrapedLudocid) {
      customer.googlePlaceId = scrapedPlaceId || '';
    } else {
      customer.googlePlaceId = extractPlaceId(fetched.placeId) || customer.googlePlaceId;
    }

    customer.googleDisplayName = fetched.displayName || customer.googleDisplayName;
    customer.googleHours = fetched.hours;
    if (!customer.useManualHours) {
      customer.hours = fetched.hours;
    }
    customer.lastSyncedAt = new Date().toISOString();
    customer.lastSyncAttemptAt = customer.lastSyncedAt;
    customer.lastSyncError = null;
    customer.lastSyncNote = fetched.syncNote || null;
    customer.updatedAt = new Date().toISOString();
    const changed = !prev || !hoursEqual(prev, fetched.hours);
    return {
      customer,
      changed,
      skipped: false,
      displayName: fetched.displayName,
      resolvedQuery: fetched.resolvedQuery,
      syncNote: fetched.syncNote || ''
    };
  } catch (err) {
    customer.lastSyncError = err.message || 'Sync failed';
    customer.lastSyncNote = null;
    customer.lastSyncAttemptAt = new Date().toISOString();
    customer.updatedAt = customer.lastSyncAttemptAt;
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

function isGoogleSyncDue(customer, nowMs) {
  const mins = normalizeGoogleSyncIntervalMinutes(customer && customer.googleSyncIntervalMinutes);
  if (mins <= 0) return false;
  if (!customer.googleMapsUrl && !customer.googlePlaceId) return false;
  const stamp = customer.lastSyncAttemptAt || customer.lastSyncedAt;
  if (!stamp) return true;
  const last = Date.parse(stamp);
  if (!Number.isFinite(last)) return true;
  return (nowMs || Date.now()) - last >= mins * 60 * 1000;
}

async function syncDueCustomers(dataDir) {
  const store = loadStore(dataDir);
  const now = Date.now();
  let synced = 0;
  let changed = 0;
  let errors = 0;
  let skipped = 0;
  for (let i = 0; i < store.customers.length; i += 1) {
    if (!isGoogleSyncDue(store.customers[i], now)) {
      skipped += 1;
      continue;
    }
    const result = await syncCustomerGoogleHours(store.customers[i]);
    store.customers[i] = result.customer;
    if (!result.skipped) synced += 1;
    else skipped += 1;
    if (result.changed) changed += 1;
    if (result.error) errors += 1;
  }
  if (synced > 0 || errors > 0) saveStore(dataDir, store);
  return { synced, changed, errors, skipped, total: store.customers.length };
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
  DEFAULT_SCREEN,
  COLOR_MODES,
  tabletFromEink,
  resolveColorMode,
  colorModePalette,
  nearestPaletteColor,
  resolveDataDir,
  storePath,
  logosDir,
  einkCacheDir,
  templatesDir,
  ensureDirs,
  migrateLegacyDataDir,
  loadStore,
  saveStore,
  defaultSettings,
  normalizeSettings,
  normalizeDevice,
  deviceUrlCode,
  deviceMatchesSlug,
  enrichDevices,
  listDevices,
  checkinDevice,
  updateDevice,
  queueDeviceReset,
  pollIntervalForDevice,
  getAutoSyncIntervalHours,
  setAutoSyncIntervalHours,
  normalizeCustomer,
  normalizeHours,
  normalizeDesign,
  normalizeDesignBundle,
  MAX_CUSTOMER_DESIGNS,
  normalizeMediaList,
  resolveLayoutFontSize,
  resolveLayoutFontFamily,
  resolveStatusBadgeColors,
  normalizeEink,
  normalizeHangRotation,
  panelFromEink,
  outputRotationDegrees,
  defaultEink,
  defaultHours,
  defaultDesign,
  slugify,
  requestedSlug,
  checkSlugAvailable,
  uniqueSlug,
  extractPlaceId,
  resolveGooglePlaceRef,
  fetchGooglePlaceHours,
  extractHoursFromPageContent,
  syncCustomerGoogleHours,
  syncAllCustomers,
  syncDueCustomers,
  isGoogleSyncDue,
  normalizeGoogleSyncIntervalMinutes,
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
  listTemplateLibrary,
  readTemplateFile,
  saveTemplateFile,
  resolveImageFile,
  resolveImageUrl,
  templatePublicUrl,
  customerFacing,
  normalizeEmail,
  issueAccessToken,
  accessTokenValid,
  findCustomersByEmail,
  STUDIO_LINK_MS,
  placesApiKey,
  withChromeCdpPage
};
