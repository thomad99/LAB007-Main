'use strict';
const fs = require('fs');
const files = ['scripts/geckos-maps-chrome.html', 'scripts/geckos-maps-expanded.html'].filter((f) =>
  fs.existsSync(f)
);
for (const file of files) {
  const h = fs.readFileSync(file, 'utf8');
  console.log('\n====', file, h.length);
  // Look for 11,0 and 22,0 style pairs near each other
  const re = /\[\[(?:\[)?(\d{1,2}),(\d{1,2})\]?,\[(?:\[)?(\d{1,2}),(\d{1,2})\]?/g;
  const hits = [];
  let m;
  while ((m = re.exec(h)) && hits.length < 40) {
    const a = Number(m[1]);
    const b = Number(m[3]);
    // likely hours if open hour 6-23 and close after open or overnight
    if (a >= 6 && a <= 23 && b >= 0 && b <= 23) {
      hits.push({ m: m[0].slice(0, 40), a, b, ctx: h.slice(m.index - 30, m.index + 50).replace(/\s+/g, ' ') });
    }
  }
  console.log('time-like pairs', hits.length);
  hits.slice(0, 20).forEach((x) => console.log(x));

  // day index + hours: [0,[[11,0],[22,0]]]
  const re2 = /\[([0-6]),\[\[(\d{1,2}),(\d{1,2})\],\[(\d{1,2}),(\d{1,2})\]\]/g;
  const hits2 = [];
  while ((m = re2.exec(h)) && hits2.length < 20) hits2.push(m[0]);
  console.log('day-period', hits2);

  const expanded = (h.match(/aria-expanded="true"/g) || []).length;
  const falsex = (h.match(/aria-expanded="false"/g) || []).length;
  console.log('aria-expanded true/false', expanded, falsex);
  console.log('eK4R0e tables', (h.match(/eK4R0e/g) || []).length);
  console.log('Ou9w8d', (h.match(/Ou9w8d/g) || []).length);
  console.log('BjTeYd', (h.match(/BjTeYd/g) || []).length);
}
