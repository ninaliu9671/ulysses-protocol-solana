'use strict';
// JSON-file persistence for watcher state. Tiny scope: slash idempotency +
// per-owner last-signature cursor. Avoids native better-sqlite3 build issues.

const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, 'watcher-state.json');

let state = { slash_attempts: {}, last_sig_seen: {}, totals: null, events: [] };

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
    if (!state.events) state.events = [];
  } catch (_) {
    state = { slash_attempts: {}, last_sig_seen: {}, totals: defaultTotals(), events: [] };
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
  const cutoffMs = parseInt(process.env.EVENT_CUTOFF_TS || '0', 10) * 1000;
  const entries = Object.entries(state.slash_attempts)
    .filter(([, v]) => v.success)
    .filter(([, v]) => cutoffMs === 0 || (v.attempted_at || 0) >= cutoffMs)
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
  // When EVENT_CUTOFF_TS is set, recompute totals from filtered events array
  // (lifetime totals can't be filtered, so derive from per-event data).
  if (EVENT_CUTOFF_TS > 0) {
    let slashed = 0n;
    let redistributed = 0n;
    for (const e of state.events) {
      if ((e.blockTime || 0) < EVENT_CUTOFF_TS) continue;
      if (e.kind === 'Slashed') slashed += BigInt(e.principal || '0');
      else if (e.kind === 'Claimed' && e.yieldPaid) redistributed += BigInt(e.yieldPaid);
    }
    return {
      total_slashed_lamports: slashed.toString(),
      total_redistributed_lamports: redistributed.toString(),
      history_backfill_done: state.totals.history_backfill_done,
      last_scan_completed: state.totals.last_scan_completed,
    };
  }
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

// ---- Event Persistence (Terminated events: Slashed / Cancelled / Claimed) ----
// Store full event details for cross-device My Commitments history and Siren Graveyard.
// Cap at 10,000 events to prevent unbounded growth.
const MAX_EVENTS = 10000;

/**
 * Add a terminated event (Slashed / Cancelled / Claimed).
 * Deduplicates by eventKey = `${kind}:${signature}`.
 * Events are stored in blockTime DESC order (newest first).
 *
 * @param {Object} event - Event details
 * @param {string} event.kind - "Slashed" | "Cancelled" | "Claimed"
 * @param {string} event.commitment - Commitment pubkey (base58)
 * @param {string} event.owner - Owner pubkey (base58)
 * @param {bigint} event.principal - Principal amount in lamports
 * @param {string} [event.typeName] - Commitment type ("NoSell" | "HoldAbove" | "NoTradeWindow" | "AgentGuardian")
 * @param {string} [event.targetMint] - Target mint pubkey (base58) or null
 * @param {number} [event.createdAt] - Unix timestamp (seconds)
 * @param {number} [event.expiresAt] - Unix timestamp (seconds)
 * @param {bigint} [event.yieldPaid] - Yield paid (Claimed only)
 * @param {string} signature - Transaction signature
 * @param {number} blockTime - Block timestamp (seconds)
 */
function addTerminatedEvent(event, signature, blockTime) {
  const eventKey = `${event.kind}:${signature}`;

  // Dedup check
  if (state.events.some(e => e.eventKey === eventKey)) return;

  const record = {
    eventKey,
    kind: event.kind,
    signature,
    blockTime,
    commitment: event.commitment,
    owner: event.owner,
    principal: event.principal.toString(),
    typeName: event.typeName ?? null,
    targetMint: event.targetMint ?? null,
    createdAt: event.createdAt ?? null,
    expiresAt: event.expiresAt ?? null,
    yieldPaid: event.yieldPaid ? event.yieldPaid.toString() : null,
  };

  // Insert in blockTime DESC order (binary search for insertion point)
  let insertIdx = 0;
  for (let i = 0; i < state.events.length; i++) {
    if (state.events[i].blockTime < blockTime) {
      insertIdx = i;
      break;
    }
    insertIdx = i + 1;
  }

  state.events.splice(insertIdx, 0, record);

  // Cap at MAX_EVENTS (remove oldest)
  if (state.events.length > MAX_EVENTS) {
    state.events = state.events.slice(0, MAX_EVENTS);
  }

  flush();
}

/**
 * Get terminated events, optionally filtered by owner.
 * @param {string|null} owner - Owner pubkey to filter by, or null for all
 * @param {number} limit - Max events to return
 * @returns {Array} Events in blockTime DESC order
 */
const EVENT_CUTOFF_TS = parseInt(process.env.EVENT_CUTOFF_TS || '0', 10);

function getTerminatedEvents(owner = null, limit = 200) {
  let filtered = state.events;
  if (EVENT_CUTOFF_TS > 0) {
    filtered = filtered.filter(e => (e.blockTime || 0) >= EVENT_CUTOFF_TS);
  }
  if (owner) {
    filtered = filtered.filter(e => e.owner === owner);
  }
  return filtered.slice(0, limit);
}

/**
 * Get Graveyard events (Slashed + Cancelled only).
 * @param {number} limit - Max events to return
 * @returns {Array} Events in blockTime DESC order
 */
function getGraveyardEvents(limit = 50) {
  return state.events
    .filter(e => e.kind === 'Slashed' || e.kind === 'Cancelled')
    .filter(e => EVENT_CUTOFF_TS === 0 || (e.blockTime || 0) >= EVENT_CUTOFF_TS)
    .slice(0, limit);
}

/**
 * Get Claimed events (for Hall of Masts Earned column).
 * @param {number} limit - Max events to return
 * @returns {Array} Events in blockTime DESC order
 */
function getClaimedEvents(limit = 500) {
  return state.events
    .filter(e => e.kind === 'Claimed')
    .filter(e => EVENT_CUTOFF_TS === 0 || (e.blockTime || 0) >= EVENT_CUTOFF_TS)
    .slice(0, limit);
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
  addTerminatedEvent,
  getTerminatedEvents,
  getGraveyardEvents,
  getClaimedEvents,
};
