use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use crate::state::{ProtocolState, CommitmentAccount};
use crate::error::UlyssesError;

pub fn handler(ctx: Context<CancelCommitment>) -> Result<()> {
    let commitment = &ctx.accounts.commitment_account;

    require!(
        ctx.accounts.owner.key() == commitment.owner,
        UlyssesError::NotOwner
    );
    require!(commitment.is_active, UlyssesError::CommitmentNotActive);

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= commitment.unlock_time,
        UlyssesError::CommitmentStillLocked
    );

    let pool_id = commitment.pool_id as usize;
    let weight = commitment.weight;
    let refund_amount = ctx.accounts.commitment_vault.lamports();
    let commitment_key = commitment.key();
    let vault_bump = commitment.vault_bump;

    // Update pool total_weight (owner forfeits reward on cancel, only gets principal back)
    ctx.accounts.protocol_state.total_weight[pool_id] =
        ctx.accounts.protocol_state.total_weight[pool_id].saturating_sub(weight);

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
        refund_amount,
    )?;

    msg!(
        "Commitment cancelled: owner={}, refund={} lamports",
        ctx.accounts.owner.key(),
        refund_amount
    );

    Ok(())
}

#[derive(Accounts)]
pub struct CancelCommitment<'info> {
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
    /// CHECK: System PDA holding staked lamports; returned to owner on cancel
    pub commitment_vault: SystemAccount<'info>,
    #[account(
        mut,
        seeds = [b"protocol"],
        bump = protocol_state.bump,
    )]
    pub protocol_state: Account<'info, ProtocolState>,
    pub system_program: Program<'info, System>,
}
