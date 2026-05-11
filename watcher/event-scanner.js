'use strict';
// Scans the vault program's transaction history for Slashed / Claimed events
// and accumulates lifetime totals into db.totals.
//
// Event payloads (Anchor `emit!`, Borsh after 8-byte discriminator):
//   Slashed   : commitment(32) + owner(32) + principal(8)
//   Claimed   : commitment(32) + owner(32) + principal(8) + yield_paid(8)
//
// Totals semantics:
//   total_slashed_lamports        = Σ Slashed.principal
//   total_redistributed_lamports  = Σ Claimed.yield_paid
//
// Strategy:
//   - First run (history_backfill_done=false): page backwards through ALL
//     program signatures via getSignaturesForAddress(before=...) until empty.
//   - Subsequent runs: only scan signatures newer than last_program_sig_cursor.
//   - Idempotency via eventKey = `${kind}:${signature}:${logIndex}`, so re-runs
//     and overlapping windows never double-count.

const { sha256 } = require('@noble/hashes/sha2');
const { PROGRAM_ID } = require('./chain');
const bs58 = require('bs58');

function eventDisc(name) {
  return Buffer.from(sha256(`event:${name}`)).slice(0, 8);
}
const SLASHED_DISC = eventDisc('Slashed');
const CLAIMED_DISC = eventDisc('Claimed');
const CANCELLED_DISC = eventDisc('Cancelled');

const SIG_PAGE_LIMIT = 1000; // RPC max
const TX_BATCH = 5;          // concurrent getTransaction calls

function parseEventBytes(b64) {
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length < 8 + 32 + 32 + 8) return null;
  const disc = bytes.slice(0, 8);
  let kind = null;
  if (disc.equals(SLASHED_DISC)) kind = 'Slashed';
  else if (disc.equals(CLAIMED_DISC)) kind = 'Claimed';
  else if (disc.equals(CANCELLED_DISC)) kind = 'Cancelled';
  else return null;

  // Common fields for all events
  const commitment = bytes.slice(8, 40).toString('base64'); // Store as base64 for now
  const owner = bytes.slice(40, 72).toString('base64');
  const principal = bytes.readBigUInt64LE(72);

  let yieldPaid = null;
  let typeDisc = null;
  let targetMint = null;
  let createdAt = null;
  let expiresAt = null;

  if (kind === 'Claimed') {
    // Claimed: yield_paid at [80:88], new fields start at [88]
    if (bytes.length >= 88) {
      yieldPaid = bytes.readBigUInt64LE(80);
    }
    if (bytes.length >= 137) {
      typeDisc = bytes[88];
      targetMint = bytes.slice(89, 121).toString('base64');
      createdAt = bytes.readBigInt64LE(121);
      expiresAt = bytes.readBigInt64LE(129);
    }
  } else {
    // Slashed / Cancelled: new fields start at [80]
    if (bytes.length >= 129) {
      typeDisc = bytes[80];
      targetMint = bytes.slice(81, 113).toString('base64');
      createdAt = bytes.readBigInt64LE(113);
      expiresAt = bytes.readBigInt64LE(121);
    }
  }

  const typeNames = ['NoSell', 'HoldAbove', 'NoTradeWindow', 'AgentGuardian'];
  const typeName = typeDisc !== null ? typeNames[typeDisc] : null;

  return {
    kind,
    commitment,
    owner,
    principal,
    yieldPaid,
    typeName,
    targetMint,
    createdAt: createdAt !== null ? Number(createdAt) : null,
    expiresAt: expiresAt !== null ? Number(expiresAt) : null,
  };
}

async function processTx(db, signature, blockTime, logs) {
  if (!Array.isArray(logs)) return;
  for (let i = 0; i < logs.length; i++) {
    const m = logs[i].match(/^Program data: (.+)$/);
    if (!m) continue;
    const ev = parseEventBytes(m[1]);
    if (!ev) continue;
    const eventKey = `${ev.kind}:${signature}:${i}`;
    if (db.hasSeenEvent(eventKey)) continue;

    // Convert base64 pubkeys to base58
    const commitmentB58 = bs58.encode(Buffer.from(ev.commitment, 'base64'));
    const ownerB58 = bs58.encode(Buffer.from(ev.owner, 'base64'));
    const targetMintB58 = ev.targetMint ? bs58.encode(Buffer.from(ev.targetMint, 'base64')) : null;

    // Update totals (legacy behavior)
    if (ev.kind === 'Slashed') {
      db.addSlashed(eventKey, ev.principal);
    } else if (ev.kind === 'Claimed') {
      db.addRedistributed(eventKey, ev.yieldPaid || 0n);
    }
    // Note: Cancelled doesn't affect totals (no redistribution)

    // Persist full event details for cross-device history
    db.addTerminatedEvent(
      {
        kind: ev.kind,
        commitment: commitmentB58,
        owner: ownerB58,
        principal: ev.principal,
        typeName: ev.typeName,
        targetMint: targetMintB58,
        createdAt: ev.createdAt,
        expiresAt: ev.expiresAt,
        yieldPaid: ev.yieldPaid,
      },
      signature,
      blockTime,
    );
  }
}

async function fetchTxBatch(connection, signatures) {
  return Promise.all(
    signatures.map((s) =>
      connection
        .getTransaction(s, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
        .catch(() => null),
    ),
  );
}

// Scan a single page of signatures (already fetched), parse + accumulate.
async function scanSignatures(connection, db, sigInfos) {
  for (let i = 0; i < sigInfos.length; i += TX_BATCH) {
    const slice = sigInfos.slice(i, i + TX_BATCH);
    const txs = await fetchTxBatch(connection, slice.map((s) => s.signature));
    for (let j = 0; j < txs.length; j++) {
      const tx = txs[j];
      if (!tx?.meta?.logMessages) continue;
      // Skip failed transactions — emit! only fires on success but be safe.
      if (tx.meta.err) continue;
      await processTx(db, slice[j].signature, tx.blockTime || slice[j].blockTime || 0, tx.meta.logMessages);
    }
  }
}

// One-shot: catch up from cursor to head, OR backfill all history on first run.
async function runScan(connection, db) {
  const isBackfill = !db.getTotals().history_backfill_done;

  if (isBackfill) {
    console.log('[SCANNER] backfilling full program history...');
    let before = undefined;
    let pages = 0;
    let newestSig = null;
    while (true) {
      const sigs = await connection.getSignaturesForAddress(PROGRAM_ID, {
        limit: SIG_PAGE_LIMIT,
        before,
      });
      if (!sigs.length) break;
      if (!newestSig) newestSig = sigs[0].signature;
      await scanSignatures(connection, db, sigs);
      pages += 1;
      console.log(`[SCANNER] backfill page ${pages}, ${sigs.length} sigs, oldest=${sigs[sigs.length - 1].signature.slice(0, 8)}`);
      if (sigs.length < SIG_PAGE_LIMIT) break;
      before = sigs[sigs.length - 1].signature;
    }
    if (newestSig) db.setProgramSigCursor(newestSig);
    db.markBackfillDone();
    db.markScanCompleted();
    db.persistTotals();
    const t = db.getTotals();
    console.log(`[SCANNER] backfill done. slashed=${t.total_slashed_lamports} redistributed=${t.total_redistributed_lamports}`);
    return;
  }

  // Incremental: pull pages newer than cursor (inclusive of new head).
  const cursor = db.getProgramSigCursor();
  const collected = [];
  let before = undefined;
  let foundCursor = false;
  while (!foundCursor) {
    const sigs = await connection.getSignaturesForAddress(PROGRAM_ID, {
      limit: SIG_PAGE_LIMIT,
      before,
      until: cursor || undefined,
    });
    if (!sigs.length) break;
    collected.push(...sigs);
    if (sigs.length < SIG_PAGE_LIMIT) break;
    before = sigs[sigs.length - 1].signature;
    // safety: cap incremental scan at 5 pages (5000 sigs) per cycle
    if (collected.length >= SIG_PAGE_LIMIT * 5) break;
  }
  if (collected.length === 0) {
    db.markScanCompleted();
    db.persistTotals();
    return;
  }
  await scanSignatures(connection, db, collected);
  db.setProgramSigCursor(collected[0].signature); // newest
  db.markScanCompleted();
  db.persistTotals();
  console.log(`[SCANNER] incremental: ${collected.length} new sigs processed`);
}

module.exports = { runScan };
