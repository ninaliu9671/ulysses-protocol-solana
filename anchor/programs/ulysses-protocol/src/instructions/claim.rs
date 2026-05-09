use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use crate::state::{ProtocolState, CommitmentAccount};
use crate::constants::PRECISION;
use crate::error::UlyssesError;

#[event]
pub struct Claimed {
    pub owner: Pubkey,
    pub target_mint: Pubkey,
    pub principal: u64,
    pub reward: u64,
    pub pool_id: u8,
    pub timestamp: i64,
}

pub fn handler(ctx: Context<Claim>) -> Result<()> {
    let commitment = &ctx.accounts.commitment_account;
    require!(commitment.is_active, UlyssesError::CommitmentNotActive);

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= commitment.unlock_time,
        UlyssesError::CommitmentStillLocked
    );

    // Read all needed values from commitment_account into locals before
    // any mutable borrows of protocol_state
    let pool_id = commitment.pool_id as usize;
    let weight = commitment.weight;
    let stake_amount = commitment.stake_amount;
    let reward_debt = commitment.reward_debt;
    let commitment_key = commitment.key();
    let vault_bump = commitment.vault_bump;
    let owner_key = ctx.accounts.owner.key();
    let target_mint = commitment.target_mint;

    // Compute pending reward:
    // pending = (weight * current_acc - reward_debt) / PRECISION
    let current_acc = ctx.accounts.protocol_state.acc_reward_per_weight[pool_id];
    let pending_u128 = (weight as u128)
        .saturating_mul(current_acc)
        .saturating_sub(reward_debt);
    let reward = (pending_u128 / PRECISION) as u64;

    // Safety check: pool must have enough balance to pay reward
    require!(
        ctx.accounts.protocol_state.pool_balance[pool_id] >= reward,
        UlyssesError::InsufficientPoolBalance
    );

    // Transfer principal: commitment_vault → owner
    let signer_seeds: &[&[&[u8]]] = &[&[b"vault", commitment_key.as_ref(), &[vault_bump]]];
    transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.commitment_vault.to_account_info(),
                to: ctx.accounts.owner.to_account_info(),
            },
            signer_seeds,
        ),
        stake_amount,
    )?;

    // Transfer reward: protocol_vault → owner (only if reward > 0)
    if reward > 0 {
        let vault_bump_byte = ctx.accounts.protocol_state.vault_bump;
        let vault_signer_seeds: &[&[&[u8]]] = &[&[b"protocol_vault", &[vault_bump_byte]]];
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.protocol_vault.to_account_info(),
                    to: ctx.accounts.owner.to_account_info(),
                },
                vault_signer_seeds,
            ),
            reward,
        )?;
    }

    // Update protocol state
    ctx.accounts.protocol_state.total_weight[pool_id] =
        ctx.accounts.protocol_state.total_weight[pool_id].saturating_sub(weight);
    ctx.accounts.protocol_state.pool_balance[pool_id] =
        ctx.accounts.protocol_state.pool_balance[pool_id].saturating_sub(reward);

    emit!(Claimed {
        owner: owner_key,
        target_mint,
        principal: stake_amount,
        reward,
        pool_id: pool_id as u8,
        timestamp: clock.unix_timestamp,
    });

    msg!(
        "CLAIM: owner={}, mint={}, principal={}, reward={}, pool_id={}",
        owner_key,
        target_mint,
        stake_amount,
        reward,
        pool_id,
    );

    Ok(())
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        close = owner,
        seeds = [b"commitment", commitment_account.owner.as_ref(), commitment_account.target_mint.as_ref()],
        bump = commitment_account.bump,
        has_one = owner,
    )]
    pub commitment_account: Account<'info, CommitmentAccount>,
    #[account(
        mut,
        seeds = [b"vault", commitment_account.key().as_ref()],
        bump = commitment_account.vault_bump,
    )]
    /// CHECK: System PDA holding staked lamports; drained to owner on claim
    pub commitment_vault: SystemAccount<'info>,
    #[account(
        mut,
        seeds = [b"protocol"],
        bump = protocol_state.bump,
    )]
    pub protocol_state: Account<'info, ProtocolState>,
    /// CHECK: Protocol reward vault PDA; validated via protocol_state.vault_bump in handler
    #[account(mut)]
    pub protocol_vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}
