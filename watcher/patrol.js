'use strict';

const { PublicKey } = require('@solana/web3.js');
const { fetchAllCommitments, getOwnerTokenBalanceAggregate } = require('./chain');
const { submitSlash } = require('./slash');

async function checkBalanceViolation(connection, c) {
  const balance = await getOwnerTokenBalanceAggregate(connection, c.owner, c.target_mint);
  return balance < c.floor_amount;
}

// Returns true if any signed-by-owner tx has blockTime falling within the
// configured UTC window since commitment creation.
async function checkNoTradeWindowViolation(connection, c) {
  const owner = new PublicKey(c.owner);
  const sigs = await connection.getSignaturesForAddress(owner, { limit: 100 });
  const startBlock = Number(c.created_at);
  for (const s of sigs) {
    if (!s.blockTime || s.blockTime < startBlock) continue;
    const hour = new Date(s.blockTime * 1000).getUTCHours();
    const start = c.window_start_hour;
    const end = c.window_end_hour;
    const inWindow = start < end ? hour >= start && hour < end : hour >= start || hour < end;
    if (inWindow) return { violated: true, signature: s.signature, blockTime: s.blockTime };
  }
  return { violated: false };
}

// Returns true if any owner-signed tx during the commitment moves funds out
// of the wallet (preBalance > postBalance for the owner SOL account, OR any
// SPL token amount decreased). Pure account-creation rent transfers are
// tolerated below a small threshold.
async function checkAgentGuardianViolation(connection, c) {
  const owner = new PublicKey(c.owner);
  const sigs = await connection.getSignaturesForAddress(owner, { limit: 50 });
  const startBlock = Number(c.created_at);
  for (const s of sigs) {
    if (!s.blockTime || s.blockTime < startBlock) continue;
    const tx = await connection.getTransaction(s.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    if (!tx || !tx.meta) continue;
    const accountKeys = tx.transaction.message.staticAccountKeys ?? tx.transaction.message.accountKeys ?? [];
    const ownerIdx = accountKeys.findIndex((k) => k.equals(owner));
    if (ownerIdx < 0) continue;
    const numSigners = tx.transaction.message.header.numRequiredSignatures;
    const ownerSigned = ownerIdx < numSigners;
    if (!ownerSigned) continue;
    const pre = tx.meta.preBalances[ownerIdx];
    const post = tx.meta.postBalances[ownerIdx];
    if (pre - post > 100_000) {
      return { violated: true, signature: s.signature, blockTime: s.blockTime };
    }
    const preTok = tx.meta.preTokenBalances ?? [];
    const postTok = tx.meta.postTokenBalances ?? [];
    for (const ptb of preTok) {
      if (accountKeys[ptb.accountIndex]?.equals(owner) || ptb.owner === c.owner) {
        const matchPost = postTok.find((p) => p.accountIndex === ptb.accountIndex);
        const preAmt = BigInt(ptb.uiTokenAmount.amount);
        const postAmt = matchPost ? BigInt(matchPost.uiTokenAmount.amount) : 0n;
        if (preAmt > postAmt) return { violated: true, signature: s.signature, blockTime: s.blockTime };
      }
    }
  }
  return { violated: false };
}

async function checkViolation(connection, c) {
  switch (c.type) {
    case 'NoSell':
    case 'HoldAbove': {
      const v = await checkBalanceViolation(connection, c);
      return { violated: v };
    }
    case 'NoTradeWindow':
      return await checkNoTradeWindowViolation(connection, c);
    case 'AgentGuardian':
      return await checkAgentGuardianViolation(connection, c);
    default:
      return { violated: false };
  }
}

async function patrol(connection, db, slasherKeypair) {
  const commitments = await fetchAllCommitments(connection);
  let violations = 0;
  for (const c of commitments) {
    if (db.wasAlreadySlashed(c.pubkey)) continue;
    try {
      const res = await checkViolation(connection, c);
      if (res.violated) {
        violations += 1;
        console.log(`[VIOLATION] ${c.type} ${c.pubkey} owner=${c.owner}${res.signature ? ' tx=' + res.signature : ''}`);
        try {
          const sig = await submitSlash(connection, c, slasherKeypair);
          console.log(`[SLASH] ${c.type} ${c.pubkey} → ${sig}`);
          db.recordSlashAttempt(c.pubkey, c.type, c.owner, sig, true, null);
        } catch (err) {
          console.error(`[SLASH FAIL] ${c.type} ${c.pubkey}: ${err.message}`);
          db.recordSlashAttempt(c.pubkey, c.type, c.owner, null, false, err.message);
        }
      }
    } catch (err) {
      console.warn(`[PATROL] check ${c.type} ${c.pubkey} failed: ${err.message}`);
    }
  }
  console.log(`[PATROL] ${commitments.length} active, ${violations} violations`);
}

module.exports = { patrol, checkViolation };
