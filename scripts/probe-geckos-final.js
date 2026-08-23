'use strict';
process.env.CHROME_PATH =
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

const { fetchGooglePlaceHours } = require('../lib/smarthours');

const url =
  'https://www.google.com/search?q=geckos+near+me#sv=CAwSmgIKBmxjbF9wdhIuCgNwdnESJ0NnMHZaeTh4TVhSNU5URnVOM2xqSWd3S0JtZGxZMnR2Y3hBQ0dBTRKiAQoDbHFpEpoBQ2c1blpXTnJiM01nYm1WaGNpQnRaU0lHaUFFQmtBRUJTS3VfNk5EMHVZQ0FDRm9TRUFBaURtZGxZMnR2Y3lCdVpXRnlJRzFsa2dFS2NtVnpkR0YxY21GdWRKb0JJME5vV2tSVFZXaE9UVWM1YmxNd1ZrcFJNRVp1VTFWT01rNXJNRE5TTVVvelJVRkY0QUVBLWdFRUNBQVFSURISCgN0YnMSC2xyZjohM3NJQUU9EhMKAXESDmdlY2tvcyBuZWFyIG1lGhJsb2NhbC1wbGFjZS12aWV3ZXIYCiDFg91g';

(async () => {
  const h = await fetchGooglePlaceHours(url);
  const days = Object.entries(h.hours).map(
    ([d, v]) => `${d}: ${v.closed ? 'closed' : `${v.open}-${v.close}`}`
  );
  console.log(
    JSON.stringify(
      {
        source: h.source,
        name: h.displayName,
        note: h.syncNote || '',
        days,
        raw: h.rawWeekdayDescriptions,
        ok: days.every((line) => line.includes('11:00-22:00'))
      },
      null,
      2
    )
  );
  if (!days.every((line) => line.includes('11:00-22:00'))) process.exit(2);
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
