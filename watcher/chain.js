'use strict';

const { Connection, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddressSync } = require('@solana/spl-token');
const bs58 = require('bs58');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROGRAM_ID = new PublicKey('7s1UK1nQWK7CrNcaS576gbpMjMqrph1vArRepnQYLki7');

/** Discriminator bytes for CommitmentAccount (first 8 bytes of account data) */
const COMMITMENT_DISCRIMINATOR = Buffer.from([155, 206, 108, 147, 168, 110, 100, 181]);

// bs58-encoded discriminator used as memcmp filter value
const DISCRIMINATOR_B58 = bs58.encode(COMMITMENT_DISCRIMINATOR);

// ---------------------------------------------------------------------------
// CommitmentType enum variant index → name
// ---------------------------------------------------------------------------

const COMMITMENT_TYPE_NAMES = {
  0: 'NoBuy',
  1: 'NoSell',
  2: 'HoldAbove',
  3: 'HoldUntil',
  4: 'NoTradeWindow',
};

// ---------------------------------------------------------------------------
// deserializeCommitmentAccount
// ---------------------------------------------------------------------------

/**
 * Deserialize a raw CommitmentAccount account data buffer into a plain object.
 *
 * Layout:
 *   [0..8)   discriminator  (8 bytes)
 *   [8..40)  owner          (32 bytes Pubkey)
 *   [40..72) target_mint    (32 bytes Pubkey)
 *   [72)     commitment_type variant index (u8)
 *            + optional payload:
 *              variant 0 (NoBuy)         — no payload
 *              variant 1 (NoSell)        — no payload
 *              variant 2 (HoldAbove)     — threshold u64 LE (8 bytes)
 *              variant 3 (HoldUntil)     — unlock_at i64 LE (8 bytes)
 *              variant 4 (NoTradeWindow) — window_start_hour u8 + window_end_hour u8 (2 bytes)
 *   ...      stake_amount   u64 LE (8 bytes)
 *   ...      slash_destination 32 bytes Pubkey
 *   ...      guardian_pubkey   1 byte (0=None / 1=Some) + 32 bytes if Some
 *   ...      is_active      1 byte bool
 *   ...      created_at     i64 LE (8 bytes)
 *   ...      bump           1 byte
 *   ...      vault_bump     1 byte
 *
 * @param {Buffer} data - Raw account data buffer
 * @returns {object} Parsed fields
 */
function deserializeCommitmentAccount(data) {
  let offset = 0;

  // --- discriminator (8 bytes) — skip ---
  offset += 8;

  // --- owner (32 bytes) ---
  const owner = bs58.encode(data.slice(offset, offset + 32));
  offset += 32;

  // --- target_mint (32 bytes) ---
  const target_mint = bs58.encode(data.slice(offset, offset + 32));
  offset += 32;

  // --- commitment_type (variant u8 + optional payload) ---
  const variantIndex = data.readUInt8(offset);
  offset += 1;

  let commitment_type;
  switch (variantIndex) {
    case 0: // NoBuy — no payload
      commitment_type = { type: 'NoBuy' };
      break;

    case 1: // NoSell — no payload
      commitment_type = { type: 'NoSell' };
      break;

    case 2: // HoldAbove — threshold u64 LE (8 bytes)
      commitment_type = {
        type: 'HoldAbove',
        threshold: data.readBigUInt64LE(offset),
      };
      offset += 8;
      break;

    case 3: // HoldUntil — unlock_at i64 LE (8 bytes)
      commitment_type = {
        type: 'HoldUntil',
        unlock_at: data.readBigInt64LE(offset),
      };
      offset += 8;
      break;

    case 4: // NoTradeWindow — window_start_hour u8 + window_end_hour u8
      commitment_type = {
        type: 'NoTradeWindow',
        window_start_hour: data.readUInt8(offset),
        window_end_hour: data.readUInt8(offset + 1),
      };
      offset += 2;
      break;

    default:
      throw new Error(`Unknown CommitmentType variant index: ${variantIndex}`);
  }

  // --- stake_amount (u64 LE, 8 bytes) ---
  const stake_amount = data.readBigUInt64LE(offset);
  offset += 8;

  // --- slash_destination (32 bytes) ---
  const slash_destination = bs58.encode(data.slice(offset, offset + 32));
  offset += 32;

  // --- guardian_pubkey (Option<Pubkey>: 1 byte tag + 32 bytes if Some) ---
  const guardianTag = data.readUInt8(offset);
  offset += 1;

  let guardian_pubkey = null;
  if (guardianTag === 1) {
    guardian_pubkey = bs58.encode(data.slice(offset, offset + 32));
    offset += 32;
  }

  // --- is_active (1 byte bool) ---
  const is_active = data.readUInt8(offset) !== 0;
  offset += 1;

  // --- created_at (i64 LE, 8 bytes) ---
  const created_at = data.readBigInt64LE(offset);
  offset += 8;

  // --- bump (1 byte) ---
  const bump = data.readUInt8(offset);
  offset += 1;

  // --- vault_bump (1 byte) ---
  const vault_bump = data.readUInt8(offset);
  // offset += 1; // no further reads needed

  return {
    owner,
    target_mint,
    commitment_type,
    stake_amount,
    slash_destination,
    guardian_pubkey,
    is_active,
    created_at,
    bump,
    vault_bump,
  };
}

// ---------------------------------------------------------------------------
// fetchAllCommitments
// ---------------------------------------------------------------------------

/**
 * Fetch all active CommitmentAccount PDAs from the Solana program.
 *
 * @param {Connection} connection - @solana/web3.js Connection instance
 * @returns {Promise<Array<object>>} Array of active commitment objects with pubkey field
 */
async function fetchAllCommitments(connection) {
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: DISCRIMINATOR_B58,
        },
      },
    ],
  });

  const parsed = accounts.map(({ pubkey, account }) => {
    try {
      const fields = deserializeCommitmentAccount(account.data);
      return { pubkey: pubkey.toBase58(), ...fields };
    } catch (err) {
      console.warn(`[chain] Failed to deserialize account ${pubkey.toBase58()}:`, err.message);
      return null;
    }
  });

  return parsed.filter(Boolean).filter((c) => c.is_active === true);
}

// ---------------------------------------------------------------------------
// getTokenBalance
// ---------------------------------------------------------------------------

/**
 * Get the SPL token balance for a given owner and mint.
 * Returns the raw token amount as a BigInt.
 * Returns 0n if the associated token account does not exist.
 *
 * @param {Connection} connection - @solana/web3.js Connection instance
 * @param {string} ownerPubkeyStr - Base58 owner public key
 * @param {string} mintPubkeyStr  - Base58 mint public key
 * @returns {Promise<BigInt>}
 */
async function getTokenBalance(connection, ownerPubkeyStr, mintPubkeyStr) {
  try {
    const owner = new PublicKey(ownerPubkeyStr);
    const mint = new PublicKey(mintPubkeyStr);

    const ata = getAssociatedTokenAddressSync(mint, owner, false);
    const info = await connection.getTokenAccountBalance(ata);

    return BigInt(info.value.amount);
  } catch (_err) {
    // Account doesn't exist or RPC error — treat as zero balance
    return 0n;
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  PROGRAM_ID,
  COMMITMENT_DISCRIMINATOR,
  deserializeCommitmentAccount,
  fetchAllCommitments,
  getTokenBalance,
};
