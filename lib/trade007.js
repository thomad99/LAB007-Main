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
const { readState, writeState, trade007StatePath } = require('./trade007Store');

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

async function callClaudeTradeBrief({ symbols, strategyId, mode, paperContext }) {
  const key = String(process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured on the server.');
  const strat = BUILTIN_STRATEGIES.find((s) => s.id === strategyId) || BUILTIN_STRATEGIES[0];
  const sys =
    'You help operators think through day-trade plans. Output concise bullets: risks, levels to watch, position-sizing mindset. Never promise returns. Not personalized financial advice.';
  const modeLabel = mode === 'live' ? 'live Alpaca' : 'paper (Alpaca paper / practice)';
  let user = `Mode: ${modeLabel}. Strategy: ${strat.name} — ${strat.summary}\nSymbols: ${symbols.join(', ')}\nGive a short pre-market style checklist (max 12 bullet lines).`;
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

  app.get('/api/007trade/strategies', (req, res) => {
    res.json({ ok: true, strategies: BUILTIN_STRATEGIES });
  });

  app.get('/api/007trade/state', (req, res) => {
    const st = readState();
    res.json({
      ok: true,
      mode: st.mode,
      selectedStrategyId: st.selectedStrategyId,
      watchlist: st.watchlist,
      tradePlans: st.tradePlans,
      paperContext: st.paperContext || '',
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
      if (typeof body.selectedStrategyId === 'string' && body.selectedStrategyId)
        st.selectedStrategyId = body.selectedStrategyId.trim();
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
      const strategyId = String(req.body?.strategyId || st.selectedStrategyId || '').trim();
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
      const strategyId = String(req.body?.strategyId || st.selectedStrategyId || '').trim();
      const mode = st.mode;
      const text = await callClaudeTradeBrief({
        symbols: symbols.map((s) => String(s).trim().toUpperCase()).filter(Boolean).slice(0, 20),
        strategyId,
        mode,
        paperContext: st.paperContext
      });
      res.json({ ok: true, text });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Claude request failed' });
    }
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
      const symbol = String(req.body?.symbol || '').trim().toUpperCase();
      const side = String(req.body?.side || 'buy').toLowerCase();
      const qty = String(Math.max(1, parseInt(req.body?.qty || '1', 10) || 1));
      if (!symbol) return res.status(400).json({ error: 'symbol required', broker: brokerMeta });

      const payload = { symbol, qty, side, type: 'market', time_in_force: 'day' };
      console.log('[007Trade] Alpaca POST /v2/orders', {
        ...brokerMeta,
        symbol,
        side,
        qty,
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
          alpaca: j
        });
      }

      console.log('[007Trade] Alpaca order accepted', {
        orderId: j.id,
        status: j.status,
        symbol: j.symbol,
        broker: brokerMeta
      });

      res.json({ ok: true, order: j, broker: brokerMeta });
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
