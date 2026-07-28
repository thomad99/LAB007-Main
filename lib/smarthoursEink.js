'use strict';

const crypto = require('crypto');
const {
  DAYS,
  DAY_LABELS,
  effectiveHours,
  formatDayHours,
  isOpenNow,
  normalizeEink
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

function contentVersion(customer) {
  const hours = effectiveHours(customer);
  const eink = normalizeEink(customer.eink);
  const payload = JSON.stringify({
    name: customer.name,
    hours,
    updatedAt: customer.updatedAt,
    lastSyncedAt: customer.lastSyncedAt,
    useManualHours: customer.useManualHours,
    eink
  });
  return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16);
}

function renderEinkBmp(customer) {
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

  const buffer = encodeBmp1Bit(bmp, eink.inverted);
  const version = contentVersion(customer);
  return { buffer, version, width: eink.width, height: eink.height, contentType: 'image/bmp' };
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

function buildEsp32Sketch(customer, options = {}) {
  const eink = normalizeEink(customer.eink);
  const wifiSsid = String(options.wifiSsid || 'YOUR_WIFI_SSID');
  const wifiPass = String(options.wifiPass || 'YOUR_WIFI_PASSWORD');
  const baseUrl = String(options.baseUrl || 'https://your-lab007-host').replace(/\/$/, '');
  const slug = customer.slug;
  const poll = Number(options.pollIntervalMinutes || eink.pollIntervalMinutes || 720);
  const width = eink.width;
  const height = eink.height;

  return `/*
 * SmartHours ESP32 + E-ink
 * Customer: ${customer.name}
 * Slug: ${slug}
 *
 * Generated by LAB007 SmartHours Code Creator.
 * 1) Install ESP32 board support in Arduino IDE
 * 2) Install libraries: WiFi, HTTPClient, ArduinoJson
 * 3) Wire your Waveshare/GxEPD2 (or similar) display and adapt drawBitmap()
 * 4) Fill WiFi settings below, flash, done
 *
 * Default poll: ${poll} minutes (12h recommended for battery).
 * The device also reads pollIntervalMinutes from the server meta JSON,
 * so you can change the interval in SmartHours admin without reflashing.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>

// ---- config ----
const char* WIFI_SSID = "${wifiSsid.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}";
const char* WIFI_PASS = "${wifiPass.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}";
const char* BASE_URL  = "${baseUrl}";
const char* SLUG      = "${slug}";
uint32_t pollMinutesFallback = ${poll}; // used until first successful meta fetch
const uint16_t EINK_W = ${width};
const uint16_t EINK_H = ${height};

Preferences prefs;

String metaUrl() {
  return String(BASE_URL) + "/api/smarthours/public/" + SLUG + "/eink.json";
}
String imageUrl(const String& version) {
  return String(BASE_URL) + "/api/smarthours/public/" + SLUG + "/eink.bmp?v=" + version;
}

bool connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) delay(250);
  return WiFi.status() == WL_CONNECTED;
}

// TODO: replace with your panel driver (GxEPD2, etc.)
void drawBitmapToDisplay(const uint8_t* data, size_t len) {
  // Parse Windows BMP (1-bit) starting at file offset from header, then push pixels to e-ink.
  // Many panels want full refresh only when content changes (this sketch already gates on version).
  Serial.printf("Received BMP %u bytes for %ux%u display\\n", (unsigned)len, EINK_W, EINK_H);
  // yourDisplay.drawBitmap(...); yourDisplay.display();
}

bool fetchMeta(String& versionOut, uint32_t& pollOut, String& imageOut) {
  HTTPClient http;
  http.setTimeout(20000);
  if (!http.begin(metaUrl())) return false;
  int code = http.GET();
  if (code != 200) { http.end(); return false; }
  String body = http.getString();
  http.end();

  StaticJsonDocument<768> doc;
  if (deserializeJson(doc, body)) return false;
  versionOut = String((const char*)doc["version"] | "");
  pollOut = doc["pollIntervalMinutes"] | pollMinutesFallback;
  imageOut = String((const char*)doc["imageUrl"] | "");
  if (imageOut.length() == 0 && versionOut.length()) imageOut = imageUrl(versionOut);
  return versionOut.length() > 0;
}

bool fetchImage(const String& url) {
  HTTPClient http;
  http.setTimeout(30000);
  if (!http.begin(url)) return false;
  int code = http.GET();
  if (code != 200) { http.end(); return false; }
  int len = http.getSize();
  WiFiClient* stream = http.getStreamPtr();
  // For production, stream into PSRAM / file. Here we buffer if size is modest.
  if (len <= 0 || len > 200000) { http.end(); return false; }
  uint8_t* buf = (uint8_t*)malloc(len);
  if (!buf) { http.end(); return false; }
  int rd = stream->readBytes(buf, len);
  http.end();
  if (rd != len) { free(buf); return false; }
  drawBitmapToDisplay(buf, len);
  free(buf);
  return true;
}

void deepSleepMinutes(uint32_t minutes) {
  if (minutes < 1) minutes = 1;
  uint64_t us = (uint64_t)minutes * 60ULL * 1000000ULL;
  Serial.printf("Sleeping %u minutes...\\n", (unsigned)minutes);
  esp_sleep_enable_timer_wakeup(us);
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  delay(200);
  prefs.begin("smarthours", false);

  if (!connectWifi()) {
    Serial.println("WiFi failed");
    deepSleepMinutes(pollMinutesFallback);
  }

  String version;
  uint32_t pollMinutes = pollMinutesFallback;
  String img;
  if (!fetchMeta(version, pollMinutes, img)) {
    Serial.println("Meta fetch failed");
    deepSleepMinutes(pollMinutesFallback);
  }

  String last = prefs.getString("ver", "");
  if (version != last) {
    Serial.printf("Update %s -> %s\\n", last.c_str(), version.c_str());
    if (fetchImage(img)) {
      prefs.putString("ver", version);
    }
  } else {
    Serial.println("No change");
  }

  prefs.putUInt("poll", pollMinutes);
  deepSleepMinutes(pollMinutes);
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
