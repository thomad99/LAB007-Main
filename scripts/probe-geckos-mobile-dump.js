'use strict';
const sh = require('../lib/smarthours');
const fs = require('fs');

(async () => {
  const url = `https://www.google.com/maps/search/?api=1&hl=en&query=${encodeURIComponent("Gecko's Grill & Pub")}&kgmid=${encodeURIComponent('/g/11ty51n7yc')}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  const text = await res.text();
  fs.writeFileSync('scripts/geckos-mobile-maps.html', text);

  // Find vicinity of 11 AM
  let idx = 0;
  let n = 0;
  while ((idx = text.indexOf('11', idx + 1)) !== -1 && n < 15) {
    const snip = text.slice(Math.max(0, idx - 40), idx + 80).replace(/\s+/g, ' ');
    if (/AM|PM|hour|open|close/i.test(snip)) {
      console.log('snip', JSON.stringify(snip));
      n += 1;
    }
    if (n >= 12) break;
  }

  // Look for APP_INITIALIZATION / hours arrays
  for (const pat of [
    /11\\u202fAM/g,
    /11 AM/g,
    /10\\u202fPM/g,
    /10 PM/g,
    /\[\[\"Closed\"\]\]/g,
    /\["Monday"/g,
    /weekday/gi,
    /BRdld/g,
    /XCUnmd/g,
    /OpeningHours/g
  ]) {
    const m = text.match(pat);
    console.log(String(pat), m ? m.length : 0);
  }

  // Try extract all day structures more loosely
  const loose = [...text.matchAll(/\["(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)"[^\]]{0,200}/g)];
  console.log('loose day structs', loose.length);
  loose.slice(0, 10).forEach((m) => console.log(m[0].slice(0, 120)));

  const parsed = sh.extractHoursFromPageContent(text);
  console.log('parsed', parsed.descriptions);
})();
