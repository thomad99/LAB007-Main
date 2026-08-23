'use strict';
const fs = require('fs');
const text = fs.readFileSync('scripts/geckos-network-hours.txt', 'utf8');
console.log('len', text.length);

const needles = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
  '11',
  'AM',
  'PM',
  'Closed',
  '[[11',
  '[[8',
  'open',
  'hours'
];
for (const n of needles) {
  const count = text.split(n).length - 1;
  if (count) console.log(n, count);
}

// Find day + hours structured patterns
const patterns = [
  /\["(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)",\d[^\]]{0,200}/g,
  /\[([0-6]),\[\[(\d{1,2}),(\d{1,2})\],\[(\d{1,2}),(\d{1,2})\]\]/g,
  /\[([0-6]),\[\[\[(\d{1,2}),(\d{1,2})\],\[(\d{1,2}),(\d{1,2})\]\]\]/g,
  /(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)[^"]{0,5}"[^"]{0,40}(\d{1,2}\s*[AP]M|\d{1,2}:\d{2}|Closed)/gi,
  /11\s*\\u202f?AM[^"]{0,30}10\s*\\u202f?PM/g,
  /\[\[(\d{1,2})\],\[(\d{1,2})\]\]/g
];

for (const re of patterns) {
  const hits = [];
  let m;
  const r = new RegExp(re.source, re.flags);
  while ((m = r.exec(text)) && hits.length < 25) hits.push(m[0].slice(0, 120));
  console.log('\nRE', re.source.slice(0, 70), '→', hits.length);
  hits.forEach((h) => console.log(' ', h));
}

// Dump context around first Wednesday
const i = text.indexOf('Wednesday');
console.log('\nWed context:\n', text.slice(i, i + 400));
const j = text.indexOf('11');
// find 11 near AM
let idx = 0;
let shown = 0;
while (shown < 8) {
  const k = text.indexOf('AM', idx);
  if (k < 0) break;
  console.log('AM ctx', text.slice(Math.max(0, k - 40), k + 40).replace(/\s+/g, ' '));
  idx = k + 2;
  shown += 1;
}
