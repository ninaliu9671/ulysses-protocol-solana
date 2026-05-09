use crate::constants::*;
use crate::events::Cancelled;
use crate::state::{NoTradeWindowCommitment, RewardPool};
use crate::utils::terminate::{move_lamports, redistribute_to_pool};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CancelNoTradeWindow<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        close = owner,
        has_one = owner,
        seeds = [NO_TRADE_SEED, owner.key().as_ref(), &commitment.nonce.to_le_bytes()],
        bump = commitment.bump,
    )]
    pub commitment: Account<'info, NoTradeWindowCommitment>,

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

pub fn handler(ctx: Context<CancelNoTradeWindow>) -> Result<()> {
    let commitment_key = ctx.accounts.commitment.key();
    let weight = ctx.accounts.commitment.weight;
    let stake = ctx.accounts.commitment.stake_amount;

    let redistributed = redistribute_to_pool(&mut ctx.accounts.reward_pool, weight, stake)?;

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
    });

    Ok(())
}
