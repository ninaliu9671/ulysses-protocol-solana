'use strict';

const { PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');
const { fetchAllCommitments, getTokenBalance } = require('./chain');
const { executeSlash } = require('./slash');

// ---------------------------------------------------------------------------
// Violation detection per commitment type
// ---------------------------------------------------------------------------

/**
 * Inspect a single commitment and return a violation descriptor, or null if
 * there is no violation (or monitoring does not apply at this moment).
 *
 * @param {import('@solana/web3.js').Connection} connection
 * @param {object} db  — the db module (getSnapshot / updateSnapshot helpers)
 * @param {object} commitment — deserialized CommitmentAccount from chain.js
 * @returns {Promise<{txSignatureBytes: Uint8Array}|null>}
 */
async function detectViolation(connection, db, commitment) {
  try {
    const ct = commitment.commitment_type;

    // -----------------------------------------------------------------------
    // HoldAbove — balance must stay >= threshold
    // -----------------------------------------------------------------------
    if (ct.type === 'HoldAbove') {
      const balance = await getTokenBalance(connection, commitment.owner, commitment.target_mint);
      if (balance < ct.threshold) {
        return { txSignatureBytes: new Uint8Array(64) };
      }
      return null;
    }

    // -----------------------------------------------------------------------
    // HoldUntil — balance must not decrease before unlock_at timestamp
    // -----------------------------------------------------------------------
    if (ct.type === 'HoldUntil') {
      const nowSec = BigInt(Math.floor(Date.now() / 1000));
      if (nowSec >= ct.unlock_at) {
        // Commitment has expired; nothing to enforce.
        return null;
      }

      const snapshot = await db.getSnapshot(commitment.pubkey);
      if (!snapshot) {
        // No baseline recorded yet; skip until initialised.
        return null;
      }

      const balance = await getTokenBalance(connection, commitment.owner, commitment.target_mint);
      if (balance < BigInt(snapshot.balance)) {
        return { txSignatureBytes: new Uint8Array(64) };
      }
      return null;
    }

    // -----------------------------------------------------------------------
    // NoBuy — balance must not increase (buying is prohibited)
    // -----------------------------------------------------------------------
    if (ct.type === 'NoBuy') {
      const snapshot = await db.getSnapshot(commitment.pubkey);
      if (!snapshot) {
        return null;
      }

      const balance = await getTokenBalance(connection, commitment.owner, commitment.target_mint);
      if (balance > BigInt(snapshot.balance)) {
        return { txSignatureBytes: new Uint8Array(64) };
      }

      // No violation — update snapshot so the baseline tracks any decreases
      // (e.g. user sells some tokens; we don't want a false positive later).
      await db.updateSnapshot(commitment.pubkey, balance);
      return null;
    }

    // -----------------------------------------------------------------------
    // NoSell — balance must not decrease (selling is prohibited)
    // -----------------------------------------------------------------------
    if (ct.type === 'NoSell') {
      const snapshot = await db.getSnapshot(commitment.pubkey);
      if (!snapshot) {
        return null;
      }

      const balance = await getTokenBalance(connection, commitment.owner, commitment.target_mint);
      if (balance < BigInt(snapshot.balance)) {
        return { txSignatureBytes: new Uint8Array(64) };
      }

      // No violation — update snapshot in case balance grew (buys are ok).
      await db.updateSnapshot(commitment.pubkey, balance);
      return null;
    }

    // -----------------------------------------------------------------------
    // NoTradeWindow — no token activity allowed within the configured UTC window
    // Only transactions touching the target_mint ATA count as violations.
    // -----------------------------------------------------------------------
    if (ct.type === 'NoTradeWindow') {
      const nowHour = new Date().getUTCHours(); // 0-23
      const wStart = ct.window_start_hour;
      const wEnd = ct.window_end_hour;

      // Determine whether we are currently inside the restricted window.
      // Handles both normal ranges (e.g. 9→17) and midnight-wrapping ranges
      // (e.g. 22→6).
      const inWindow =
        wStart <= wEnd
          ? nowHour >= wStart && nowHour < wEnd           // normal: 9 ≤ h < 17
          : nowHour >= wStart || nowHour < wEnd;          // wraps midnight: h ≥ 22 || h < 6

      if (!inWindow) {
        // Outside the monitored window; nothing to check.
        return null;
      }

      // Derive the owner's Associated Token Account for target_mint.
      // Monitor that ATA address — only transactions that actually touch the
      // target token will appear here (SOL transfers won't show up).
      const { getAssociatedTokenAddressSync } = require('@solana/spl-token');
      const ownerPubkey = new PublicKey(commitment.owner);
      const mintPubkey = new PublicKey(commitment.target_mint);
      let ata;
      try {
        ata = getAssociatedTokenAddressSync(mintPubkey, ownerPubkey);
      } catch {
        // ATA derivation failed (e.g. invalid mint) — skip.
        return null;
      }

      const nowSec = BigInt(Math.floor(Date.now() / 1000));
      const sigs = await connection.getSignaturesForAddress(ata, { limit: 10 });

      // Only flag transactions within the last 2 minutes (one patrol cycle).
      const recentSigs = sigs.filter(
        (s) => s.blockTime && nowSec - BigInt(s.blockTime) < 120n
      );

      if (recentSigs.length > 0) {
        // Decode the first recent signature into raw bytes for the slash ix.
        const decoded = bs58.decode(recentSigs[0].signature);
        const txSignatureBytes = new Uint8Array(64);
        txSignatureBytes.set(decoded.slice(0, 64));
        return { txSignatureBytes };
      }

      return null;
    }

    // Unknown commitment type — do nothing.
    console.warn(`[PATROL] Unknown commitment type: ${ct.type}`);
    return null;
  } catch (err) {
    console.error(
      `[PATROL] detectViolation error for ${commitment.pubkey}: ${err.message}`
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main patrol loop
// ---------------------------------------------------------------------------

/**
 * Fetch all on-chain commitments, check each for violations, and slash any
 * offenders.
 *
 * @param {import('@solana/web3.js').Connection} connection
 * @param {object} db
 * @param {import('@solana/web3.js').Keypair} slasher
 */
async function patrol(connection, db, slasher) {
  const commitments = await fetchAllCommitments(connection);

  for (const c of commitments) {
    const violation = await detectViolation(connection, db, c);
    if (violation) {
      console.log(
        `[PATROL] Violation detected: owner=${c.owner} type=${c.commitment_type.type}`
      );
      try {
        const sig = await executeSlash(
          connection,
          slasher,
          c,
          violation.txSignatureBytes
        );
        db.markSlashed(c.pubkey, sig, c.stake_amount);
      } catch (err) {
        console.error(`[PATROL] Slash failed for ${c.owner}: ${err.message}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { patrol, detectViolation };
