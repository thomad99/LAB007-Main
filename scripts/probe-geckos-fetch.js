'use strict';
process.env.CHROME_PATH =
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';

const {
  fetchGooglePlaceHours,
  resolveGooglePlaceRef,
  scrapeTargetUrls,
  extractGoogleSearchPlaceHints
} = require('../lib/smarthours');

const url =
  'https://www.google.com/search?q=geckos+near+me&sca_esv=7fe2d86af3c866b1&cs=0&sxsrf=APpeQns7zLcxThL0_C27LirDtOQtoMrxFw%3A1785341171626&ei=8yRqao_UJa6CwbkP55ba2QQ&biw=1278&bih=1270&ved=0ahUKEwjPmdmSoviVAxUuQTABHWeLNksQ4dUDCBA&uact=5&oq=geckos+near+me&gs_lp=Egxnd3Mtd2l6LXNlcnAiDmdlY2tvcyBuZWFyIG1lMggQABiABBjJAzILEAAYgAQYigUYkgMyCxAAGIAEGIoFGJIDMgUQABiABDIFEAAYgAQyBhAAGBYYHjIGEAAYFhgeMgYQABgWGB4yBhAAGBYYHjIGEAAYFhgeSLsuUJgdWMstcAF4AZABAJgBjwGgAeoKqgEDOS41uAEDyAEA-AEBmAIPoALZC8ICChAAGEcY1gQYsAPCAg0QABiABBiKBRhDGLADwgIEECMYJ8ICFhAuGIAEGIoFGEMYsQMYgwEYxwEY0QPCAgsQABiABBixAxiDAcICCBAAGIAEGLEDwgIQEAAYgAQYigUYQxixAxiDAcICCxAAGIAEGIoFGJECwgINEAAYgAQYigUYQxixA8ICBRAuGIAEwgIKEAAYgAQYigUYQ8ICEBAuGIAEGIoFGEMYxwEYrwHCAg4QLhiABBjHARivARiOBcICERAuGIAEGLEDGMcBGK8BGI4FwgIOEC4YrwEYxwEYkgMYgATCAggQABiABBiSA8ICHRAuGIAEGMcBGK8BGI4FGJcFGNwEGN4EGOAE2AEBwgILEC4YgAQYxwEYrwGYAwCIBgGQBgq6BgYIARABGBSSBwM4LjegB8WlAbIHAzcuN7gHzQvCBwYyLTEyLjPIB1OACAE&sclient=gws-wiz-serp#sv=CAwSmgIKBmxjbF9wdhIuCgNwdnESJ0NnMHZaeTh4TVhSNU5URnVOM2xqSWd3S0JtZGxZMnR2Y3hBQ0dBTRKiAQoDbHFpEpoBQ2c1blpXTnJiM01nYm1WaGNpQnRaU0lHaUFFQmtBRUJTS3VfNk5EMHVZQ0FDRm9TRUFBaURtZGxZMnR2Y3lCdVpXRnlJRzFsa2dFS2NtVnpkR0YxY21GdWRKb0JJME5vV2tSVFZXaE9UVWM1YmxNd1ZrcFJNRVp1VTFWT01rNXJNRE5TTVVvelJVRkY0QUVBLWdFRUNBQVFSURISCgN0YnMSC2xyZjohM3NJQUU9EhMKAXESDmdlY2tvcyBuZWFyIG1lGhJsb2NhbC1wbGFjZS12aWV3ZXIYCiDFg91g';

(async () => {
  const hints = extractGoogleSearchPlaceHints(url);
  console.log('hints', hints);
  const resolved = await resolveGooglePlaceRef(url);
  console.log('resolved', {
    placeId: resolved.placeId,
    query: resolved.query,
    kgmid: resolved.kgmid,
    ludocid: resolved.ludocid,
    sourceUrl: resolved.sourceUrl
  });
  console.log('targets', scrapeTargetUrls(resolved, url));
  const result = await fetchGooglePlaceHours(url);
  console.log(
    JSON.stringify(
      {
        source: result.source,
        displayName: result.displayName,
        syncNote: result.syncNote,
        hours: result.hours,
        raw: result.rawWeekdayDescriptions
      },
      null,
      2
    )
  );
})().catch((e) => {
  console.error('FAIL', e.message);
  if (e.tried) console.error('tried', e.tried);
  if (e.sample) console.error('sample', e.sample);
  process.exit(1);
});
