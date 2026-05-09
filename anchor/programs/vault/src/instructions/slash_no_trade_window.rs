use crate::constants::*;
use crate::events::Slashed;
use crate::state::{NoTradeWindowCommitment, RewardPool};
use crate::utils::errors::ErrorCode;
use crate::utils::terminate::{move_lamports, redistribute_to_pool};
use anchor_lang::prelude::*;

// v2.1: NoTradeWindow violations cannot be verified on-chain (program cannot
// inspect signers of historical transactions). slash_authority is trusted.
// See DESIGN.md OQ-6.

#[derive(Accounts)]
pub struct SlashNoTradeWindow<'info> {
    #[account(address = reward_pool.slash_authority @ ErrorCode::Unauthorized)]
    pub slash_authority: Signer<'info>,

    /// CHECK: rent receiver on close; must match commitment.owner.
    #[account(mut, address = commitment.owner)]
    pub owner: UncheckedAccount<'info>,

    #[account(
        mut,
        close = owner,
        seeds = [NO_TRADE_SEED, commitment.owner.as_ref(), &commitment.nonce.to_le_bytes()],
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

pub fn handler(ctx: Context<SlashNoTradeWindow>) -> Result<()> {
    let commitment_key = ctx.accounts.commitment.key();
    let owner_key = ctx.accounts.commitment.owner;
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
