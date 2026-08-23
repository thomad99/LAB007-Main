'use strict';
const fs = require('fs');
const h = fs.readFileSync('scripts/geckos-maps-chrome.html', 'utf8');
const i = h.indexOf('Show open hours for the week');
console.log('idx', i);
console.log(h.slice(i - 800, i + 600).replace(/\s+/g, ' '));
const j = h.indexOf('pane.openhours');
console.log('\njsaction idx', j);
console.log(h.slice(j - 200, j + 400).replace(/\s+/g, ' '));
