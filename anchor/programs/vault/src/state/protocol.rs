use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct RewardPool {
    pub total_weight: u128,
    pub acc_reward_per_weight: u128,
    pub treasury: Pubkey,
    pub slash_authority: Pubkey,
    pub bump: u8,
}
