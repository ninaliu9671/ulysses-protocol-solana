#!/usr/bin/env node
/**
 * seed-devnet-manual.mjs
 * Manually construct seed transactions without using Anchor Program API
 */

import { Connection, PublicKey, Keypair, TransactionMessage, VersionedTransaction, SystemProgram } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('3TyFQro3GCCfd4yV5Wmbb2Rrzh35TreXJWMfbFs5dz5S');
const SEED_AUTHORITY_ADDRESS = new PublicKey('7xnji33BGTxreohNTGfHtLuWCuqu8Sj2zGb7Qm5kgF67');

// Load keypairs
const SEED_AUTH_KEYPAIR = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(readFileSync(join(__dirname, '../seed-authority-keypair.json'), 'utf-8')))
);

// Verify seed authority matches
if (!SEED_AUTH_KEYPAIR.publicKey.equals(SEED_AUTHORITY_ADDRESS)) {
  console.error('❌ Seed authority keypair does not match expected address');
  process.exit(1);
}

// Helper to derive PDA
function findProgramAddress(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

// Borsh serialization helpers
function serializeU64(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

function serializeI64(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(value));
  return buf;
}

// Build seed_create_no_sell instruction
function buildSeedCreateNoSellIx(owner, targetMint, stakeAmount, durationSeconds, floorAmount, commitTimestamp) {
  // Discriminator from IDL
  const discriminator = Buffer.from([70, 18, 41, 201, 171, 52, 50, 49]);

  // Serialize args
  const args = Buffer.concat([
    discriminator,
    serializeU64(stakeAmount),
    serializeU64(durationSeconds),
    serializeU64(floorAmount),
    serializeI64(commitTimestamp)
  ]);

  // Derive PDAs
  const [commitment] = findProgramAddress(
    [Buffer.from('no_sell'), owner.toBuffer(), targetMint.toBuffer()],
    PROGRAM_ID
  );

  const [vault] = findProgramAddress(
    [Buffer.from('vault'), commitment.toBuffer()],
    PROGRAM_ID
  );

  const [rewardPool] = findProgramAddress(
    [Buffer.from('reward_pool')],
    PROGRAM_ID
  );

  const [masterChef] = findProgramAddress(
    [Buffer.from('master_chef')],
    PROGRAM_ID
  );

  // Build instruction
  return {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: SEED_AUTH_KEYPAIR.publicKey, isSigner: true, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: targetMint, isSigner: false, isWritable: false },
      { pubkey: commitment, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: rewardPool, isSigner: false, isWritable: true },
      { pubkey: masterChef, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    data: args
  };
}

async function main() {
  console.log('🌱 Manual Seed Script');
  console.log('━'.repeat(60));

  const connection = new Connection(RPC_URL, 'confirmed');

  // Test: Create one NoSell commitment
  const testOwner = new PublicKey('G516bTwL2LLPLH36L6pE6XRG9K9u1iy7s4v5wMJTbqg6'); // DEV wallet
  const testMint = new PublicKey('So11111111111111111111111111111111111111112'); // SOL
  const stakeAmount = 100_000_000; // 0.1 SOL
  const duration = 7 * 24 * 60 * 60; // 7 days
  const floorAmount = 50_000_000; // 0.05 SOL floor
  const commitTimestamp = Math.floor(Date.now() / 1000) - (5 * 24 * 60 * 60); // 5 days ago

  console.log('Creating test NoSell commitment:');
  console.log(`  Owner: ${testOwner.toBase58()}`);
  console.log(`  Mint: ${testMint.toBase58()}`);
  console.log(`  Stake: ${stakeAmount / 1e9} SOL`);
  console.log(`  Duration: ${duration / 86400} days`);
  console.log(`  Commit Time: ${new Date(commitTimestamp * 1000).toISOString()}`);

  try {
    const ix = buildSeedCreateNoSellIx(
      testOwner,
      testMint,
      stakeAmount,
      duration,
      floorAmount,
      commitTimestamp
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    const message = new TransactionMessage({
      payerKey: SEED_AUTH_KEYPAIR.publicKey,
      recentBlockhash: blockhash,
      instructions: [ix]
    }).compileToV0Message();

    const tx = new VersionedTransaction(message);
    tx.sign([SEED_AUTH_KEYPAIR]);

    console.log('\n📤 Sending transaction...');
    const sig = await connection.sendTransaction(tx, {
      maxRetries: 3,
      skipPreflight: false
    });

    console.log(`  Signature: ${sig}`);
    console.log('  Confirming...');

    await connection.confirmTransaction({
      signature: sig,
      blockhash,
      lastValidBlockHeight
    });

    console.log('✅ Transaction confirmed!');

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.logs) {
      console.error('Program logs:');
      err.logs.forEach(log => console.error('  ', log));
    }
    process.exit(1);
  }
}

main();
