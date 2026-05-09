const Database = require("better-sqlite3");
const path = require("path");

// Module-level db variable, initialized by init()
let db = null;

/**
 * Initialize the database connection and create tables if they don't exist.
 */
function init() {
  const dbPath = path.join(__dirname, "watcher.db");
  db = new Database(dbPath);

  // Enable foreign keys
  db.pragma("journal_mode = WAL");

  // Create commitments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS commitments (
      pubkey            TEXT PRIMARY KEY,
      owner             TEXT NOT NULL,
      target_mint       TEXT NOT NULL,
      commitment_type   TEXT NOT NULL,
      stake_amount      TEXT NOT NULL,
      slash_destination TEXT NOT NULL,
      is_active         INTEGER NOT NULL DEFAULT 1,
      created_at        INTEGER NOT NULL,
      first_seen_at     INTEGER NOT NULL
    )
  `);

  // Create snapshots table
  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      pubkey      TEXT PRIMARY KEY,
      balance     TEXT NOT NULL,
      updated_at  INTEGER NOT NULL
    )
  `);

  // Create slash_events table
  db.exec(`
    CREATE TABLE IF NOT EXISTS slash_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      pubkey      TEXT NOT NULL,
      owner       TEXT NOT NULL,
      target_mint TEXT NOT NULL,
      amount      TEXT NOT NULL,
      tx_sig      TEXT NOT NULL,
      slashed_at  INTEGER NOT NULL
    )
  `);
}

/**
 * Insert or replace a commitment.
 * c = { pubkey, owner, target_mint, commitment_type, stake_amount (BigInt), slash_destination, created_at (BigInt) }
 */
function upsertCommitment(c) {
  if (!db) throw new Error("Database not initialized. Call init() first.");

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO commitments
      (pubkey, owner, target_mint, commitment_type, stake_amount, slash_destination, is_active, created_at, first_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const commitmentTypeJson = JSON.stringify(c.commitment_type);
  const stakeAmountStr = c.stake_amount.toString();
  const createdAtNum = Number(c.created_at);
  const firstSeenAtNum = Math.floor(Date.now() / 1000);

  stmt.run(
    c.pubkey,
    c.owner,
    c.target_mint,
    commitmentTypeJson,
    stakeAmountStr,
    c.slash_destination,
    1, // is_active
    createdAtNum,
    firstSeenAtNum
  );
}

/**
 * Get a snapshot by pubkey.
 * Returns row or undefined.
 */
function getSnapshot(pubkey) {
  if (!db) throw new Error("Database not initialized. Call init() first.");

  const stmt = db.prepare("SELECT * FROM snapshots WHERE pubkey = ?");
  return stmt.get(pubkey);
}

/**
 * Set a snapshot (insert or replace).
 * balance is BigInt.
 */
function setSnapshot(pubkey, balance) {
  if (!db) throw new Error("Database not initialized. Call init() first.");

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO snapshots (pubkey, balance, updated_at)
    VALUES (?, ?, ?)
  `);

  const balanceStr = balance.toString();
  const updatedAtNum = Math.floor(Date.now() / 1000);

  stmt.run(pubkey, balanceStr, updatedAtNum);
}

/**
 * Update a snapshot.
 * balance is BigInt.
 */
function updateSnapshot(pubkey, balance) {
  if (!db) throw new Error("Database not initialized. Call init() first.");

  const stmt = db.prepare(`
    UPDATE snapshots
    SET balance = ?, updated_at = ?
    WHERE pubkey = ?
  `);

  const balanceStr = balance.toString();
  const updatedAtNum = Math.floor(Date.now() / 1000);

  stmt.run(balanceStr, updatedAtNum, pubkey);
}

/**
 * Mark a commitment as slashed and record the slash event.
 * pubkey: commitment pubkey
 * txSig: transaction signature (may be undefined)
 * amount: slashed amount (may be undefined, BigInt)
 */
function markSlashed(pubkey, txSig, amount) {
  if (!db) throw new Error("Database not initialized. Call init() first.");

  // Read owner and target_mint from commitments
  const commitmentStmt = db.prepare(
    "SELECT owner, target_mint FROM commitments WHERE pubkey = ?"
  );
  const commitment = commitmentStmt.get(pubkey);

  if (!commitment) {
    throw new Error(`Commitment not found: ${pubkey}`);
  }

  // Update is_active to 0
  const updateStmt = db.prepare(
    "UPDATE commitments SET is_active = 0 WHERE pubkey = ?"
  );
  updateStmt.run(pubkey);

  // Insert slash event
  const insertStmt = db.prepare(`
    INSERT INTO slash_events (pubkey, owner, target_mint, amount, tx_sig, slashed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const amountStr = amount ? amount.toString() : "0";
  const txSigStr = txSig || "";
  const slashedAtNum = Math.floor(Date.now() / 1000);

  insertStmt.run(
    pubkey,
    commitment.owner,
    commitment.target_mint,
    amountStr,
    txSigStr,
    slashedAtNum
  );
}

/**
 * Get all active commitments.
 * Returns array of rows.
 */
function getActiveCommitments() {
  if (!db) throw new Error("Database not initialized. Call init() first.");

  const stmt = db.prepare(
    "SELECT * FROM commitments WHERE is_active = 1"
  );
  return stmt.all();
}

/**
 * Get slash history, ordered by slashed_at DESC.
 * Returns array of rows.
 */
function getSlashHistory() {
  if (!db) throw new Error("Database not initialized. Call init() first.");

  const stmt = db.prepare(
    "SELECT * FROM slash_events ORDER BY slashed_at DESC"
  );
  return stmt.all();
}

module.exports = {
  init,
  upsertCommitment,
  getSnapshot,
  setSnapshot,
  updateSnapshot,
  markSlashed,
  getActiveCommitments,
  getSlashHistory,
};
