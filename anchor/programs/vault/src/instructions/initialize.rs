use crate::constants::{PROTOCOL_VAULT_SEED, REWARD_POOL_SEED};
use crate::state::RewardPool;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + RewardPool::INIT_SPACE,
        seeds = [REWARD_POOL_SEED],
        bump,
    )]
    pub reward_pool: Account<'info, RewardPool>,

    /// CHECK: 0-data PDA created here; subsequent reads use SystemAccount.
    #[account(
        init,
        payer = admin,
        space = 0,
        seeds = [PROTOCOL_VAULT_SEED],
        bump,
    )]
    pub protocol_vault: UncheckedAccount<'info>,

    /// CHECK: stored as treasury pubkey only; v2.1 expectation: Squads multisig vault.
    pub treasury: UncheckedAccount<'info>,

    /// CHECK: stored as slash_authority pubkey only; watcher keypair.
    pub slash_authority: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    let pool = &mut ctx.accounts.reward_pool;
    pool.total_weight = 0;
    pool.acc_reward_per_weight = 0;
    pool.treasury = ctx.accounts.treasury.key();
    pool.slash_authority = ctx.accounts.slash_authority.key();
    pool.bump = ctx.bumps.reward_pool;
    Ok(())
}
