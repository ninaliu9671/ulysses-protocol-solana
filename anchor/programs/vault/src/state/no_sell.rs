use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct NoSellCommitment {
    pub owner: Pubkey,
    pub target_mint: Pubkey,
    pub floor_amount: u64,
    pub stake_amount: u64,
    pub weight: u64,
    pub reward_debt: u128,
    pub created_at: i64,
    pub expires_at: i64,
    pub bump: u8,
    pub vault_bump: u8,
}
