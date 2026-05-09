'use strict';

const { Connection, PublicKey } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { sha256 } = require('@noble/hashes/sha2');
const bs58 = require('bs58');

// ---------------------------------------------------------------------------
// Constants — must match anchor/programs/vault/
// ---------------------------------------------------------------------------

const PROGRAM_ID = new PublicKey('3TyFQro3GCCfd4yV5Wmbb2Rrzh35TreXJWMfbFs5dz5S');

function anchorDisc(name) {
  return Buffer.from(sha256(`account:${name}`)).slice(0, 8);
}

const DISC = {
  NoSell: anchorDisc('NoSellCommitment'),
  HoldAbove: anchorDisc('HoldAboveCommitment'),
  NoTradeWindow: anchorDisc('NoTradeWindowCommitment'),
  AgentGuardian: anchorDisc('AgentGuardianCommitment'),
};

// ---------------------------------------------------------------------------
// Deserializers — layouts must match #[derive(InitSpace)] field order
// ---------------------------------------------------------------------------

function readPubkey(data, offset) {
  return bs58.encode(data.slice(offset, offset + 32));
}

// NoSellCommitment / HoldAboveCommitment have identical layout:
// owner(32) + target_mint(32) + floor_amount(8) + stake_amount(8) + weight(8)
// + reward_debt(16) + created_at(8) + expires_at(8) + bump(1) + vault_bump(1)
function deserializeMintScoped(data, type) {
  let o = 8;
  const owner = readPubkey(data, o); o += 32;
  const target_mint = readPubkey(data, o); o += 32;
  const floor_amount = data.readBigUInt64LE(o); o += 8;
  const stake_amount = data.readBigUInt64LE(o); o += 8;
  const weight = data.readBigUInt64LE(o); o += 8;
  const reward_debt = data.readBigUInt64LE(o) | (data.readBigUInt64LE(o + 8) << 64n); o += 16;
  const created_at = data.readBigInt64LE(o); o += 8;
  const expires_at = data.readBigInt64LE(o); o += 8;
  const bump = data.readUInt8(o); o += 1;
  const vault_bump = data.readUInt8(o);
  return { type, owner, target_mint, floor_amount, stake_amount, weight, reward_debt, created_at, expires_at, bump, vault_bump };
}

// NoTradeWindowCommitment:
// owner(32) + nonce(8) + window_start_hour(1) + window_end_hour(1)
// + stake_amount(8) + weight(8) + reward_debt(16) + created_at(8) + expires_at(8) + bump(1) + vault_bump(1)
function deserializeNoTradeWindow(data) {
  let o = 8;
  const owner = readPubkey(data, o); o += 32;
  const nonce = data.readBigUInt64LE(o); o += 8;
  const window_start_hour = data.readUInt8(o); o += 1;
  const window_end_hour = data.readUInt8(o); o += 1;
  const stake_amount = data.readBigUInt64LE(o); o += 8;
  const weight = data.readBigUInt64LE(o); o += 8;
  const reward_debt = data.readBigUInt64LE(o) | (data.readBigUInt64LE(o + 8) << 64n); o += 16;
  const created_at = data.readBigInt64LE(o); o += 8;
  const expires_at = data.readBigInt64LE(o); o += 8;
  const bump = data.readUInt8(o); o += 1;
  const vault_bump = data.readUInt8(o);
  return { type: 'NoTradeWindow', owner, nonce, window_start_hour, window_end_hour, stake_amount, weight, reward_debt, created_at, expires_at, bump, vault_bump };
}

// AgentGuardianCommitment:
// owner(32) + guardian_pubkey(32) + stake_amount(8) + weight(8)
// + reward_debt(16) + created_at(8) + expires_at(8) + bump(1) + vault_bump(1)
function deserializeAgentGuardian(data) {
  let o = 8;
  const owner = readPubkey(data, o); o += 32;
  const guardian_pubkey = readPubkey(data, o); o += 32;
  const stake_amount = data.readBigUInt64LE(o); o += 8;
  const weight = data.readBigUInt64LE(o); o += 8;
  const reward_debt = data.readBigUInt64LE(o) | (data.readBigUInt64LE(o + 8) << 64n); o += 16;
  const created_at = data.readBigInt64LE(o); o += 8;
  const expires_at = data.readBigInt64LE(o); o += 8;
  const bump = data.readUInt8(o); o += 1;
  const vault_bump = data.readUInt8(o);
  return { type: 'AgentGuardian', owner, guardian_pubkey, stake_amount, weight, reward_debt, created_at, expires_at, bump, vault_bump };
}

const PARSERS = {
  NoSell: (d) => deserializeMintScoped(d, 'NoSell'),
  HoldAbove: (d) => deserializeMintScoped(d, 'HoldAbove'),
  NoTradeWindow: deserializeNoTradeWindow,
  AgentGuardian: deserializeAgentGuardian,
};

// ---------------------------------------------------------------------------
// Fetch all commitments (4 types) via getProgramAccounts with discriminator filter
// ---------------------------------------------------------------------------

async function fetchAllCommitmentsByType(connection, typeName) {
  const disc = DISC[typeName];
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [{ memcmp: { offset: 0, bytes: bs58.encode(disc) } }],
  });
  const parser = PARSERS[typeName];
  return accounts
    .map(({ pubkey, account }) => {
      try {
        return { pubkey: pubkey.toBase58(), ...parser(account.data) };
      } catch (err) {
        console.warn(`[chain] Failed to parse ${typeName} ${pubkey.toBase58()}: ${err.message}`);
        return null;
      }
    })
    .filter(Boolean);
}

async function fetchAllCommitments(connection) {
  const types = Object.keys(DISC);
  const all = await Promise.all(types.map((t) => fetchAllCommitmentsByType(connection, t)));
  return all.flat();
}

// ---------------------------------------------------------------------------
// SPL token balance: SUM across all owner's accounts for the mint (per OQ-8)
// ---------------------------------------------------------------------------

async function getOwnerTokenBalanceAggregate(connection, ownerStr, mintStr) {
  const owner = new PublicKey(ownerStr);
  const mint = new PublicKey(mintStr);
  const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint });
  let total = 0n;
  for (const { account } of accounts.value) {
    const amt = account.data?.parsed?.info?.tokenAmount?.amount;
    if (amt) total += BigInt(amt);
  }
  return total;
}

async function getOwnerTokenAccountPubkeys(connection, ownerStr, mintStr) {
  const owner = new PublicKey(ownerStr);
  const mint = new PublicKey(mintStr);
  const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint });
  return accounts.value.map((a) => a.pubkey);
}

module.exports = {
  PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  DISC,
  fetchAllCommitments,
  fetchAllCommitmentsByType,
  getOwnerTokenBalanceAggregate,
  getOwnerTokenAccountPubkeys,
};
