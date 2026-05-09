use anchor_lang::prelude::*;
use crate::state::ProtocolState;
use crate::constants::PROTOCOL_STATE_SPACE;

pub fn handler(ctx: Context<Initialize>, authority: Pubkey) -> Result<()> {
    let state = &mut ctx.accounts.protocol_state;
    state.authority = authority;
    state.bump = ctx.bumps.protocol_state;
    state.vault_bump = ctx.bumps.protocol_vault;
    state.acc_reward_per_weight = [0u128; 6];
    state.total_weight = [0u64; 6];
    state.pool_balance = [0u64; 6];
    msg!("Ulysses Protocol initialized. Authority: {}", authority);
    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = PROTOCOL_STATE_SPACE,
        seeds = [b"protocol"],
        bump,
    )]
    pub protocol_state: Account<'info, ProtocolState>,
    /// CHECK: Protocol reward vault PDA，持有所有pool的slash奖励lamports
    #[account(
        mut,
        seeds = [b"protocol_vault"],
        bump,
    )]
    pub protocol_vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}
