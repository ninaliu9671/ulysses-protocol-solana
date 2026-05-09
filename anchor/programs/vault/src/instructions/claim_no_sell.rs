use crate::constants::*;
use crate::events::Claimed;
use crate::state::{NoSellCommitment, RewardPool};
use crate::utils::errors::ErrorCode;
use crate::utils::terminate::{compute_pending_yield, deduct_weight};
use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

#[derive(Accounts)]
pub struct ClaimNoSell<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        close = owner,
        has_one = owner,
        seeds = [NO_SELL_SEED, owner.key().as_ref(), commitment.target_mint.as_ref()],
        bump = commitment.bump,
    )]
    pub commitment: Account<'info, NoSellCommitment>,

    #[account(
        mut,
        seeds = [VAULT_SEED, commitment.key().as_ref()],
        bump = commitment.vault_bump,
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut, seeds = [REWARD_POOL_SEED], bump = reward_pool.bump)]
    pub reward_pool: Account<'info, RewardPool>,

    #[account(mut, seeds = [PROTOCOL_VAULT_SEED], bump)]
    pub protocol_vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ClaimNoSell>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(now >= ctx.accounts.commitment.expires_at, ErrorCode::NotYetExpired);

    let commitment_key = ctx.accounts.commitment.key();
    let weight = ctx.accounts.commitment.weight;
    let reward_debt = ctx.accounts.commitment.reward_debt;
    let stake = ctx.accounts.commitment.stake_amount;
    let vault_bump = ctx.accounts.commitment.vault_bump;
    let acc = ctx.accounts.reward_pool.acc_reward_per_weight;

    let yield_paid = compute_pending_yield(weight, acc, reward_debt)?;

    deduct_weight(&mut ctx.accounts.reward_pool, weight)?;

    let vault_seeds: &[&[u8]] = &[VAULT_SEED, commitment_key.as_ref(), &[vault_bump]];
    let vault_signer: &[&[&[u8]]] = &[vault_seeds];
    let vault_lamports = ctx.accounts.vault.lamports();
    transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.owner.to_account_info(),
            },
            vault_signer,
        ),
        vault_lamports,
    )?;

    if yield_paid > 0 {
        let pv_bump = ctx.bumps.protocol_vault;
        let pv_seeds: &[&[u8]] = &[PROTOCOL_VAULT_SEED, &[pv_bump]];
        let pv_signer: &[&[&[u8]]] = &[pv_seeds];
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.protocol_vault.to_account_info(),
                    to: ctx.accounts.owner.to_account_info(),
                },
                pv_signer,
            ),
            yield_paid,
        )?;
    }

    emit!(Claimed {
        commitment: commitment_key,
        owner: ctx.accounts.owner.key(),
        principal: stake,
        yield_paid,
    });

    Ok(())
}
