use crate::constants::*;
use crate::events::Claimed;
use crate::state::{HoldAboveCommitment, RewardPool};
use crate::utils::errors::ErrorCode;
use crate::utils::terminate::{compute_pending_yield, deduct_weight, move_lamports};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ClaimHoldAbove<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        close = owner,
        has_one = owner,
        seeds = [HOLD_ABOVE_SEED, owner.key().as_ref(), commitment.target_mint.as_ref()],
        bump = commitment.bump,
    )]
    pub commitment: Account<'info, HoldAboveCommitment>,

    /// CHECK: program-owned 0-data PDA holding the stake.
    #[account(
        mut,
        seeds = [VAULT_SEED, commitment.key().as_ref()],
        bump = commitment.vault_bump,
    )]
    pub vault: UncheckedAccount<'info>,

    #[account(mut, seeds = [REWARD_POOL_SEED], bump = reward_pool.bump)]
    pub reward_pool: Account<'info, RewardPool>,

    /// CHECK: program-owned 0-data PDA holding pool SOL.
    #[account(mut, seeds = [PROTOCOL_VAULT_SEED], bump)]
    pub protocol_vault: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<ClaimHoldAbove>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(now >= ctx.accounts.commitment.expires_at, ErrorCode::NotYetExpired);

    let commitment_key = ctx.accounts.commitment.key();
    let weight = ctx.accounts.commitment.weight;
    let reward_debt = ctx.accounts.commitment.reward_debt;
    let stake = ctx.accounts.commitment.stake_amount;
    let acc = ctx.accounts.reward_pool.acc_reward_per_weight;

    let yield_paid = compute_pending_yield(weight, acc, reward_debt)?;
    deduct_weight(&mut ctx.accounts.reward_pool, weight)?;

    let vault_lamports = ctx.accounts.vault.lamports();
    move_lamports(
        &ctx.accounts.vault.to_account_info(),
        &ctx.accounts.owner.to_account_info(),
        vault_lamports,
    )?;

    if yield_paid > 0 {
        move_lamports(
            &ctx.accounts.protocol_vault.to_account_info(),
            &ctx.accounts.owner.to_account_info(),
            yield_paid,
        )?;
    }

    emit!(Claimed {
        commitment: commitment_key,
        owner: ctx.accounts.owner.key(),
        principal: stake,
        yield_paid,
        type_disc: crate::events::TYPE_DISC_HOLD_ABOVE,
        target_mint: ctx.accounts.commitment.target_mint,
        created_at: ctx.accounts.commitment.created_at,
        expires_at: ctx.accounts.commitment.expires_at,
    });

    Ok(())
}
