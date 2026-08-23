'use strict';
const sh = require('../lib/smarthours');
const fs = require('fs');

const UA = {
  desktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  mobile:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
};

async function tryUrl(label, url, ua) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': ua, 'Accept-Language': 'en-US,en;q=0.9' },
      redirect: 'follow'
    });
    const text = await res.text();
    const parsed = sh.extractHoursFromPageContent(text);
    const has11 = /11\s*AM/i.test(text) || parsed.descriptions.some((d) => /11/.test(d));
    const has10 = /10\s*PM/i.test(text) || parsed.descriptions.some((d) => /22:00|10\s*PM/i.test(d));
    const days = [...text.matchAll(/\["(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)",\s*\d/g)].map(
      (m) => m[1]
    );
    console.log(
      label,
      res.status,
      text.length,
      'desc',
      parsed.descriptions.length,
      '11?',
      has11,
      '10pm?',
      has10,
      'tokens',
      [...new Set(days)].length,
      parsed.descriptions.slice(0, 3)
    );
    if (parsed.descriptions.length >= 5 || (has11 && has10 && days.length >= 5)) {
      fs.writeFileSync('scripts/geckos-hit.txt', text.slice(0, 250000));
      return parsed;
    }
  } catch (e) {
    console.log(label, 'ERR', e.message);
  }
  return null;
}

(async () => {
  const kg = '/g/11ty51n7yc';
  const urls = [
    ['maps kgmid', `https://www.google.com/maps?hl=en&gl=us&kgmid=${encodeURIComponent(kg)}`],
    ['maps q+kgmid', `https://www.google.com/maps/search/?api=1&hl=en&query=${encodeURIComponent("Gecko's Grill & Pub")}&kgmid=${encodeURIComponent(kg)}`],
    ['maps place name', `https://www.google.com/maps/place/Gecko%27s+Grill+%26+Pub`],
    ['preview q', `https://www.google.com/maps/preview/place?authuser=0&hl=en&gl=us&q=${encodeURIComponent("Gecko's Grill & Pub")}`],
    ['preview geckos', `https://www.google.com/maps/preview/place?authuser=0&hl=en&gl=us&q=geckos`],
    ['search kgmid', `https://www.google.com/search?hl=en&gl=us&kgmid=${encodeURIComponent(kg)}&q=${encodeURIComponent("Gecko's Grill & Pub")}`],
    ['search ludocid hours', `https://www.google.com/search?hl=en&gl=us&q=${encodeURIComponent("Gecko's Grill & Pub hours")}`],
    ['maps data', `https://www.google.com/maps/place/?q=place_id:ChIJ`] // placeholder skip
  ];

  for (const [label, url] of urls) {
    if (url.includes('ChIJ')) continue;
    let hit = await tryUrl(label + ' desk', url, UA.desktop);
    if (hit) {
      console.log('HIT', label, hit.descriptions);
      break;
    }
    hit = await tryUrl(label + ' mob', url, UA.mobile);
    if (hit) {
      console.log('HIT', label, hit.descriptions);
      break;
    }
  }

  // Follow maps place redirect to extract cid
  const place = await fetch(`https://www.google.com/maps/place/${encodeURIComponent("Gecko's Grill & Pub")}?hl=en`, {
    headers: { 'User-Agent': UA.desktop, 'Accept-Language': 'en-US,en;q=0.9' },
    redirect: 'follow'
  });
  const finalUrl = place.url;
  const text = await place.text();
  console.log('place final', finalUrl.slice(0, 200), 'len', text.length);
  console.log('cid', (finalUrl.match(/cid=(\d+)/) || [])[1] || extractFeature(text));
  console.log('placeId', (text.match(/ChIJ[\w-]{20,}/) || [])[0]);
  fs.writeFileSync('scripts/geckos-maps-place.html', text.slice(0, 300000));
})();

function extractFeature(text) {
  const m = String(text).match(/0x[0-9a-f]+:0x([0-9a-f]+)/i);
  if (!m) return '';
  try {
    return BigInt('0x' + m[1]).toString(10);
  } catch {
    return m[0];
  }
}
