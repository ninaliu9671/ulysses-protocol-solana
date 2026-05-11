'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const path = require('path');
const fs = require('fs');
const { Connection, Keypair } = require('@solana/web3.js');
const express = require('express');
const cors = require('cors');

const db = require('./db');
const { fetchAllCommitments } = require('./chain');
const { patrol, checkViolation } = require('./patrol');
const { submitSlash } = require('./slash');
const { runScan } = require('./event-scanner');

const RPC_URL = process.env.HELIUS_RPC_URL ?? 'https://api.devnet.solana.com';
const PORT = process.env.PORT ?? 3001;
const HELIUS_WEBHOOK_SECRET = process.env.HELIUS_WEBHOOK_SECRET ?? null;
const KEYPAIR_PATH = process.env.SLASHER_KEYPAIR_PATH ?? path.join(__dirname, 'slasher-keypair.json');

const connection = new Connection(RPC_URL, 'confirmed');

// Load slasher keypair: env JSON first (for Railway-style deploy), else file path.
let slasherKeypair = null;
let keypairBytes;
if (process.env.SLASHER_KEYPAIR_JSON) {
  keypairBytes = JSON.parse(process.env.SLASHER_KEYPAIR_JSON);
} else {
  try {
    keypairBytes = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'));
  } catch (err) {
    console.warn(`[WATCHER] no slasher keypair at ${KEYPAIR_PATH} and SLASHER_KEYPAIR_JSON not set; slash disabled.`);
  }
}
if (keypairBytes) {
  slasherKeypair = Keypair.fromSecretKey(Uint8Array.from(keypairBytes));
  console.log('[WATCHER] slasher pubkey:', slasherKeypair.publicKey.toBase58());
}

db.init();

let lastWebhookSeen = null;
let lastPollCompleted = null;
let lastFullScanCompleted = null;
let lastEventScanCompleted = null;
let eventScanInFlight = false;

async function runEventScan() {
  if (eventScanInFlight) return;
  eventScanInFlight = true;
  try {
    await runScan(connection, db);
    lastEventScanCompleted = Date.now();
  } catch (err) {
    console.error('[SCANNER] error:', err.message);
  } finally {
    eventScanInFlight = false;
  }
}

async function runPatrol() {
  if (!slasherKeypair) return;
  try {
    await patrol(connection, db, slasherKeypair);
    lastPollCompleted = Date.now();
  } catch (err) {
    console.error('[PATROL] error:', err.message);
  }
}

// Helius webhook handler — best-effort fast path. Iterates the addresses
// referenced in the event, finds matching active commitments, runs check.
async function handleWebhookEvent(events) {
  if (!slasherKeypair) return;
  lastWebhookSeen = Date.now();
  const all = await fetchAllCommitments(connection);
  const owners = new Set();
  for (const ev of events) {
    for (const acct of ev.accountData ?? []) {
      if (acct.account) owners.add(acct.account);
    }
    if (ev.feePayer) owners.add(ev.feePayer);
  }
  const candidates = all.filter((c) => owners.has(c.owner));
  for (const c of candidates) {
    if (db.wasAlreadySlashed(c.pubkey)) continue;
    try {
      const res = await checkViolation(connection, c);
      if (res.violated) {
        console.log(`[WEBHOOK] violation detected ${c.type} ${c.pubkey}`);
        try {
          const sig = await submitSlash(connection, c, slasherKeypair);
          console.log(`[WEBHOOK SLASH] ${sig}`);
          db.recordSlashAttempt(c.pubkey, c.type, c.owner, sig, true, null);
        } catch (err) {
          db.recordSlashAttempt(c.pubkey, c.type, c.owner, null, false, err.message);
        }
      }
    } catch (err) {
      console.warn(`[WEBHOOK] check ${c.pubkey} failed: ${err.message}`);
    }
  }
}

// Startup full-scan recovery: catches any violations that occurred while watcher
// was offline. Per OQ-11.
async function recoverOnStartup() {
  console.log('[STARTUP] full-scan beginning...');
  await runPatrol();
  lastFullScanCompleted = Date.now();
  console.log('[STARTUP] full-scan complete');
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.post('/webhook/helius', async (req, res) => {
  if (HELIUS_WEBHOOK_SECRET) {
    if (req.headers['x-webhook-secret'] !== HELIUS_WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }
  const events = Array.isArray(req.body) ? req.body : [req.body];
  res.json({ ok: true, count: events.length });
  handleWebhookEvent(events).catch((err) => console.error('[WEBHOOK] handler error:', err.message));
});

app.get('/health', async (req, res) => {
  let slasherBalanceSol = null;
  if (slasherKeypair) {
    try {
      const lamports = await connection.getBalance(slasherKeypair.publicKey);
      slasherBalanceSol = lamports / 1e9;
    } catch (_) {}
  }
  res.json({
    healthy: true,
    uptime_seconds: process.uptime(),
    slasher_pubkey: slasherKeypair?.publicKey.toBase58() ?? null,
    slasher_balance_sol: slasherBalanceSol,
    last_webhook_seen: lastWebhookSeen,
    last_poll_completed: lastPollCompleted,
    last_full_scan_completed: lastFullScanCompleted,
    last_event_scan_completed: lastEventScanCompleted,
    rpc_url: RPC_URL,
  });
});

app.get('/commitments', async (req, res) => {
  try {
    const all = await fetchAllCommitments(connection);
    res.json(all.map((c) => ({
      ...c,
      stake_amount: c.stake_amount.toString(),
      weight: c.weight.toString(),
      reward_debt: c.reward_debt.toString(),
      created_at: c.created_at.toString(),
      expires_at: c.expires_at.toString(),
      floor_amount: c.floor_amount?.toString(),
      nonce: c.nonce?.toString(),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/history', (req, res) => {
  res.json(db.getRecentSlashes(50));
});

app.get('/stats', (req, res) => {
  const t = db.getTotals();
  res.json({
    total_slashed_lamports: t.total_slashed_lamports,
    total_redistributed_lamports: t.total_redistributed_lamports,
    history_backfill_done: t.history_backfill_done,
    last_scan_completed: t.last_scan_completed,
  });
});

// My Commitments history — terminated events for a specific owner
app.get('/events', (req, res) => {
  const owner = req.query.owner;
  const limit = parseInt(req.query.limit || '200', 10);
  if (!owner) {
    return res.status(400).json({ error: 'owner query param required' });
  }
  try {
    const events = db.getTerminatedEvents(owner, limit);
    res.json({ events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Siren Graveyard — recent Slashed + Cancelled events
app.get('/graveyard', (req, res) => {
  const limit = parseInt(req.query.limit || '50', 10);
  try {
    const events = db.getGraveyardEvents(limit);
    res.json({ events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

recoverOnStartup().then(() => {
  setInterval(runPatrol, 60_000);
  // Kick off event-scanner backfill in background; do not block server startup.
  runEventScan();
  setInterval(runEventScan, 60_000);
  app.listen(PORT, () => console.log(`[WATCHER] listening on :${PORT}`));
});
