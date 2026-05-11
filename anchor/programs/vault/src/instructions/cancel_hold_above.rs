use crate::constants::*;
use crate::events::Cancelled;
use crate::state::{HoldAboveCommitment, RewardPool};
use crate::utils::terminate::{compute_pending_yield, move_lamports, redistribute_to_pool};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CancelHoldAbove<'info> {
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

    /// CHECK: program-owned 0-data PDA.
    #[account(
        mut,
        seeds = [VAULT_SEED, commitment.key().as_ref()],
        bump = commitment.vault_bump,
    )]
    pub vault: UncheckedAccount<'info>,

    #[account(mut, seeds = [REWARD_POOL_SEED], bump = reward_pool.bump)]
    pub reward_pool: Account<'info, RewardPool>,

    /// CHECK: program-owned 0-data PDA.
    #[account(mut, seeds = [PROTOCOL_VAULT_SEED], bump)]
    pub protocol_vault: UncheckedAccount<'info>,

    /// CHECK: receives last-staker funds.
    #[account(mut, address = reward_pool.treasury)]
    pub treasury: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<CancelHoldAbove>) -> Result<()> {
    let commitment_key = ctx.accounts.commitment.key();
    let weight = ctx.accounts.commitment.weight;
    let stake = ctx.accounts.commitment.stake_amount;
    let acc = ctx.accounts.reward_pool.acc_reward_per_weight;
    let reward_debt = ctx.accounts.commitment.reward_debt;

    let pending_yield = compute_pending_yield(weight, acc, reward_debt)?;
    let total = stake.saturating_add(pending_yield);

    let redistributed = redistribute_to_pool(&mut ctx.accounts.reward_pool, weight, total)?;

    let principal_dest = if redistributed {
        ctx.accounts.protocol_vault.to_account_info()
    } else {
        ctx.accounts.treasury.to_account_info()
    };
    move_lamports(&ctx.accounts.vault.to_account_info(), &principal_dest, stake)?;

    let vault_remaining = ctx.accounts.vault.lamports();
    if vault_remaining > 0 {
        move_lamports(
            &ctx.accounts.vault.to_account_info(),
            &ctx.accounts.owner.to_account_info(),
            vault_remaining,
        )?;
    }

    emit!(Cancelled {
        commitment: commitment_key,
        owner: ctx.accounts.owner.key(),
        principal: stake,
        type_disc: crate::events::TYPE_DISC_HOLD_ABOVE,
        target_mint: ctx.accounts.commitment.target_mint,
        created_at: ctx.accounts.commitment.created_at,
        expires_at: ctx.accounts.commitment.expires_at,
    });

    Ok(())
}
