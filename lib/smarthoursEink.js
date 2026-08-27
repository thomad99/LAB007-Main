'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {
  DAYS,
  DAY_LABELS,
  tabletFromEink,
  effectiveHours,
  formatDayHours,
  isOpenNow,
  normalizeEink,
  normalizeDesign,
  resolveDataDir,
  einkCacheDir,
  ensureDirs,
  readLogoFile,
  readMediaFile,
  resolveImageFile,
  resolveLayoutFontSize
} = require('./smarthours');

// Compact 5x7 glyphs for printable ASCII (32-126). Each row is a bit mask (bits 0-4).
const FONT5X7 = {
  32: [0, 0, 0, 0, 0, 0, 0],
  33: [4, 4, 4, 4, 0, 4, 0],
  35: [10, 10, 31, 10, 31, 10, 10],
  36: [4, 15, 20, 14, 5, 30, 4],
  37: [25, 26, 2, 4, 8, 11, 19],
  38: [8, 20, 20, 8, 21, 18, 13],
  39: [4, 4, 0, 0, 0, 0, 0],
  40: [2, 4, 8, 8, 8, 4, 2],
  41: [8, 4, 2, 2, 2, 4, 8],
  42: [0, 4, 21, 14, 21, 4, 0],
  43: [0, 4, 4, 31, 4, 4, 0],
  44: [0, 0, 0, 0, 4, 4, 8],
  45: [0, 0, 0, 31, 0, 0, 0],
  46: [0, 0, 0, 0, 0, 4, 0],
  47: [1, 2, 2, 4, 8, 8, 16],
  48: [14, 17, 19, 21, 25, 17, 14],
  49: [4, 12, 4, 4, 4, 4, 14],
  50: [14, 17, 1, 2, 4, 8, 31],
  51: [31, 2, 4, 2, 1, 17, 14],
  52: [2, 6, 10, 18, 31, 2, 2],
  53: [31, 16, 30, 1, 1, 17, 14],
  54: [6, 8, 16, 30, 17, 17, 14],
  55: [31, 1, 2, 4, 8, 8, 8],
  56: [14, 17, 17, 14, 17, 17, 14],
  57: [14, 17, 17, 15, 1, 2, 12],
  58: [0, 4, 0, 0, 4, 0, 0],
  59: [0, 4, 0, 0, 4, 4, 8],
  61: [0, 0, 31, 0, 31, 0, 0],
  63: [14, 17, 1, 2, 4, 0, 4],
  64: [14, 17, 1, 13, 21, 21, 14],
  65: [14, 17, 17, 31, 17, 17, 17],
  66: [30, 17, 17, 30, 17, 17, 30],
  67: [14, 17, 16, 16, 16, 17, 14],
  68: [30, 17, 17, 17, 17, 17, 30],
  69: [31, 16, 16, 30, 16, 16, 31],
  70: [31, 16, 16, 30, 16, 16, 16],
  71: [14, 17, 16, 19, 17, 17, 14],
  72: [17, 17, 17, 31, 17, 17, 17],
  73: [14, 4, 4, 4, 4, 4, 14],
  74: [1, 1, 1, 1, 17, 17, 14],
  75: [17, 18, 20, 24, 20, 18, 17],
  76: [16, 16, 16, 16, 16, 16, 31],
  77: [17, 27, 21, 21, 17, 17, 17],
  78: [17, 17, 25, 21, 19, 17, 17],
  79: [14, 17, 17, 17, 17, 17, 14],
  80: [30, 17, 17, 30, 16, 16, 16],
  81: [14, 17, 17, 17, 21, 18, 13],
  82: [30, 17, 17, 30, 20, 18, 17],
  83: [14, 17, 16, 14, 1, 17, 14],
  84: [31, 4, 4, 4, 4, 4, 4],
  85: [17, 17, 17, 17, 17, 17, 14],
  86: [17, 17, 17, 17, 17, 10, 4],
  87: [17, 17, 17, 21, 21, 21, 10],
  88: [17, 17, 10, 4, 10, 17, 17],
  89: [17, 17, 10, 4, 4, 4, 4],
  90: [31, 1, 2, 4, 8, 16, 31],
  97: [0, 0, 14, 1, 15, 17, 15],
  98: [16, 16, 30, 17, 17, 17, 30],
  99: [0, 0, 14, 17, 16, 17, 14],
  100: [1, 1, 15, 17, 17, 17, 15],
  101: [0, 0, 14, 17, 31, 16, 14],
  102: [6, 8, 8, 30, 8, 8, 8],
  103: [0, 0, 15, 17, 15, 1, 14],
  104: [16, 16, 30, 17, 17, 17, 17],
  105: [4, 0, 12, 4, 4, 4, 14],
  106: [2, 0, 6, 2, 2, 18, 12],
  107: [16, 16, 18, 20, 24, 20, 18],
  108: [12, 4, 4, 4, 4, 4, 14],
  109: [0, 0, 26, 21, 21, 17, 17],
  110: [0, 0, 30, 17, 17, 17, 17],
  111: [0, 0, 14, 17, 17, 17, 14],
  112: [0, 0, 30, 17, 30, 16, 16],
  113: [0, 0, 15, 17, 15, 1, 1],
  114: [0, 0, 22, 25, 16, 16, 16],
  115: [0, 0, 15, 16, 14, 1, 30],
  116: [8, 8, 30, 8, 8, 8, 6],
  117: [0, 0, 17, 17, 17, 17, 15],
  118: [0, 0, 17, 17, 17, 10, 4],
  119: [0, 0, 17, 17, 21, 21, 10],
  120: [0, 0, 17, 10, 4, 10, 17],
  121: [0, 0, 17, 17, 15, 1, 14],
  122: [0, 0, 31, 2, 4, 8, 31]
};

function createBitmap(width, height, fillBlack) {
  const stride = Math.ceil(width / 8);
  const data = Buffer.alloc(stride * height, fillBlack ? 0x00 : 0xff);
  return { width, height, stride, data, fillBlack: !!fillBlack };
}

function setPixel(bmp, x, y, black) {
  if (x < 0 || y < 0 || x >= bmp.width || y >= bmp.height) return;
  const byteIndex = y * bmp.stride + (x >> 3);
  const bit = 7 - (x & 7);
  if (black) bmp.data[byteIndex] &= ~(1 << bit);
  else bmp.data[byteIndex] |= 1 << bit;
}

function fillRect(bmp, x, y, w, h, black) {
  const x2 = Math.min(bmp.width, x + w);
  const y2 = Math.min(bmp.height, y + h);
  for (let yy = Math.max(0, y); yy < y2; yy += 1) {
    for (let xx = Math.max(0, x); xx < x2; xx += 1) setPixel(bmp, xx, yy, black);
  }
}

function hLine(bmp, x, y, w, black) {
  fillRect(bmp, x, y, w, 1, black);
}

function drawChar(bmp, ch, x, y, scale, black) {
  const code = ch.charCodeAt(0);
  const glyph = FONT5X7[code] || FONT5X7[63];
  for (let row = 0; row < 7; row += 1) {
    const bits = glyph[row];
    for (let col = 0; col < 5; col += 1) {
      if (bits & (1 << (4 - col))) {
        fillRect(bmp, x + col * scale, y + row * scale, scale, scale, black);
      }
    }
  }
}

function textWidth(text, scale) {
  return String(text || '').length * (5 * scale + scale);
}

function drawText(bmp, text, x, y, scale, black) {
  let cx = x;
  const str = String(text || '');
  for (let i = 0; i < str.length; i += 1) {
    drawChar(bmp, str[i], cx, y, scale, black);
    cx += 5 * scale + scale;
  }
  return cx;
}

function drawTextCentered(bmp, text, y, scale, black) {
  const w = textWidth(text, scale);
  const x = Math.max(0, Math.floor((bmp.width - w) / 2));
  drawText(bmp, text, x, y, scale, black);
}

function encodeBmp1Bit(bmp, inverted) {
  const width = bmp.width;
  const height = bmp.height;
  // BMP rows padded to 4 bytes
  const rowSize = Math.floor((width + 31) / 32) * 4;
  const pixelBytes = rowSize * height;
  const fileSize = 62 + pixelBytes;
  const out = Buffer.alloc(fileSize, 0);

  out.write('BM', 0);
  out.writeUInt32LE(fileSize, 2);
  out.writeUInt32LE(62, 10); // pixel offset
  out.writeUInt32LE(40, 14); // DIB header size
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22); // bottom-up
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(1, 28); // 1 bpp
  out.writeUInt32LE(0, 30);
  out.writeUInt32LE(pixelBytes, 34);
  out.writeUInt32LE(2835, 38);
  out.writeUInt32LE(2835, 42);
  out.writeUInt32LE(2, 46);
  out.writeUInt32LE(2, 50);
  // Color table: index0 = black/white depending on inverted
  if (inverted) {
    out[54] = 255; out[55] = 255; out[56] = 255; out[57] = 0;
    out[58] = 0; out[59] = 0; out[60] = 0; out[61] = 0;
  } else {
    out[54] = 0; out[55] = 0; out[56] = 0; out[57] = 0;
    out[58] = 255; out[59] = 255; out[60] = 255; out[61] = 0;
  }

  for (let y = 0; y < height; y += 1) {
    const srcY = height - 1 - y;
    const destRow = 62 + y * rowSize;
    for (let xByte = 0; xByte < bmp.stride; xByte += 1) {
      out[destRow + xByte] = bmp.data[srcY * bmp.stride + xByte];
    }
  }
  return out;
}

function parseHexColor(value, fallback = 255) {
  const s = String(value || '').trim();
  const m = s.match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

function createGray(width, height, fill) {
  return { width, height, data: Buffer.alloc(width * height, fill & 255) };
}

function setGray(gray, x, y, value) {
  if (x < 0 || y < 0 || x >= gray.width || y >= gray.height) return;
  gray.data[y * gray.width + x] = value & 255;
}

function fillGrayRect(gray, x, y, w, h, value) {
  const x2 = Math.min(gray.width, x + w);
  const y2 = Math.min(gray.height, y + h);
  for (let yy = Math.max(0, y); yy < y2; yy += 1) {
    for (let xx = Math.max(0, x); xx < x2; xx += 1) setGray(gray, xx, yy, value);
  }
}

function drawCharGray(gray, ch, x, y, scale, value) {
  const code = ch.charCodeAt(0);
  const glyph = FONT5X7[code] || FONT5X7[63];
  for (let row = 0; row < 7; row += 1) {
    const bits = glyph[row];
    for (let col = 0; col < 5; col += 1) {
      if (bits & (1 << (4 - col))) {
        fillGrayRect(gray, x + col * scale, y + row * scale, scale, scale, value);
      }
    }
  }
}

function drawTextGray(gray, text, x, y, scale, value) {
  let cx = x;
  const str = String(text || '');
  for (let i = 0; i < str.length; i += 1) {
    drawCharGray(gray, str[i], cx, y, scale, value);
    cx += 5 * scale + scale;
  }
  return cx;
}

function drawTextCenteredGray(gray, text, y, scale, value) {
  const w = textWidth(text, scale);
  const x = Math.max(0, Math.floor((gray.width - w) / 2));
  drawTextGray(gray, text, x, y, scale, value);
}

function drawWrappedTextGray(gray, text, x, y, maxW, maxH, scale, value, align) {
  const lineH = 7 * scale + Math.max(2, scale);
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, scale) <= maxW || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  });
  if (line) lines.push(line);
  if (!words.length && String(text || '').includes('\n')) {
    String(text).split('\n').forEach((l) => lines.push(l));
  }
  let cy = y;
  for (let i = 0; i < lines.length; i += 1) {
    if (cy + 7 * scale > y + maxH) break;
    const lw = textWidth(lines[i], scale);
    let lx = x;
    if (align === 'center') lx = x + Math.max(0, Math.floor((maxW - lw) / 2));
    if (align === 'right') lx = x + Math.max(0, maxW - lw);
    drawTextGray(gray, lines[i].slice(0, 80), lx, cy, scale, value);
    cy += lineH;
  }
}

function decodePngRgba(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 2;
  const idats = [];
  while (offset + 8 <= buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    offset += 12 + len;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idats.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
  }
  if (!width || !height || bitDepth !== 8 || ![0, 2, 4, 6].includes(colorType)) return null;
  let inflated;
  try {
    inflated = zlib.inflateSync(Buffer.concat(idats));
  } catch (_) {
    return null;
  }
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : 4;
  const stride = width * channels;
  const rgba = Buffer.alloc(width * height * 4);
  let ip = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    if (ip >= inflated.length) return null;
    const filter = inflated[ip];
    ip += 1;
    if (ip + stride > inflated.length) return null;
    const row = inflated.subarray(ip, ip + stride);
    ip += stride;
    const recon = Buffer.alloc(stride);
    for (let i = 0; i < stride; i += 1) {
      const x = row[i];
      const a = i >= channels ? recon[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let val = x;
      if (filter === 1) val = (x + a) & 255;
      else if (filter === 2) val = (x + b) & 255;
      else if (filter === 3) val = (x + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        val = (x + pr) & 255;
      }
      recon[i] = val;
    }
    for (let x = 0; x < width; x += 1) {
      const si = x * channels;
      const di = (y * width + x) * 4;
      if (colorType === 0) {
        rgba[di] = rgba[di + 1] = rgba[di + 2] = recon[si];
        rgba[di + 3] = 255;
      } else if (colorType === 2) {
        rgba[di] = recon[si];
        rgba[di + 1] = recon[si + 1];
        rgba[di + 2] = recon[si + 2];
        rgba[di + 3] = 255;
      } else if (colorType === 4) {
        rgba[di] = rgba[di + 1] = rgba[di + 2] = recon[si];
        rgba[di + 3] = recon[si + 1];
      } else {
        rgba[di] = recon[si];
        rgba[di + 1] = recon[si + 1];
        rgba[di + 2] = recon[si + 2];
        rgba[di + 3] = recon[si + 3];
      }
    }
    prev = recon;
  }
  return { width, height, rgba };
}

function decodeImageToRgba(buf, mimeHint) {
  if (!buf || !buf.length) return null;
  const png = decodePngRgba(buf);
  if (png) return png;
  // JPEG/WebP not decoded natively — caller can show placeholder
  void mimeHint;
  return null;
}

function blitRgbaToGray(gray, rgbaImg, dx, dy, dw, dh, fit) {
  if (!rgbaImg || dw < 1 || dh < 1) return;
  const sw = rgbaImg.width;
  const sh = rgbaImg.height;
  let scale;
  if (fit === 'contain') scale = Math.min(dw / sw, dh / sh);
  else scale = Math.max(dw / sw, dh / sh);
  const rw = Math.max(1, Math.round(sw * scale));
  const rh = Math.max(1, Math.round(sh * scale));
  const ox = dx + Math.floor((dw - rw) / 2);
  const oy = dy + Math.floor((dh - rh) / 2);
  for (let y = 0; y < rh; y += 1) {
    const sy = Math.min(sh - 1, Math.floor((y / rh) * sh));
    for (let x = 0; x < rw; x += 1) {
      const sx = Math.min(sw - 1, Math.floor((x / rw) * sw));
      const tx = ox + x;
      const ty = oy + y;
      if (tx < dx || ty < dy || tx >= dx + dw || ty >= dy + dh) continue;
      if (tx < 0 || ty < 0 || tx >= gray.width || ty >= gray.height) continue;
      const i = (sy * sw + sx) * 4;
      const a = rgbaImg.rgba[i + 3] / 255;
      if (a < 0.08) continue;
      const lum = Math.round(0.299 * rgbaImg.rgba[i] + 0.587 * rgbaImg.rgba[i + 1] + 0.114 * rgbaImg.rgba[i + 2]);
      const prev = gray.data[ty * gray.width + tx];
      setGray(gray, tx, ty, Math.round(prev * (1 - a) + lum * a));
    }
  }
}

function grayToBmp1Bit(gray, inverted) {
  const bmp = createBitmap(gray.width, gray.height, false);
  const err = Float32Array.from(gray.data);
  for (let y = 0; y < gray.height; y += 1) {
    for (let x = 0; x < gray.width; x += 1) {
      const i = y * gray.width + x;
      const old = err[i];
      const neu = old < 128 ? 0 : 255;
      setPixel(bmp, x, y, neu < 128);
      const diff = old - neu;
      if (x + 1 < gray.width) err[i + 1] += (diff * 7) / 16;
      if (y + 1 < gray.height) {
        if (x > 0) err[i + gray.width - 1] += (diff * 3) / 16;
        err[i + gray.width] += (diff * 5) / 16;
        if (x + 1 < gray.width) err[i + gray.width + 1] += diff / 16;
      }
    }
  }
  return encodeBmp1Bit(bmp, inverted);
}

function tabletToEinkTransform(einkW, einkH, tablet) {
  const tw = Math.max(1, Number(tablet && tablet.width) || einkW);
  const th = Math.max(1, Number(tablet && tablet.height) || einkH);
  const scale = Math.min(einkW / tw, einkH / th);
  const drawW = Math.round(tw * scale);
  const drawH = Math.round(th * scale);
  return {
    scale,
    ox: Math.floor((einkW - drawW) / 2),
    oy: Math.floor((einkH - drawH) / 2),
    tabletW: tw,
    tabletH: th
  };
}

function mapEl(el, t) {
  return {
    x: Math.round(el.x * t.scale + t.ox),
    y: Math.round(el.y * t.scale + t.oy),
    w: Math.max(1, Math.round(el.w * t.scale)),
    h: Math.max(1, Math.round(el.h * t.scale))
  };
}

function fontScaleFor(px, t) {
  const target = Math.max(10, Number(px) || 22) * t.scale;
  return Math.max(1, Math.min(8, Math.round(target / 7)));
}

function contentVersion(customer) {
  const hours = effectiveHours(customer);
  const eink = normalizeEink(customer.eink);
  const tablet = tabletFromEink(eink);
  const design = normalizeDesign(customer.design, tablet, eink.colorMode);
  const payload = JSON.stringify({
    name: customer.name,
    hours,
    openNow: isOpenNow(hours),
    updatedAt: customer.updatedAt,
    lastSyncedAt: customer.lastSyncedAt,
    useManualHours: customer.useManualHours,
    design,
    eink
  });
  return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16);
}

function pruneEinkCache(dataDir, customerId, keepVersion) {
  const dir = einkCacheDir(dataDir);
  if (!fs.existsSync(dir)) return;
  const prefix = `${customerId}.`;
  fs.readdirSync(dir).forEach((name) => {
    if (!name.startsWith(prefix) || !name.endsWith('.bmp')) return;
    if (name === `${customerId}.${keepVersion}.bmp`) return;
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch (_) {
      /* ignore */
    }
  });
}

function loadImageRgba(dataDir, customer, mediaId) {
  if (!mediaId) return null;
  const file = resolveImageFile(dataDir, customer, mediaId);
  if (!file) return null;
  return decodeImageToRgba(file.buffer, file.type);
}

function renderDesignNative(customer, dataDir) {
  const eink = normalizeEink(customer.eink);
  const tablet = tabletFromEink(eink);
  const design = normalizeDesign(customer.design, tablet, eink.colorMode);
  const hours = effectiveHours(customer);
  const openNow = isOpenNow(hours);
  const bg = parseHexColor(design.backgroundColor, 12);
  const fg = parseHexColor(design.textColor, 245);
  const accent = parseHexColor(design.accentColor, 180);
  const gray = createGray(eink.width, eink.height, bg);
  const t = tabletToEinkTransform(eink.width, eink.height, tablet);

  // Letterbox outside tablet area stays background; draw tablet plane slightly lighter if needed
  fillGrayRect(gray, t.ox, t.oy, Math.round(t.tabletW * t.scale), Math.round(t.tabletH * t.scale), bg);

  const textInk = bg > 127 ? 0 : 255;
  const mutedInk = bg > 127 ? 40 : 210;
  const accentInk = accent < 140 ? 0 : 255;

  const logoFile = readLogoFile(dataDir, customer.id);
  const logoImg = logoFile ? decodeImageToRgba(logoFile.buffer, logoFile.type) : null;

  (design.layout || []).forEach((el) => {
    const box = mapEl(el, t);
    if (el.type === 'logo') {
      if (logoImg) blitRgbaToGray(gray, logoImg, box.x, box.y, box.w, box.h, 'contain');
      else {
        fillGrayRect(gray, box.x, box.y, box.w, box.h, mutedInk);
        drawTextCenteredGray(gray, 'LOGO', box.y + Math.floor(box.h / 2) - 7, Math.max(1, fontScaleFor(18, t)), textInk);
      }
    } else if (el.type === 'title') {
      const scale = fontScaleFor(resolveLayoutFontSize(el, design), t);
      drawWrappedTextGray(gray, customer.name || 'Hours', box.x, box.y + Math.max(0, Math.floor((box.h - 7 * scale) / 2)), box.w, box.h, scale, textInk, 'center');
    } else if (el.type === 'status') {
      if (design.statusMode === 'image') {
        const mediaId = openNow ? design.openMediaId : design.closedMediaId;
        const img = loadImageRgba(dataDir, customer, mediaId);
        if (img) blitRgbaToGray(gray, img, box.x, box.y, box.w, box.h, 'contain');
        else {
          const label = openNow ? 'OPEN' : 'CLOSED';
          const scale = fontScaleFor(resolveLayoutFontSize(el, design), t);
          drawTextCenteredGray(gray, label, box.y + Math.floor((box.h - 7 * scale) / 2), scale, textInk);
        }
      } else {
        const label = design.statusMode === 'text'
          ? (openNow ? 'Open Now' : 'Closed Now')
          : (openNow ? 'OPEN' : 'CLOSED');
        const scale = fontScaleFor(resolveLayoutFontSize(el, design), t);
        if (design.statusMode === 'badge') {
          fillGrayRect(gray, box.x + 8, box.y + 8, box.w - 16, box.h - 16, openNow ? accentInk : mutedInk);
          drawTextCenteredGray(gray, label, box.y + Math.floor((box.h - 7 * scale) / 2), scale, bg > 127 ? 255 : 0);
        } else {
          drawTextCenteredGray(gray, label, box.y + Math.floor((box.h - 7 * scale) / 2), scale, textInk);
        }
      }
    } else if (el.type === 'slideshow') {
      const firstId = (design.slideshowMediaIds || [])[0];
      const img = loadImageRgba(dataDir, customer, firstId);
      if (img) blitRgbaToGray(gray, img, box.x, box.y, box.w, box.h, 'cover');
      else fillGrayRect(gray, box.x, box.y, box.w, Math.max(2, Math.floor(box.h * 0.02)), mutedInk);
    } else if (el.type === 'hours') {
      const scale = fontScaleFor(resolveLayoutFontSize(el, design), t);
      const rowH = Math.max(7 * scale + 4, Math.floor(box.h / Math.max(1, DAYS.length)));
      DAYS.forEach((day, idx) => {
        const y = box.y + idx * rowH;
        if (y + 7 * scale > box.y + box.h) return;
        const label = (DAY_LABELS[day] || day).slice(0, 3).toUpperCase();
        const value = formatDayHours(hours[day]);
        drawTextGray(gray, label, box.x + 4, y, scale, textInk);
        const vw = textWidth(value, scale);
        drawTextGray(gray, value, Math.max(box.x + 4, box.x + box.w - 4 - vw), y, scale, textInk);
      });
    } else if (el.type === 'text') {
      const scale = fontScaleFor(resolveLayoutFontSize(el, design), t);
      const color = el.color ? (parseHexColor(el.color, textInk) < 128 ? 0 : 255) : textInk;
      // If custom color luminance is close to bg, force contrast
      const useInk = Math.abs(color - bg) < 40 ? textInk : color;
      drawWrappedTextGray(gray, el.text || '', box.x, box.y, box.w, box.h, scale, useInk, el.align || 'center');
    } else if (el.type === 'image') {
      const img = loadImageRgba(dataDir, customer, el.mediaId);
      if (img) blitRgbaToGray(gray, img, box.x, box.y, box.w, box.h, el.fit === 'contain' ? 'contain' : 'cover');
      else {
        fillGrayRect(gray, box.x, box.y, box.w, box.h, mutedInk);
        drawTextCenteredGray(gray, 'IMG', box.y + Math.floor(box.h / 2) - 7, Math.max(1, fontScaleFor(16, t)), textInk);
      }
    } else if (el.type === 'sketch' && el.dataUrl && String(el.dataUrl).startsWith('data:image/')) {
      const m = String(el.dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (m) {
        try {
          const buf = Buffer.from(m[2], 'base64');
          const img = decodeImageToRgba(buf, m[1]);
          if (img) blitRgbaToGray(gray, img, box.x, box.y, box.w, box.h, 'contain');
        } catch (_) {
          /* ignore bad sketch */
        }
      }
    }
  });

  void fg;
  const buffer = grayToBmp1Bit(gray, eink.inverted);
  return { buffer, width: eink.width, height: eink.height };
}

function renderLegacyHoursBmp(customer) {
  const eink = normalizeEink(customer.eink);
  const hours = effectiveHours(customer);
  const openNow = isOpenNow(hours);
  const bmp = createBitmap(eink.width, eink.height, false);

  const pad = Math.max(12, Math.floor(eink.width * 0.04));
  let y = pad;

  const titleScale = Math.max(2, Math.min(5, Math.floor(eink.width / 160)));
  drawTextCentered(bmp, String(customer.name || 'Hours').slice(0, 28), y, titleScale, true);
  y += 7 * titleScale + pad;

  hLine(bmp, pad, y, eink.width - pad * 2, true);
  y += Math.floor(pad * 0.7);

  const statusScale = Math.max(2, titleScale - 1);
  drawTextCentered(bmp, openNow ? 'OPEN NOW' : 'CLOSED NOW', y, statusScale, true);
  y += 7 * statusScale + pad;

  hLine(bmp, pad, y, eink.width - pad * 2, true);
  y += pad;

  const rowScale = Math.max(2, Math.min(4, Math.floor(eink.width / 220)));
  const rowH = 7 * rowScale + Math.floor(pad * 0.55);
  DAYS.forEach((day) => {
    const label = (DAY_LABELS[day] || day).slice(0, 3).toUpperCase();
    const value = formatDayHours(hours[day]);
    drawText(bmp, label, pad, y, rowScale, true);
    const vw = textWidth(value, rowScale);
    drawText(bmp, value, Math.max(pad, eink.width - pad - vw), y, rowScale, true);
    y += rowH;
  });

  y = eink.height - pad - 7 * 2;
  drawTextCentered(bmp, 'SmartHours', y, 2, true);

  return encodeBmp1Bit(bmp, eink.inverted);
}

function renderEinkBmp(customer, options = {}) {
  const dataDir = options.dataDir || resolveDataDir();
  ensureDirs(dataDir);
  const eink = normalizeEink(customer.eink);
  const version = contentVersion(customer);
  const cachePath = path.join(einkCacheDir(dataDir), `${customer.id}.${version}.bmp`);

  if (fs.existsSync(cachePath)) {
    return {
      buffer: fs.readFileSync(cachePath),
      version,
      width: eink.width,
      height: eink.height,
      contentType: 'image/bmp',
      cached: true
    };
  }

  let buffer;
  try {
    const tablet = tabletFromEink(eink);
    const design = normalizeDesign(customer.design, tablet, eink.colorMode);
    if (design.layout && design.layout.length) {
      buffer = renderDesignNative(customer, dataDir).buffer;
    } else {
      buffer = renderLegacyHoursBmp(customer);
    }
  } catch (err) {
    console.warn('[SmartHours] design BMP render failed, using legacy:', err.message);
    buffer = renderLegacyHoursBmp(customer);
  }

  try {
    fs.writeFileSync(cachePath, buffer);
    pruneEinkCache(dataDir, customer.id, version);
  } catch (err) {
    console.warn('[SmartHours] eink cache write failed:', err.message);
  }

  return {
    buffer,
    version,
    width: eink.width,
    height: eink.height,
    contentType: 'image/bmp',
    cached: false
  };
}

function einkMeta(customer, baseUrl) {
  const eink = normalizeEink(customer.eink);
  const version = contentVersion(customer);
  const root = String(baseUrl || '').replace(/\/$/, '');
  return {
    slug: customer.slug,
    name: customer.name,
    version,
    updatedAt: customer.updatedAt,
    pollIntervalMinutes: eink.pollIntervalMinutes,
    width: eink.width,
    height: eink.height,
    inverted: eink.inverted,
    imageUrl: `${root}/api/smarthours/public/${encodeURIComponent(customer.slug)}/eink.bmp?v=${version}`,
    metaUrl: `${root}/api/smarthours/public/${encodeURIComponent(customer.slug)}/eink.json`,
    displayUrl: `${root}/SmartHours/v/${encodeURIComponent(customer.slug)}`
  };
}

function bmpToProgmemArray(buffer, symbolName = 'DESIGN_BMP') {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  const lines = [`const uint8_t ${symbolName}[] PROGMEM = {`];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = [];
    for (let j = i; j < Math.min(i + 16, bytes.length); j += 1) {
      chunk.push(`0x${bytes[j].toString(16).padStart(2, '0')}`);
    }
    const comma = i + 16 < bytes.length ? ',' : '';
    lines.push(`  ${chunk.join(', ')}${comma}`);
  }
  lines.push('};');
  lines.push(`const size_t ${symbolName}_LEN = ${bytes.length};`);
  return lines.join('\n');
}

function escapeCppString(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function buildEsp32Sketch(customer, options = {}) {
  const eink = normalizeEink(customer.eink);
  const wifiSsid = escapeCppString(options.wifiSsid || 'YOUR_WIFI_SSID');
  const wifiPass = escapeCppString(options.wifiPass || 'YOUR_WIFI_PASSWORD');
  const baseUrl = String(options.baseUrl || 'https://your-lab007-host').replace(/\/$/, '');
  const slug = customer.slug;
  const poll = Number(options.pollIntervalMinutes || eink.pollIntervalMinutes || 720);
  const width = eink.width;
  const height = eink.height;
  const version = String(options.version || contentVersion(customer));
  const dataDir = options.dataDir || resolveDataDir();

  let bmpBuffer = options.bmpBuffer;
  if (!bmpBuffer || !bmpBuffer.length) {
    try {
      bmpBuffer = renderEinkBmp(customer, { dataDir }).buffer;
    } catch (_) {
      bmpBuffer = Buffer.alloc(0);
    }
  }
  const hasBmp = Buffer.isBuffer(bmpBuffer) && bmpBuffer.length > 62;
  const progmemBlock = hasBmp
    ? bmpToProgmemArray(bmpBuffer, 'DESIGN_BMP')
    : 'const uint8_t DESIGN_BMP[] PROGMEM = { 0x00 };\nconst size_t DESIGN_BMP_LEN = 0;';

  return `/*
 * SmartHours ESP32 + E-ink
 * Customer: ${escapeCppString(customer.name)}
 * Slug: ${slug}
 * Design version: ${version}
 * Canvas size baked in: ${width}x${height}
 *
 * This sketch ports your SmartHours Design canvas to the ESP32:
 *  - DESIGN_BMP[] is a 1-bit Windows BMP of the saved design (same as admin preview)
 *  - On boot it draws that embedded design immediately
 *  - Then it polls the server; when the design/hours version changes, it downloads
 *    a fresh BMP and redraws (no reflash needed after you Save Design)
 *
 * Setup
 * 1) Arduino IDE → ESP32 board support
 * 2) Libraries: WiFi, HTTPClient, ArduinoJson, WebServer, DNSServer, GxEPD2, Adafruit GFX
 * 3) Uncomment ONE panel line in initDisplay() for your Waveshare (or similar)
 * 4) Set BASE_URL, flash. Leave WIFI / customer code empty to use the setup screen.
 *
 * First boot / after reset: the board broadcasts WiFi "MySmartLife".
 * Join it, open the setup page, then: SCAN for WiFi → pick a network → password → unique customer code.
 *
 * Default poll: ${poll} minutes (server meta and check-in can override without reflash).
 * Any button: short press = live check-in; hold 3 seconds = reset to setup (MySmartLife).
 * USB Serial Monitor (115200, newline): after boot type help for test commands (battery, wifi, checkin).
 * Battery ADC is reported on check-in. Offline WiFi keeps the last image and poll.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <SPI.h>
#include <string.h>
#include <pgmspace.h>
#include <esp_sleep.h>
#include <esp_system.h>
#include <driver/rtc_io.h>

// ---- optional e-ink driver (uncomment matching panel in initDisplay) ----
// #include <GxEPD2_BW.h>
// #include <Fonts/FreeMonoBold9pt7b.h>

// ---- config ----
const char* WIFI_SSID = "${wifiSsid}";
const char* WIFI_PASS = "${wifiPass}";
const char* BASE_URL  = "${escapeCppString(baseUrl)}";
const char* SLUG      = "${escapeCppString(slug)}";
const char* EMBEDDED_VERSION = "${version}";
const char* FW_VERSION = "1.6.1";
const char* SETUP_AP_NAME = "MySmartLife";
uint32_t pollMinutesFallback = ${poll};
const uint16_t EINK_W = ${width};
const uint16_t EINK_H = ${height};
const bool EINK_INVERTED = ${eink.inverted ? 'true' : 'false'};

// Buttons (LOW = pressed). Short press = live check-in. Hold BTN_LONG_MS = setup reset.
// Default: BOOT + Waveshare ESP32 e-Paper Driver KEY1/KEY2/KEY3.
// Override: #define BTN_PIN_LIST 0, 12, 13, 14
#ifndef BTN_PIN_LIST
#define BTN_PIN_LIST 0, 39, 34, 35
#endif
#ifndef BTN_LONG_MS
#define BTN_LONG_MS 3000
#endif
const uint8_t BTN_PINS[] = { BTN_PIN_LIST };
const size_t BTN_COUNT = sizeof(BTN_PINS) / sizeof(BTN_PINS[0]);
enum { BTN_NONE = 0, BTN_SHORT = 1, BTN_LONG = 2 };
// Battery ADC (voltage divider). Calibrate BAT_ADC_EMPTY / BAT_ADC_FULL for your board.
// GPIO34 is KEY2 on the Waveshare driver — move this to GPIO36 if KEY2 is wired.
#ifndef BAT_ADC_PIN
#define BAT_ADC_PIN 34
#endif
#ifndef BAT_ADC_EMPTY
#define BAT_ADC_EMPTY 1700
#endif
#ifndef BAT_ADC_FULL
#define BAT_ADC_FULL 2450
#endif

// SPI pins — change to match your wiring
#ifndef EPD_CS
#define EPD_CS   5
#define EPD_DC   17
#define EPD_RST  16
#define EPD_BUSY 4
#endif

Preferences prefs;
String cfgSsid;
String cfgPass;
String cfgSlug;
WebServer setupServer(80);
DNSServer setupDns;

// Embedded snapshot of the Design canvas (1-bit BMP)
${progmemBlock}

const char SETUP_PAGE[] PROGMEM = R"SHPAGE(
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SmartHours Setup</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;background:#0f172a;color:#e2e8f0;padding:24px;max-width:420px}
h1{font-size:1.3rem;margin:0 0 6px}
.sub{color:#94a3b8;margin:0 0 20px;line-height:1.4}
button{width:100%;padding:16px;font-size:1.05rem;border:0;border-radius:12px;background:#38bdf8;color:#0f172a;font-weight:700}
button.ghost{background:#1e293b;color:#e2e8f0;margin-top:10px;font-weight:600;text-align:left}
button.ghost.picked{outline:2px solid #38bdf8}
button.save{margin-top:18px}
label{display:block;margin:16px 0 6px;font-size:.85rem;color:#94a3b8}
input{width:100%;box-sizing:border-box;padding:14px;border-radius:10px;border:1px solid #334155;background:#1e293b;color:#fff;font-size:1rem}
.hidden{display:none}
#status{min-height:1.4em;margin:12px 0;color:#94a3b8}
#nets{margin-top:8px}
</style>
</head>
<body>
<h1>SmartHours setup</h1>
<p class="sub">Join the MySmartLife network, then scan and pick your WiFi.</p>
<button type="button" id="scanBtn">SCAN for WiFi</button>
<p id="status"></p>
<form id="cfg" class="hidden" method="POST" action="/save">
  <div id="listWrap" class="hidden">
    <label>WiFi network</label>
    <input type="hidden" id="ssid" name="ssid">
    <div id="nets"></div>
  </div>
  <div id="afterNet" class="hidden">
    <label for="pass">WiFi password</label>
    <input id="pass" name="pass" type="password" autocomplete="off">
    <label for="slug">Unique customer code</label>
    <input id="slug" name="slug" autocomplete="off" placeholder="your-shop-code">
    <button type="submit" class="save">Save and connect</button>
  </div>
</form>
<script>
var scanBtn = document.getElementById('scanBtn');
var statusEl = document.getElementById('status');
var cfg = document.getElementById('cfg');
var listWrap = document.getElementById('listWrap');
var afterNet = document.getElementById('afterNet');
var nets = document.getElementById('nets');
var ssidEl = document.getElementById('ssid');
var passEl = document.getElementById('pass');
function doScan() {
  scanBtn.disabled = true;
  statusEl.textContent = 'Scanning for WiFi...';
  afterNet.classList.add('hidden');
  ssidEl.value = '';
  fetch('/scan').then(function(r) { return r.json(); }).then(function(list) {
    nets.innerHTML = '';
    if (!list || !list.length) {
      statusEl.textContent = 'No networks found. Try SCAN again.';
      scanBtn.disabled = false;
      return;
    }
    for (var i = 0; i < list.length; i++) {
      (function(name) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'ghost';
        b.textContent = name;
        b.addEventListener('click', function() {
          var kids = nets.querySelectorAll('button');
          for (var k = 0; k < kids.length; k++) kids[k].classList.remove('picked');
          b.classList.add('picked');
          ssidEl.value = name;
          afterNet.classList.remove('hidden');
          statusEl.textContent = 'Enter the WiFi password, then your unique customer code.';
          setTimeout(function() { passEl.focus(); }, 30);
        });
        nets.appendChild(b);
      })(list[i]);
    }
    cfg.classList.remove('hidden');
    listWrap.classList.remove('hidden');
    scanBtn.textContent = 'SCAN again';
    statusEl.textContent = 'Select your WiFi network.';
    scanBtn.disabled = false;
  }).catch(function() {
    statusEl.textContent = 'Scan failed. Try again.';
    scanBtn.disabled = false;
  });
}
scanBtn.addEventListener('click', doScan);
fetch('/cfg').then(function(r) { return r.json(); }).then(function(c) {
  if (c && c.slug) document.getElementById('slug').value = c.slug;
}).catch(function() {});
</script>
</body>
</html>
)SHPAGE";

bool isPlaceholder(const String& value, const char* placeholder) {
  return !value.length() || value == placeholder;
}

void loadCfg() {
  cfgSsid = prefs.getString("ssid", "");
  cfgPass = prefs.getString("pass", "");
  cfgSlug = prefs.getString("slug", "");
  if (prefs.getBool("setup", false)) {
    cfgSsid = "";
    cfgPass = "";
    cfgSlug = "";
    return;
  }
  if (isPlaceholder(cfgSsid, "YOUR_WIFI_SSID") && !isPlaceholder(String(WIFI_SSID), "YOUR_WIFI_SSID")) {
    cfgSsid = WIFI_SSID;
    cfgPass = WIFI_PASS;
  }
  if (isPlaceholder(cfgSlug, "") && !isPlaceholder(String(SLUG), "")) {
    cfgSlug = SLUG;
  }
}

bool isConfigured() {
  return cfgSsid.length() > 0 && cfgSlug.length() > 0;
}

void clearSavedWifi() {
  prefs.putBool("setup", true);
  prefs.putString("ssid", "");
  prefs.putString("pass", "");
  prefs.putString("slug", "");
  prefs.putString("ver", "");
  cfgSsid = "";
  cfgPass = "";
  cfgSlug = "";
}

bool anyButtonDown() {
  for (size_t i = 0; i < BTN_COUNT; i++) {
    if (digitalRead(BTN_PINS[i]) == LOW) return true;
  }
  return false;
}

void initButtons() {
  for (size_t i = 0; i < BTN_COUNT; i++) {
    uint8_t p = BTN_PINS[i];
    if (p >= 34 && p <= 39) pinMode(p, INPUT);
    else pinMode(p, INPUT_PULLUP);
  }
}

void waitButtonsReleased() {
  uint32_t t0 = millis();
  while (anyButtonDown() && (millis() - t0) < 10000UL) delay(20);
}

int classifyButtonPress() {
  if (!anyButtonDown()) {
    if (esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_EXT1) return BTN_SHORT;
    return BTN_NONE;
  }
  uint32_t t0 = millis();
  while (anyButtonDown()) {
    if (millis() - t0 >= (uint32_t)BTN_LONG_MS) return BTN_LONG;
    delay(10);
  }
  return BTN_SHORT;
}

void armButtonWake() {
  uint64_t mask = 0;
  for (size_t i = 0; i < BTN_COUNT; i++) {
    uint8_t p = BTN_PINS[i];
    if (digitalRead(p) == LOW) continue;
    mask |= (1ULL << p);
    if (p < 34 && rtc_gpio_is_valid_gpio((gpio_num_t)p)) {
      rtc_gpio_pullup_en((gpio_num_t)p);
      rtc_gpio_pulldown_dis((gpio_num_t)p);
    }
  }
  if (mask) esp_sleep_enable_ext1_wakeup(mask, ESP_EXT1_WAKEUP_ANY_LOW);
}

void handleSetupRoot() {
  setupServer.send_P(200, "text/html", SETUP_PAGE);
}

void handleSetupCfg() {
  StaticJsonDocument<256> doc;
  doc["slug"] = cfgSlug;
  String json;
  serializeJson(doc, json);
  setupServer.send(200, "application/json", json);
}

void handleSetupScan() {
  Serial.println("Scanning WiFi...");
  int n = WiFi.scanNetworks(false, false);
  DynamicJsonDocument doc(4096);
  JsonArray arr = doc.to<JsonArray>();
  for (int i = 0; i < n; i++) {
    String ssid = WiFi.SSID(i);
    if (!ssid.length()) continue;
    bool dup = false;
    for (int j = 0; j < i; j++) {
      if (WiFi.SSID(j) == ssid) { dup = true; break; }
    }
    if (dup) continue;
    arr.add(ssid);
  }
  WiFi.scanDelete();
  String json;
  serializeJson(doc, json);
  setupServer.send(200, "application/json", json);
}

void handleSetupSave() {
  String ssid = setupServer.arg("ssid");
  String pass = setupServer.arg("pass");
  String slug = setupServer.arg("slug");
  ssid.trim();
  pass.trim();
  slug.trim();
  if (!ssid.length() || !slug.length()) {
    setupServer.send(400, "text/plain", "WiFi network and unique customer code are required.");
    return;
  }
  prefs.putBool("setup", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.putString("slug", slug);
  prefs.putString("ver", "");
  setupServer.send(200, "text/html",
    "<html><body style='font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:24px'>"
    "<p>Saved. Connecting to WiFi...</p></body></html>");
  delay(600);
  ESP.restart();
}

void runSetupPortal() {
  Serial.printf("Setup mode — connect to WiFi \\"%s\\"\\n", SETUP_AP_NAME);
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(SETUP_AP_NAME);
  delay(150);
  IPAddress apIp = WiFi.softAPIP();
  setupDns.start(53, "*", apIp);
  setupServer.on("/", handleSetupRoot);
  setupServer.on("/scan", HTTP_GET, handleSetupScan);
  setupServer.on("/cfg", HTTP_GET, handleSetupCfg);
  setupServer.on("/save", HTTP_POST, handleSetupSave);
  setupServer.on("/generate_204", handleSetupRoot);
  setupServer.on("/gen_204", handleSetupRoot);
  setupServer.on("/hotspot-detect.html", handleSetupRoot);
  setupServer.on("/ncsi.txt", handleSetupRoot);
  setupServer.on("/connecttest.txt", handleSetupRoot);
  setupServer.onNotFound(handleSetupRoot);
  setupServer.begin();
  Serial.printf("Setup page: http://%s/\\n", apIp.toString().c_str());
  while (true) {
    setupDns.processNextRequest();
    setupServer.handleClient();
    delay(2);
  }
}

String metaUrl() {
  return String(BASE_URL) + "/api/smarthours/public/" + cfgSlug + "/eink.json";
}
String imageUrl(const String& version) {
  return String(BASE_URL) + "/api/smarthours/public/" + cfgSlug + "/eink.bmp?v=" + version;
}
String checkinUrl() {
  return String(BASE_URL) + "/api/smarthours/devices/checkin";
}

String deviceIdHex() {
  uint64_t mac = ESP.getEfuseMac();
  char buf[17];
  snprintf(buf, sizeof(buf), "%04X%08X", (uint16_t)(mac >> 32), (uint32_t)mac);
  return String(buf);
}

uint8_t readBatteryPercent(int& mvOut) {
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
  int raw = analogRead(BAT_ADC_PIN);
  // Rough millivolts assuming 2:1 divider into 3.3V ADC (3.3V * 2 * raw/4095)
  mvOut = (int)((raw * 3300L * 2L) / 4095L);
  int span = BAT_ADC_FULL - BAT_ADC_EMPTY;
  if (span < 1) span = 1;
  int pct = ((raw - BAT_ADC_EMPTY) * 100) / span;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return (uint8_t)pct;
}

bool connectWifi() {
  if (cfgSsid.length() == 0) return false;
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.mode(WIFI_STA);
  WiFi.begin(cfgSsid.c_str(), cfgPass.c_str());
  for (int i = 0; i < 240 && WiFi.status() != WL_CONNECTED; i++) delay(250);
  return WiFi.status() == WL_CONNECTED;
}

// ---- BMP helpers (Windows 1-bit, bottom-up) ----
struct BmpInfo {
  uint32_t dataOffset;
  int32_t width;
  int32_t height;
  uint16_t bitsPerPixel;
  bool ok;
};

BmpInfo parseBmpHeader(const uint8_t* data, size_t len) {
  BmpInfo info = {0, 0, 0, 0, false};
  if (!data || len < 54) return info;
  if (data[0] != 'B' || data[1] != 'M') return info;
  info.dataOffset = (uint32_t)data[10] | ((uint32_t)data[11] << 8) | ((uint32_t)data[12] << 16) | ((uint32_t)data[13] << 24);
  info.width = (int32_t)((uint32_t)data[18] | ((uint32_t)data[19] << 8) | ((uint32_t)data[20] << 16) | ((uint32_t)data[21] << 24));
  info.height = (int32_t)((uint32_t)data[22] | ((uint32_t)data[23] << 8) | ((uint32_t)data[24] << 16) | ((uint32_t)data[25] << 24));
  info.bitsPerPixel = (uint16_t)data[28] | ((uint16_t)data[29] << 8);
  info.ok = (info.bitsPerPixel == 1 && info.width > 0 && info.height != 0 && info.dataOffset < len);
  return info;
}

// Packed 1-bit framebuffer, MSB first, row stride = ceil(width/8)
bool bmpToPacked1Bit(const uint8_t* bmp, size_t len, uint8_t* out, uint16_t outW, uint16_t outH) {
  BmpInfo info = parseBmpHeader(bmp, len);
  if (!info.ok || !out) return false;
  const bool bottomUp = info.height > 0;
  const int32_t absH = bottomUp ? info.height : -info.height;
  const uint32_t rowSize = ((uint32_t)((info.width + 31) / 32)) * 4; // BMP rows padded to 4 bytes
  const uint16_t outStride = (outW + 7) / 8;
  memset(out, 0xFF, (size_t)outStride * outH); // white

  for (uint16_t y = 0; y < outH; y++) {
    int32_t srcY = (int32_t)(((uint32_t)y * (uint32_t)absH) / outH);
    if (srcY >= absH) srcY = absH - 1;
    const uint32_t fileRow = bottomUp ? (uint32_t)(absH - 1 - srcY) : (uint32_t)srcY;
    const uint8_t* srcRow = bmp + info.dataOffset + fileRow * rowSize;
    for (uint16_t x = 0; x < outW; x++) {
      int32_t srcX = (int32_t)(((uint32_t)x * (uint32_t)info.width) / outW);
      if (srcX >= info.width) srcX = info.width - 1;
      uint8_t byte = srcRow[srcX >> 3];
      bool black = ((byte >> (7 - (srcX & 7))) & 1) == 0; // SmartHours BMP: index0=black
      if (EINK_INVERTED) black = !black;
      if (black) {
        out[y * outStride + (x >> 3)] &= ~(0x80 >> (x & 7));
      } else {
        out[y * outStride + (x >> 3)] |= (0x80 >> (x & 7));
      }
    }
  }
  return true;
}

// Replace this with your panel instance. Example for Waveshare 7.5" V2 (800x480):
// GxEPD2_BW<GxEPD2_750_T7, GxEPD2_750_T7::HEIGHT> display(GxEPD2_750_T7(EPD_CS, EPD_DC, EPD_RST, EPD_BUSY));
void* gDisplay = nullptr; // placeholder when GxEPD2 is not linked

bool initDisplay() {
  /*
   * Uncomment ONE of these after installing GxEPD2, and set gDisplay accordingly.
   *
   * // 7.5" 800x480
   * static GxEPD2_BW<GxEPD2_750_T7, GxEPD2_750_T7::HEIGHT> display(GxEPD2_750_T7(EPD_CS, EPD_DC, EPD_RST, EPD_BUSY));
   * display.init(115200);
   * // Keep rotation 0 when EINK_W/H already match your panel. Change only if the mount is sideways.
   * display.setRotation(0);
   * gDisplay = &display;
   *
   * If your panel size differs from EINK_W x EINK_H, the BMP is scaled in bmpToPacked1Bit().
   * Prefer matching SmartHours e-ink width/height to your panel for sharpest results.
   */
  Serial.printf("Display target %ux%u (set GxEPD2 panel in initDisplay)\\n", EINK_W, EINK_H);
  return true;
}

void drawPackedToPanel(const uint8_t* packed, uint16_t w, uint16_t h) {
  // With GxEPD2, typical full refresh:
  // auto* d = (GxEPD2_BW<GxEPD2_750_T7, GxEPD2_750_T7::HEIGHT>*)gDisplay;
  // d->setFullWindow();
  // d->firstPage();
  // do {
  //   d->fillScreen(GxEPD_WHITE);
  //   d->drawBitmap(0, 0, packed, w, h, GxEPD_BLACK);
  // } while (d->nextPage());
  Serial.printf("Ready to paint packed 1-bit bitmap %ux%u (%u bytes)\\n",
    w, h, (unsigned)(((w + 7) / 8) * h));
  (void)packed;
}

bool drawBmpBuffer(const uint8_t* data, size_t len, const char* sourceTag) {
  if (!data || len < 62) {
    Serial.println("No BMP data");
    return false;
  }
  BmpInfo info = parseBmpHeader(data, len);
  if (!info.ok) {
    Serial.println("Unsupported BMP (need 1-bit Windows BMP from SmartHours)");
    return false;
  }
  const uint16_t stride = (EINK_W + 7) / 8;
  const size_t need = (size_t)stride * EINK_H;
  uint8_t* packed = (uint8_t*)malloc(need);
  if (!packed) {
    Serial.println("Out of memory for framebuffer");
    return false;
  }
  bool ok = bmpToPacked1Bit(data, len, packed, EINK_W, EINK_H);
  if (ok) {
    Serial.printf("Drawing design from %s (%dx%d BMP -> %ux%u panel)\\n",
      sourceTag, (int)info.width, (int)(info.height < 0 ? -info.height : info.height), EINK_W, EINK_H);
    drawPackedToPanel(packed, EINK_W, EINK_H);
  }
  free(packed);
  return ok;
}

bool drawEmbeddedDesign() {
  if (DESIGN_BMP_LEN < 62) {
    Serial.println("No embedded design BMP — save Design in SmartHours and re-download code");
    return false;
  }
  // PROGMEM copy into RAM for parsing
  uint8_t* ram = (uint8_t*)malloc(DESIGN_BMP_LEN);
  if (!ram) return false;
  memcpy_P(ram, DESIGN_BMP, DESIGN_BMP_LEN);
  bool ok = drawBmpBuffer(ram, DESIGN_BMP_LEN, "embedded canvas");
  free(ram);
  return ok;
}

bool fetchMeta(String& versionOut, uint32_t& pollOut, String& imageOut) {
  HTTPClient http;
  http.setTimeout(20000);
  if (!http.begin(metaUrl())) return false;
  int code = http.GET();
  if (code != 200) { http.end(); return false; }
  String body = http.getString();
  http.end();

  StaticJsonDocument<1024> doc;
  if (deserializeJson(doc, body)) return false;
  versionOut = String((const char*)doc["version"] | "");
  pollOut = doc["pollIntervalMinutes"] | pollMinutesFallback;
  imageOut = String((const char*)doc["imageUrl"] | "");
  if (imageOut.length() == 0 && versionOut.length()) imageOut = imageUrl(versionOut);
  return versionOut.length() > 0;
}

bool postCheckin(uint32_t pollMinutes, uint8_t batteryPct, int batteryMv) {
  HTTPClient http;
  http.setTimeout(15000);
  if (!http.begin(checkinUrl())) return false;
  http.addHeader("Content-Type", "application/json");
  StaticJsonDocument<512> doc;
  doc["deviceId"] = deviceIdHex();
  doc["customerSlug"] = cfgSlug;
  doc["wifiSsid"] = cfgSsid;
  doc["wifiRssi"] = WiFi.RSSI();
  doc["fwVersion"] = FW_VERSION;
  doc["ip"] = WiFi.localIP().toString();
  doc["localIp"] = WiFi.localIP().toString();
  doc["batteryPercent"] = batteryPct;
  doc["batteryMv"] = batteryMv;
  doc["reportedPollMinutes"] = pollMinutes;
  String payload;
  serializeJson(doc, payload);
  int code = http.POST(payload);
  bool wantSetup = false;
  if (code == 200) {
    String resp = http.getString();
    StaticJsonDocument<512> out;
    if (!deserializeJson(out, resp)) {
      uint32_t serverPoll = out["pollIntervalMinutes"] | 0;
      if (serverPoll >= 1) {
        pollMinutesFallback = serverPoll;
        prefs.putUInt("poll", serverPoll);
        Serial.printf("Server poll interval: %u min\\n", (unsigned)serverPoll);
      }
      if (out["reset"] | false) wantSetup = true;
      const char* cmd = out["command"] | "";
      if (cmd && strcmp(cmd, "setup") == 0) wantSetup = true;
    }
  } else {
    Serial.printf("Check-in HTTP %d\\n", code);
  }
  http.end();
  return wantSetup;
}

bool fetchAndDrawImage(const String& url) {
  HTTPClient http;
  http.setTimeout(45000);
  if (!http.begin(url)) return false;
  int code = http.GET();
  if (code != 200) { http.end(); return false; }
  int len = http.getSize();
  WiFiClient* stream = http.getStreamPtr();
  // 600x1024 1-bit BMP ~78KB; allow up to 250KB
  if (len <= 0 || len > 250000) { http.end(); return false; }
  uint8_t* buf = (uint8_t*)malloc(len);
  if (!buf) { http.end(); return false; }
  int rd = stream->readBytes(buf, len);
  http.end();
  bool ok = false;
  if (rd == len) ok = drawBmpBuffer(buf, len, "server canvas");
  free(buf);
  return ok;
}

void deepSleepMinutes(uint32_t minutes) {
  if (minutes < 1) minutes = 1;
  uint64_t us = (uint64_t)minutes * 60ULL * 1000000ULL;
  Serial.printf("Sleeping %u minutes (short press = check-in, hold 3s = setup)...\\n", (unsigned)minutes);
  initButtons();
  waitButtonsReleased();
  delay(20);
  armButtonWake();
  esp_sleep_enable_timer_wakeup(us);
  esp_deep_sleep_start();
}

void printSerialHelp() {
  Serial.println(F("Commands (type then Enter):"));
  Serial.println(F("  help     this list"));
  Serial.println(F("  status   wifi, battery, config"));
  Serial.println(F("  battery  ADC reading (USB is still powering the board)"));
  Serial.println(F("  wifi     connect and print IP"));
  Serial.println(F("  checkin  ping SmartHours"));
  Serial.println(F("  paint    redraw embedded design"));
  Serial.println(F("  setup    forget WiFi, open MySmartLife"));
  Serial.println(F("  sleep    deep sleep until poll/button"));
  Serial.println(F("  reboot   restart"));
}

void printSerialStatus() {
  int mv = 0;
  uint8_t pct = readBatteryPercent(mv);
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
  int raw = analogRead(BAT_ADC_PIN);
  Serial.printf("id %s  fw %s\\n", deviceIdHex().c_str(), FW_VERSION);
  Serial.printf("slug %s  ssid %s  configured %s\\n",
    cfgSlug.c_str(), cfgSsid.c_str(), isConfigured() ? "yes" : "no");
  Serial.printf("wifi %s  ip %s  rssi %d\\n",
    WiFi.status() == WL_CONNECTED ? "up" : "down",
    WiFi.localIP().toString().c_str(),
    WiFi.RSSI());
  Serial.printf("battery raw %d  ~%d mV  %u%%  (GPIO %d)\\n",
    raw, mv, (unsigned)pct, BAT_ADC_PIN);
  Serial.printf("poll %u min  wake %d\\n",
    (unsigned)pollMinutesFallback, (int)esp_sleep_get_wakeup_cause());
  Serial.println(F("USB is plugged in, so this is not a battery-only power test."));
}

bool handleSerialLine(String line) {
  line.trim();
  line.toLowerCase();
  if (!line.length()) return true;
  if (line == "help" || line == "?") {
    printSerialHelp();
    return true;
  }
  if (line == "status") {
    printSerialStatus();
    return true;
  }
  if (line == "battery") {
    int mv = 0;
    uint8_t pct = readBatteryPercent(mv);
    analogReadResolution(12);
    analogSetAttenuation(ADC_11db);
    int raw = analogRead(BAT_ADC_PIN);
    Serial.printf("battery raw %d  ~%d mV  %u%%  GPIO %d\\n", raw, mv, (unsigned)pct, BAT_ADC_PIN);
    if (raw < 200) Serial.println(F("ADC is ~0 — battery sense not wired, or still on USB-only power."));
    else if (mv < 3300) Serial.println(F("Voltage looks low or missing. Confirm the pack is plugged in and charged."));
    else Serial.println(F("Sense looks alive. Unplug USB (keep battery) to prove the unit runs without the PC."));
    return true;
  }
  if (line == "wifi") {
    Serial.println(F("Connecting WiFi..."));
    if (connectWifi()) {
      Serial.printf("wifi up  ip %s  rssi %d  ssid %s\\n",
        WiFi.localIP().toString().c_str(), WiFi.RSSI(), cfgSsid.c_str());
    } else {
      Serial.println(F("wifi failed"));
    }
    return true;
  }
  if (line == "checkin") {
    if (!connectWifi()) {
      Serial.println(F("wifi failed — cannot check in"));
      return true;
    }
    int mv = 0;
    uint8_t pct = readBatteryPercent(mv);
    String version;
    uint32_t pollMinutes = pollMinutesFallback;
    String img;
    if (fetchMeta(version, pollMinutes, img)) {
      Serial.printf("meta ok  version %s  poll %u\\n", version.c_str(), (unsigned)pollMinutes);
      prefs.putUInt("poll", pollMinutes);
      pollMinutesFallback = pollMinutes;
    } else {
      Serial.println(F("meta failed"));
    }
    if (postCheckin(pollMinutesFallback, pct, mv)) {
      Serial.println(F("server asked for setup mode"));
    } else {
      Serial.println(F("check-in posted"));
    }
    return true;
  }
  if (line == "paint") {
    if (drawEmbeddedDesign()) Serial.println(F("painted embedded design"));
    else Serial.println(F("paint failed"));
    return true;
  }
  if (line == "setup") {
    Serial.println(F("Clearing WiFi — restarting into MySmartLife"));
    clearSavedWifi();
    delay(200);
    ESP.restart();
    return true;
  }
  if (line == "sleep") {
    return false;
  }
  if (line == "reboot" || line == "restart") {
    ESP.restart();
    return true;
  }
  Serial.printf("Unknown: %s  (type help)\\n", line.c_str());
  return true;
}

void serialTestLoop() {
  Serial.println();
  Serial.println(F("USB test console @ 115200. Type help then Enter. Sleeps in 25s if idle."));
  uint32_t last = millis();
  uint32_t idleMs = 25000UL;
  String acc;
  while (true) {
    while (Serial.available()) {
      char c = (char)Serial.read();
      if (c == '\\r') continue;
      if (c == '\\n') {
        acc.trim();
        if (acc.length()) {
          Serial.printf("> %s\\n", acc.c_str());
          if (!handleSerialLine(acc)) return;
          last = millis();
          idleMs = 120000UL;
        }
        acc = "";
      } else if (acc.length() < 80) {
        acc += c;
      }
    }
    if (millis() - last > idleMs) {
      Serial.println(F("Idle — going to sleep"));
      return;
    }
    delay(10);
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);
  prefs.begin("smarthours", false);
  loadCfg();
  uint32_t savedPoll = prefs.getUInt("poll", pollMinutesFallback);
  if (savedPoll >= 1) pollMinutesFallback = savedPoll;
  initButtons();
  int btn = classifyButtonPress();
  if (btn == BTN_LONG) {
    Serial.println("Long press — reset to setup mode");
    clearSavedWifi();
    runSetupPortal();
  }
  bool livePoll = (btn == BTN_SHORT);
  if (livePoll) Serial.println("Short press — live check-in");
  initDisplay();

  if (!isConfigured()) {
    runSetupPortal();
  }

  String last = prefs.getString("ver", "");
  bool painted = false;

  if (!connectWifi()) {
    Serial.println("WiFi failed — keeping existing image and last poll interval");
    if (!painted && last.length() == 0) {
      if (drawEmbeddedDesign()) {
        prefs.putString("ver", EMBEDDED_VERSION);
      }
    }
    serialTestLoop();
    deepSleepMinutes(pollMinutesFallback);
    return;
  }

  int batteryMv = 0;
  uint8_t batteryPct = readBatteryPercent(batteryMv);
  Serial.printf("Battery %u%% (%d mV)  local IP %s\\n",
    (unsigned)batteryPct, batteryMv, WiFi.localIP().toString().c_str());

  String version;
  uint32_t pollMinutes = pollMinutesFallback;
  String img;
  if (fetchMeta(version, pollMinutes, img)) {
    if (livePoll || version != last) {
      Serial.printf("Design update %s -> %s\\n", last.c_str(), version.c_str());
      painted = fetchAndDrawImage(img);
      if (painted) prefs.putString("ver", version);
    } else {
      Serial.println("Design version unchanged");
    }
    prefs.putUInt("poll", pollMinutes);
    pollMinutesFallback = pollMinutes;
  } else {
    Serial.println("Meta fetch failed");
  }

  if (postCheckin(pollMinutesFallback, batteryPct, batteryMv)) {
    Serial.println("Server requested setup mode");
    clearSavedWifi();
    runSetupPortal();
  }

  if (!painted && last.length() == 0) {
    if (drawEmbeddedDesign()) {
      prefs.putString("ver", EMBEDDED_VERSION);
      painted = true;
    }
  }

  serialTestLoop();
  deepSleepMinutes(pollMinutesFallback);
}

void loop() {}
`;
}

module.exports = {
  renderEinkBmp,
  contentVersion,
  einkMeta,
  buildEsp32Sketch
};
