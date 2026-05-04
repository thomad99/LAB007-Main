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
    brokerEnvAcknowledged: false,
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
      paperContext: typeof j.paperContext === 'string' ? j.paperContext : ''
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
  defaultState
};
