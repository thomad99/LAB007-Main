'use strict';
process.env.CHROME_PATH =
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const { fetchGooglePlaceHours, resolveGooglePlaceRef } = require('../lib/smarthours');

const url =
  'https://www.google.com/search?q=geckos+near+me#sv=CAwSmgIKBmxjbF9wdhIuCgNwdnESJ0NnMHZaeTh4TVhSNU5URnVOM2xqSWd3S0JtZGxZMnR2Y3hBQ0dBTRKiAQoDbHFpEpoBQ2c1blpXTnJiM01nYm1WaGNpQnRaU0lHaUFFQmtBRUJTS3VfNk5EMHVZQ0FDRm9TRUFBaURtZGxZMnR2Y3lCdVpXRnlJRzFsa2dFS2NtVnpkR0YxY21GdWRKb0JJME5vV2tSVFZXaE9UVWM1YmxNd1ZrcFJNRVp1VTFWT01rNXJNRE5TTVVvelJVRkY0QUVBLWdFRUNBQVFSURISCgN0YnMSC2xyZjohM3NJQUU9EhMKAXESDmdlY2tvcyBuZWFyIG1lGhJsb2NhbC1wbGFjZS12aWV3ZXIYCiDFg91g';

(async () => {
  const r = await resolveGooglePlaceRef(url);
  console.log('resolved', r);
  const h = await fetchGooglePlaceHours(url);
  console.log({
    name: h.displayName,
    source: h.source,
    resolvedFrom: h.resolvedFrom,
    hoursSample: Object.fromEntries(
      Object.entries(h.hours).map(([d, v]) => [d, v.closed ? 'closed' : `${v.open}-${v.close}`])
    )
  });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
