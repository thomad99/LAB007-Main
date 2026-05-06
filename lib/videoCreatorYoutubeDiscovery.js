'use strict';

/** Default region for search ranking (videos are still globally listed). */
const DEFAULT_REGION = 'US';

/** YouTube Data API: search consumes 100 quota units per call; videos.list 1 unit per call (up to 50 ids). */
const MAX_SEARCH_PAGES = 2;
const IDS_PER_BATCH = 50;

const RANGE_TO_DAYS = {
  '1w': 7,
  '1m': 30,
  '3m': 90
};

function getYoutubeDataApiKey() {
  return String(process.env.YOUTUBE_DATA_API_KEY || process.env.YOUTUBE_API_KEY || '').trim();
}

function isoPublishedAfter(days) {
  const d = new Date(Date.now() - Math.max(1, Number(days)) * 86400000);
  return d.toISOString();
}

function youtubeErrorMessage(payload) {
  const err = payload && payload.error;
  if (!err) return 'YouTube API error';
  const first = Array.isArray(err.errors) ? err.errors[0] : null;
  const bit = first && `${first.reason || ''}${first.message ? `: ${first.message}` : ''}`.trim();
  return bit || err.message || JSON.stringify(err).slice(0, 280);
}

/**
 * Narrow search keywords when category-only queries fail without `q`.
 * @param {string} categoryId
 * @returns {string}
 */
function fallbackQueryForCategory(categoryId) {
  const map = {
    '1': 'film',
    '2': 'cars',
    '10': 'music',
    '15': 'pets',
    '17': 'sports',
    '20': 'gaming',
    '22': 'vlog',
    '23': 'comedy skit',
    '24': 'entertainment',
    '25': 'news report',
    '26': 'how to',
    '27': 'education',
    '28': 'technology',
    '29': 'community'
  };
  return map[String(categoryId)] || 'video';
}

async function readJson(fetchFn, urlStr) {
  const r = await fetchFn(urlStr);
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

/**
 * One search.list page. Tries category-only without `q`, then retries with fallback `q`.
 */
async function searchListPage(fetchFn, apiKey, opts) {
  const cat = String(opts.categoryId || '').trim();
  const isAny = !cat || cat.toLowerCase() === 'any';

  const buildUrl = (includeQ, qVal) => {
    const u = new URL('https://www.googleapis.com/youtube/v3/search');
    u.searchParams.set('part', 'snippet');
    u.searchParams.set('type', 'video');
    u.searchParams.set('publishedAfter', opts.publishedAfterISO);
    u.searchParams.set('maxResults', String(Math.min(50, opts.maxPerPage || 50)));
    u.searchParams.set('key', apiKey);
    u.searchParams.set('relevanceLanguage', opts.relevanceLanguage || 'en');
    if (opts.regionCode) u.searchParams.set('regionCode', opts.regionCode);
    if (!isAny) u.searchParams.set('videoCategoryId', cat);
    if (includeQ && qVal) u.searchParams.set('q', qVal);
    if (opts.pageToken) u.searchParams.set('pageToken', opts.pageToken);
    return u.toString();
  };

  let url;
  let ok;
  let j;

  if (isAny) {
    url = buildUrl(true, String(opts.anyQuery || 'interesting').trim() || 'interesting');
    ({ ok, j } = await readJson(fetchFn, url));
  } else {
    url = buildUrl(false, '');
    ({ ok, j } = await readJson(fetchFn, url));
    if (!ok) {
      const fq = fallbackQueryForCategory(cat);
      url = buildUrl(true, fq);
      ({ ok, j } = await readJson(fetchFn, url));
    }
  }

  if (!ok) {
    const err = new Error(youtubeErrorMessage(j));
    err.status = j && j.error && j.error.code ? Number(j.error.code) : 502;
    throw err;
  }

  const items = Array.isArray(j.items) ? j.items : [];
  const ids = items.map((it) => it.id && it.id.videoId).filter(Boolean);
  const nextPageToken = j.nextPageToken || null;
  return { ids, nextPageToken };
}

/**
 * Fetch statistics + snippet for up to IDS_PER_BATCH ids per call.
 * @returns {Promise<Map<string, object>>}
 */
async function videosDetailsById(fetchFn, apiKey, videoIds) {
  const map = new Map();
  const chunks = [];
  for (let i = 0; i < videoIds.length; i += IDS_PER_BATCH) {
    chunks.push(videoIds.slice(i, i + IDS_PER_BATCH));
  }
  for (const chunk of chunks) {
    const u = new URL('https://www.googleapis.com/youtube/v3/videos');
    u.searchParams.set('part', 'snippet,statistics,contentDetails');
    u.searchParams.set('id', chunk.join(','));
    u.searchParams.set('key', apiKey);

    const { ok, j } = await readJson(fetchFn, u.toString());
    if (!ok) {
      const err = new Error(youtubeErrorMessage(j));
      err.status = j && j.error && j.error.code ? Number(j.error.code) : 502;
      throw err;
    }
    const items = Array.isArray(j.items) ? j.items : [];
    for (const it of items) {
      const vid = String(it.id || '');
      if (!vid) continue;
      map.set(vid, it);
    }
  }
  return map;
}

function normalizeVideo(vidId, apiItem) {
  const sn = apiItem.snippet || {};
  const st = apiItem.statistics || {};
  const publishedAt = sn.publishedAt || '';
  const viewCount = st.viewCount != null ? parseInt(String(st.viewCount), 10) : 0;
  const likeCount = st.likeCount != null ? parseInt(String(st.likeCount), 10) : null;
  const commentCount = st.commentCount != null ? parseInt(String(st.commentCount), 10) : null;
  const title = String(sn.title || '').trim();
  const channelTitle = String(sn.channelTitle || '').trim();
  return {
    videoId: vidId,
    title,
    channelTitle,
    publishedAt,
    viewCount: Number.isFinite(viewCount) ? viewCount : 0,
    likeCount,
    commentCount,
    thumbnails: sn.thumbnails || {},
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(vidId)}`
  };
}

/**
 * Discovery: recent-ish candidates from search.list, enriched with statistics, returned sorted two ways.
 * @param {typeof fetch} fetchFn
 * @param {{ categoryId?: string, range: string, regionCode?: string, maxVideos?: number }} params
 */
async function discoverYoutubeVideos(fetchFn, params) {
  const apiKey = getYoutubeDataApiKey();
  if (!apiKey) {
    const err = new Error(
      'Set YOUTUBE_DATA_API_KEY or YOUTUBE_API_KEY on the server to use discovery.'
    );
    err.status = 503;
    throw err;
  }

  const range = String(params.range || '1m').toLowerCase();
  const days = RANGE_TO_DAYS[range] ?? RANGE_TO_DAYS['1m'];
  const publishedAfterISO = isoPublishedAfter(days);
  const regionCode =
    String(process.env.YOUTUBE_DISCOVERY_REGION || params.regionCode || DEFAULT_REGION || 'US').trim()
      || 'US';

  const categoryId =
    params.categoryId === undefined || params.categoryId === null
      ? ''
      : String(params.categoryId).trim();

  const idsUnique = [];
  const seen = new Set();
  let pageToken = null;
  let pages = 0;

  while (pages < MAX_SEARCH_PAGES) {
    const { ids, nextPageToken } = await searchListPage(fetchFn, apiKey, {
      publishedAfterISO,
      categoryId,
      regionCode,
      pageToken,
      maxPerPage: 50,
      anyQuery: 'popular video tips'
    });
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      idsUnique.push(id);
    }
    pageToken = nextPageToken;
    pages++;
    if (!pageToken || !ids.length) break;
  }

  if (!idsUnique.length) {
    return {
      ok: true,
      publishedAfter: publishedAfterISO,
      categoryId: categoryId ? categoryId : 'any',
      range,
      quotaNote:
        'YouTube Data API charges ~100 quota units per search page + 1 per videos.list batch. Daily default quota is 10,000.',
      byViews: [],
      byDate: []
    };
  }

  const detailsMap = await videosDetailsById(fetchFn, apiKey, idsUnique);
  /** Re-include only ids that returned metadata (handles removed/private). */
  const normalized = idsUnique.map((vid) => detailsMap.get(vid)).filter(Boolean).map((it) =>
    normalizeVideo(String(it.id), it)
  );

  const clamp = typeof params.maxVideos === 'number' ? Math.min(40, Math.max(5, params.maxVideos)) : 25;

  const byViews = [...normalized].sort((a, b) => b.viewCount - a.viewCount).slice(0, clamp);

  const byDate = [...normalized]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, clamp);

  return {
    ok: true,
    publishedAfter: publishedAfterISO,
    categoryId: categoryId ? categoryId : 'any',
    range,
    candidateCount: normalized.length,
    quotaNote:
      'YouTube Data API charges ~100 quota units per search page + 1 per videos.list batch. Daily default quota is 10,000.',
    byViews,
    byDate
  };
}

module.exports = {
  getYoutubeDataApiKey,
  discoverYoutubeVideos,
  RANGE_TO_DAYS
};
