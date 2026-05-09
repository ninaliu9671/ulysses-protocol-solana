/**
 * Devnet seed: 12 wallets × ~28 commitments (4 types, mixed states).
 * Drives Hero / Hall of Masts / Siren Graveyard from real on-chain data.
 *
 * Uses seed_create_* (devnet-seed feature) so SEED_AUTHORITY pays the stake.
 * The 12 owner wallets only need a tiny SOL float for claim signing.
 *
 * Usage: node scripts/seed-devnet.mjs [--rng-seed=<n>]
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

// ─── Config ───────────────────────────────────────────────────────────────

const PROGRAM_ID = new PublicKey("3TyFQro3GCCfd4yV5Wmbb2Rrzh35TreXJWMfbFs5dz5S");
const TREASURY = new PublicKey("9CYhSzFPXUQRmKncPtBFuPdRMZwumsexcDUVGaULcQo6");
const SLASH_AUTHORITY_PUBKEY = new PublicKey("4CAGNZ1VbqVNpWRUFdHLpjmN6tnALLDMJrVMZdrRvtf6");
const RPC = "https://api.devnet.solana.com";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const FUNDER_KEYPAIR_PATH = path.join(SCRIPT_DIR, "funder-keypair.json");
const SEED_AUTH_KEYPAIR_PATH = path.join(SCRIPT_DIR, "seed-authority-keypair.json");
const SEED_KEYS_PATH = path.join(SCRIPT_DIR, "seed-keys.json");
const SLASHER_KEYPAIR_PATH = path.join(SCRIPT_DIR, "..", "watcher", "slasher-keypair.json");

// Pretend mints — never minted on-chain. Seeded path stores them as opaque pubkeys.
function fakeMint(suffix) {
  // Stable, deterministic-looking 32-byte pubkey. Just needs to be a valid base58 pubkey.
  const seed = `seed-mint-${suffix}`.padEnd(32, "x").slice(0, 32);
  return new PublicKey(Buffer.from(seed, "utf8"));
}

// ─── Discriminators (match program IDL) ──────────────────────────────────

const DISC = {
  seedCreateNoSell: Buffer.from([70, 18, 41, 201, 171, 52, 50, 49]),
  seedCreateHoldAbove: Buffer.from([137, 233, 166, 156, 47, 11, 99, 38]),
  seedCreateNoTradeWindow: Buffer.from([173, 178, 216, 149, 106, 117, 148, 224]),
  seedCreateAgentGuardian: Buffer.from([8, 139, 90, 242, 76, 168, 198, 109]),
  slashNoTradeWindow: Buffer.from([208, 80, 29, 54, 171, 194, 185, 20]),
  slashAgentGuardian: Buffer.from([125, 8, 127, 167, 254, 198, 46, 74]),
  claimNoSell: Buffer.from([20, 58, 165, 149, 24, 92, 85, 131]),
  claimHoldAbove: Buffer.from([67, 174, 96, 201, 254, 197, 74, 115]),
  claimNoTradeWindow: Buffer.from([179, 159, 97, 221, 64, 20, 51, 1]),
  claimAgentGuardian: Buffer.from([114, 22, 251, 35, 221, 225, 31, 183]),
};

// ─── PDA helpers ──────────────────────────────────────────────────────────

function findPda(seeds) {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}
const REWARD_POOL = findPda([Buffer.from("reward_pool")]);
const PROTOCOL_VAULT = findPda([Buffer.from("protocol_vault")]);
const noSellPda = (owner, mint) => findPda([Buffer.from("no_sell"), owner.toBuffer(), mint.toBuffer()]);
const holdAbovePda = (owner, mint) => findPda([Buffer.from("hold_above"), owner.toBuffer(), mint.toBuffer()]);
const noTradePda = (owner, nonce) => {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(BigInt(nonce));
  return findPda([Buffer.from("no_trade"), owner.toBuffer(), nonceBuf]);
};
const agentGuardPda = (owner) => findPda([Buffer.from("agent_guard"), owner.toBuffer()]);
const vaultPda = (commitment) => findPda([Buffer.from("vault"), commitment.toBuffer()]);

// ─── Encoders ─────────────────────────────────────────────────────────────

function u64(v) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(v));
  return b;
}
function i64(v) {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(v));
  return b;
}
function u16(v) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(v);
  return b;
}
function u8(v) {
  return Buffer.from([v & 0xff]);
}

// ─── Instruction builders ─────────────────────────────────────────────────

function ixSeedCreateNoSell(seedAuth, owner, mint, stakeLamports, durationDays, floorAmount, commitTs) {
  const commitment = noSellPda(owner, mint);
  const vault = vaultPda(commitment);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: seedAuth, isSigner: true, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: commitment, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: REWARD_POOL, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([DISC.seedCreateNoSell, u64(stakeLamports), u16(durationDays), u64(floorAmount), i64(commitTs)]),
  });
}

function ixSeedCreateHoldAbove(seedAuth, owner, mint, stakeLamports, durationDays, floorAmount, commitTs) {
  const commitment = holdAbovePda(owner, mint);
  const vault = vaultPda(commitment);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: seedAuth, isSigner: true, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: commitment, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: REWARD_POOL, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([DISC.seedCreateHoldAbove, u64(stakeLamports), u16(durationDays), u64(floorAmount), i64(commitTs)]),
  });
}

function ixSeedCreateNoTradeWindow(seedAuth, owner, stakeLamports, durationDays, startH, endH, nonce, commitTs) {
  const commitment = noTradePda(owner, nonce);
  const vault = vaultPda(commitment);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: seedAuth, isSigner: true, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: commitment, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: REWARD_POOL, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      DISC.seedCreateNoTradeWindow,
      u64(stakeLamports),
      u16(durationDays),
      u8(startH),
      u8(endH),
      u64(nonce),
      i64(commitTs),
    ]),
  });
}

function ixSeedCreateAgentGuardian(seedAuth, owner, stakeLamports, durationDays, guardianPubkey, commitTs) {
  const commitment = agentGuardPda(owner);
  const vault = vaultPda(commitment);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: seedAuth, isSigner: true, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: commitment, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: REWARD_POOL, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      DISC.seedCreateAgentGuardian,
      u64(stakeLamports),
      u16(durationDays),
      guardianPubkey.toBuffer(),
      i64(commitTs),
    ]),
  });
}

function ixSlashNoTradeWindow(slasher, owner, commitment) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: slasher, isSigner: true, isWritable: false },
      { pubkey: owner, isSigner: false, isWritable: true },
      { pubkey: commitment, isSigner: false, isWritable: true },
      { pubkey: vaultPda(commitment), isSigner: false, isWritable: true },
      { pubkey: REWARD_POOL, isSigner: false, isWritable: true },
      { pubkey: PROTOCOL_VAULT, isSigner: false, isWritable: true },
      { pubkey: TREASURY, isSigner: false, isWritable: true },
    ],
    data: DISC.slashNoTradeWindow,
  });
}

function ixSlashAgentGuardian(slasher, owner, commitment) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: slasher, isSigner: true, isWritable: false },
      { pubkey: owner, isSigner: false, isWritable: true },
      { pubkey: commitment, isSigner: false, isWritable: true },
      { pubkey: vaultPda(commitment), isSigner: false, isWritable: true },
      { pubkey: REWARD_POOL, isSigner: false, isWritable: true },
      { pubkey: PROTOCOL_VAULT, isSigner: false, isWritable: true },
      { pubkey: TREASURY, isSigner: false, isWritable: true },
    ],
    data: DISC.slashAgentGuardian,
  });
}

function ixClaim(disc, owner, commitment) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: commitment, isSigner: false, isWritable: true },
      { pubkey: vaultPda(commitment), isSigner: false, isWritable: true },
      { pubkey: REWARD_POOL, isSigner: false, isWritable: true },
      { pubkey: PROTOCOL_VAULT, isSigner: false, isWritable: true },
    ],
    data: disc,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function sendTx(conn, signers, ixs, label) {
  const tx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    ...ixs,
  );
  try {
    const sig = await sendAndConfirmTransaction(conn, tx, signers, { commitment: "confirmed", skipPreflight: false });
    console.log(`  ✓ ${label} ${sig.slice(0, 12)}…`);
    return sig;
  } catch (e) {
    const msg = e?.message ?? String(e);
    console.log(`  ✗ ${label} FAILED: ${msg.slice(0, 200)}`);
    if (e?.logs) e.logs.slice(0, 4).forEach((l) => console.log(`      ${l}`));
    return null;
  }
}

function loadKp(p) {
  const arr = JSON.parse(readFileSync(p, "utf8"));
  return Keypair.fromSecretKey(new Uint8Array(arr));
}

async function airdropFromFunder(conn, funder, recipient, lamports, label) {
  const balance = await conn.getBalance(recipient);
  if (balance >= lamports) {
    console.log(`  − ${label} already has ${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL, skip funding`);
    return;
  }
  const need = lamports - balance;
  await sendTx(
    conn,
    [funder],
    [SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: recipient, lamports: need })],
    `fund ${label} ${(need / LAMPORTS_PER_SOL).toFixed(3)} SOL`,
  );
}

function loadOrCreateSeedWallets(n) {
  if (existsSync(SEED_KEYS_PATH)) {
    const raw = JSON.parse(readFileSync(SEED_KEYS_PATH, "utf8"));
    return raw.map((arr) => Keypair.fromSecretKey(new Uint8Array(arr)));
  }
  const wallets = Array.from({ length: n }, () => Keypair.generate());
  writeFileSync(SEED_KEYS_PATH, JSON.stringify(wallets.map((w) => Array.from(w.secretKey)), null, 0));
  console.log(`Generated ${n} seed wallets → seed-keys.json`);
  return wallets;
}

// ─── Plan generator (28 commitments / 12 personas) ───────────────────────

function generatePlan(wallets, T_now) {
  const DAY = 86400;
  const SOL = LAMPORTS_PER_SOL;
  // Personas A..L (12); each has 1-3 commitments. ~28 total.
  // status: 'active' | 'slashed' (only NoTradeWindow/AgentGuardian) | 'claimed' (any type, owner signs)
  // For 'claimed', commit_timestamp + duration must be in the past so claim succeeds.
  // For 'slashed', we slash right after creation (before expiry).
  const w = wallets;
  const guardian = wallets[11].publicKey; // shared guardian for AG personas
  const SIREN = fakeMint("siren");
  const TOKEN_X = fakeMint("tokenX");
  const TOKEN_Y = fakeMint("tokenY");

  /**
   * Each item: { wallet, kind, status, ts (created), days, stake, ...kindArgs }
   */
  const plan = [];
  // A: stoic — 3 active mixed
  plan.push({ wallet: w[0], kind: "NoSell", status: "active", ts: T_now - 60 * DAY, days: 90, stake: 0.5 * SOL, mint: SIREN, floor: 1 });
  plan.push({ wallet: w[0], kind: "HoldAbove", status: "active", ts: T_now - 30 * DAY, days: 60, stake: 0.3 * SOL, mint: TOKEN_X, floor: 1 });
  plan.push({ wallet: w[0], kind: "NoTradeWindow", status: "active", ts: T_now - 15 * DAY, days: 30, stake: 0.2 * SOL, startH: 2, endH: 6, nonce: 1 });
  // B: believer — 3 NoSell on different mints (all active)
  plan.push({ wallet: w[1], kind: "NoSell", status: "active", ts: T_now - 75 * DAY, days: 180, stake: 0.8 * SOL, mint: SIREN, floor: 1 });
  plan.push({ wallet: w[1], kind: "NoSell", status: "active", ts: T_now - 45 * DAY, days: 90, stake: 0.4 * SOL, mint: TOKEN_X, floor: 1 });
  plan.push({ wallet: w[1], kind: "NoSell", status: "active", ts: T_now - 12 * DAY, days: 30, stake: 0.15 * SOL, mint: TOKEN_Y, floor: 1 });
  // C: hodler — 1 long active HoldAbove + 1 already-claimed
  plan.push({ wallet: w[2], kind: "HoldAbove", status: "active", ts: T_now - 90 * DAY, days: 365, stake: 1.2 * SOL, mint: SIREN, floor: 1 });
  plan.push({ wallet: w[2], kind: "NoSell", status: "claimed", ts: T_now - 80 * DAY, days: 30, stake: 0.25 * SOL, mint: TOKEN_X, floor: 1 });
  // D: window-disciplined — 2 active NoTradeWindow (different nonces)
  plan.push({ wallet: w[3], kind: "NoTradeWindow", status: "active", ts: T_now - 25 * DAY, days: 60, stake: 0.4 * SOL, startH: 0, endH: 8, nonce: 1 });
  plan.push({ wallet: w[3], kind: "NoTradeWindow", status: "active", ts: T_now - 8 * DAY, days: 14, stake: 0.1 * SOL, startH: 14, endH: 18, nonce: 2 });
  // E: agent-protected — active AG
  plan.push({ wallet: w[4], kind: "AgentGuardian", status: "active", ts: T_now - 10 * DAY, days: 90, stake: 0.6 * SOL, guardianPubkey: guardian });
  // F: claimed-once — short already-claimed NoTradeWindow
  plan.push({ wallet: w[5], kind: "NoTradeWindow", status: "claimed", ts: T_now - 60 * DAY, days: 14, stake: 0.18 * SOL, startH: 3, endH: 7, nonce: 1 });
  plan.push({ wallet: w[5], kind: "HoldAbove", status: "active", ts: T_now - 6 * DAY, days: 30, stake: 0.12 * SOL, mint: SIREN, floor: 1 });
  // G: slashed once — slashed NoTradeWindow + still has 1 active
  plan.push({ wallet: w[6], kind: "NoTradeWindow", status: "slashed", ts: T_now - 18 * DAY, days: 30, stake: 0.35 * SOL, startH: 1, endH: 4, nonce: 1 });
  plan.push({ wallet: w[6], kind: "NoSell", status: "active", ts: T_now - 5 * DAY, days: 30, stake: 0.2 * SOL, mint: SIREN, floor: 1 });
  // H: agent-violator — slashed AG
  plan.push({ wallet: w[7], kind: "AgentGuardian", status: "slashed", ts: T_now - 22 * DAY, days: 60, stake: 0.45 * SOL, guardianPubkey: guardian });
  // I: heavy-violator — 2 slashed NoTradeWindow recent
  plan.push({ wallet: w[8], kind: "NoTradeWindow", status: "slashed", ts: T_now - 4 * DAY, days: 14, stake: 0.25 * SOL, startH: 5, endH: 9, nonce: 1 });
  plan.push({ wallet: w[8], kind: "NoTradeWindow", status: "slashed", ts: T_now - 1 * DAY, days: 7, stake: 0.15 * SOL, startH: 22, endH: 23, nonce: 2 });
  // J: recent-loss — slashed AG within last 12h
  plan.push({ wallet: w[9], kind: "AgentGuardian", status: "slashed", ts: T_now - 3600 * 10, days: 30, stake: 0.5 * SOL, guardianPubkey: guardian });
  // K: long-game — active NoSell + already-claimed AG
  plan.push({ wallet: w[10], kind: "NoSell", status: "active", ts: T_now - 50 * DAY, days: 180, stake: 0.7 * SOL, mint: TOKEN_Y, floor: 1 });
  plan.push({ wallet: w[10], kind: "AgentGuardian", status: "claimed", ts: T_now - 70 * DAY, days: 30, stake: 0.3 * SOL, guardianPubkey: guardian });
  // L: light — single small NoTradeWindow active
  plan.push({ wallet: w[11], kind: "NoTradeWindow", status: "active", ts: T_now - 2 * DAY, days: 21, stake: 0.08 * SOL, startH: 12, endH: 14, nonce: 1 });
  // Two more recently-slashed for graveyard freshness
  plan.push({ wallet: w[2], kind: "NoTradeWindow", status: "slashed", ts: T_now - 3600 * 6, days: 14, stake: 0.2 * SOL, startH: 19, endH: 23, nonce: 1 });
  plan.push({ wallet: w[5], kind: "AgentGuardian", status: "slashed", ts: T_now - 3600 * 18, days: 30, stake: 0.3 * SOL, guardianPubkey: guardian });

  return plan;
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const conn = new Connection(RPC, "confirmed");

  const funder = loadKp(FUNDER_KEYPAIR_PATH);
  const seedAuth = loadKp(SEED_AUTH_KEYPAIR_PATH);
  const slasher = loadKp(SLASHER_KEYPAIR_PATH);

  console.log("Funder:        ", funder.publicKey.toBase58());
  console.log("SeedAuthority: ", seedAuth.publicKey.toBase58());
  console.log("Slasher:       ", slasher.publicKey.toBase58());
  console.log("RewardPool:    ", REWARD_POOL.toBase58());

  const rpInfo = await conn.getAccountInfo(REWARD_POOL);
  if (!rpInfo) {
    console.log("\n✗ RewardPool not initialized. Run scripts/initialize.mjs first.");
    process.exit(1);
  }

  // 1. Fund seedAuthority + slasher
  console.log("\n=== Fund seedAuthority + slasher ===");
  await airdropFromFunder(conn, funder, seedAuth.publicKey, 12 * LAMPORTS_PER_SOL, "seedAuthority");
  await airdropFromFunder(conn, funder, slasher.publicKey, 1.5 * LAMPORTS_PER_SOL, "slasher");

  // 2. Load/create 12 seed wallets
  const wallets = loadOrCreateSeedWallets(12);
  console.log(`\n=== Fund 12 seed wallets ===`);
  for (let i = 0; i < wallets.length; i++) {
    await airdropFromFunder(conn, funder, wallets[i].publicKey, 0.05 * LAMPORTS_PER_SOL, `wallet-${i}`);
  }

  // 3. Build plan
  const T_now = Math.floor(Date.now() / 1000);
  const plan = generatePlan(wallets, T_now);
  console.log(`\n=== Plan: ${plan.length} commitments ===`);

  let createdN = 0, slashedN = 0, claimedN = 0, skippedN = 0;

  // 4. Create each commitment
  for (let idx = 0; idx < plan.length; idx++) {
    const it = plan[idx];
    const ownerPk = it.wallet.publicKey;
    let createIx;
    let commitmentPda;
    let claimDisc;
    let slashIx = null;

    if (it.kind === "NoSell") {
      commitmentPda = noSellPda(ownerPk, it.mint);
      createIx = ixSeedCreateNoSell(seedAuth.publicKey, ownerPk, it.mint, it.stake, it.days, it.floor, it.ts);
      claimDisc = DISC.claimNoSell;
    } else if (it.kind === "HoldAbove") {
      commitmentPda = holdAbovePda(ownerPk, it.mint);
      createIx = ixSeedCreateHoldAbove(seedAuth.publicKey, ownerPk, it.mint, it.stake, it.days, it.floor, it.ts);
      claimDisc = DISC.claimHoldAbove;
    } else if (it.kind === "NoTradeWindow") {
      commitmentPda = noTradePda(ownerPk, it.nonce);
      createIx = ixSeedCreateNoTradeWindow(seedAuth.publicKey, ownerPk, it.stake, it.days, it.startH, it.endH, it.nonce, it.ts);
      claimDisc = DISC.claimNoTradeWindow;
      slashIx = ixSlashNoTradeWindow(slasher.publicKey, ownerPk, commitmentPda);
    } else if (it.kind === "AgentGuardian") {
      commitmentPda = agentGuardPda(ownerPk);
      createIx = ixSeedCreateAgentGuardian(seedAuth.publicKey, ownerPk, it.stake, it.days, it.guardianPubkey, it.ts);
      claimDisc = DISC.claimAgentGuardian;
      slashIx = ixSlashAgentGuardian(slasher.publicKey, ownerPk, commitmentPda);
    }

    // Skip if commitment already exists (idempotent)
    const existing = await conn.getAccountInfo(commitmentPda);
    const label = `[${idx + 1}/${plan.length}] ${it.kind} ${it.status} owner=${ownerPk.toBase58().slice(0, 6)}…`;
    if (existing) {
      console.log(`${label}  (already exists, skipping create)`);
      skippedN++;
      continue;
    }

    console.log(label);
    const createSig = await sendTx(conn, [seedAuth], [createIx], "create");
    if (!createSig) continue;
    createdN++;

    if (it.status === "slashed") {
      if (!slashIx) {
        console.log("  − slashed status only valid for NoTradeWindow/AgentGuardian; skip slash");
        continue;
      }
      const sig = await sendTx(conn, [slasher], [slashIx], "slash");
      if (sig) slashedN++;
    } else if (it.status === "claimed") {
      // owner signs claim — must already be expired (commit_ts + days < now)
      const expiresAt = it.ts + it.days * 86400;
      if (expiresAt > T_now) {
        console.log(`  − cannot claim: not yet expired (expiresAt=${expiresAt}, now=${T_now})`);
        continue;
      }
      const sig = await sendTx(conn, [it.wallet], [ixClaim(claimDisc, ownerPk, commitmentPda)], "claim");
      if (sig) claimedN++;
    }
  }

  // 5. Summary + invariants
  console.log("\n=== Summary ===");
  console.log(`Created:  ${createdN}`);
  console.log(`Slashed:  ${slashedN}`);
  console.log(`Claimed:  ${claimedN}`);
  console.log(`Skipped:  ${skippedN}`);
  console.log("\n✔ Seed complete. Open /commitment + /leaderboard to verify.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
