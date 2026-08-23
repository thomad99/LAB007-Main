'use strict';
const fs = require('fs');
const h = fs.readFileSync('scripts/geckos-maps-chrome.html', 'utf8');
for (const d of ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']) {
  const n = (h.match(new RegExp(d, 'g')) || []).length;
  const i = h.indexOf('>' + d + '<');
  console.log(d, 'count', n, i >= 0 ? h.slice(i, i + 220).replace(/\s+/g, ' ') : '-');
}
const i = h.indexOf('mxowUb');
console.log('\n--- table context ---');
console.log(h.slice(Math.max(0, i - 400), i + 2500).replace(/\s+/g, ' ').slice(0, 2200));
