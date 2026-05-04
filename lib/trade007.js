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
const { readState, writeState, trade007StatePath, defaultRiskProfile } = require('./trade007Store');

const fetchFn =
  global.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

const BUILTIN_STRATEGIES = [
  {
    id: 'momentum-breakout',
    name: 'Momentum breakout',
    summary: 'Focus on volume-backed breaks above prior-day high; tight stops.',
    style: 'Day-trader classic'
  },
  {
    id: 'mean-reversion',
    name: 'Mean reversion',
    summary: 'Fade extended moves into VWAP / bands on liquid names.',
    style: 'Short-term statistical'
  },
  {
    id: 'opening-range',
    name: 'Opening range breakout',
    summary: 'Trade the first 15–30m range expansion with defined risk.',
    style: 'ORB playbook'
  },
  {
    id: 'news-catalyst',
    name: 'News & catalyst',
    summary: 'Prioritize symbols with scheduled news; reduce size into headlines.',
    style: 'Event-driven'
  },
  {
    id: 'conservative-swing',
    name: 'Conservative (legacy investor style)',
    summary: 'Smaller size, wider stops, fewer trades — capital preservation first.',
    style: 'Risk-first'
  },
  {
    id: 'quant-lite',
    name: 'Quant-lite factors',
    summary: 'Rank by simple factors (liquidity, volatility regime); rotate weekly.',
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

/**
 * Mid-quote or last trade from Alpaca Data API (same keys as trading; requires data access).
 */
async function alpacaLatestEntryEstimate(symbol) {
  const sym = encodeURIComponent(String(symbol || '').toUpperCase());
  const h = alpacaHeaders();
  const qUrl = `https://data.alpaca.markets/v2/stocks/${sym}/quotes/latest`;
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
  const tUrl = `https://data.alpaca.markets/v2/stocks/${sym}/trades/latest`;
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
          unrealizedPlTotal: unrealizedSum
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

  app.post('/api/007trade/alpaca-order', async (req, res) => {
    const base = alpacaBaseUrl();
    const paper = alpacaIsPaper();
    const brokerMeta = { baseUrl: base, paper, keyIdSuffix: alpacaKeyIdSuffix() };

    try {
      if (!alpacaConfigured()) {
        console.warn('[007Trade] alpaca-order blocked: no Alpaca env keys');
        return res.status(400).json({
          error: 'Alpaca keys not configured. Add ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY to the server environment.'
        });
      }

      const st = readState();
      const rp = sanitizeRiskProfile(st.riskProfile || {});
      const body = req.body || {};

      const symbol = String(body.symbol || '').trim().toUpperCase();
      const side = String(body.side || 'buy').toLowerCase();
      if (side !== 'buy' && side !== 'sell') {
        return res.status(400).json({ error: 'side must be buy or sell', broker: brokerMeta });
      }

      let strategyId = String(body.strategyId || '').trim();
      if (!VALID_STRATEGY_IDS.has(strategyId)) {
        strategyId = String(
          st.selectedStrategyId || (Array.isArray(st.activeStrategyIds) && st.activeStrategyIds[0]) || ''
        ).trim();
      }
      if (!VALID_STRATEGY_IDS.has(strategyId)) strategyId = 'momentum-breakout';
      const stratMeta = BUILTIN_STRATEGIES.find((s) => s.id === strategyId);
      const strategyName = stratMeta ? stratMeta.name : strategyId !== 'none' ? strategyId : null;

      if (!symbol) return res.status(400).json({ error: 'symbol required', broker: brokerMeta });

      const plainOnly =
        body.plainOnly === true ||
        String(body.plainOnly || '').toLowerCase() === 'true' ||
        String(body.plainOnly || '').toLowerCase() === '1';
      const useBracket =
        !plainOnly &&
        (body.useBracket !== false) &&
        rp.useBracketOrders &&
        !(String(body.useBracket || '').toLowerCase() === 'false');

      const useAutoQty =
        body.useAutoQty === false || String(body.useAutoQty || '').toLowerCase() === 'false'
          ? false
          : body.useAutoQty === true ||
            String(body.useAutoQty || '').toLowerCase() === 'true' ||
            rp.useAutoQty;

      let entryEstimate = null;
      let qtyNum = Math.max(1, parseInt(body.qty || '1', 10) || 1);

      if (useBracket || useAutoQty) {
        entryEstimate = await alpacaLatestEntryEstimate(symbol);
      }

      if (useAutoQty && entryEstimate != null) {
        const acct = await alpacaFetchAccountJson();
        const equity = parseFloat(acct.equity) || 0;
        qtyNum = qtyFromAccountRisk(equity, rp.maxAccountRiskPct, entryEstimate, rp.stopLossPct);
      }

      const qty = String(Math.min(100000, Math.max(1, qtyNum)));

      const clientOrderId = buildAlpacaClientOrderId(symbol, strategyId);
      let payload = {
        symbol,
        qty,
        side,
        type: 'market',
        time_in_force: 'day',
        client_order_id: clientOrderId
      };

      let executionPlan = {
        bracket: false,
        plainOnly,
        autoSized: useAutoQty,
        entryEstimate: entryEstimate != null ? fmtPrice(entryEstimate) : null,
        stopLossPct: rp.stopLossPct,
        takeProfitPct: rp.takeProfitPct,
        maxAccountRiskPct: rp.maxAccountRiskPct
      };

      if (useBracket) {
        if (entryEstimate == null) {
          try {
            entryEstimate = await alpacaLatestEntryEstimate(symbol);
          } catch (e) {
            return res.status(400).json({
              ok: false,
              error: e.message || 'Need a live quote for bracket orders.',
              broker: brokerMeta
            });
          }
        }
        payload.order_class = 'bracket';
        const legs = bracketLegs(side, entryEstimate, rp);
        payload.take_profit = legs.take_profit;
        payload.stop_loss = legs.stop_loss;
        executionPlan = {
          ...executionPlan,
          bracket: true,
          entryEstimate: fmtPrice(entryEstimate),
          takeProfitAt: legs.take_profit.limit_price,
          stopLossAt: legs.stop_loss.stop_price
        };
      }

      console.log('[007Trade] Alpaca POST /v2/orders', {
        ...brokerMeta,
        symbol,
        side,
        qty,
        strategyId,
        strategyName: strategyName || undefined,
        client_order_id: clientOrderId,
        useBracket,
        useAutoQty,
        payload
      });

      const r = await fetchFn(`${base}/v2/orders`, {
        method: 'POST',
        headers: alpacaHeaders(),
        body: JSON.stringify(payload)
      });
      const j = await r.json().catch(() => ({}));

      if (trade007DebugVerbose()) {
        console.log('[007Trade] Alpaca raw response', { httpStatus: r.status, body: j });
      }

      if (!r.ok) {
        const msg =
          j.message ||
          j.error ||
          (Array.isArray(j.errors) && j.errors.length ? JSON.stringify(j.errors) : null) ||
          `Alpaca HTTP ${r.status}`;
        console.error('[007Trade] Alpaca order rejected', {
          httpStatus: r.status,
          broker: brokerMeta,
          alpacaBody: j
        });
        const status = r.status >= 400 && r.status < 600 ? r.status : 502;
        return res.status(status).json({
          ok: false,
          error: msg,
          broker: brokerMeta,
          alpaca: j,
          executionPlan
        });
      }

      console.log('[007Trade] Alpaca order accepted', {
        orderId: j.id,
        status: j.status,
        symbol: j.symbol,
        client_order_id: j.client_order_id || clientOrderId,
        strategyId,
        bracket: useBracket,
        broker: brokerMeta
      });

      try {
        const stJ = readState();
        if (!Array.isArray(stJ.tradeJournal)) stJ.tradeJournal = [];
        stJ.tradeJournal.unshift({
          ts: new Date().toISOString(),
          strategyId,
          strategyName: strategyName || strategyId,
          symbol,
          side,
          qty,
          alpacaOrderId: j.id,
          clientOrderId: j.client_order_id || clientOrderId,
          bracket: Boolean(useBracket),
          paper: alpacaIsPaper()
        });
        stJ.tradeJournal = stJ.tradeJournal.slice(0, 500);
        writeState(stJ);
      } catch (je) {
        console.warn('[007Trade] tradeJournal append failed', je.message);
      }

      res.json({
        ok: true,
        order: j,
        broker: brokerMeta,
        executionPlan,
        strategyTag: {
          strategyId,
          strategyName: strategyName || undefined,
          client_order_id: j.client_order_id || clientOrderId
        }
      });
    } catch (e) {
      const msg = e.message || String(e);
      console.error('[007Trade] alpaca-order exception', msg, e);
      res.status(500).json({ ok: false, error: msg || 'Broker order failed', broker: brokerMeta });
    }
  });
}

module.exports = {
  registerTrade007Routes,
  BUILTIN_STRATEGIES
};
