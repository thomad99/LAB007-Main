'use strict';
process.env.CHROME_PATH =
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const sh = require('../lib/smarthours');

// Access internals via re-require by reading - preview isn't exported.
// Duplicate minimal call through fetchGooglePlaceHours only, and a small inline resolve+preview by eval of file section.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

(async () => {
  const url =
    'https://www.google.com/search?q=geckos+near+me#sv=CAwSmgIKBmxjbF9wdhIuCgNwdnESJ0NnMHZaeTh4TVhSNU5URnVOM2xqSWd3S0JtZGxZMnR2Y3hBQ0dBTRKiAQoDbHFpEpoBQ2c1blpXTnJiM01nYm1WaGNpQnRaU0lHaUFFQmtBRUJTS3VfNk5EMHVZQ0FDRm9TRUFBaURtZGxZMnR2Y3lCdVpXRnlJRzFsa2dFS2NtVnpkR0YxY21GdWRKb0JJME5vV2tSVFZXaE9UVWM1YmxNd1ZrcFJNRVp1VTFWT01rNXJNRE5TTVVvelJVRkY0QUVBLWdFRUNBQVFSURISCgN0YnMSC2xyZjohM3NJQUU9EhMKAXESDmdlY2tvcyBuZWFyIG1lGhJsb2NhbC1wbGFjZS12aWV3ZXIYCiDFg91g';
  const resolved = await sh.resolveGooglePlaceRef(url);
  console.log('resolved', resolved.query, resolved.kgmid);

  // Manually hit preview URLs like fetchGooglePreviewHours
  const kgmid = resolved.kgmid;
  const q = resolved.query;
  const previewUrls = [
    `https://www.google.com/maps/preview/place?authuser=0&hl=en&gl=us&q=${encodeURIComponent(q)}`,
    `https://www.google.com/maps/preview/place?authuser=0&hl=en&gl=us&q=${encodeURIComponent(q + ' Grill Pub')}`
  ];
  for (const u of previewUrls) {
    const res = await fetch(u, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const text = await res.text();
    const parsed = sh.extractHoursFromPageContent(text);
    console.log('preview', res.status, text.length, parsed.descriptions);
  }
})().catch((e) => console.error(e));
