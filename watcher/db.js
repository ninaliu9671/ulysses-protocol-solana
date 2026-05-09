'use strict';
// JSON-file persistence for watcher state. Tiny scope: slash idempotency +
// per-owner last-signature cursor. Avoids native better-sqlite3 build issues.

const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, 'watcher-state.json');

let state = { slash_attempts: {}, last_sig_seen: {} };

function init() {
  try {
    state = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    if (!state.slash_attempts) state.slash_attempts = {};
    if (!state.last_sig_seen) state.last_sig_seen = {};
  } catch (_) {
    state = { slash_attempts: {}, last_sig_seen: {} };
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

module.exports = {
  init,
  wasAlreadySlashed,
  recordSlashAttempt,
  getRecentSlashes,
  getLastSigSeen,
  setLastSigSeen,
};
