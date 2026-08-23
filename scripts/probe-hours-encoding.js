'use strict';
const fs = require('fs');
const h = fs.readFileSync('scripts/geckos-maps-chrome.html', 'utf8');

// Common Google hours encodings
const patterns = [
  /\[\[([0-6]),\[\[(\d{1,2}),(\d{1,2})\],\[(\d{1,2}),(\d{1,2})\]\]/g,
  /\[\[(\d{1,2}),(\d{2})\],\[(\d{1,2}),(\d{2})\]\]/g,
  /"([^"]*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[^"]{0,40}(?:AM|PM|Closed)[^"]*)"/gi,
  /11\\u202fAM|11 AM|22:00|10\\u202fPM/g
];

for (const re of patterns) {
  const hits = [];
  let m;
  const r = new RegExp(re.source, re.flags);
  while ((m = r.exec(h)) && hits.length < 30) {
    hits.push(m[0].slice(0, 120));
  }
  console.log('\nPATTERN', re.source.slice(0, 60), 'hits', hits.length);
  hits.slice(0, 15).forEach((x) => console.log(' ', x));
}

// Look near "opening" / "hours" json keys
for (const key of ['opening_hours', 'openHours', 'weekday_text', 'regularOpeningHours', 'current_opening']) {
  const i = h.toLowerCase().indexOf(key.toLowerCase());
  console.log(key, i, i >= 0 ? h.slice(i, i + 200).replace(/\s+/g, ' ') : '');
}
