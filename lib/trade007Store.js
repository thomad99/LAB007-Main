'use strict';

const fs = require('fs');
const path = require('path');

function trade007StatePath() {
  const explicit = String(process.env.TRADE007_DATA_PATH || '').trim();
  if (explicit) return path.resolve(explicit);
  const disk = String(process.env.LAB007_DATA_DIR || process.env.LAB007_DISK_ROOT || '').trim();
  if (disk) return path.join(path.resolve(disk), 'Trade007', 'state.json');
  return path.join(path.dirname(__dirname), 'data', 'Trade007', 'state.json');
}

function defaultAutomationState() {
  return {
    masterEnabled: false,
    allowLiveAutomation: false,
    pollIntervalSec: 60,
    rules: [],
    log: [],
    lastTickAt: null,
    /** Log signals and risk checks but do not send orders */
    dryRun: false,
    /** 0 = off. Halt new entries when (startEquity − equity) reaches this (ET day, mark-to-market). */
    maxDailyLossUsd: 0,
    /** 0 = unlimited. Counts all open positions at the broker. */
    maxConcurrentPositions: 0,
    daily: {
      etDate: null,
      startEquity: null,
      halted: false
    }
  };
}

function defaultRiskProfile() {
  return {
    /** When true, market entries use Alpaca bracket (take-profit + stop) from % below */
    useBracketOrders: true,
    /** Stop distance from entry estimate (%) */
    stopLossPct: 1,
    /** Take-profit target from entry estimate (%) */
    takeProfitPct: 2,
    /** Max portion of account equity to risk on one trade (used when auto qty is on) */
    maxAccountRiskPct: 1,
    /** Size qty from equity × maxAccountRiskPct ÷ (per-share stop distance) */
    useAutoQty: false
  };
}

function defaultState() {
  return {
    version: 1,
    mode: 'paper',
    selectedStrategyId: 'momentum-breakout',
    watchlist: ['SPY', 'QQQ'],
    tradePlans: [],
    /** Legacy simulated fills (UI removed); kept for older state files */
    simOrders: [],
    simCash: 100000,
    simPositions: {},
    /** Saved notes included in Claude briefs — persists with state.json */
    paperContext: '',
    riskProfile: defaultRiskProfile(),
    /** Up to 6 strategy ids active together (brief + tagging) */
    activeStrategyIds: ['momentum-breakout'],
    /** Append-only log of orders placed via this app (for per-strategy reporting) */
    tradeJournal: [],
    brokerEnvAcknowledged: false,
    automation: defaultAutomationState(),
    updatedAt: null
  };
}

function normalizeMode(m) {
  if (m === 'live') return 'live';
  if (m === 'sim' || m === 'paper') return 'paper';
  return 'paper';
}

function readState() {
  const p = trade007StatePath();
  if (!fs.existsSync(p)) return defaultState();
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    const merged = {
      ...defaultState(),
      ...j,
      tradePlans: j.tradePlans || [],
      simOrders: j.simOrders || [],
      watchlist: j.watchlist || ['SPY'],
      mode: normalizeMode(j.mode),
      paperContext: typeof j.paperContext === 'string' ? j.paperContext : '',
      riskProfile: { ...defaultRiskProfile(), ...(j.riskProfile && typeof j.riskProfile === 'object' ? j.riskProfile : {}) },
      activeStrategyIds:
        Array.isArray(j.activeStrategyIds) && j.activeStrategyIds.length > 0
          ? j.activeStrategyIds.slice(0, 6)
          : j.selectedStrategyId
            ? [j.selectedStrategyId]
            : ['momentum-breakout'],
      tradeJournal: Array.isArray(j.tradeJournal) ? j.tradeJournal.slice(0, 500) : [],
      automation: (() => {
        const d = defaultAutomationState();
        const a = j.automation;
        if (!a || typeof a !== 'object') return d;
        const dailyIn = typeof a.daily === 'object' && a.daily ? a.daily : {};
        return {
          ...d,
          ...a,
          rules: Array.isArray(a.rules) ? a.rules : d.rules,
          log: Array.isArray(a.log) ? a.log.slice(0, 150) : d.log,
          daily: {
            ...d.daily,
            ...dailyIn
          }
        };
      })()
    };
    return merged;
  } catch {
    return defaultState();
  }
}

function writeState(state) {
  const p = trade007StatePath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(p, JSON.stringify(state, null, 2), 'utf8');
}

module.exports = {
  trade007StatePath,
  readState,
  writeState,
  defaultState,
  defaultRiskProfile,
  defaultAutomationState
};
