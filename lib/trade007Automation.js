'use strict';

/**
 * Strategy automation: ORB (long/short/both, exits, flatten), momentum (prior-day high),
 * mean reversion (fade from open). Global: dry-run, daily loss limit, max positions.
 */

let timer = null;
let warnedLive = false;
const unimplementedStrategyWarned = new Set();
let lastPositionLimitLog = 0;

function etDateString(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function ms(iso) {
  return new Date(iso).getTime();
}

function positionQty(pos) {
  if (!pos) return 0;
  return parseFloat(pos.qty) || 0;
}

function countOpenPositions(positions) {
  let n = 0;
  for (const p of positions) {
    if (positionQty(p) !== 0) n += 1;
  }
  return n;
}

function absPositionExposureUsd(pos) {
  if (!pos) return 0;
  return Math.abs(parseFloat(pos.market_value) || 0);
}

function totalExposureUsd(positions) {
  return (positions || []).reduce((sum, p) => sum + absPositionExposureUsd(p), 0);
}

function isMomentumFamily(strategyId) {
  return (
    strategyId === 'momentum-breakout' ||
    strategyId === 'news-catalyst' ||
    strategyId === 'conservative-swing' ||
    strategyId === 'quant-lite'
  );
}

async function fetchClockJson(deps) {
  const r = await deps.fetchFn(`${deps.alpacaBaseUrl()}/v2/clock`, { headers: deps.alpacaHeaders() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || 'clock');
  return j;
}

async function fetchAccountEquity(deps) {
  const r = await deps.fetchFn(`${deps.alpacaBaseUrl()}/v2/account`, { headers: deps.alpacaHeaders() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || 'account');
  const eq = parseFloat(j.equity);
  if (!(eq > 0)) throw new Error('invalid equity');
  return eq;
}

async function fetchCalendarDay(deps, dateStr) {
  const r = await deps.fetchFn(`${deps.alpacaBaseUrl()}/v2/calendar?start=${dateStr}&end=${dateStr}`, {
    headers: deps.alpacaHeaders()
  });
  const arr = await r.json().catch(() => []);
  return Array.isArray(arr) && arr[0] ? arr[0] : null;
}

async function fetchMinuteBars(deps, symbol, startIso, endIso) {
  const sym = encodeURIComponent(symbol);
  const feed = encodeURIComponent(String(process.env.ALPACA_DATA_FEED || 'iex').toLowerCase());
  const url = `https://data.alpaca.markets/v2/stocks/${sym}/bars?timeframe=1Min&feed=${feed}&start=${encodeURIComponent(
    startIso
  )}&end=${encodeURIComponent(endIso)}&limit=2000&sort=asc`;
  const r = await deps.fetchFn(url, { headers: deps.alpacaHeaders() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || 'bars');
  return j.bars || [];
}

async function fetchDailyBars(deps, symbol, startIso, endIso) {
  const sym = encodeURIComponent(symbol);
  const feed = encodeURIComponent(String(process.env.ALPACA_DATA_FEED || 'iex').toLowerCase());
  const url = `https://data.alpaca.markets/v2/stocks/${sym}/bars?timeframe=1Day&feed=${feed}&start=${encodeURIComponent(
    startIso
  )}&end=${encodeURIComponent(endIso)}&limit=40&sort=asc`;
  const r = await deps.fetchFn(url, { headers: deps.alpacaHeaders() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.error || 'daily bars');
  return j.bars || [];
}

async function fetchLatestTrade(deps, symbol) {
  const sym = encodeURIComponent(symbol);
  const feed = encodeURIComponent(String(process.env.ALPACA_DATA_FEED || 'iex').toLowerCase());
  const r = await deps.fetchFn(`https://data.alpaca.markets/v2/stocks/${sym}/trades/latest?feed=${feed}`, {
    headers: deps.alpacaHeaders()
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.trade) throw new Error(j.message || 'no trade');
  return parseFloat(j.trade.p);
}

async function fetchPositions(deps) {
  const r = await deps.fetchFn(`${deps.alpacaBaseUrl()}/v2/positions`, { headers: deps.alpacaHeaders() });
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j : [];
}

function todayEntryCount(rule, symbol) {
  const day = etDateString();
  const key = `${symbol}|${day}`;
  if (!rule.counters || typeof rule.counters !== 'object') return 0;
  return parseInt(rule.counters[key], 10) || 0;
}

function bumpTodayEntry(rule, symbol) {
  const day = etDateString();
  const key = `${symbol}|${day}`;
  if (!rule.counters) rule.counters = {};
  rule.counters[key] = (parseInt(rule.counters[key], 10) || 0) + 1;
}

function buildRuleSizingOpts(rule) {
  const mode = String(rule?.sizeMode || 'auto').toLowerCase();
  if (mode === 'fixed') {
    const fixedQty = Math.min(100000, Math.max(1, parseInt(rule?.fixedQty, 10) || 1));
    return { qty: fixedQty, useAutoQty: false };
  }
  return { useAutoQty: true };
}

async function automationPlaceOrder(deps, st, auto, opts, appendLog, ruleId) {
  if (auto.dryRun) {
    appendLog(
      st,
      'info',
      `[dry-run] would ${opts.side} ${opts.symbol} qty=${opts.qty != null ? opts.qty : 'auto'}`,
      ruleId
    );
    return { ok: true, dryRun: true };
  }
  const countAsEntry = opts.countAsEntry !== false;
  const maxEntries = Math.max(0, parseInt(auto.maxAutoEntriesPerDay, 10) || 0);
  const todayEntries = Math.max(0, parseInt(auto?.daily?.autoEntriesCount, 10) || 0);
  if (countAsEntry && maxEntries > 0 && todayEntries >= maxEntries) {
    appendLog(st, 'warn', `Circuit breaker: max auto entries/day reached (${maxEntries}).`, ruleId);
    return { ok: false, error: 'circuit breaker: max auto entries/day reached' };
  }

  const positions = await fetchPositions(deps);
  const maxTotalExposure = Math.max(0, parseFloat(auto.maxTotalExposureUsd) || 0);
  if (countAsEntry && maxTotalExposure > 0) {
    const exp = totalExposureUsd(positions);
    if (exp >= maxTotalExposure) {
      appendLog(
        st,
        'warn',
        `Circuit breaker: total exposure ${exp.toFixed(2)} exceeds limit ${maxTotalExposure.toFixed(2)}.`,
        ruleId
      );
      return { ok: false, error: 'circuit breaker: total exposure limit reached' };
    }
  }

  const maxPerSymbolExposure = Math.max(0, parseFloat(auto.maxPerSymbolExposureUsd) || 0);
  if (countAsEntry && maxPerSymbolExposure > 0) {
    const target = String(opts.symbol || '').toUpperCase();
    const existing = positions.find((p) => String(p.symbol || '').toUpperCase() === target);
    const symbolExp = absPositionExposureUsd(existing);
    if (symbolExp >= maxPerSymbolExposure) {
      appendLog(
        st,
        'warn',
        `Circuit breaker: ${target} exposure ${symbolExp.toFixed(2)} exceeds limit ${maxPerSymbolExposure.toFixed(2)}.`,
        ruleId
      );
      return { ok: false, error: `circuit breaker: ${target} exposure limit reached` };
    }
  }

  let riskOverride = opts.riskOverride;
  if (auto.marketConditionSizingEnabled) {
    const mult = effectiveRiskMultiplier(auto);
    const baseRisk = parseFloat(st?.riskProfile?.maxAccountRiskPct) || 1;
    const scaled = Math.max(0.01, Math.min(25, baseRisk * mult));
    riskOverride = { ...(riskOverride || {}), maxAccountRiskPct: scaled };
  }
  const result = await deps.executeTrade007Order({
    ...opts,
    source: 'automation',
    riskOverride,
    ruleId: ruleId || opts.ruleId || null
  });
  if (countAsEntry && result && result.ok) {
    auto.daily.autoEntriesCount = todayEntries + 1;
  }
  return result;
}

async function closePositionMarket(deps, st, auto, pos, strategyId, appendLog, ruleId, reason) {
  const sym = pos.symbol;
  const q = positionQty(pos);
  if (q === 0) return { ok: true, skipped: true };
  const side = q > 0 ? 'sell' : 'buy';
  const qty = Math.abs(Math.round(q));
  if (qty < 1) return { ok: true, skipped: true };
  appendLog(st, 'info', `${sym}: closing position (${side} ${qty})`, ruleId);
  return automationPlaceOrder(
    deps,
    st,
    auto,
    {
      symbol: sym,
      side,
      qty,
      plainOnly: true,
      useAutoQty: false,
      useBracket: false,
      countAsEntry: false,
      reason: reason || 'Automated exit',
      strategyId
    },
    appendLog,
    ruleId
  );
}

async function loadOrbContext(deps, symbol, rule, nowIso) {
  const calDay = etDateString();
  const cal = await fetchCalendarDay(deps, calDay);
  if (!cal || !cal.open) return { ok: false, reason: 'no_calendar' };
  const sessionOpen = cal.open;
  const orbMs = rule.orbMinutes * 60 * 1000;
  if (ms(nowIso) < ms(sessionOpen) + orbMs) return { ok: false, reason: 'orb_incomplete' };
  let bars;
  try {
    bars = await fetchMinuteBars(deps, symbol, sessionOpen, nowIso);
  } catch {
    return { ok: false, reason: 'bars_error' };
  }
  const orbEnd = ms(sessionOpen) + orbMs;
  const orbBars = bars.filter((b) => {
    const t = ms(b.t);
    return t >= ms(sessionOpen) && t < orbEnd;
  });
  if (orbBars.length < 2) return { ok: false, reason: 'orb_bars' };
  let orHigh = -Infinity;
  let orLow = Infinity;
  for (const b of orbBars) {
    orHigh = Math.max(orHigh, parseFloat(b.h));
    orLow = Math.min(orLow, parseFloat(b.l));
  }
  return { ok: true, sessionOpen, orHigh, orLow, cal };
}

async function sessionOpenPriceFromBars(deps, symbol, sessionOpenIso, endIso) {
  const end = ms(endIso) < ms(sessionOpenIso) + 120000 ? endIso : new Date(ms(sessionOpenIso) + 120000).toISOString();
  const bars = await fetchMinuteBars(deps, symbol, sessionOpenIso, end);
  const t0 = ms(sessionOpenIso);
  for (const b of bars) {
    if (ms(b.t) >= t0) return parseFloat(b.o);
  }
  return bars.length ? parseFloat(bars[0].o) : null;
}

function priorDayHighFromDaily(bars, etToday) {
  const sorted = [...bars].sort((a, b) => ms(a.t) - ms(b.t));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const barDay = new Date(sorted[i].t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    if (barDay !== etToday) return parseFloat(sorted[i].h);
  }
  if (sorted.length >= 2) return parseFloat(sorted[sorted.length - 2].h);
  return null;
}

async function maybeFlattenBeforeClose(
  deps,
  rule,
  symbol,
  st,
  auto,
  clock,
  positions,
  appendLog
) {
  const flatMin = rule.flattenBeforeCloseMin || 0;
  if (flatMin <= 0) return;
  const nc = clock.next_close;
  if (!nc) return;
  const untilCloseMs = ms(nc) - ms(clock.timestamp || new Date().toISOString());
  if (untilCloseMs > flatMin * 60 * 1000) return;
  const pos = positions.find((p) => p.symbol === symbol);
  if (!pos || positionQty(pos) === 0) return;
  await closePositionMarket(
    deps,
    st,
    auto,
    pos,
    rule.strategyId,
    appendLog,
    rule.id,
    `Flatten before close (${flatMin}m rule)`
  );
}

async function maybeExitOutsideOrb(
  deps,
  rule,
  symbol,
  st,
  auto,
  nowIso,
  positions,
  appendLog
) {
  if (rule.strategyId !== 'opening-range' || !rule.exitOutsideOrb) return;
  const ctx = await loadOrbContext(deps, symbol, rule, nowIso);
  if (!ctx.ok) return;
  const { orHigh, orLow } = ctx;
  let lastPx;
  try {
    lastPx = await fetchLatestTrade(deps, symbol);
  } catch {
    return;
  }
  const pos = positions.find((p) => p.symbol === symbol);
  const q = positionQty(pos);
  if (q > 0 && lastPx < orLow) {
    appendLog(
      st,
      'info',
      `${symbol}: exit long — last ${lastPx.toFixed(4)} < OR low ${orLow.toFixed(4)}`,
      rule.id,
      'Exit: price broke below OR low (long)'
    );
    await closePositionMarket(
      deps,
      st,
      auto,
      pos,
      rule.strategyId,
      appendLog,
      rule.id,
      'Exit: price broke above OR high (short)'
    );
  } else if (q < 0 && lastPx > orHigh) {
    appendLog(
      st,
      'info',
      `${symbol}: cover short — last ${lastPx.toFixed(4)} > OR high ${orHigh.toFixed(4)}`,
      rule.id
    );
    await closePositionMarket(
      deps,
      st,
      auto,
      pos,
      rule.strategyId,
      appendLog,
      rule.id
    );
  }
}

async function runExitHandlers(deps, st, auto, rules, clock, appendLog) {
  const nowIso = clock.timestamp || new Date().toISOString();
  for (const rule of rules) {
    for (const symbol of rule.symbols || []) {
      try {
        let positions = await fetchPositions(deps);
        await maybeExitOutsideOrb(deps, rule, symbol, st, auto, nowIso, positions, appendLog);
        positions = await fetchPositions(deps);
        await maybeFlattenBeforeClose(deps, rule, symbol, st, auto, clock, positions, appendLog);
      } catch (e) {
        appendLog(st, 'error', `${symbol} exit: ${e.message}`, rule.id);
      }
    }
  }
}

async function maybeEnterOrbLong(deps, rule, symbol, st, auto, nowIso, appendLog) {
  const ctx = await loadOrbContext(deps, symbol, rule, nowIso);
  if (!ctx.ok) {
    if (ctx.reason === 'orb_bars') {
      appendLog(st, 'info', `${symbol}: ORB bars still building`, rule.id);
    }
    return;
  }
  const { orHigh } = ctx;
  const positions = await fetchPositions(deps);
  const pos = positions.find((p) => p.symbol === symbol);
  const q = positionQty(pos);
  if (q !== 0) return;

  if (todayEntryCount(rule, symbol) >= rule.maxTradesPerSymbolPerDay) return;
  if (!rule.lastEntryAt || typeof rule.lastEntryAt !== 'object') rule.lastEntryAt = {};
  const lastAt = rule.lastEntryAt[symbol];
  if (lastAt && (Date.now() - new Date(lastAt).getTime()) / 60000 < rule.minMinutesBetweenEntries) return;

  let lastPx;
  try {
    lastPx = await fetchLatestTrade(deps, symbol);
  } catch (e) {
    appendLog(st, 'warn', `${symbol}: price ${e.message}`, rule.id);
    return;
  }
  if (lastPx <= orHigh) return;

  appendLog(
    st,
    'info',
    `${symbol}: ORB long — last ${lastPx.toFixed(4)} > OR high ${orHigh.toFixed(4)}`,
    rule.id
  );
  const result = await automationPlaceOrder(
    deps,
    st,
    auto,
    {
      symbol,
      side: 'buy',
      strategyId: rule.strategyId,
      ...buildRuleSizingOpts(rule),
      plainOnly: false,
      reason: `Entry: ORB long breakout above OR high ${orHigh.toFixed(4)}`
    },
    appendLog,
    rule.id
  );
  if (result.ok && !result.dryRun) {
    bumpTodayEntry(rule, symbol);
    rule.lastEntryAt[symbol] = new Date().toISOString();
    appendLog(st, 'info', `${symbol}: long filled/placed (${result.order?.id || 'ok'})`, rule.id);
  } else if (!result.ok) {
    appendLog(st, 'error', `${symbol}: ${result.error || 'order failed'}`, rule.id);
  }
}

async function maybeEnterOrbShort(deps, rule, symbol, st, auto, nowIso, appendLog) {
  const ctx = await loadOrbContext(deps, symbol, rule, nowIso);
  if (!ctx.ok) return;
  const { orLow } = ctx;
  const positions = await fetchPositions(deps);
  const pos = positions.find((p) => p.symbol === symbol);
  if (positionQty(pos) !== 0) return;

  if (todayEntryCount(rule, symbol) >= rule.maxTradesPerSymbolPerDay) return;
  if (!rule.lastEntryAt || typeof rule.lastEntryAt !== 'object') rule.lastEntryAt = {};
  const lastAt = rule.lastEntryAt[symbol];
  if (lastAt && (Date.now() - new Date(lastAt).getTime()) / 60000 < rule.minMinutesBetweenEntries) return;

  let lastPx;
  try {
    lastPx = await fetchLatestTrade(deps, symbol);
  } catch (e) {
    appendLog(st, 'warn', `${symbol}: price ${e.message}`, rule.id);
    return;
  }
  if (lastPx >= orLow) return;

  appendLog(
    st,
    'info',
    `${symbol}: ORB short — last ${lastPx.toFixed(4)} < OR low ${orLow.toFixed(4)}`,
    rule.id
  );
  const result = await automationPlaceOrder(
    deps,
    st,
    auto,
    {
      symbol,
      side: 'sell',
      strategyId: rule.strategyId,
      ...buildRuleSizingOpts(rule),
      plainOnly: false,
      reason: `Entry: ORB short breakdown below OR low ${orLow.toFixed(4)}`
    },
    appendLog,
    rule.id
  );
  if (result.ok && !result.dryRun) {
    bumpTodayEntry(rule, symbol);
    rule.lastEntryAt[symbol] = new Date().toISOString();
    appendLog(st, 'info', `${symbol}: short entry (${result.order?.id || 'ok'})`, rule.id);
  } else if (!result.ok) {
    appendLog(st, 'error', `${symbol}: ${result.error || 'order failed'}`, rule.id);
  }
}

async function maybeEnterMomentum(deps, rule, symbol, st, auto, nowIso, appendLog) {
  const positions = await fetchPositions(deps);
  if (positionQty(positions.find((p) => p.symbol === symbol)) !== 0) return;
  if (todayEntryCount(rule, symbol) >= rule.maxTradesPerSymbolPerDay) return;
  if (!rule.lastEntryAt || typeof rule.lastEntryAt !== 'object') rule.lastEntryAt = {};
  const lastAt = rule.lastEntryAt[symbol];
  if (lastAt && (Date.now() - new Date(lastAt).getTime()) / 60000 < rule.minMinutesBetweenEntries) return;

  const etToday = etDateString();
  const start = new Date();
  start.setDate(start.getDate() - 40);
  const startIso = start.toISOString();
  const endIso = nowIso;
  let bars;
  try {
    bars = await fetchDailyBars(deps, symbol, startIso, endIso);
  } catch (e) {
    appendLog(st, 'warn', `${symbol}: daily bars ${e.message}`, rule.id);
    return;
  }
  const pHigh = priorDayHighFromDaily(bars, etToday);
  if (pHigh == null || !(pHigh > 0)) {
    appendLog(st, 'info', `${symbol}: no prior day high yet`, rule.id);
    return;
  }
  const mult = 1 + (rule.minBreakoutPct || 0) / 100;
  const trigger = pHigh * mult;
  let lastPx;
  try {
    lastPx = await fetchLatestTrade(deps, symbol);
  } catch (e) {
    appendLog(st, 'warn', `${symbol}: price ${e.message}`, rule.id);
    return;
  }
  if (lastPx <= trigger) return;

  appendLog(
    st,
    'info',
    `${symbol}: momentum long — last ${lastPx.toFixed(4)} > prior high ${pHigh.toFixed(4)}${rule.minBreakoutPct ? ` (+${rule.minBreakoutPct}%)` : ''}`,
    rule.id
  );
  const result = await automationPlaceOrder(
    deps,
    st,
    auto,
    {
      symbol,
      side: 'buy',
      strategyId: rule.strategyId,
      ...buildRuleSizingOpts(rule),
      plainOnly: false,
      reason: `Entry: Momentum breakout above trigger ${trigger.toFixed(4)}`
    },
    appendLog,
    rule.id
  );
  if (result.ok && !result.dryRun) {
    bumpTodayEntry(rule, symbol);
    rule.lastEntryAt[symbol] = new Date().toISOString();
    appendLog(st, 'info', `${symbol}: order (${result.order?.id || 'ok'})`, rule.id);
  } else if (!result.ok) {
    appendLog(st, 'error', `${symbol}: ${result.error || 'order failed'}`, rule.id);
  }
}

async function maybeEnterMeanReversion(deps, rule, symbol, st, auto, nowIso, appendLog) {
  const positions = await fetchPositions(deps);
  if (positionQty(positions.find((p) => p.symbol === symbol)) !== 0) return;
  if (todayEntryCount(rule, symbol) >= rule.maxTradesPerSymbolPerDay) return;
  if (!rule.lastEntryAt || typeof rule.lastEntryAt !== 'object') rule.lastEntryAt = {};
  const lastAt = rule.lastEntryAt[symbol];
  if (lastAt && (Date.now() - new Date(lastAt).getTime()) / 60000 < rule.minMinutesBetweenEntries) return;

  const calDay = etDateString();
  const cal = await fetchCalendarDay(deps, calDay);
  if (!cal || !cal.open) return;
  const sessionOpen = cal.open;
  const minsSinceOpen = (ms(nowIso) - ms(sessionOpen)) / 60000;
  if (minsSinceOpen < (rule.fadeMinMinutesAfterOpen || 0)) return;

  let openPx;
  try {
    openPx = await sessionOpenPriceFromBars(deps, symbol, sessionOpen, nowIso);
  } catch {
    return;
  }
  if (!(openPx > 0)) return;

  let lastPx;
  try {
    lastPx = await fetchLatestTrade(deps, symbol);
  } catch (e) {
    appendLog(st, 'warn', `${symbol}: price ${e.message}`, rule.id);
    return;
  }
  const fadePct = rule.fadeFromOpenPct || 0.5;
  const downPct = ((openPx - lastPx) / openPx) * 100;
  if (downPct < fadePct) return;

  appendLog(
    st,
    'info',
    `${symbol}: mean-rev long — down ${downPct.toFixed(2)}% from open (threshold ${fadePct}%)`,
    rule.id
  );
  const result = await automationPlaceOrder(
    deps,
    st,
    auto,
    {
      symbol,
      side: 'buy',
      strategyId: rule.strategyId,
      ...buildRuleSizingOpts(rule),
      plainOnly: false,
      reason: `Entry: Mean-reversion dip ${downPct.toFixed(2)}% from open`
    },
    appendLog,
    rule.id
  );
  if (result.ok && !result.dryRun) {
    bumpTodayEntry(rule, symbol);
    rule.lastEntryAt[symbol] = new Date().toISOString();
    appendLog(st, 'info', `${symbol}: order (${result.order?.id || 'ok'})`, rule.id);
  } else if (!result.ok) {
    appendLog(st, 'error', `${symbol}: ${result.error || 'order failed'}`, rule.id);
  }
}

async function runOrbEntries(deps, rule, st, auto, nowIso, appendLog) {
  const dir = rule.orbDirection || 'long';
  for (const symbol of rule.symbols || []) {
    try {
      if (dir === 'long' || dir === 'both') {
        const positions = await fetchPositions(deps);
        const flat = positionQty(positions.find((p) => p.symbol === symbol)) === 0;
        if (flat) await maybeEnterOrbLong(deps, rule, symbol, st, auto, nowIso, appendLog);
      }
      if (dir === 'short' || dir === 'both') {
        const positions = await fetchPositions(deps);
        const flat = positionQty(positions.find((p) => p.symbol === symbol)) === 0;
        if (flat) await maybeEnterOrbShort(deps, rule, symbol, st, auto, nowIso, appendLog);
      }
    } catch (e) {
      appendLog(st, 'error', `${symbol}: ${e.message}`, rule.id);
    }
  }
}

async function runEntriesForRule(deps, rule, st, auto, nowIso, appendLog) {
  const sid = rule.strategyId;
  if (sid === 'opening-range') {
    await runOrbEntries(deps, rule, st, auto, nowIso, appendLog);
  } else if (sid === 'mean-reversion') {
    for (const symbol of rule.symbols || []) {
      try {
        await maybeEnterMeanReversion(deps, rule, symbol, st, auto, nowIso, appendLog);
      } catch (e) {
        appendLog(st, 'error', `${symbol}: ${e.message}`, rule.id);
      }
    }
  } else if (isMomentumFamily(sid)) {
    for (const symbol of rule.symbols || []) {
      try {
        await maybeEnterMomentum(deps, rule, symbol, st, auto, nowIso, appendLog);
      } catch (e) {
        appendLog(st, 'error', `${symbol}: ${e.message}`, rule.id);
      }
    }
  } else {
    const wkey = rule.id + '|' + sid;
    if (!unimplementedStrategyWarned.has(wkey)) {
      unimplementedStrategyWarned.add(wkey);
      appendLog(st, 'info', `Strategy "${sid}" has no automation handler.`, rule.id);
    }
  }
}

function effectiveRiskMultiplier(auto) {
  const raw = Number(auto?.lastMarketMultiplier);
  const m = Number.isFinite(raw) && raw > 0 ? raw : 1;
  const floor = Math.min(1.5, Math.max(0.1, parseFloat(auto?.marketConditionRiskFloor) || 0.35));
  const ceil = Math.min(2, Math.max(0.2, parseFloat(auto?.marketConditionRiskCeiling) || 1.1));
  return Math.min(ceil, Math.max(floor, m));
}

function resetDailyAndCheckHalt(deps, st, auto, appendLog) {
  const todayEt = etDateString();
  if (!auto.daily || typeof auto.daily !== 'object') auto.daily = { etDate: null, startEquity: null, halted: false };
  if (auto.daily.etDate !== todayEt) {
    auto.daily.etDate = todayEt;
    auto.daily.startEquity = null;
    auto.daily.halted = false;
    auto.daily.autoEntriesCount = 0;
  }
}

async function updateDailyLossHalt(deps, st, auto, appendLog) {
  try {
    const eq = await fetchAccountEquity(deps);
    if (auto.daily.startEquity == null) auto.daily.startEquity = eq;
    const maxLoss = auto.maxDailyLossUsd || 0;
    if (maxLoss > 0 && auto.daily.startEquity != null) {
      const drop = auto.daily.startEquity - eq;
      if (drop >= maxLoss && !auto.daily.halted) {
        auto.daily.halted = true;
        appendLog(
          st,
          'warn',
          `Daily loss limit: equity down ~$${drop.toFixed(2)} from session baseline (max $${maxLoss}). New entries paused until tomorrow (ET).`,
          null
        );
      }
    }
  } catch (e) {
    appendLog(st, 'warn', 'Account equity: ' + e.message, null);
  }
}

async function runAutomationTick(deps) {
  const {
    readState,
    writeState,
    appendAutomationLog,
    defaultAutomationState,
    alpacaConfigured,
    alpacaIsPaper,
    analyzeMarketConditions
  } = deps;

  if (!alpacaConfigured()) return;

  const st = readState();
  if (!st.automation || typeof st.automation !== 'object') st.automation = defaultAutomationState();
  const auto = st.automation;
  if (!auto.masterEnabled) return;

  if (!alpacaIsPaper() && !auto.allowLiveAutomation) {
    if (!warnedLive) {
      warnedLive = true;
      appendAutomationLog(st, 'warn', 'Automation blocked: Alpaca is LIVE and allowLiveAutomation is false.', null);
      writeState(st);
    }
    return;
  }
  warnedLive = false;

  const rules = Array.isArray(auto.rules) ? auto.rules.filter((r) => r.enabled) : [];
  resetDailyAndCheckHalt(deps, st, auto, appendAutomationLog);
  await updateDailyLossHalt(deps, st, auto, appendAutomationLog);

  if (auto.marketConditionSizingEnabled && typeof analyzeMarketConditions === 'function') {
    try {
      const mc = await analyzeMarketConditions();
      auto.lastMarketType = mc.marketType || null;
      auto.lastMarketMultiplier = Number(mc.suggestedRiskMultiplier) || 1;
    } catch (e) {
      appendAutomationLog(st, 'warn', 'Market conditions: ' + (e.message || 'failed'), null);
    }
  } else {
    auto.lastMarketType = null;
    auto.lastMarketMultiplier = 1;
  }

  if (!rules.length) {
    auto.lastTickAt = new Date().toISOString();
    st.automation = auto;
    writeState(st);
    return;
  }

  let clock;
  try {
    clock = await fetchClockJson(deps);
  } catch (e) {
    appendAutomationLog(st, 'warn', 'Clock: ' + e.message, null);
    writeState(st);
    return;
  }

  const nowIso = clock.timestamp || new Date().toISOString();
  if (!clock.is_open) {
    auto.lastTickAt = nowIso;
    st.automation = auto;
    writeState(st);
    return;
  }

  await runExitHandlers(deps, st, auto, rules, clock, appendAutomationLog);

  let positions = await fetchPositions(deps);

  if (auto.daily && auto.daily.halted) {
    auto.lastTickAt = new Date().toISOString();
    st.automation = auto;
    writeState(st);
    return;
  }

  const maxPos = auto.maxConcurrentPositions || 0;
  if (maxPos > 0 && countOpenPositions(positions) >= maxPos) {
    const now = Date.now();
    if (now - lastPositionLimitLog > 60000) {
      lastPositionLimitLog = now;
      appendAutomationLog(
        st,
        'warn',
        `Entry skipped: ${countOpenPositions(positions)} open positions (limit ${maxPos}).`,
        null
      );
    }
    auto.lastTickAt = new Date().toISOString();
    st.automation = auto;
    writeState(st);
    return;
  }

  for (const rule of rules) {
    await runEntriesForRule(deps, rule, st, auto, nowIso, appendAutomationLog);
  }

  auto.lastTickAt = new Date().toISOString();
  st.automation = auto;
  writeState(st);
}

function startTrade007Automation(deps) {
  const tick = () => {
    runAutomationTick(deps).catch((e) => {
      console.error('[007Trade automation]', e);
      try {
        const st = deps.readState();
        deps.appendAutomationLog(st, 'error', e.message || String(e), null);
        deps.writeState(st);
      } catch (_) {}
    });
  };

  function reschedule() {
    if (timer) clearInterval(timer);
    timer = null;
    const st = deps.readState();
    const sec = Math.min(300, Math.max(30, parseInt(st.automation?.pollIntervalSec, 10) || 60));
    timer = setInterval(tick, sec * 1000);
  }

  reschedule();
  tick();

  setInterval(() => {
    try {
      reschedule();
    } catch (_) {}
  }, 60000);
}

module.exports = { startTrade007Automation, runAutomationTick };
