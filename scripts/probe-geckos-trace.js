'use strict';
process.env.CHROME_PATH =
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

const sh = require('../lib/smarthours');

// Monkey-patch console to see scrape warnings
const URL =
  'https://www.google.com/search?q=geckos+near+me#sv=CAwSmgIKBmxjbF9wdhIuCgNwdnESJ0NnMHZaeTh4TVhSNU5URnVOM2xqSWd3S0JtZGxZMnR2Y3hBQ0dBTRKiAQoDbHFpEpoBQ2c1blpXTnJiM01nYm1WaGNpQnRaU0lHaUFFQmtBRUJTS3VfNk5EMHVZQ0FDRm9TRUFBaURtZGxZMnR2Y3lCdVpXRnlJRzFsa2dFS2NtVnpkR0YxY21GdWRKb0JJME5vV2tSVFZXaE9UVWM1YmxNd1ZrcFJNRVp1VTFWT01rNXJNRE5TTVVvelJVRkY0QUVBLWdFRUNBQVFSURISCgN0YnMSC2xyZjohM3NJQUU9EhMKAXESDmdlY2tvcyBuZWFyIG1lGhJsb2NhbC1wbGFjZS12aWV3ZXIYCiDFg91g';

(async () => {
  const resolved = await sh.resolveGooglePlaceRef(URL);
  console.log('resolved', resolved);

  // Call scrape path pieces by using fetch and logging
  const origWarn = console.warn;
  console.warn = (...args) => {
    origWarn('[WARN]', ...args);
  };

  try {
    const fetched = await sh.fetchGooglePlaceHours(URL);
    console.log('OK', {
      source: fetched.source,
      note: fetched.syncNote,
      desc: fetched.rawWeekdayDescriptions,
      mon: fetched.hours.monday
    });
  } catch (e) {
    console.log('ERR', e.message);
  }
})();
