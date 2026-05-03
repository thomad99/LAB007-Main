/**
 * Fetch top headlines from RSS feeds (xml2js). Env:
 *   NEWS_RSS_URLS — comma-separated feed URLs (defaults to BBC World + CNN World)
 */

'use strict';

const { parseStringPromise } = require('xml2js');

const fetchFn =
  global.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

function defaultFeedUrls() {
  const raw = String(process.env.NEWS_RSS_URLS || '').trim();
  if (raw) return raw.split(/[\s,]+/).map((u) => u.trim()).filter(Boolean);
  return [
    'http://feeds.bbci.co.uk/news/world/rss.xml',
    'https://rss.cnn.com/rss/edition_world.rss'
  ];
}

function normalizeItems(parsed) {
  const rss = parsed.rss || parsed.feed;
  if (!rss) return [];
  const ch = rss.channel || rss;
  const chObj = Array.isArray(ch) ? ch[0] : ch;
  if (!chObj) return [];
  const rawItems = chObj.item || chObj.entry;
  if (!rawItems) return [];
  const arr = Array.isArray(rawItems) ? rawItems : [rawItems];
  const out = [];
  for (const item of arr) {
    const titleRaw = item.title;
    const title =
      typeof titleRaw === 'string'
        ? titleRaw
        : Array.isArray(titleRaw)
          ? titleRaw[0]
          : titleRaw && titleRaw._
          ? titleRaw._
          : '';
    const linkRaw = item.link;
    let link = '';
    if (typeof linkRaw === 'string') link = linkRaw;
    else if (Array.isArray(linkRaw)) link = linkRaw[0]?.href || linkRaw[0] || '';
    else if (linkRaw && linkRaw.$ && linkRaw.$.href) link = linkRaw.$.href;
    else if (linkRaw && linkRaw._) link = linkRaw._;
    const t = String(title || '').replace(/\s+/g, ' ').trim();
    if (t && !/^BBC News$/i.test(t)) out.push({ title: t.slice(0, 300), link: String(link || '').trim() });
  }
  return out;
}

async function fetchFeed(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 25000);
  let res;
  try {
    res = await fetchFn(url, {
      headers: { 'User-Agent': 'LAB007-scheduled-jobs/1.0' },
      signal: ac.signal
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`RSS ${res.status}: ${url}`);
  const xml = await res.text();
  const parsed = await parseStringPromise(xml);
  return normalizeItems(parsed);
}

/**
 * @param {{ count?: number, rssUrls?: string[] }} options
 * @returns {Promise<{ title: string, link?: string }[]>}
 */
async function runNewsHeadlinesTask(options = {}) {
  const count = Math.min(20, Math.max(1, Number(options.count) || 3));
  const urls = Array.isArray(options.rssUrls) && options.rssUrls.length ? options.rssUrls : defaultFeedUrls();
  const seen = new Set();
  const merged = [];
  for (const url of urls) {
    try {
      const items = await fetchFeed(url);
      for (const it of items) {
        const key = it.title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(it);
        if (merged.length >= count) return merged.slice(0, count);
      }
    } catch (e) {
      console.warn('[newsHeadlinesTask]', url, e.message);
    }
  }
  return merged.slice(0, count);
}

module.exports = { runNewsHeadlinesTask, defaultFeedUrls };
