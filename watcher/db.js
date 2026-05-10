'use strict';
// JSON-file persistence for watcher state. Tiny scope: slash idempotency +
// per-owner last-signature cursor. Avoids native better-sqlite3 build issues.

const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, 'watcher-state.json');

let state = { slash_attempts: {}, last_sig_seen: {}, totals: null };

function defaultTotals() {
  return {
    total_slashed_lamports: '0',
    total_redistributed_lamports: '0',
    seen_event_keys: {},
    last_program_sig_cursor: null,
    history_backfill_done: false,
    last_scan_completed: null,
  };
}

function init() {
  try {
    state = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    if (!state.slash_attempts) state.slash_attempts = {};
    if (!state.last_sig_seen) state.last_sig_seen = {};
    if (!state.totals) state.totals = defaultTotals();
    if (!state.totals.seen_event_keys) state.totals.seen_event_keys = {};
  } catch (_) {
    state = { slash_attempts: {}, last_sig_seen: {}, totals: defaultTotals() };
    flush();
  }
}

function flush() {
  fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2));
}

function wasAlreadySlashed(pubkey) {
  return state.slash_attempts[pubkey]?.success === true;
}

function recordSlashAttempt(pubkey, type, owner, txSig, success, errorMessage) {
  state.slash_attempts[pubkey] = {
    type,
    owner,
    tx_signature: txSig,
    attempted_at: Date.now(),
    success: !!success,
    error_message: errorMessage ?? null,
  };
  flush();
}

function getRecentSlashes(limit = 50) {
  const entries = Object.entries(state.slash_attempts)
    .filter(([, v]) => v.success)
    .map(([pubkey, v]) => ({ commitment_pubkey: pubkey, ...v }))
    .sort((a, b) => b.attempted_at - a.attempted_at)
    .slice(0, limit);
  return entries;
}

function getLastSigSeen(owner) {
  return state.last_sig_seen[owner] ?? null;
}

function setLastSigSeen(owner, signature, blockTime) {
  state.last_sig_seen[owner] = { signature, block_time: blockTime };
  flush();
}

// ---- Totals (Slashed / Redistributed) ----
// eventKey: `${kind}:${signature}:${logIndex}` to dedupe across scans/restarts.
function hasSeenEvent(eventKey) {
  return state.totals.seen_event_keys[eventKey] === 1;
}

function addSlashed(eventKey, lamports) {
  if (state.totals.seen_event_keys[eventKey]) return;
  state.totals.seen_event_keys[eventKey] = 1;
  state.totals.total_slashed_lamports = (
    BigInt(state.totals.total_slashed_lamports) + BigInt(lamports)
  ).toString();
}

function addRedistributed(eventKey, lamports) {
  if (state.totals.seen_event_keys[eventKey]) return;
  state.totals.seen_event_keys[eventKey] = 1;
  state.totals.total_redistributed_lamports = (
    BigInt(state.totals.total_redistributed_lamports) + BigInt(lamports)
  ).toString();
}

function getTotals() {
  return {
    total_slashed_lamports: state.totals.total_slashed_lamports,
    total_redistributed_lamports: state.totals.total_redistributed_lamports,
    history_backfill_done: state.totals.history_backfill_done,
    last_scan_completed: state.totals.last_scan_completed,
  };
}

function getProgramSigCursor() {
  return state.totals.last_program_sig_cursor;
}

function setProgramSigCursor(sig) {
  state.totals.last_program_sig_cursor = sig;
}

function markBackfillDone() {
  state.totals.history_backfill_done = true;
}

function markScanCompleted() {
  state.totals.last_scan_completed = Date.now();
}

function persistTotals() {
  flush();
}

module.exports = {
  init,
  wasAlreadySlashed,
  recordSlashAttempt,
  getRecentSlashes,
  getLastSigSeen,
  setLastSigSeen,
  hasSeenEvent,
  addSlashed,
  addRedistributed,
  getTotals,
  getProgramSigCursor,
  setProgramSigCursor,
  markBackfillDone,
  markScanCompleted,
  persistTotals,
};
