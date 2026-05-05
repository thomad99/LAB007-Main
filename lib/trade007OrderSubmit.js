'use strict';

/**
 * Shared Alpaca order path for manual UI and automation runner.
 * @param {object} deps - helpers from trade007.js
 * @param {object} opts - same shape as HTTP body + source: 'manual'|'automation'
 */
async function submitTrade007Order(deps, opts = {}) {
  const {
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
  } = deps;

  const base = alpacaBaseUrl();
  const paper = alpacaIsPaper();
  const brokerMeta = { baseUrl: base, paper, keyIdSuffix: alpacaKeyIdSuffix() };
  const source = opts.source || 'manual';

  try {
    if (!alpacaConfigured()) {
      return { ok: false, status: 400, error: 'Alpaca keys not configured.', broker: brokerMeta };
    }

    const st = readState();
    const rp = sanitizeRiskProfile({
      ...(st.riskProfile || {}),
      ...(opts.riskOverride && typeof opts.riskOverride === 'object' ? opts.riskOverride : {})
    });

    const symbol = String(opts.symbol || '').trim().toUpperCase();
    const side = String(opts.side || 'buy').toLowerCase();
    if (side !== 'buy' && side !== 'sell') {
      return { ok: false, status: 400, error: 'side must be buy or sell', broker: brokerMeta };
    }

    let strategyId = String(opts.strategyId || '').trim();
    if (!VALID_STRATEGY_IDS.has(strategyId)) {
      strategyId = String(
        st.selectedStrategyId || (Array.isArray(st.activeStrategyIds) && st.activeStrategyIds[0]) || ''
      ).trim();
    }
    if (!VALID_STRATEGY_IDS.has(strategyId)) strategyId = 'momentum-breakout';
    const stratMeta = BUILTIN_STRATEGIES.find((s) => s.id === strategyId);
    const strategyName = stratMeta ? stratMeta.name : strategyId !== 'none' ? strategyId : null;

    if (!symbol) return { ok: false, status: 400, error: 'symbol required', broker: brokerMeta };

    const plainOnly =
      opts.plainOnly === true ||
      String(opts.plainOnly || '').toLowerCase() === 'true' ||
      String(opts.plainOnly || '').toLowerCase() === '1';
    const useBracket =
      !plainOnly &&
      (opts.useBracket !== false) &&
      rp.useBracketOrders &&
      !(String(opts.useBracket || '').toLowerCase() === 'false');

    const useAutoQty =
      opts.useAutoQty === false || String(opts.useAutoQty || '').toLowerCase() === 'false'
        ? false
        : opts.useAutoQty === true ||
          String(opts.useAutoQty || '').toLowerCase() === 'true' ||
          rp.useAutoQty;

    let entryEstimate = null;
    let qtyNum = Math.max(1, parseInt(opts.qty || '1', 10) || 1);

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
          return {
            ok: false,
            status: 400,
            error: e.message || 'Need a live quote for bracket orders.',
            broker: brokerMeta
          };
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
      source,
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
      return {
        ok: false,
        status,
        error: msg,
        broker: brokerMeta,
        alpaca: j,
        executionPlan
      };
    }

    console.log('[007Trade] Alpaca order accepted', {
      orderId: j.id,
      status: j.status,
      symbol: j.symbol,
      client_order_id: j.client_order_id || clientOrderId,
      strategyId,
      bracket: useBracket,
      source,
      broker: brokerMeta
    });

    try {
      const stJ = readState();
      if (!Array.isArray(stJ.tradeJournal)) stJ.tradeJournal = [];
      stJ.tradeJournal.unshift({
        ts: new Date().toISOString(),
        strategyId,
        strategyName: strategyName || strategyId,
        ruleId: opts.ruleId || null,
        reason: opts.reason || null,
        symbol,
        side,
        qty,
        alpacaOrderId: j.id,
        clientOrderId: j.client_order_id || clientOrderId,
        bracket: Boolean(useBracket),
        paper: alpacaIsPaper(),
        source
      });
      stJ.tradeJournal = stJ.tradeJournal.slice(0, 500);
      writeState(stJ);
    } catch (je) {
      console.warn('[007Trade] tradeJournal append failed', je.message);
    }

    return {
      ok: true,
      order: j,
      broker: brokerMeta,
      executionPlan,
      strategyTag: {
        strategyId,
        strategyName: strategyName || undefined,
        client_order_id: j.client_order_id || clientOrderId
      }
    };
  } catch (e) {
    const msg = e.message || String(e);
    console.error('[007Trade] submitTrade007Order exception', msg, e);
    return { ok: false, status: 500, error: msg || 'Broker order failed', broker: brokerMeta };
  }
}

module.exports = { submitTrade007Order };
