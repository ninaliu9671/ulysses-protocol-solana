use anchor_lang::prelude::*;

#[account]
pub struct ProtocolState {
    pub authority: Pubkey,                    // 32
    pub bump: u8,                             //  1
    pub vault_bump: u8,                       //  1: protocol_vault PDA bump
    pub acc_reward_per_weight: [u128; 6],     // 96: 每池per-weight收益累积器（PRECISION-scaled）
    pub total_weight: [u64; 6],               // 48: 每池活跃weight总和
    pub pool_balance: [u64; 6],               // 48: 每池protocol_vault可分配lamports
}

#[account]
pub struct CommitmentAccount {
    pub owner: Pubkey,
    pub target_mint: Pubkey,
    pub commitment_type: CommitmentType,
    pub stake_amount: u64,
    // slash_destination已删除——slash资金统一进protocol pool
    pub guardian_pubkey: Option<Pubkey>,
    pub is_active: bool,
    pub created_at: i64,
    pub bump: u8,
    pub vault_bump: u8,
    pub weight: u64,        // integer_sqrt(stake) * difficulty
    pub reward_debt: u128,  // weight * acc_at_entry（PRECISION-scaled，未除PRECISION）
    pub unlock_time: i64,   // 承诺到期unix时间戳
    pub pool_id: u8,        // 0-5，对应CommitmentType
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum CommitmentType {
    NoBuy,
    NoSell,
    HoldAbove { threshold: u64 },
    HoldUntil { unlock_at: i64 },
    NoTradeWindow {
        window_start_hour: u8,
        window_end_hour: u8,
    },
    AgentGuardian,   // 变体索引5，代理委托监控
}

impl CommitmentType {
    pub fn pool_id(&self) -> u8 {
        match self {
            Self::NoBuy => 0,
            Self::NoSell => 1,
            Self::HoldAbove { .. } => 2,
            Self::HoldUntil { .. } => 3,
            Self::NoTradeWindow { .. } => 4,
            Self::AgentGuardian => 5,
        }
    }

    // 计算difficulty factor
    // duration_secs: 对HoldUntil以外的类型由调用方传入；HoldUntil用unlock_at-now
    // now: clock.unix_timestamp
    pub fn difficulty(&self, duration_secs: u32, now: i64) -> u64 {
        use crate::constants::*;
        let days = (duration_secs as u64) / 86_400;
        match self {
            Self::NoBuy => days.min(NOBUY_MAX_DAYS).max(1),
            Self::NoSell => days.min(NOSELL_MAX_DAYS).max(1),
            Self::HoldAbove { .. } => integer_sqrt(days.min(HOLDABOVE_MAX_DAYS).max(1)),
            Self::HoldUntil { unlock_at } => {
                let d = ((*unlock_at - now).max(0) as u64) / 86_400;
                integer_sqrt(d.min(HOLDUNTIL_MAX_DAYS).max(1))
            }
            Self::NoTradeWindow { window_start_hour, window_end_hour } => {
                let wh = if window_end_hour > window_start_hour {
                    (*window_end_hour - *window_start_hour) as u64
                } else {
                    (24 - *window_start_hour + *window_end_hour) as u64
                };
                ((wh * days.min(NOTRADE_MAX_DAYS).max(1)) / 24).max(1)
            }
            Self::AgentGuardian => (2 * days.min(GUARDIAN_MAX_DAYS).max(1)),
        }
    }
}

// Babylonian整数平方根
pub fn integer_sqrt(n: u64) -> u64 {
    if n == 0 {
        return 0;
    }
    let mut x = (n as f64).sqrt() as u64;
    while x > 0 && x.saturating_mul(x) > n {
        x -= 1;
    }
    while (x + 1).checked_mul(x + 1).map_or(false, |sq| sq <= n) {
        x += 1;
    }
    x
}

// weight = integer_sqrt(stake_lamports) * difficulty
pub fn compute_weight(stake: u64, difficulty: u64) -> u64 {
    integer_sqrt(stake).saturating_mul(difficulty)
}
