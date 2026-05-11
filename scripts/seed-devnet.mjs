#!/usr/bin/env node
/**
 * seed-devnet.mjs
 *
 * Comprehensive timeline-based seeding script for Ulysses Protocol devnet.
 * Creates 38 commitments across 6 phases (2026-04-15 to 2026-05-11) using
 * the devnet-seed feature's *_seeded instructions.
 *
 * Timeline phases:
 * - Phase 0: 2026-04-15 (T-27d) - 6 commitments
 * - Phase 1: 2026-04-22 (T-20d) - 8 commitments
 * - Phase 2: 2026-04-29 (T-13d) - 8 commitments
 * - Phase 3: 2026-05-04 (T-8d)  - 6 commitments
 * - Phase 4: 2026-05-08 (T-4d)  - 6 commitments
 * - Phase 5: 2026-05-11 (T-1d)  - 4 commitments (DEV wallet)
 *
 * Usage:
 *   node scripts/seed-devnet.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import bs58 from "bs58";

// ─── Constants ────────────────────────────────────────────────────────────
const RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("3bWHBvfqVXjb2NKLA8p8Aq3h1JhXJNGRBqoNSy7pump9");
const IDL_PATH = "./anchor/target/idl/vault.json";

const FUNDER_PATH = "./funder-keypair.json";
const SEED_AUTH_PATH = "./seed-authority-keypair.json";
const SLASHER_PATH = "./slasher-keypair.json";
const SEED_KEYS_PATH = "./seed-keys.json";
const DEV_WALLET_PATH = "./dev-wallet-keypair.json";

const REWARD_POOL_SEED = "reward_pool";
const MASTER_CHEF_SEED = "master_chef";

// Timeline reference: T_now = 2026-05-12 00:00:00 UTC
const T_NOW = 1747008000; // 2026-05-12 00:00:00 UTC
const DAY = 86400;

// ─── Helper Functions ─────────────────────────────────────────────────────

function loadKp(path) {
  const arr = JSON.parse(readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(new Uint8Array(arr));
}

function loadOrCreateSeedWallets(n) {
  if (existsSync(SEED_KEYS_PATH)) {
    const raw = JSON.parse(readFileSync(SEED_KEYS_PATH, "utf8"));
    return raw.map((arr) => Keypair.fromSecretKey(new Uint8Array(arr)));
  }
  const wallets = Array.from({ length: n }, () => Keypair.generate());
  writeFileSync(SEED_KEYS_PATH, JSON.stringify(wallets.map((w) => Array.from(w.secretKey)), null, 0));
  console.log(`✓ Generated ${n} seed wallets → seed-keys.json`);
  return wallets;
}

function loadOrCreateDevWallet() {
  if (existsSync(DEV_WALLET_PATH)) {
    return loadKp(DEV_WALLET_PATH);
  }
  const kp = Keypair.generate();
  writeFileSync(DEV_WALLET_PATH, JSON.stringify(Array.from(kp.secretKey), null, 0));
  console.log(`✓ Generated dev wallet → dev-wallet-keypair.json`);
  console.log(`  Address: ${kp.publicKey.toBase58()}`);
  return kp;
}

async function sendTx(conn, signers, ixs, label) {
  try {
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
    const tx = new (await import("@solana/web3.js")).Transaction();
    tx.recentBlockhash = blockhash;
    tx.feePayer = signers[0].publicKey;
    tx.add(...ixs);
    tx.sign(...signers);

    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    console.log(`  ✓ ${label}`);
    return sig;
  } catch (e) {
    const msg = e?.message ?? String(e);
    console.log(`  ✗ ${label} FAILED: ${msg.slice(0, 200)}`);
    if (e?.logs) e.logs.slice(0, 4).forEach((l) => console.log(`      ${l}`));
    return null;
  }
}

async function airdropFromFunder(conn, funder, recipient, lamports, label) {
  const balance = await conn.getBalance(recipient);
  if (balance >= lamports) {
    console.log(`  − ${label} already has ${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL, skip`);
    return;
  }
  const need = lamports - balance;
  await sendTx(
    conn,
    [funder],
    [SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: recipient, lamports: need })],
    `Fund ${label} +${(need / LAMPORTS_PER_SOL).toFixed(3)} SOL`
  );
}

// ─── Timeline Generator ───────────────────────────────────────────────────

function generateTimeline(wallets, devWallet) {
  const SOL = LAMPORTS_PER_SOL;
  const guardian = wallets[11].publicKey; // Wallet L is shared guardian

  // Phase timestamps
  const T0 = T_NOW - 27 * DAY; // 2026-04-15
  const T1 = T_NOW - 20 * DAY; // 2026-04-22
  const T2 = T_NOW - 13 * DAY; // 2026-04-29
  const T3 = T_NOW - 8 * DAY;  // 2026-05-04
  const T4 = T_NOW - 4 * DAY;  // 2026-05-08
  const T5 = T_NOW - 1 * DAY;  // 2026-05-11

  const timeline = [];

  // ─── Phase 0: 2026-04-15 (T-27d) ───
  timeline.push(
    { owner: wallets[0], type: "NoSell", principal: 10 * SOL, duration: 30 * DAY, commitTime: T0, status: "active" },
    { owner: wallets[1], type: "NoSell", principal: 15 * SOL, duration: 60 * DAY, commitTime: T0, status: "active" },
    { owner: wallets[2], type: "HoldAbove", principal: 8 * SOL, duration: 45 * DAY, threshold: 50_000_000, commitTime: T0, status: "active" },
    { owner: wallets[3], type: "NoTradeWindow", principal: 12 * SOL, duration: 30 * DAY, windowStart: T0 + 10 * DAY, windowEnd: T0 + 20 * DAY, commitTime: T0, status: "slashed" },
    { owner: wallets[4], type: "AgentGuardian", principal: 20 * SOL, duration: 90 * DAY, guardian, commitTime: T0, status: "active" },
    { owner: wallets[5], type: "NoSell", principal: 5 * SOL, duration: 14 * DAY, commitTime: T0, status: "claimed" }
  );

  // ─── Phase 1: 2026-04-22 (T-20d) ───
  timeline.push(
    { owner: wallets[0], type: "HoldAbove", principal: 7 * SOL, duration: 30 * DAY, threshold: 45_000_000, commitTime: T1, status: "active" },
    { owner: wallets[1], type: "NoTradeWindow", principal: 10 * SOL, duration: 25 * DAY, windowStart: T1 + 5 * DAY, windowEnd: T1 + 15 * DAY, commitTime: T1, status: "active" },
    { owner: wallets[2], type: "NoSell", principal: 18 * SOL, duration: 60 * DAY, commitTime: T1, status: "active" },
    { owner: wallets[6], type: "NoSell", principal: 9 * SOL, duration: 21 * DAY, commitTime: T1, status: "active" },
    { owner: wallets[7], type: "AgentGuardian", principal: 25 * SOL, duration: 60 * DAY, guardian, commitTime: T1, status: "active" },
    { owner: wallets[8], type: "HoldAbove", principal: 6 * SOL, duration: 30 * DAY, threshold: 40_000_000, commitTime: T1, status: "active" },
    { owner: wallets[3], type: "NoSell", principal: 11 * SOL, duration: 14 * DAY, commitTime: T1, status: "claimed" },
    { owner: wallets[9], type: "NoSell", principal: 4 * SOL, duration: 7 * DAY, commitTime: T1, status: "claimed" }
  );

  // ─── Phase 2: 2026-04-29 (T-13d) ───
  timeline.push(
    { owner: wallets[4], type: "NoSell", principal: 13 * SOL, duration: 45 * DAY, commitTime: T2, status: "active" },
    { owner: wallets[5], type: "HoldAbove", principal: 8 * SOL, duration: 30 * DAY, threshold: 55_000_000, commitTime: T2, status: "active" },
    { owner: wallets[6], type: "NoTradeWindow", principal: 14 * SOL, duration: 20 * DAY, windowStart: T2 + 5 * DAY, windowEnd: T2 + 10 * DAY, commitTime: T2, status: "slashed" },
    { owner: wallets[7], type: "NoSell", principal: 16 * SOL, duration: 30 * DAY, commitTime: T2, status: "active" },
    { owner: wallets[8], type: "AgentGuardian", principal: 22 * SOL, duration: 75 * DAY, guardian, commitTime: T2, status: "active" },
    { owner: wallets[9], type: "NoSell", principal: 7 * SOL, duration: 14 * DAY, commitTime: T2, status: "active" },
    { owner: wallets[10], type: "HoldAbove", principal: 9 * SOL, duration: 30 * DAY, threshold: 48_000_000, commitTime: T2, status: "active" },
    { owner: wallets[11], type: "NoSell", principal: 5 * SOL, duration: 7 * DAY, commitTime: T2, status: "claimed" }
  );

  // ─── Phase 3: 2026-05-04 (T-8d) ───
  timeline.push(
    { owner: wallets[0], type: "NoSell", principal: 12 * SOL, duration: 30 * DAY, commitTime: T3, status: "active" },
    { owner: wallets[1], type: "AgentGuardian", principal: 28 * SOL, duration: 60 * DAY, guardian, commitTime: T3, status: "active" },
    { owner: wallets[2], type: "NoTradeWindow", principal: 11 * SOL, duration: 15 * DAY, windowStart: T3 + 3 * DAY, windowEnd: T3 + 8 * DAY, commitTime: T3, status: "active" },
    { owner: wallets[3], type: "HoldAbove", principal: 10 * SOL, duration: 30 * DAY, threshold: 52_000_000, commitTime: T3, status: "active" },
    { owner: wallets[10], type: "NoSell", principal: 6 * SOL, duration: 14 * DAY, commitTime: T3, status: "active" },
    { owner: wallets[4], type: "NoSell", principal: 8 * SOL, duration: 7 * DAY, commitTime: T3, status: "claimed" }
  );

  // ─── Phase 4: 2026-05-08 (T-4d) ───
  timeline.push(
    { owner: wallets[5], type: "NoSell", principal: 14 * SOL, duration: 30 * DAY, commitTime: T4, status: "active" },
    { owner: wallets[6], type: "HoldAbove", principal: 9 * SOL, duration: 30 * DAY, threshold: 46_000_000, commitTime: T4, status: "active" },
    { owner: wallets[7], type: "NoTradeWindow", principal: 13 * SOL, duration: 20 * DAY, windowStart: T4 + 5 * DAY, windowEnd: T4 + 12 * DAY, commitTime: T4, status: "active" },
    { owner: wallets[8], type: "NoSell", principal: 17 * SOL, duration: 45 * DAY, commitTime: T4, status: "active" },
    { owner: wallets[9], type: "AgentGuardian", principal: 24 * SOL, duration: 60 * DAY, guardian, commitTime: T4, status: "active" },
    { owner: wallets[11], type: "NoSell", principal: 5 * SOL, duration: 7 * DAY, commitTime: T4, status: "active" }
  );

  // ─── Phase 5: 2026-05-11 (T-1d) - DEV WALLET ───
  timeline.push(
    { owner: devWallet, type: "NoSell", principal: 3 * SOL, duration: 30 * DAY, commitTime: T5, status: "active" },
    { owner: devWallet, type: "HoldAbove", principal: 2 * SOL, duration: 30 * DAY, threshold: 50_000_000, commitTime: T5, status: "active" },
    { owner: devWallet, type: "NoTradeWindow", principal: 2.5 * SOL, duration: 20 * DAY, windowStart: T5 + 5 * DAY, windowEnd: T5 + 10 * DAY, commitTime: T5, status: "active" },
    { owner: devWallet, type: "AgentGuardian", principal: 4 * SOL, duration: 45 * DAY, guardian, commitTime: T5, status: "active" }
  );

  return timeline;
}

// ─── Main Execution ───────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Ulysses Protocol Devnet Seeding (Timeline Mode)");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Load keypairs
  console.log("1. Loading keypairs...");
  const funder = loadKp(FUNDER_PATH);
  const seedAuth = loadKp(SEED_AUTH_PATH);
  const slasher = loadKp(SLASHER_PATH);
  const seedWallets = loadOrCreateSeedWallets(12);
  const devWallet = loadOrCreateDevWallet();

  console.log(`  Funder:        ${funder.publicKey.toBase58()}`);
  console.log(`  Seed Auth:     ${seedAuth.publicKey.toBase58()}`);
  console.log(`  Slasher:       ${slasher.publicKey.toBase58()}`);
  console.log(`  Dev Wallet:    ${devWallet.publicKey.toBase58()}`);
  console.log(`  Seed Wallets:  ${seedWallets.length} loaded\n`);

  // Setup connection and program
  const conn = new Connection(RPC, "confirmed");
  const idl = JSON.parse(readFileSync(IDL_PATH, "utf8"));
  const provider = new AnchorProvider(conn, { publicKey: funder.publicKey }, { commitment: "confirmed" });
  const program = new Program(idl, PROGRAM_ID, provider);

  // Derive PDAs
  const [rewardPool] = PublicKey.findProgramAddressSync(
    [Buffer.from(REWARD_POOL_SEED)],
    PROGRAM_ID
  );
  const [masterChef] = PublicKey.findProgramAddressSync(
    [Buffer.from(MASTER_CHEF_SEED)],
    PROGRAM_ID
  );

  console.log("2. Funding wallets...");
  await airdropFromFunder(conn, funder, seedAuth.publicKey, 5 * LAMPORTS_PER_SOL, "Seed Auth");
  await airdropFromFunder(conn, funder, slasher.publicKey, 2 * LAMPORTS_PER_SOL, "Slasher");
  await airdropFromFunder(conn, funder, devWallet.publicKey, 1 * LAMPORTS_PER_SOL, "Dev Wallet");

  for (let i = 0; i < seedWallets.length; i++) {
    await airdropFromFunder(conn, funder, seedWallets[i].publicKey, 0.5 * LAMPORTS_PER_SOL, `Seed Wallet ${i}`);
  }
  console.log();

  // Generate timeline
  const timeline = generateTimeline(seedWallets, devWallet);
  console.log(`3. Generated timeline: ${timeline.length} commitments across 6 phases\n`);

  // Execute timeline
  console.log("4. Creating commitments...\n");

  let activeCount = 0;
  let slashedCount = 0;
  let claimedCount = 0;

  for (let i = 0; i < timeline.length; i++) {
    const entry = timeline[i];
    const { owner, type, principal, duration, commitTime, status } = entry;

    const ownerPubkey = owner.publicKey;
    const [commitment] = PublicKey.findProgramAddressSync(
      [Buffer.from("commitment"), ownerPubkey.toBuffer()],
      PROGRAM_ID
    );

    const label = `[${i + 1}/${timeline.length}] ${type} ${(principal / LAMPORTS_PER_SOL).toFixed(1)} SOL (${status})`;

    try {
      // Build instruction based on type
      let ix;
      const commonAccounts = {
        commitment,
        owner: ownerPubkey,
        seedAuthority: seedAuth.publicKey,
        rewardPool,
        masterChef,
        systemProgram: SystemProgram.programId,
      };

      if (type === "NoSell") {
        ix = await program.methods
          .noSellSeeded(new BN(principal), new BN(duration), new BN(commitTime))
          .accounts(commonAccounts)
          .instruction();
      } else if (type === "HoldAbove") {
        ix = await program.methods
          .holdAboveSeeded(new BN(principal), new BN(duration), new BN(entry.threshold), new BN(commitTime))
          .accounts(commonAccounts)
          .instruction();
      } else if (type === "NoTradeWindow") {
        ix = await program.methods
          .noTradeWindowSeeded(
            new BN(principal),
            new BN(duration),
            new BN(entry.windowStart),
            new BN(entry.windowEnd),
            new BN(commitTime)
          )
          .accounts(commonAccounts)
          .instruction();
      } else if (type === "AgentGuardian") {
        ix = await program.methods
          .agentGuardianSeeded(new BN(principal), new BN(duration), entry.guardian, new BN(commitTime))
          .accounts(commonAccounts)
          .instruction();
      }

      const sig = await sendTx(conn, [seedAuth], [ix], label);
      if (!sig) continue;

      // Handle post-creation actions
      if (status === "slashed") {
        // Slash immediately
        const slashIx = await program.methods
          .slash()
          .accounts({
            commitment,
            slasher: slasher.publicKey,
            rewardPool,
            masterChef,
          })
          .instruction();

        await sendTx(conn, [slasher], [slashIx], `  └─ Slash ${type}`);
        slashedCount++;
      } else if (status === "claimed") {
        // Claim (only works if commitment has expired)
        const claimIx = await program.methods
          .claim()
          .accounts({
            commitment,
            owner: ownerPubkey,
            rewardPool,
            masterChef,
          })
          .instruction();

        await sendTx(conn, [owner], [claimIx], `  └─ Claim ${type}`);
        claimedCount++;
      } else {
        activeCount++;
      }

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      console.log(`  ✗ ${label} FAILED: ${e.message.slice(0, 150)}`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  Seeding Complete");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Active:   ${activeCount}`);
  console.log(`  Slashed:  ${slashedCount}`);
  console.log(`  Claimed:  ${claimedCount}`);
  console.log(`  Total:    ${timeline.length}`);
  console.log("\n  Next steps:");
  console.log("  1. Start watcher: cd watcher && npm start");
  console.log("  2. Start frontend: cd app && npm run dev");
  console.log("  3. Check 'My Commitments' panel for DEV wallet data");
  console.log("  4. Check 'Siren Graveyard' for slashed/claimed history");
  console.log("═══════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
