'use strict';

const { PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { sha256 } = require('@noble/hashes/sha2');
const { PROGRAM_ID, getOwnerTokenAccountPubkeys } = require('./chain');

// On-chain treasury (from initialize) — must match RewardPool.treasury.
const TREASURY = new PublicKey('9CYhSzFPXUQRmKncPtBFuPdRMZwumsexcDUVGaULcQo6');

const REWARD_POOL_SEED = Buffer.from('reward_pool');
const PROTOCOL_VAULT_SEED = Buffer.from('protocol_vault');
const NO_SELL_SEED = Buffer.from('no_sell');
const HOLD_ABOVE_SEED = Buffer.from('hold_above');
const NO_TRADE_SEED = Buffer.from('no_trade');
const AGENT_GUARD_SEED = Buffer.from('agent_guard');
const VAULT_SEED = Buffer.from('vault');

function ixDisc(name) {
  return Buffer.from(sha256(`global:${name}`)).slice(0, 8);
}

const IX_DISC = {
  slash_no_sell: ixDisc('slash_no_sell'),
  slash_hold_above: ixDisc('slash_hold_above'),
  slash_no_trade_window: ixDisc('slash_no_trade_window'),
  slash_agent_guardian: ixDisc('slash_agent_guardian'),
};

function findPda(seeds) {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID);
}

function commitmentPda(c) {
  switch (c.type) {
    case 'NoSell':
      return findPda([NO_SELL_SEED, new PublicKey(c.owner).toBuffer(), new PublicKey(c.target_mint).toBuffer()]);
    case 'HoldAbove':
      return findPda([HOLD_ABOVE_SEED, new PublicKey(c.owner).toBuffer(), new PublicKey(c.target_mint).toBuffer()]);
    case 'NoTradeWindow': {
      const nonceBuf = Buffer.alloc(8);
      nonceBuf.writeBigUInt64LE(c.nonce);
      return findPda([NO_TRADE_SEED, new PublicKey(c.owner).toBuffer(), nonceBuf]);
    }
    case 'AgentGuardian':
      return findPda([AGENT_GUARD_SEED, new PublicKey(c.owner).toBuffer()]);
    default:
      throw new Error('unknown type ' + c.type);
  }
}

function commonAccounts(c, slasher, cPda) {
  const [vault] = findPda([VAULT_SEED, cPda.toBuffer()]);
  const [reward_pool] = findPda([REWARD_POOL_SEED]);
  const [protocol_vault] = findPda([PROTOCOL_VAULT_SEED]);
  return [
    { pubkey: slasher, isSigner: true, isWritable: false },
    { pubkey: new PublicKey(c.owner), isSigner: false, isWritable: true },
    { pubkey: cPda, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: reward_pool, isSigner: false, isWritable: true },
    { pubkey: protocol_vault, isSigner: false, isWritable: true },
    { pubkey: TREASURY, isSigner: false, isWritable: true },
  ];
}

async function buildSlashIx(connection, c, slasher) {
  const [pda] = commitmentPda(c);
  const keys = commonAccounts(c, slasher, pda);
  let disc;
  switch (c.type) {
    case 'NoSell': disc = IX_DISC.slash_no_sell; break;
    case 'HoldAbove': disc = IX_DISC.slash_hold_above; break;
    case 'NoTradeWindow': disc = IX_DISC.slash_no_trade_window; break;
    case 'AgentGuardian': disc = IX_DISC.slash_agent_guardian; break;
    default: throw new Error('unknown type ' + c.type);
  }
  if (c.type === 'NoSell' || c.type === 'HoldAbove') {
    const tokenAccts = await getOwnerTokenAccountPubkeys(connection, c.owner, c.target_mint);
    for (const p of tokenAccts) {
      keys.push({ pubkey: p, isSigner: false, isWritable: false });
    }
  }
  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data: disc });
}

async function submitSlash(connection, c, slasherKeypair) {
  const ix = await buildSlashIx(connection, c, slasherKeypair.publicKey);
  const tx = new Transaction().add(ix);
  return await sendAndConfirmTransaction(connection, tx, [slasherKeypair], { commitment: 'confirmed' });
}

module.exports = { submitSlash, buildSlashIx, commitmentPda };
