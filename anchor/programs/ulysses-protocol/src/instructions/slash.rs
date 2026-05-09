use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use crate::state::{ProtocolState, CommitmentAccount};
use crate::constants::PRECISION;
use crate::error::UlyssesError;

#[event]
pub struct Slashed {
    pub owner: Pubkey,
    pub target_mint: Pubkey,
    pub amount: u64,
    pub pool_id: u8,
    pub went_to_pool: bool,   // true=进奖池，false=归平台（最后一人）
    pub tx_signature: [u8; 64],
    pub timestamp: i64,
}

pub fn handler(ctx: Context<Slash>, tx_signature: [u8; 64]) -> Result<()> {
    require!(
        ctx.accounts.authority.key() == ctx.accounts.protocol_state.authority,
        UlyssesError::NotAuthority
    );

    let commitment = &ctx.accounts.commitment_account;
    require!(commitment.is_active, UlyssesError::CommitmentNotActive);

    // Read all needed values from commitment_account before any mutable borrows
    let pool_id = commitment.pool_id as usize;
    let weight = commitment.weight;
    let commitment_key = commitment.key();
    let vault_bump = commitment.vault_bump;
    let owner = commitment.owner;
    let target_mint = commitment.target_mint;

    let slash_amount = ctx.accounts.commitment_vault.lamports();

    // Validate protocol_vault PDA
    let (expected_vault, _) = Pubkey::find_program_address(&[b"protocol_vault"], &crate::ID);
    require_keys_eq!(ctx.accounts.protocol_vault.key(), expected_vault);

    // Compute remaining_weight (strictly avoid divide-by-zero)
    let remaining_weight = ctx.accounts.protocol_state.total_weight[pool_id]
        .saturating_sub(weight);

    let went_to_pool: bool;

    if remaining_weight > 0 {
        // Case A: other stakers exist in this pool — slash funds go to reward pool
        ctx.accounts.protocol_state.acc_reward_per_weight[pool_id] = ctx
            .accounts
            .protocol_state
            .acc_reward_per_weight[pool_id]
            .saturating_add(
                slash_amount as u128 * PRECISION / remaining_weight as u128,
            );
        ctx.accounts.protocol_state.total_weight[pool_id] = remaining_weight;
        ctx.accounts.protocol_state.pool_balance[pool_id] = ctx
            .accounts
            .protocol_state
            .pool_balance[pool_id]
            .saturating_add(slash_amount);

        // Transfer: commitment_vault → protocol_vault
        let signer_seeds: &[&[&[u8]]] = &[&[b"vault", commitment_key.as_ref(), &[vault_bump]]];
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.commitment_vault.to_account_info(),
                    to: ctx.accounts.protocol_vault.to_account_info(),
                },
                signer_seeds,
            ),
            slash_amount,
        )?;

        went_to_pool = true;
    } else {
        // Case B: last staker in pool — funds go directly to authority (platform revenue)
        ctx.accounts.protocol_state.total_weight[pool_id] = 0;

        let signer_seeds: &[&[&[u8]]] = &[&[b"vault", commitment_key.as_ref(), &[vault_bump]]];
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.commitment_vault.to_account_info(),
                    to: ctx.accounts.authority.to_account_info(),
                },
                signer_seeds,
            ),
            slash_amount,
        )?;

        went_to_pool = false;
    }

    emit!(Slashed {
        owner,
        target_mint,
        amount: slash_amount,
        pool_id: pool_id as u8,
        went_to_pool,
        tx_signature,
        timestamp: Clock::get()?.unix_timestamp,
    });

    msg!(
        "SLASH: owner={}, mint={}, amount={} lamports, pool_id={}, went_to_pool={}",
        owner,
        target_mint,
        slash_amount,
        pool_id,
        went_to_pool,
    );

    Ok(())
}

#[derive(Accounts)]
pub struct Slash<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"protocol"],
        bump = protocol_state.bump,
    )]
    pub protocol_state: Account<'info, ProtocolState>,
    #[account(
        mut,
        close = authority,
        seeds = [b"commitment", commitment_account.owner.as_ref(), commitment_account.target_mint.as_ref()],
        bump = commitment_account.bump,
    )]
    pub commitment_account: Account<'info, CommitmentAccount>,
    #[account(
        mut,
        seeds = [b"vault", commitment_account.key().as_ref()],
        bump = commitment_account.vault_bump,
    )]
    /// CHECK: System PDA holding staked lamports; drained to protocol_vault or authority
    pub commitment_vault: SystemAccount<'info>,
    /// CHECK: Protocol reward vault PDA; validated via find_program_address in handler
    #[account(mut)]
    pub protocol_vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}
