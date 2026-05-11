/**
 * Reset devnet: close all existing commitment accounts.
 *
 * Strategy:
 * - NoTradeWindow / AgentGuardian → slash (slasher signs)
 * - NoSell / HoldAbove → cancel (owner signs, must be in seed-keys.json)
 *
 * Usage: node scripts/reset-devnet.mjs
 */
import { readFileSync } from "fs";
import path from "path";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

// ─── Config ───────────────────────────────────────────────────────────────

const PROGRAM_ID = new PublicKey("3TyFQro3GCCfd4yV5Wmbb2Rrzh35TreXJWMfbFs5dz5S");
const TREASURY = new PublicKey("9CYhSzFPXUQRmKncPtBFuPdRMZwumsexcDUVGaULcQo6");
const RPC = "https://api.devnet.solana.com";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const SEED_KEYS_PATH = path.join(SCRIPT_DIR, "seed-keys.json");
const SLASHER_KEYPAIR_PATH = path.join(SCRIPT_DIR, "..", "watcher", "slasher-keypair.json");

// ─── Discriminators (from IDL) ────────────────────────────────────────────

const ACCOUNT_DISC = {
  NoSellCommitment: Buffer.from([210, 225, 13, 205, 235, 122, 238, 19]),
  HoldAboveCommitment: Buffer.from([134, 251, 75, 38, 68, 73, 197, 11]),
  NoTradeWindowCommitment: Buffer.from([175, 106, 90, 191, 234, 29, 246, 172]),
  AgentGuardianCommitment: Buffer.from([99, 27, 73, 222, 92, 136, 198, 162]),
};

const CANCEL_DISC = {
  cancelNoSell: Buffer.from([47, 42, 4, 228, 218, 241, 71, 230]),
  cancelHoldAbove: Buffer.from([240, 195, 26, 235, 47, 135, 143, 50]),
  cancelNoTradeWindow: Buffer.from([252, 37, 60, 109, 246, 242, 70, 253]),
  cancelAgentGuardian: Buffer.from([90, 161, 0, 61, 73, 110, 176, 79]),
};

const SLASH_DISC = {
  slashNoTradeWindow: Buffer.from([208, 80, 29, 54, 171, 194, 185, 20]),
  slashAgentGuardian: Buffer.from([125, 8, 127, 167, 254, 198, 46, 74]),
};

// ─── PDA helpers ──────────────────────────────────────────────────────────

function findPda(seeds) {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}
const REWARD_POOL = findPda([Buffer.from("reward_pool")]);
const PROTOCOL_VAULT = findPda([Buffer.from("protocol_vault")]);
const vaultPda = (commitment) => findPda([Buffer.from("vault"), commitment.toBuffer()]);

// ─── Instruction builders ─────────────────────────────────────────────────

function ixCancelNoSell(owner, commitment) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: owner.publicKey, isSigner: true, isWritable: true },
      { pubkey: commitment, isSigner: false, isWritable: true },
      { pubkey: vaultPda(commitment), isSigner: false, isWritable: true },
      { pubkey: REWARD_POOL, isSigner: false, isWritable: true },
      { pubkey: PROTOCOL_VAULT, isSigner: false, isWritable: true },
      { pubkey: TREASURY, isSigner: false, isWritable: true },
    ],
    data: CANCEL_DISC.cancelNoSell,
  });
}

function ixCancelHoldAbove(owner, commitment) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: owner.publicKey, isSigner: true, isWritable: true },
      { pubkey: commitment, isSigner: false, isWritable: true },
      { pubkey: vaultPda(commitment), isSigner: false, isWritable: true },
      { pubkey: REWARD_POOL, isSigner: false, isWritable: true },
      { pubkey: PROTOCOL_VAULT, isSigner: false, isWritable: true },
      { pubkey: TREASURY, isSigner: false, isWritable: true },
    ],
    data: CANCEL_DISC.cancelHoldAbove,
  });
}

function ixCancelNoTradeWindow(owner, commitment) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: owner.publicKey, isSigner: true, isWritable: true },
      { pubkey: commitment, isSigner: false, isWritable: true },
      { pubkey: vaultPda(commitment), isSigner: false, isWritable: true },
      { pubkey: REWARD_POOL, isSigner: false, isWritable: true },
      { pubkey: PROTOCOL_VAULT, isSigner: false, isWritable: true },
      { pubkey: TREASURY, isSigner: false, isWritable: true },
    ],
    data: CANCEL_DISC.cancelNoTradeWindow,
  });
}

function ixCancelAgentGuardian(owner, commitment) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: owner.publicKey, isSigner: true, isWritable: true },
      { pubkey: commitment, isSigner: false, isWritable: true },
      { pubkey: vaultPda(commitment), isSigner: false, isWritable: true },
      { pubkey: REWARD_POOL, isSigner: false, isWritable: true },
      { pubkey: PROTOCOL_VAULT, isSigner: false, isWritable: true },
      { pubkey: TREASURY, isSigner: false, isWritable: true },
    ],
    data: CANCEL_DISC.cancelAgentGuardian,
  });
}

function ixSlashNoTradeWindow(slasher, ownerPubkey, commitment) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: slasher.publicKey, isSigner: true, isWritable: false },
      { pubkey: ownerPubkey, isSigner: false, isWritable: true },
      { pubkey: commitment, isSigner: false, isWritable: true },
      { pubkey: vaultPda(commitment), isSigner: false, isWritable: true },
      { pubkey: REWARD_POOL, isSigner: false, isWritable: true },
      { pubkey: PROTOCOL_VAULT, isSigner: false, isWritable: true },
      { pubkey: TREASURY, isSigner: false, isWritable: true },
    ],
    data: SLASH_DISC.slashNoTradeWindow,
  });
}

function ixSlashAgentGuardian(slasher, ownerPubkey, commitment) {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: slasher.publicKey, isSigner: true, isWritable: false },
      { pubkey: ownerPubkey, isSigner: false, isWritable: true },
      { pubkey: commitment, isSigner: false, isWritable: true },
      { pubkey: vaultPda(commitment), isSigner: false, isWritable: true },
      { pubkey: REWARD_POOL, isSigner: false, isWritable: true },
      { pubkey: PROTOCOL_VAULT, isSigner: false, isWritable: true },
      { pubkey: TREASURY, isSigner: false, isWritable: true },
    ],
    data: SLASH_DISC.slashAgentGuardian,
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
    return true;
  } catch (e) {
    const msg = e?.message ?? String(e);
    console.log(`  ✗ ${label} FAILED: ${msg.slice(0, 200)}`);
    return false;
  }
}

function loadKp(p) {
  const arr = JSON.parse(readFileSync(p, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("[RESET] Starting devnet cleanup...");
  const connection = new Connection(RPC, "confirmed");

  // Load slasher keypair
  const slasher = loadKp(SLASHER_KEYPAIR_PATH);
  console.log(`[RESET] Slasher: ${slasher.publicKey.toBase58()}`);

  // Load seed wallets
  const seedKeysRaw = JSON.parse(readFileSync(SEED_KEYS_PATH, "utf8"));
  const seedWallets = seedKeysRaw.map((arr) => Keypair.fromSecretKey(Uint8Array.from(arr)));
  const seedWalletMap = new Map(seedWallets.map((kp) => [kp.publicKey.toBase58(), kp]));
  console.log(`[RESET] Loaded ${seedWallets.length} seed wallets`);

  let closedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  // Fetch all commitment accounts by discriminator
  const types = [
    { name: "NoSell", disc: ACCOUNT_DISC.NoSellCommitment, cancelFn: ixCancelNoSell },
    { name: "HoldAbove", disc: ACCOUNT_DISC.HoldAboveCommitment, cancelFn: ixCancelHoldAbove },
    { name: "NoTradeWindow", disc: ACCOUNT_DISC.NoTradeWindowCommitment, slashFn: ixSlashNoTradeWindow, cancelFn: ixCancelNoTradeWindow },
    { name: "AgentGuardian", disc: ACCOUNT_DISC.AgentGuardianCommitment, slashFn: ixSlashAgentGuardian, cancelFn: ixCancelAgentGuardian },
  ];

  for (const type of types) {
    console.log(`\n[RESET] Fetching ${type.name} accounts...`);
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [{ memcmp: { offset: 0, bytes: type.disc.toString("base64") } }],
    });
    console.log(`[RESET] Found ${accounts.length} ${type.name} accounts`);

    for (const { pubkey, account } of accounts) {
      // Parse owner from account data (offset 8 for discriminator, then owner pubkey at offset 8)
      const ownerPubkey = new PublicKey(account.data.slice(8, 40));
      const ownerB58 = ownerPubkey.toBase58();

      // Decide: slash or cancel
      if (type.slashFn) {
        // NoTradeWindow / AgentGuardian → slash
        const ix = type.slashFn(slasher, ownerPubkey, pubkey);
        const success = await sendTx(connection, [slasher], [ix], `Slash ${type.name} ${pubkey.toBase58().slice(0, 8)}`);
        if (success) closedCount++;
        else failedCount++;
      } else {
        // NoSell / HoldAbove → cancel (need owner keypair)
        const ownerKp = seedWalletMap.get(ownerB58);
        if (!ownerKp) {
          console.log(`  ⚠ Skip ${type.name} ${pubkey.toBase58().slice(0, 8)} (owner ${ownerB58.slice(0, 8)} not in seed-keys.json)`);
          skippedCount++;
          continue;
        }
        const ix = type.cancelFn(ownerKp, pubkey);
        const success = await sendTx(connection, [ownerKp], [ix], `Cancel ${type.name} ${pubkey.toBase58().slice(0, 8)}`);
        if (success) closedCount++;
        else failedCount++;
      }
    }
  }

  console.log(`\n[RESET] Done. Closed: ${closedCount}, Failed: ${failedCount}, Skipped: ${skippedCount}`);
}

main().catch((err) => {
  console.error("[RESET] Fatal error:", err);
  process.exit(1);
});
