use anchor_lang::prelude::*;

#[event]
pub struct Created {
    pub commitment: Pubkey,
    pub owner: Pubkey,
    pub type_disc: u8,
    pub stake_amount: u64,
    pub weight: u64,
    pub expires_at: i64,
}

#[event]
pub struct Claimed {
    pub commitment: Pubkey,
    pub owner: Pubkey,
    pub principal: u64,
    pub yield_paid: u64,
}

#[event]
pub struct Cancelled {
    pub commitment: Pubkey,
    pub owner: Pubkey,
    pub principal: u64,
}

#[event]
pub struct Slashed {
    pub commitment: Pubkey,
    pub owner: Pubkey,
    pub principal: u64,
}

#[event]
pub struct Voided {
    pub commitment: Pubkey,
    pub owner: Pubkey,
    pub principal: u64,
}

pub const TYPE_DISC_NO_SELL: u8 = 0;
pub const TYPE_DISC_HOLD_ABOVE: u8 = 1;
pub const TYPE_DISC_NO_TRADE_WINDOW: u8 = 2;
pub const TYPE_DISC_AGENT_GUARDIAN: u8 = 3;
