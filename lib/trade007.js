/**
 * 007Trade — paper (Alpaca paper) vs live strategies, Claude planning, optional Alpaca when env configured.
 * State file: set LAB007_DATA_DIR (Render disk) or TRADE007_DATA_PATH so watchlist/plans/notes survive deploys.
 * Paper vs real-money API host is ALPACA_PAPER (not the dashboard mode alone).
 * Secrets: Render env — ALPACA_API_KEY_ID, ALPACA_API_SECRET_KEY (never stored in state.json).
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  readState,
  writeState,
  trade007StatePath,
  defaultRiskProfile,
  defaultAutomationState
} = require('./trade007Store');
const { submitTrade007Order } = require('./trade007OrderSubmit');

const fetchFn =
  global.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

const BUILTIN_STRATEGIES = [
  {
    id: 'momentum-breakout',
    name: 'Momentum breakout',
    summary:
      'Focus on volume-backed breaks. Automation: long when price clears the prior completed session daily high (optional min breakout %).',
    style: 'Day-trader classic'
  },
  {
    id: 'mean-reversion',
    name: 'Mean reversion',
    summary:
      'Planning lens for fades. Automation: optional dip-buy vs session open after N minutes when drop-from-open exceeds your fade %.',
    style: 'Short-term statistical'
  },
  {
    id: 'opening-range',
    name: 'Opening range breakout',
    summary:
      'ORB playbook: optional server automation (long/short/both), exits outside the range, and flatten-before-close run from Automation settings.',
    style: 'ORB playbook'
  },
  {
    id: 'news-catalyst',
    name: 'News & catalyst',
    summary:
      'Prioritize symbols with scheduled news; reduce size into headlines. Automation entry logic matches momentum (for journal tagging).',
    style: 'Event-driven'
  },
  {
    id: 'conservative-swing',
    name: 'Conservative (legacy investor style)',
    summary:
      'Smaller size, wider stops, fewer trades. Use stricter rule limits in Automation; entry engine same as momentum when selected.',
    style: 'Risk-first'
  },
  {
    id: 'quant-lite',
    name: 'Quant-lite factors',
    summary:
      'Rank by simple factors; rotate weekly. Automation entry engine same as momentum when you need consistent tagging.',
    style: 'Systematic lite'
  }
];

function alpacaConfigured() {
  const k = String(process.env.ALPACA_API_KEY_ID || '').trim();
  const s = String(process.env.ALPACA_API_SECRET_KEY || '').trim();
  return Boolean(k && s);
}

function alpacaIsPaper() {
  const paper = String(process.env.ALPACA_PAPER || 'true').toLowerCase();
  return paper !== 'false' && paper !== '0' && paper !== 'no';
}

function alpacaBaseUrl() {
  return alpacaIsPaper() ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
}

function alpacaHeaders() {
  return {
    'APCA-API-KEY-ID': String(process.env.ALPACA_API_KEY_ID || '').trim(),
    'APCA-API-SECRET-KEY': String(process.env.ALPACA_API_SECRET_KEY || '').trim(),
    'Content-Type': 'application/json'
  };
}

/** Alpaca data feed for market data endpoints (free plans usually require IEX). */
function alpacaDataFeed() {
  const v = String(process.env.ALPACA_DATA_FEED || '').trim().toLowerCase();
  if (v === 'sip' || v === 'iex' || v === 'otc') return v;
  return 'iex';
}

/** Last 4 chars of key ID — safe to log for “which key hit Alpaca” debugging */
function alpacaKeyIdSuffix() {
  const k = String(process.env.ALPACA_API_KEY_ID || '').trim();
  return k.length >= 4 ? k.slice(-4) : k ? '***' : '(missing)';
}

function trade007DebugVerbose() {
  const v = String(process.env.TRADE007_DEBUG || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Alpaca client_order_id (≤48 chars): encodes app + symbol + strategy hash for dashboard matching */
function buildAlpacaClientOrderId(symbol, strategyId) {
  const sym = String(symbol || 'X').replace(/[^A-Z0-9]/gi, '').slice(0, 5).toUpperCase() || 'X';
  const sid = String(strategyId || 'none');
  const stratHash = crypto.createHash('sha256').update(sid).digest('hex').slice(0, 6);
  const rnd = crypto.randomBytes(3).toString('hex');
  const id = `007-${sym}-${stratHash}-${rnd}`;
  return id.length <= 48 ? id : id.slice(0, 48);
}

function sanitizeRiskProfile(raw) {
  const d = defaultRiskProfile();
  const r = raw && typeof raw === 'object' ? raw : {};
  const x = { ...d, ...r };
  x.useBracketOrders =
    r.useBracketOrders === false || String(r.useBracketOrders).toLowerCase() === 'false' ? false : true;
  x.useAutoQty = r.useAutoQty === true || String(r.useAutoQty).toLowerCase() === 'true';
  x.stopLossPct = Math.min(50, Math.max(0.05, parseFloat(x.stopLossPct) || d.stopLossPct));
  x.takeProfitPct = Math.min(100, Math.max(0.05, parseFloat(x.takeProfitPct) || d.takeProfitPct));
  x.maxAccountRiskPct = Math.min(25, Math.max(0.01, parseFloat(x.maxAccountRiskPct) || d.maxAccountRiskPct));
  return x;
}

function fmtPrice(n) {
  const x = Math.round(parseFloat(n) * 100) / 100;
  return x.toFixed(2);
}

async function alpacaFetchAccountJson() {
  const r = await fetchFn(`${alpacaBaseUrl()}/v2/account`, { headers: alpacaHeaders() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || `Alpaca account HTTP ${r.status}`);
  return j;
}

async function alpacaFetchDailyBars(symbol, lookbackDays) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - Math.max(lookbackDays + 20, 90));
  const sym = encodeURIComponent(String(symbol || '').toUpperCase());
  const url = `https://data.alpaca.markets/v2/stocks/${sym}/bars?timeframe=1Day&feed=${encodeURIComponent(
    alpacaDataFeed()
  )}&start=${encodeURIComponent(
    start.toISOString()
  )}&end=${encodeURIComponent(end.toISOString())}&limit=${Math.max(lookbackDays + 20, 90)}&sort=asc`;
  const r = await fetchFn(url, { headers: alpacaHeaders() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || `Daily bars failed for ${symbol}`);
  return Array.isArray(j.bars) ? j.bars : [];
}

function sma(vals, period) {
  if (!Array.isArray(vals) || vals.length < period || period <= 0) return null;
  const slice = vals.slice(vals.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function std(vals) {
  if (!Array.isArray(vals) || vals.length < 2) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const varSum = vals.reduce((a, b) => a + (b - mean) ** 2, 0);
  return Math.sqrt(varSum / (vals.length - 1));
}

function pctChange(a, b) {
  if (!(a > 0) || !(b > 0)) return null;
  return (b - a) / a;
}

function maxDrawdown(vals) {
  if (!Array.isArray(vals) || vals.length < 2) return 0;
  let peak = vals[0];
  let mdd = 0;
  for (const v of vals) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? (peak - v) / peak : 0;
    if (dd > mdd) mdd = dd;
  }
  return mdd;
}

function classifyMarketType(metrics) {
  const { close, sma50v, sma200v, ret20, ret60, vol20, dd60, breadth50 } = metrics;
  if (close < sma200v && ret60 < -0.05 && dd60 > 0.08) {
    return { type: 'Bear', reason: 'Price is below 200DMA with weak 60-day trend and drawdown pressure.' };
  }
  if (vol20 >= 0.32 || dd60 > 0.12) {
    return { type: 'Volatile', reason: 'Realized volatility/drawdown risk is elevated.' };
  }
  if (close > sma200v && sma50v > sma200v && ret20 > 0.01 && breadth50 >= 0.75) {
    return { type: 'Bull', reason: 'Trend and breadth are supportive across major indices.' };
  }
  if (Math.abs(ret20) < 0.015 && vol20 < 0.18) {
    return { type: 'Slow', reason: 'Low-volatility, low-momentum grind with limited directional edge.' };
  }
  return { type: 'Range', reason: 'Mixed conditions; no strong trend regime detected.' };
}

async function analyzeMarketConditions() {
  const spyBars = await alpacaFetchDailyBars('SPY', 260);
  if (spyBars.length < 210) throw new Error('Not enough SPY history to classify market regime.');
  const closes = spyBars.map((b) => parseFloat(b.c)).filter((n) => Number.isFinite(n));
  const close = closes[closes.length - 1];
  const sma50v = sma(closes, 50);
  const sma200v = sma(closes, 200);
  const ret20 = pctChange(closes[closes.length - 21], close);
  const ret60 = pctChange(closes[closes.length - 61], close);
  const rtn20 = closes
    .slice(-21)
    .map((c, i, arr) => (i === 0 ? null : pctChange(arr[i - 1], c)))
    .filter((x) => x != null);
  const vol20 = std(rtn20) * Math.sqrt(252);
  const dd60 = maxDrawdown(closes.slice(-60));

  const breadthSymbols = ['SPY', 'QQQ', 'IWM', 'DIA'];
  const breadthRows = await Promise.all(
    breadthSymbols.map(async (sym) => {
      const bars = await alpacaFetchDailyBars(sym, 120);
      const cs = bars.map((x) => parseFloat(x.c)).filter((n) => Number.isFinite(n));
      return { symbol: sym, close: cs[cs.length - 1], sma50: sma(cs, 50) };
    })
  );
  const breadthAbove = breadthRows.filter((r) => r.close > r.sma50).length;
  const breadth50 = breadthRows.length ? breadthAbove / breadthRows.length : 0;

  const cls = classifyMarketType({ close, sma50v, sma200v, ret20, ret60, vol20, dd60, breadth50 });
  const riskByType = { Bull: 1.0, Range: 0.8, Slow: 0.7, Volatile: 0.55, Bear: 0.45 };
  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    marketType: cls.type,
    reason: cls.reason,
    suggestedRiskMultiplier: riskByType[cls.type] || 0.7,
    metrics: {
      spyClose: close,
      sma50: sma50v,
      sma200: sma200v,
      return20dPct: ret20 != null ? ret20 * 100 : null,
      return60dPct: ret60 != null ? ret60 * 100 : null,
      realizedVol20dPct: vol20 * 100,
      maxDrawdown60dPct: dd60 * 100,
      breadthAbove50dPct: breadth50 * 100
    },
    breadth: breadthRows
  };
}

/**
 * Mid-quote or last trade from Alpaca Data API (same keys as trading; requires data access).
 */
async function alpacaLatestEntryEstimate(symbol) {
  const sym = encodeURIComponent(String(symbol || '').toUpperCase());
  const h = alpacaHeaders();
  const qUrl = `https://data.alpaca.markets/v2/stocks/${sym}/quotes/latest?feed=${encodeURIComponent(
    alpacaDataFeed()
  )}`;
  const rq = await fetchFn(qUrl, { headers: h });
  const jq = await rq.json().catch(() => ({}));
  if (rq.ok && jq && jq.quote) {
    const q = jq.quote;
    const ap = parseFloat(q.ap);
    const bp = parseFloat(q.bp);
    if (ap > 0 && bp > 0) return (ap + bp) / 2;
    if (ap > 0) return ap;
    if (bp > 0) return bp;
  }
  const tUrl = `https://data.alpaca.markets/v2/stocks/${sym}/trades/latest?feed=${encodeURIComponent(
    alpacaDataFeed()
  )}`;
  const rt = await fetchFn(tUrl, { headers: h });
  const jt = await rt.json().catch(() => ({}));
  if (rt.ok && jt && jt.trade) {
    const p = parseFloat(jt.trade.p);
    if (p > 0) return p;
  }
  const hint = jq.message || jq.error || jt.message || jt.error || '';
  throw new Error(
    `No live price for ${symbol}${hint ? `: ${hint}` : ''}. Check symbol, session, and Alpaca market data (data.alpaca.markets).`
  );
}

function bracketLegs(side, entry, rp) {
  const sl = rp.stopLossPct / 100;
  const tp = rp.takeProfitPct / 100;
  if (side === 'buy') {
    return {
      take_profit: { limit_price: fmtPrice(entry * (1 + tp)) },
      stop_loss: { stop_price: fmtPrice(entry * (1 - sl)) }
    };
  }
  return {
    take_profit: { limit_price: fmtPrice(entry * (1 - tp)) },
    stop_loss: { stop_price: fmtPrice(entry * (1 + sl)) }
  };
}

function qtyFromAccountRisk(equity, maxRiskPct, entry, stopLossPct) {
  const sl = stopLossPct / 100;
  const riskDollars = Math.max(0, parseFloat(equity) || 0) * (maxRiskPct / 100);
  const perShare = entry * sl;
  if (perShare <= 0 || riskDollars <= 0) return 1;
  const q = Math.floor(riskDollars / perShare);
  return Math.min(100000, Math.max(1, q));
}

const VALID_STRATEGY_IDS = new Set(BUILTIN_STRATEGIES.map((s) => s.id));

function normalizeActiveStrategyIds(input) {
  const arr = Array.isArray(input) ? input : [];
  const out = [];
  for (const x of arr) {
    const id = String(x || '').trim();
    if (VALID_STRATEGY_IDS.has(id) && !out.includes(id)) out.push(id);
    if (out.length >= 6) break;
  }
  if (out.length === 0) out.push('momentum-breakout');
  return out;
}

function trade007OrderDeps() {
  return {
    readState,
    writeState,
    fetchFn,
    alpacaBaseUrl,
    alpacaHeaders,
    alpacaConfigured,
    alpacaIsPaper,
    alpacaKeyIdSuffix,
    sanitizeRiskProfile,
    VALID_STRATEGY_IDS,
    BUILTIN_STRATEGIES,
    buildAlpacaClientOrderId,
    fmtPrice,
    bracketLegs,
    qtyFromAccountRisk,
    alpacaLatestEntryEstimate,
    alpacaFetchAccountJson,
    trade007DebugVerbose
  };
}

async function executeTrade007Order(opts) {
  return submitTrade007Order(trade007OrderDeps(), opts);
}

function trade007NoIndexHeaders(res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.setHeader('Cache-Control', 'private, no-store');
}

function trade007NoIndexMiddleware(req, res, next) {
  trade007NoIndexHeaders(res);
  next();
}

function trade007AuthRequired() {
  const v = String(process.env.TRADE007_AUTH_REQUIRED || 'true').toLowerCase();
  return !(v === '0' || v === 'false' || v === 'off' || v === 'no');
}

function requireTrade007Auth(req, res, next) {
  if (!trade007AuthRequired()) return next();
  const user = String(process.env.TRADE007_AUTH_USER || '').trim();
  const pass = String(process.env.TRADE007_AUTH_PASS || '').trim();
  if (!user || !pass) {
    return res.status(503).json({ error: 'Trade auth not configured on server.' });
  }
  const header = String(req.get('authorization') || '');
  if (!header.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="007Trade"');
    return res.status(401).send('Authentication required');
  }
  let decoded = '';
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    res.setHeader('WWW-Authenticate', 'Basic realm="007Trade"');
    return res.status(401).send('Authentication required');
  }
  const idx = decoded.indexOf(':');
  const gotUser = idx >= 0 ? decoded.slice(0, idx) : '';
  const gotPass = idx >= 0 ? decoded.slice(idx + 1) : '';
  if (gotUser !== user || gotPass !== pass) {
    res.setHeader('WWW-Authenticate', 'Basic realm="007Trade"');
    return res.status(401).send('Authentication required');
  }
  next();
}

async function callClaudeTradeBrief({ symbols, strategyIds, strategyId, mode, paperContext }) {
  const key = String(process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured on the server.');
  let ids = Array.isArray(strategyIds) && strategyIds.length ? strategyIds : [];
  if (!ids.length && strategyId) ids = [strategyId];
  if (!ids.length) ids = ['momentum-breakout'];
  ids = normalizeActiveStrategyIds(ids);
  const strats = ids.map((id) => BUILTIN_STRATEGIES.find((s) => s.id === id)).filter(Boolean);
  const sys =
    'You help operators think through day-trade plans. Output concise bullets: risks, levels to watch, position-sizing mindset. Never promise returns. Not personalized financial advice.';
  const modeLabel = mode === 'live' ? 'live Alpaca' : 'paper (Alpaca paper / practice)';
  const stratBlock = strats
    .map((s) => `• ${s.name} (${s.style}): ${s.summary}`)
    .join('\n');
  let user = `Mode: ${modeLabel}.\nActive strategies (${strats.length}):\n${stratBlock}\n\nSymbols: ${symbols.join(', ')}\nGive one consolidated pre-market-style checklist (max 14 bullet lines) that respects how these playbooks differ; note where they conflict.`;
  const ctx = String(paperContext || '').trim();
  if (ctx) {
    user += `\n\nOperator context (from saved dashboard notes — factor into the checklist where relevant):\n${ctx.slice(0, 6000)}`;
  }
  const r = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.TRADE007_ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      max_tokens: 1200,
      messages: [{ role: 'user', content: user }],
      system: sys
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Anthropic error (${r.status})`);
  return (j.content || []).map((c) => c.text || '').join('').trim();
}

function registerTrade007Routes(app) {
  app.use(['/007trade', '/api/007trade'], trade007NoIndexMiddleware, requireTrade007Auth);

  app.get('/007trade', (req, res) => {
    const p = path.join(__dirname, '..', 'public', '007trade-dashboard.html');
    if (fs.existsSync(p)) return res.sendFile(p);
    return res.status(404).send('Not found');
  });

  app.get('/007trade/trade', (req, res) => {
    const p = path.join(__dirname, '..', 'public', '007trade.html');
    if (fs.existsSync(p)) return res.sendFile(p);
    return res.status(404).send('Not found');
  });

  app.get('/007trade/settings', (req, res) => {
    const p = path.join(__dirname, '..', 'public', '007trade-settings.html');
    if (fs.existsSync(p)) return res.sendFile(p);
    return res.status(404).send('Not found');
  });

  app.get('/007trade/dashboard', (req, res) => {
    const p = path.join(__dirname, '..', 'public', '007trade-dashboard.html');
    if (fs.existsSync(p)) return res.sendFile(p);
    return res.status(404).send('Not found');
  });

  app.get('/007trade/copytrader', (req, res) => {
    const p = path.join(__dirname, '..', 'public', '007trade-copytrader.html');
    if (fs.existsSync(p)) return res.sendFile(p);
    return res.status(404).send('Not found');
  });

  app.get('/007trade/market-conditions', (req, res) => {
    const p = path.join(__dirname, '..', 'public', '007trade-market-conditions.html');
    if (fs.existsSync(p)) return res.sendFile(p);
    return res.status(404).send('Not found');
  });

  app.get('/007trade/simple-trade', (req, res) => {
    const p = path.join(__dirname, '..', 'public', '007trade-simple-trade.html');
    if (fs.existsSync(p)) return res.sendFile(p);
    return res.status(404).send('Not found');
  });

  app.get('/007trade/auto-trade', (req, res) => {
    const p = path.join(__dirname, '..', 'public', '007trade.html');
    if (fs.existsSync(p)) return res.sendFile(p);
    return res.status(404).send('Not found');
  });

  app.get('/007trade/circuit-breaker', (req, res) => {
    const p = path.join(__dirname, '..', 'public', '007trade-circuit-breaker.html');
    if (fs.existsSync(p)) return res.sendFile(p);
    return res.status(404).send('Not found');
  });

  app.get('/api/007trade/alpaca-dashboard', async (req, res) => {
    if (!alpacaConfigured()) {
      return res.status(400).json({
        ok: false,
        configured: false,
        error: 'Alpaca keys not configured on server.'
      });
    }
    const base = alpacaBaseUrl();
    const h = alpacaHeaders();
    try {
      const [acctR, posR, ordR] = await Promise.all([
        fetchFn(`${base}/v2/account`, { headers: h }),
        fetchFn(`${base}/v2/positions`, { headers: h }),
        fetchFn(`${base}/v2/orders?status=open&nested=true&limit=100`, { headers: h })
      ]);
      const acct = await acctR.json().catch(() => ({}));
      const positionsJson = await posR.json().catch(() => []);
      const ordersJson = await ordR.json().catch(() => []);

      if (!acctR.ok) {
        return res.status(502).json({
          ok: false,
          configured: true,
          broker: { baseUrl: base, paper: alpacaIsPaper() },
          error: acct.message || acct.error || `Alpaca account ${acctR.status}`
        });
      }

      const posList = Array.isArray(positionsJson) ? positionsJson : [];
      const ordList = Array.isArray(ordersJson) ? ordersJson : [];

      let unrealizedSum = 0;
      for (const p of posList) {
        unrealizedSum += parseFloat(p.unrealized_pl) || 0;
      }
      const equity = parseFloat(acct.equity) || 0;
      const lastEquity = parseFloat(acct.last_equity) || 0;
      const dayPl = lastEquity > 0 ? equity - lastEquity : null;
      const dayPlPct = lastEquity > 0 ? dayPl / lastEquity : null;

      res.json({
        ok: true,
        configured: true,
        broker: { baseUrl: base, paper: alpacaIsPaper(), keyIdSuffix: alpacaKeyIdSuffix() },
        fetchedAt: new Date().toISOString(),
        account: {
          account_number: acct.account_number,
          status: acct.status,
          currency: acct.currency,
          equity: acct.equity,
          cash: acct.cash,
          portfolio_value: acct.portfolio_value,
          buying_power: acct.buying_power,
          day_trading_buying_power: acct.daytrading_buying_power,
          pattern_day_trader: acct.pattern_day_trader
        },
        positions: posList,
        openOrders: ordList,
        summary: {
          positionCount: posList.length,
          openOrderCount: ordList.length,
          unrealizedPlTotal: unrealizedSum,
          dayPl,
          dayPlPct
        }
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        configured: true,
        error: e.message || 'Alpaca dashboard fetch failed'
      });
    }
  });

  app.get('/api/007trade/strategies', (req, res) => {
    res.json({ ok: true, strategies: BUILTIN_STRATEGIES });
  });

  app.get('/api/007trade/state', (req, res) => {
    const st = readState();
    const ids = normalizeActiveStrategyIds(st.activeStrategyIds || [st.selectedStrategyId]);
    res.json({
      ok: true,
      mode: st.mode,
      selectedStrategyId: st.selectedStrategyId,
      activeStrategyIds: ids,
      watchlist: st.watchlist,
      tradePlans: st.tradePlans,
      paperContext: st.paperContext || '',
      riskProfile: sanitizeRiskProfile(st.riskProfile || {}),
      copyTrader: st.copyTrader || {},
      simOrders: st.simOrders.slice(-50),
      simCash: st.simCash,
      simPositions: st.simPositions || {},
      brokerEnvAcknowledged: st.brokerEnvAcknowledged,
      alpacaEnvPresent: alpacaConfigured(),
      /** True when server env points at Alpaca paper API (ALPACA_PAPER not false) */
      alpacaIsPaper: alpacaConfigured() ? alpacaIsPaper() : true,
      trade007Path: trade007StatePath()
    });
  });

  app.post('/api/007trade/state', (req, res) => {
    try {
      const st = readState();
      const body = req.body || {};
      if (body.mode === 'paper' || body.mode === 'sim' || body.mode === 'live') {
        st.mode = body.mode === 'live' ? 'live' : 'paper';
      }
      if (typeof body.paperContext === 'string') st.paperContext = body.paperContext.slice(0, 8000);
      if (body.riskProfile && typeof body.riskProfile === 'object') {
        st.riskProfile = sanitizeRiskProfile({ ...st.riskProfile, ...body.riskProfile });
      }
      if (Array.isArray(body.activeStrategyIds)) {
        st.activeStrategyIds = normalizeActiveStrategyIds(body.activeStrategyIds);
      }
      if (typeof body.selectedStrategyId === 'string' && body.selectedStrategyId.trim()) {
        const id = body.selectedStrategyId.trim();
        if (VALID_STRATEGY_IDS.has(id)) st.selectedStrategyId = id;
      }
      if (!Array.isArray(st.activeStrategyIds) || st.activeStrategyIds.length === 0) {
        st.activeStrategyIds = normalizeActiveStrategyIds([st.selectedStrategyId]);
      } else {
        st.activeStrategyIds = normalizeActiveStrategyIds(st.activeStrategyIds);
      }
      if (!st.activeStrategyIds.includes(st.selectedStrategyId)) {
        st.selectedStrategyId = st.activeStrategyIds[0];
      }
      if (Array.isArray(body.watchlist))
        st.watchlist = body.watchlist.map((x) => String(x || '').trim().toUpperCase()).filter(Boolean).slice(0, 40);
      if (typeof body.brokerEnvAcknowledged === 'boolean') st.brokerEnvAcknowledged = body.brokerEnvAcknowledged;
      if (body.copyTrader && typeof body.copyTrader === 'object') {
        const cur = st.copyTrader && typeof st.copyTrader === 'object' ? st.copyTrader : {};
        st.copyTrader = { ...cur, ...body.copyTrader };
        st.copyTrader.enabled = st.copyTrader.enabled === true;
        st.copyTrader.mode =
          st.copyTrader.mode === 'semi_auto' || st.copyTrader.mode === 'shadow' ? st.copyTrader.mode : 'shadow';
        st.copyTrader.maxAllocationPct = Math.min(100, Math.max(1, parseFloat(st.copyTrader.maxAllocationPct) || 20));
        st.copyTrader.minTrackRecordMonths = Math.min(
          60,
          Math.max(3, parseInt(st.copyTrader.minTrackRecordMonths, 10) || 12)
        );
        st.copyTrader.maxDrawdownPct = Math.min(60, Math.max(2, parseFloat(st.copyTrader.maxDrawdownPct) || 12));
        st.copyTrader.minSharpe = Math.min(5, Math.max(0.2, parseFloat(st.copyTrader.minSharpe) || 1.2));
        st.copyTrader.notes = String(st.copyTrader.notes || '').slice(0, 4000);
      }
      writeState(st);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Save failed' });
    }
  });

  app.post('/api/007trade/plan', (req, res) => {
    try {
      const st = readState();
      const symbol = String(req.body?.symbol || '').trim().toUpperCase();
      const fallback =
        (Array.isArray(st.activeStrategyIds) && st.activeStrategyIds[0]) || st.selectedStrategyId || '';
      const strategyId = String(req.body?.strategyId || fallback || '').trim();
      if (!symbol) return res.status(400).json({ error: 'symbol required' });
      const plan = {
        id: crypto.randomUUID(),
        symbol,
        strategyId,
        status: 'queued',
        createdAt: new Date().toISOString(),
        notes: String(req.body?.notes || '').slice(0, 500)
      };
      st.tradePlans.unshift(plan);
      st.tradePlans = st.tradePlans.slice(0, 100);
      writeState(st);
      res.json({ ok: true, plan });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Failed' });
    }
  });

  app.delete('/api/007trade/plan/:id', (req, res) => {
    const st = readState();
    st.tradePlans = st.tradePlans.filter((p) => p.id !== req.params.id);
    writeState(st);
    res.json({ ok: true });
  });

  app.post('/api/007trade/claude-brief', async (req, res) => {
    try {
      const st = readState();
      const symbols = Array.isArray(req.body?.symbols) ? req.body.symbols : st.watchlist;
      const ids =
        Array.isArray(req.body?.strategyIds) && req.body.strategyIds.length > 0
          ? normalizeActiveStrategyIds(req.body.strategyIds)
          : normalizeActiveStrategyIds(st.activeStrategyIds || [st.selectedStrategyId]);
      const mode = st.mode;
      const text = await callClaudeTradeBrief({
        symbols: symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean).slice(0, 20),
        strategyIds: ids,
        mode,
        paperContext: st.paperContext
      });
      res.json({ ok: true, text });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Claude request failed' });
    }
  });

  app.get('/api/007trade/report', (req, res) => {
    const st = readState();
    const journal = Array.isArray(st.tradeJournal) ? st.tradeJournal : [];
    const byStrategy = {};
    for (const row of journal) {
      const id = String(row.strategyId || 'unknown');
      if (!byStrategy[id]) {
        byStrategy[id] = {
          strategyId: id,
          strategyName: BUILTIN_STRATEGIES.find((s) => s.id === id)?.name || id,
          ordersPlaced: 0,
          symbols: new Set(),
          lastAt: null
        };
      }
      byStrategy[id].ordersPlaced += 1;
      if (row.symbol) byStrategy[id].symbols.add(row.symbol);
      const t = row.ts;
      if (t && (!byStrategy[id].lastAt || t > byStrategy[id].lastAt)) byStrategy[id].lastAt = t;
    }
    const summary = Object.values(byStrategy).map((x) => ({
      strategyId: x.strategyId,
      strategyName: x.strategyName,
      ordersPlaced: x.ordersPlaced,
      uniqueSymbols: x.symbols.size,
      symbols: [...x.symbols].slice(0, 24),
      lastAt: x.lastAt
    }));
    res.json({
      ok: true,
      disclaimer:
        'These counts reflect orders submitted through 007Trade only. Realized P&L and full lifecycle are in Alpaca; linking fills to strategies can be extended via Activity API.',
      totals: {
        ordersInJournal: journal.length,
        strategiesTagged: summary.length
      },
      byStrategy: summary.sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || '')),
      recent: journal.slice(0, 50)
    });
  });

  app.get('/api/007trade/broker-status', (req, res) => {
    res.json({
      ok: true,
      alpaca: alpacaConfigured(),
      baseUrl: alpacaConfigured() ? alpacaBaseUrl() : null,
      hint: alpacaConfigured()
        ? 'Alpaca env detected. Live/paper orders use ALPACA_PAPER (default true for paper).'
        : 'Set ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY on the server to enable broker API.'
    });
  });

  app.get('/api/007trade/alpaca-ping', async (req, res) => {
    if (!alpacaConfigured()) {
      return res.status(400).json({
        ok: false,
        error: 'Alpaca keys not configured on server.'
      });
    }
    try {
      const base = alpacaBaseUrl();
      const r = await fetchFn(`${base}/v2/account`, { headers: alpacaHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        return res.status(502).json({
          ok: false,
          baseUrl: base,
          error: j.message || j.error || `Alpaca HTTP ${r.status}`
        });
      }
      return res.json({
        ok: true,
        baseUrl: base,
        account: {
          id: j.id,
          status: j.status,
          currency: j.currency,
          equity: j.equity,
          cash: j.cash,
          account_number: j.account_number
        }
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || 'Alpaca ping failed' });
    }
  });

  app.get('/api/007trade/market-conditions', async (req, res) => {
    if (!alpacaConfigured()) {
      return res.status(400).json({ ok: false, configured: false, error: 'Alpaca keys not configured.' });
    }
    try {
      return res.json(await analyzeMarketConditions());
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || 'Market condition analysis failed' });
    }
  });

  app.post('/api/007trade/alpaca-order', async (req, res) => {
    const brokerMeta = { baseUrl: alpacaBaseUrl(), paper: alpacaIsPaper(), keyIdSuffix: alpacaKeyIdSuffix() };
    const result = await executeTrade007Order({ ...req.body, source: 'manual' });
    if (result.ok) {
      return res.json(result);
    }
    return res.status(result.status || 500).json({
      ok: false,
      error: result.error,
      broker: result.broker || brokerMeta,
      alpaca: result.alpaca,
      executionPlan: result.executionPlan
    });
  });

  app.get('/007trade/automation', (req, res) => {
    return res.redirect('/007trade/auto-trade');
  });

  app.get('/api/007trade/automation', (req, res) => {
    const st = readState();
    const auto = st.automation && typeof st.automation === 'object' ? st.automation : {};
    res.json({
      ok: true,
      automation: {
        masterEnabled: Boolean(auto.masterEnabled),
        allowLiveAutomation: Boolean(auto.allowLiveAutomation),
        pollIntervalSec: Math.min(300, Math.max(30, parseInt(auto.pollIntervalSec, 10) || 60)),
        dryRun: Boolean(auto.dryRun),
        maxDailyLossUsd: Math.max(0, parseFloat(auto.maxDailyLossUsd) || 0),
        maxConcurrentPositions: Math.min(100, Math.max(0, parseInt(auto.maxConcurrentPositions, 10) || 0)),
        marketConditionSizingEnabled: Boolean(auto.marketConditionSizingEnabled),
        marketConditionRiskFloor: Math.min(1.5, Math.max(0.1, parseFloat(auto.marketConditionRiskFloor) || 0.35)),
        marketConditionRiskCeiling: Math.min(2, Math.max(0.2, parseFloat(auto.marketConditionRiskCeiling) || 1.1)),
        maxTotalExposureUsd: Math.max(0, parseFloat(auto.maxTotalExposureUsd) || 0),
        maxPerSymbolExposureUsd: Math.max(0, parseFloat(auto.maxPerSymbolExposureUsd) || 0),
        maxAutoEntriesPerDay: Math.max(0, parseInt(auto.maxAutoEntriesPerDay, 10) || 0),
        lastMarketType: auto.lastMarketType || null,
        lastMarketMultiplier:
          auto.lastMarketMultiplier != null ? Number(auto.lastMarketMultiplier) : 1,
        daily: {
          etDate: auto.daily && auto.daily.etDate ? auto.daily.etDate : null,
          halted: Boolean(auto.daily && auto.daily.halted),
          autoEntriesCount: Math.max(
            0,
            parseInt(auto.daily && auto.daily.autoEntriesCount, 10) || 0
          ),
          startEquity:
            auto.daily && auto.daily.startEquity != null ? Number(auto.daily.startEquity) : null
        },
        rules: Array.isArray(auto.rules) ? auto.rules : [],
        log: Array.isArray(auto.log) ? auto.log.slice(0, 80) : [],
        lastTickAt: auto.lastTickAt || null
      }
    });
  });

  app.post('/api/007trade/automation', (req, res) => {
    try {
      const st = readState();
      const body = req.body || {};
      if (!st.automation || typeof st.automation !== 'object') st.automation = defaultAutomationState();
      const a = st.automation;
      if (typeof body.masterEnabled === 'boolean') a.masterEnabled = body.masterEnabled;
      if (typeof body.allowLiveAutomation === 'boolean') a.allowLiveAutomation = body.allowLiveAutomation;
      if (body.pollIntervalSec != null) {
        a.pollIntervalSec = Math.min(300, Math.max(30, parseInt(body.pollIntervalSec, 10) || 60));
      }
      if (typeof body.dryRun === 'boolean') a.dryRun = body.dryRun;
      if (body.maxDailyLossUsd != null) {
        a.maxDailyLossUsd = Math.max(0, parseFloat(body.maxDailyLossUsd) || 0);
      }
      if (body.maxConcurrentPositions != null) {
        a.maxConcurrentPositions = Math.min(100, Math.max(0, parseInt(body.maxConcurrentPositions, 10) || 0));
      }
      if (typeof body.marketConditionSizingEnabled === 'boolean') {
        a.marketConditionSizingEnabled = body.marketConditionSizingEnabled;
      }
      if (body.marketConditionRiskFloor != null) {
        a.marketConditionRiskFloor = Math.min(1.5, Math.max(0.1, parseFloat(body.marketConditionRiskFloor) || 0.35));
      }
      if (body.marketConditionRiskCeiling != null) {
        a.marketConditionRiskCeiling = Math.min(2, Math.max(0.2, parseFloat(body.marketConditionRiskCeiling) || 1.1));
      }
      if (body.maxTotalExposureUsd != null) {
        a.maxTotalExposureUsd = Math.max(0, parseFloat(body.maxTotalExposureUsd) || 0);
      }
      if (body.maxPerSymbolExposureUsd != null) {
        a.maxPerSymbolExposureUsd = Math.max(0, parseFloat(body.maxPerSymbolExposureUsd) || 0);
      }
      if (body.maxAutoEntriesPerDay != null) {
        a.maxAutoEntriesPerDay = Math.max(0, parseInt(body.maxAutoEntriesPerDay, 10) || 0);
      }
      if (Array.isArray(body.rules)) {
        a.rules = sanitizeAutomationRules(body.rules);
      }
      writeState(st);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Save failed' });
    }
  });

  const { startTrade007Automation } = require('./trade007Automation');
  startTrade007Automation({
    executeTrade007Order,
    readState,
    writeState,
    fetchFn,
    alpacaBaseUrl,
    alpacaHeaders,
    alpacaConfigured,
    alpacaIsPaper,
    analyzeMarketConditions,
    appendAutomationLog,
    defaultAutomationState
  });
}

function sanitizeAutomationRules(rules) {
  const out = [];
  const seen = new Set();
  for (const r of rules) {
    if (!r || typeof r !== 'object') continue;
    const id = String(r.id || '').trim() || require('crypto').randomUUID();
    if (seen.has(id)) continue;
    seen.add(id);
    const strategyId = String(r.strategyId || '').trim();
    if (!VALID_STRATEGY_IDS.has(strategyId)) continue;
    const symbols = Array.isArray(r.symbols)
      ? [...new Set(r.symbols.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))].slice(0, 12)
      : [];
    if (!symbols.length) continue;
    const orbDirRaw = String(r.orbDirection || 'long').toLowerCase();
    const orbDirection = ['long', 'short', 'both'].includes(orbDirRaw) ? orbDirRaw : 'long';
    out.push({
      id,
      enabled: r.enabled !== false,
      strategyId,
      symbols,
      orbMinutes: Math.min(120, Math.max(5, parseInt(r.orbMinutes, 10) || 30)),
      maxTradesPerSymbolPerDay: Math.min(20, Math.max(1, parseInt(r.maxTradesPerSymbolPerDay, 10) || 1)),
      minMinutesBetweenEntries: Math.min(240, Math.max(1, parseInt(r.minMinutesBetweenEntries, 10) || 5)),
      orbDirection,
      exitOutsideOrb: r.exitOutsideOrb === true,
      flattenBeforeCloseMin: Math.min(180, Math.max(0, parseInt(r.flattenBeforeCloseMin, 10) || 0)),
      minBreakoutPct: Math.min(2, Math.max(0, parseFloat(r.minBreakoutPct) || 0)),
      fadeFromOpenPct: Math.min(5, Math.max(0.05, parseFloat(r.fadeFromOpenPct) || 0.5)),
      fadeMinMinutesAfterOpen: Math.min(180, Math.max(0, parseInt(r.fadeMinMinutesAfterOpen, 10) || 15)),
      counters: typeof r.counters === 'object' && r.counters ? r.counters : {},
      lastEntryAt: typeof r.lastEntryAt === 'object' && r.lastEntryAt ? r.lastEntryAt : {}
    });
    if (out.length >= 12) break;
  }
  return out;
}

function appendAutomationLog(st, level, message, ruleId) {
  if (!st.automation) st.automation = defaultAutomationState();
  if (!Array.isArray(st.automation.log)) st.automation.log = [];
  st.automation.log.unshift({
    ts: new Date().toISOString(),
    level: level || 'info',
    message: String(message || '').slice(0, 500),
    ruleId: ruleId || undefined
  });
  st.automation.log = st.automation.log.slice(0, 150);
}

module.exports = {
  registerTrade007Routes,
  BUILTIN_STRATEGIES
};
