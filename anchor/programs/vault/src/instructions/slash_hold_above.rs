use crate::constants::*;
use crate::events::Slashed;
use crate::state::{HoldAboveCommitment, RewardPool};
use crate::utils::errors::ErrorCode;
use crate::utils::terminate::{move_lamports, redistribute_to_pool};
use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

#[derive(Accounts)]
pub struct SlashHoldAbove<'info> {
    #[account(address = reward_pool.slash_authority @ ErrorCode::Unauthorized)]
    pub slash_authority: Signer<'info>,

    /// CHECK: rent receiver on close; must match commitment.owner.
    #[account(mut, address = commitment.owner)]
    pub owner: UncheckedAccount<'info>,

    #[account(
        mut,
        close = owner,
        seeds = [HOLD_ABOVE_SEED, commitment.owner.as_ref(), commitment.target_mint.as_ref()],
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

pub fn handler<'info>(ctx: Context<'_, '_, 'info, 'info, SlashHoldAbove<'info>>) -> Result<()> {
    let owner_key = ctx.accounts.commitment.owner;
    let mint_key = ctx.accounts.commitment.target_mint;
    let floor = ctx.accounts.commitment.floor_amount;
    let mut current: u64 = 0;
    for ai in ctx.remaining_accounts.iter() {
        let ta = Account::<TokenAccount>::try_from(ai)?;
        require_keys_eq!(ta.owner, owner_key, ErrorCode::TokenAccountOwnerMismatch);
        require_keys_eq!(ta.mint, mint_key, ErrorCode::TokenAccountMintMismatch);
        current = current
            .checked_add(ta.amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
    }
    require!(current < floor, ErrorCode::NoViolation);

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

    emit!(Slashed {
        commitment: commitment_key,
        owner: owner_key,
        principal: stake,
    });

    Ok(())
}
