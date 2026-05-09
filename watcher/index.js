'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const path = require('path');
const fs = require('fs');
const { Connection, Keypair } = require('@solana/web3.js');
const express = require('express');
const cors = require('cors');

const db = require('./db');
const { fetchAllCommitments, getTokenBalance } = require('./chain');
const { patrol } = require('./patrol');

// ============================================================================
// Configuration & Initialization
// ============================================================================

const RPC_URL = process.env.HELIUS_RPC_URL ?? 'https://api.devnet.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

// Load slasher keypair
let slasherKeypair = null;
const keypairPath = process.env.SLASHER_KEYPAIR_PATH ?? path.join(__dirname, 'slasher-keypair.json');

try {
  slasherKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf8')))
  );
} catch (err) {
  console.log(`[WATCHER] WARNING: Slasher keypair not found at ${keypairPath}. Slash functionality disabled.`);
  slasherKeypair = null;
}

// Initialize database
db.init();

// ============================================================================
// Polling Loops
// ============================================================================

/**
 * Sync commitments from chain every 60 seconds.
 * Fetch all active commitments and store them in DB.
 * If a commitment hasn't been snapshotted yet, capture the current token balance.
 */
async function syncCommitments() {
  try {
    const commitments = await fetchAllCommitments(connection);
    for (const c of commitments) {
      db.upsertCommitment(c);
      if (!db.getSnapshot(c.pubkey)) {
        const balance = await getTokenBalance(connection, c.owner, c.target_mint);
        db.setSnapshot(c.pubkey, balance);
      }
    }
    console.log(`[SYNC] ${commitments.length} active commitments`);
  } catch (err) {
    console.error('[SYNC] Error:', err.message);
  }
}

/**
 * Run patrol loop every 30 seconds.
 * Detects violations and executes slashes if slasher keypair is available.
 */
async function runPatrol() {
  if (!slasherKeypair) {
    console.warn('[PATROL] Skipping — no slasher keypair loaded');
    return;
  }
  try {
    await patrol(connection, db, slasherKeypair);
  } catch (err) {
    console.error('[PATROL] Error:', err.message);
  }
}

// ============================================================================
// Express Server
// ============================================================================

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

/**
 * GET /commitments
 * Returns all active commitments from the database.
 */
app.get('/commitments', (req, res) => {
  try {
    const commitments = db.getActiveCommitments();
    res.json(commitments);
  } catch (err) {
    console.error('[GET /commitments] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /history
 * Returns slash history (slash events) from the database.
 */
app.get('/history', (req, res) => {
  try {
    const history = db.getSlashHistory();
    res.json(history);
  } catch (err) {
    console.error('[GET /history] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// Startup Sequence
// ============================================================================

// Initial sync
syncCommitments();

// Start periodic sync (every 60 seconds)
setInterval(syncCommitments, 60_000);

// Start patrol loop after 5 second delay (every 30 seconds)
setTimeout(() => {
  runPatrol();
  setInterval(runPatrol, 30_000);
}, 5_000);

// Start Express server
app.listen(PORT, () => {
  console.log('[WATCHER] Listening on :' + PORT);
});
