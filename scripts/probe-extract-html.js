'use strict';
const fs = require('fs');
const { extractHoursFromPageContent } = require('../lib/smarthours');
const html = fs.readFileSync('scripts/geckos-maps-chrome.html', 'utf8');
const parsed = extractHoursFromPageContent(html);
console.log(JSON.stringify(parsed, null, 2));
