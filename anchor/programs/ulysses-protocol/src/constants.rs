pub const MIN_STAKE_LAMPORTS: u64 = 10_000_000;   // 0.01 SOL
pub const MIN_DURATION_SECS: u32 = 86_400;          // 1 day minimum
pub const PRECISION: u128 = 1_000_000_000;           // 1e9，防止acc整数除法截断（仅用于acc累积器，不用于sqrt内部）
pub const NUM_POOLS: usize = 6;

// Per-pool difficulty上限（天数）
pub const NOBUY_MAX_DAYS: u64 = 3;
pub const NOSELL_MAX_DAYS: u64 = 7;
pub const HOLDABOVE_MAX_DAYS: u64 = 30;
pub const HOLDUNTIL_MAX_DAYS: u64 = 90;
pub const NOTRADE_MAX_DAYS: u64 = 30;
pub const GUARDIAN_MAX_DAYS: u64 = 30;

// ProtocolState space: 8 disc + 32 authority + 1 bump + 1 vault_bump + 96 acc([u128;6]) + 48 total_weight([u64;6]) + 48 pool_balance([u64;6]) = 234, pad到248
pub const PROTOCOL_STATE_SPACE: usize = 248;

// CommitmentAccount space: 8+32+32+9+8+33+1+8+1+1+8+16+8+1 = 166, 保持180（14 bytes padding足够）
pub const COMMITMENT_SPACE: usize = 180;
