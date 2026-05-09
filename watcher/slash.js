'use strict';

const {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
  Keypair
} = require('@solana/web3.js');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROGRAM_ID = new PublicKey('7s1UK1nQWK7CrNcaS576gbpMjMqrph1vArRepnQYLki7');

/** Slash instruction discriminator (8 bytes) */
const SLASH_DISCRIMINATOR = Buffer.from([204, 141, 18, 161, 8, 177, 92, 142]);

// ---------------------------------------------------------------------------
// executeSlash
// ---------------------------------------------------------------------------

/**
 * Build and send the slash instruction on-chain.
 *
 * @param {Connection} connection - Solana Connection instance
 * @param {Keypair} slasher - The protocol authority/slasher keypair
 * @param {Object} commitment - Object with fields: owner (base58), target_mint (base58), slash_destination (base58)
 * @param {Uint8Array|Buffer|null} txSignatureBytes - The 64-byte violation tx signature (or null for zeros)
 * @returns {string} Transaction signature
 * @throws {Error} If instruction fails to execute
 */
async function executeSlash(connection, slasher, commitment, txSignatureBytes) {
  try {
    // =========================================================================
    // Step 1: Build data buffer
    // =========================================================================
    // Layout: [8-byte discriminator] + [64-byte tx_signature]

    let txSignature = Buffer.alloc(64);

    if (txSignatureBytes) {
      if (txSignatureBytes.length < 64) {
        // Zero-pad to 64 bytes
        Buffer.concat([
          Buffer.from(txSignatureBytes),
          Buffer.alloc(64 - txSignatureBytes.length)
        ]).copy(txSignature);
      } else {
        // Take first 64 bytes
        Buffer.from(txSignatureBytes).copy(txSignature, 0, 0, 64);
      }
    }
    // else: txSignature remains all zeros

    const data = Buffer.concat([SLASH_DISCRIMINATOR, txSignature]);

    // =========================================================================
    // Step 2: Derive PDAs
    // =========================================================================

    const [protocolState] = PublicKey.findProgramAddressSync(
      [Buffer.from('protocol')],
      PROGRAM_ID
    );

    const commitmentPDA = PublicKey.findProgramAddressSync(
      [
        Buffer.from('commitment'),
        new PublicKey(commitment.owner).toBuffer(),
        new PublicKey(commitment.target_mint).toBuffer()
      ],
      PROGRAM_ID
    )[0];

    const commitmentVault = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), commitmentPDA.toBuffer()],
      PROGRAM_ID
    )[0];

    const slashDestination = new PublicKey(commitment.slash_destination);

    // =========================================================================
    // Step 3: Create accounts array (order is critical)
    // =========================================================================

    const keys = [
      {
        pubkey: slasher.publicKey,
        isSigner: true,
        isWritable: true
      },
      {
        pubkey: protocolState,
        isSigner: false,
        isWritable: false
      },
      {
        pubkey: commitmentPDA,
        isSigner: false,
        isWritable: true
      },
      {
        pubkey: commitmentVault,
        isSigner: false,
        isWritable: true
      },
      {
        pubkey: slashDestination,
        isSigner: false,
        isWritable: true
      },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false
      }
    ];

    // =========================================================================
    // Step 4: Create TransactionInstruction
    // =========================================================================

    const instruction = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys,
      data
    });

    // =========================================================================
    // Step 5: Create and send Transaction
    // =========================================================================

    const transaction = new Transaction().add(instruction);

    const sig = await sendAndConfirmTransaction(
      connection,
      transaction,
      [slasher],
      { commitment: 'confirmed' }
    );

    console.log(`[SLASH] ${sig}`);
    return sig;
  } catch (err) {
    console.error(`[SLASH ERROR] ${err.message}`);
    throw err;
  }
}

module.exports = { executeSlash };
