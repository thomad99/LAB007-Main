'use strict';
const { extractHoursFromPageContent } = require('../lib/smarthours');
const fs = require('fs');

(async () => {
  const urls = [
    'https://www.google.com/search?tbm=map&hl=en&gl=us&q=geckos',
    'https://www.google.com/search?tbm=map&hl=en&gl=us&q=' + encodeURIComponent("Gecko's Grill & Pub"),
    'https://www.google.com/search?tbm=map&hl=en&gl=us&q=geckos&kgmid=%2Fg%2F11ty51n7yc',
    'https://www.google.com/search?tbm=map&authuser=0&hl=en&gl=us&q=geckos&pb=!1sgeckos!7i20!10b1'
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
          Accept: 'application/json,text/plain,*/*'
        }
      });
      const text = await res.text();
      const parsed = extractHoursFromPageContent(text);
      console.log('\n', res.status, text.length, url.slice(0, 90));
      console.log('days', parsed.descriptions);
      if (parsed.descriptions.length >= 5) {
        fs.writeFileSync('scripts/geckos-tbm-map.json.txt', text.slice(0, 250000), 'utf8');
        console.log('SAVED full week payload');
      }
    } catch (e) {
      console.log('fail', url, e.message);
    }
  }

  // Also parse the saved network body with current extractor
  const net = fs.readFileSync('scripts/geckos-network-hours.txt', 'utf8');
  const fromNet = extractHoursFromPageContent(net);
  console.log('\nfrom saved network:', fromNet.descriptions);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
