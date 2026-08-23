'use strict';
const { extractHoursFromPageContent } = require('../lib/smarthours');
const fs = require('fs');

(async () => {
  // Reconstruct from interesting URL in probe output (truncated) — use full from network file's first line marker if any
  // Better: pull URL-like strings from chrome html that contain tbm=map
  const html = fs.readFileSync('scripts/geckos-maps-chrome.html', 'utf8');
  const urls = new Set();
  for (const m of html.matchAll(/https:\/\/www\.google\.com\/search\?tbm=map[^"'\s<>]+/g)) {
    urls.add(m[0].replace(/&amp;/g, '&'));
  }
  for (const m of html.matchAll(/\/search\?tbm=map[^"'\s<>]+/g)) {
    urls.add('https://www.google.com' + m[0].replace(/&amp;/g, '&'));
  }
  console.log('found urls', urls.size);
  [...urls].slice(0, 5).forEach((u) => console.log(u.slice(0, 160)));

  // Try a richer pb commonly used by Maps
  const candidates = [
    ...[...urls].slice(0, 3),
    'https://www.google.com/search?tbm=map&authuser=0&hl=en&gl=us&q=geckos&pb=!1sgeckos!7i20!10b1!12m56!1m5!18b1!30b1!31m1!1b1!34e1!2m4!5m1!6e2!20e3!39b1!3m30!32i1!49b1!6m8!1m2!1i1000!2i100!3s!5b1!9b0!15b1!16b0!18m16!1m12!4m1!1e1!4m1!1e3!6m1!1e1!6m1!1e2!9b0!15b1!16b0!17e1!18e0!19e1!20b0!21b0!22b0!23b0!24b0!25b0!26b0!27b0!28b0!29b0!30b0!31b0!32b0!33b0!34b0!35b0!36b0!37b0!38b0!39b0!40b0!41b0!42b0!43b0!44b0!45b0!46b0!47b0!48b0!49b0!50b0!51b0!52b0!53b0!54b0!55b0!56b0!57b0!58b0!59b0!60b0'
  ];

  for (const url of candidates) {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    const text = await res.text();
    const parsed = extractHoursFromPageContent(text);
    console.log(res.status, text.length, parsed.descriptions.length, parsed.descriptions.slice(0, 3), url.slice(0, 100));
    if (parsed.descriptions.length >= 7) {
      console.log('FULL WEEK OK');
      break;
    }
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
