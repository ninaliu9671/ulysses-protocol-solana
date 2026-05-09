use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct AgentGuardianCommitment {
    pub owner: Pubkey,
    pub guardian_pubkey: Pubkey,
    pub stake_amount: u64,
    pub weight: u64,
    pub reward_debt: u128,
    pub created_at: i64,
    pub expires_at: i64,
    pub bump: u8,
    pub vault_bump: u8,
}
