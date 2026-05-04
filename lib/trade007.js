/**
 * 007Trade — dashboard API (sim/live), strategies, Claude planning, optional Alpaca when env configured.
 * Secrets: use Render env — ALPACA_API_KEY_ID, ALPACA_API_SECRET_KEY (never stored in state.json).
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

function alpacaBaseUrl() {
  const paper = String(process.env.ALPACA_PAPER || 'true').toLowerCase();
  const usePaper = paper !== 'false' && paper !== '0' && paper !== 'no';
  return usePaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
}

function alpacaHeaders() {
  return {
    'APCA-API-KEY-ID': String(process.env.ALPACA_API_KEY_ID || '').trim(),
    'APCA-API-SECRET-KEY': String(process.env.ALPACA_API_SECRET_KEY || '').trim(),
    'Content-Type': 'application/json'
  };
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

async function callClaudeTradeBrief({ symbols, strategyId, mode }) {
  const key = String(process.env.ANTHROPIC_API_KEY || '').trim();
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured on the server.');
  const strat = BUILTIN_STRATEGIES.find((s) => s.id === strategyId) || BUILTIN_STRATEGIES[0];
  const sys =
    'You help operators think through day-trade plans. Output concise bullets: risks, levels to watch, position-sizing mindset. Never promise returns. Not personalized financial advice.';
  const user = `Mode: ${mode}. Strategy: ${strat.name} — ${strat.summary}\nSymbols: ${symbols.join(', ')}\nGive a short pre-market style checklist (max 12 bullet lines).`;
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
      simOrders: st.simOrders.slice(-50),
      simCash: st.simCash,
      simPositions: st.simPositions || {},
      brokerEnvAcknowledged: st.brokerEnvAcknowledged,
      alpacaEnvPresent: alpacaConfigured(),
      trade007Path: trade007StatePath()
    });
  });

  app.post('/api/007trade/state', (req, res) => {
    try {
      const st = readState();
      const body = req.body || {};
      if (body.mode === 'sim' || body.mode === 'live') st.mode = body.mode;
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
        mode
      });
      res.json({ ok: true, text });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Claude request failed' });
    }
  });

  app.post('/api/007trade/sim-fill', (req, res) => {
    try {
      const st = readState();
      if (st.mode !== 'sim') return res.status(400).json({ error: 'Switch to Sim mode for simulated fills.' });
      const symbol = String(req.body?.symbol || '').trim().toUpperCase();
      const side = String(req.body?.side || 'buy').toLowerCase();
      const qty = Math.max(1, parseInt(req.body?.qty || '1', 10) || 1);
      if (!symbol) return res.status(400).json({ error: 'symbol required' });
      const price = Math.round((50 + Math.random() * 450) * 100) / 100;
      const cost = qty * price * (side === 'sell' ? -1 : 1);
      st.simCash = Math.round((st.simCash - cost) * 100) / 100;
      const order = {
        id: crypto.randomUUID(),
        symbol,
        side,
        qty,
        price,
        status: 'filled',
        ts: new Date().toISOString(),
        mode: 'sim'
      };
      st.simOrders.unshift(order);
      st.simOrders = st.simOrders.slice(0, 200);
      writeState(st);
      res.json({ ok: true, order, simCash: st.simCash });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Sim fill failed' });
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
    try {
      const st = readState();
      if (st.mode !== 'live') {
        return res.status(400).json({ error: 'Set mode to Live on the dashboard to send broker orders.' });
      }
      if (!alpacaConfigured()) {
        return res.status(400).json({
          error: 'Alpaca keys not configured. Add ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY to the server environment.'
        });
      }
      const symbol = String(req.body?.symbol || '').trim().toUpperCase();
      const side = String(req.body?.side || 'buy').toLowerCase();
      const qty = String(Math.max(1, parseInt(req.body?.qty || '1', 10) || 1));
      if (!symbol) return res.status(400).json({ error: 'symbol required' });
      const r = await fetchFn(`${alpacaBaseUrl()}/v2/orders`, {
        method: 'POST',
        headers: alpacaHeaders(),
        body: JSON.stringify({
          symbol,
          qty,
          side,
          type: 'market',
          time_in_force: 'day'
        })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || j.error || `Alpaca ${r.status}`);
      res.json({ ok: true, order: j });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Broker order failed' });
    }
  });
}

module.exports = {
  registerTrade007Routes,
  BUILTIN_STRATEGIES
};
