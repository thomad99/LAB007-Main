'use strict';
const fs = require('fs');
const { extractHoursFromPageContent } = require('../lib/smarthours');
const text = fs.readFileSync('scripts/geckos-network-hours.txt', 'utf8');
console.log('Mon count', (text.match(/Monday/g) || []).length);
console.log('has [[11],[22]]', /\[\[11\],\[22\]\]/.test(text));
// Count how many full week blocks
const blocks = text.match(
  /\["Wednesday",\d[\s\S]{0,80}\["Thursday",\d[\s\S]{0,80}\["Friday",\d[\s\S]{0,80}\["Saturday",\d[\s\S]{0,80}\["Sunday",\d[\s\S]{0,80}\["Monday",\d[\s\S]{0,80}\["Tuesday",\d/g
);
console.log('full week blocks', blocks ? blocks.length : 0);
console.log(extractHoursFromPageContent(text).descriptions);
