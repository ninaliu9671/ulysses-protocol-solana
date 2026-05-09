use crate::constants::*;
use crate::events::Slashed;
use crate::state::{NoSellCommitment, RewardPool};
use crate::utils::errors::ErrorCode;
use crate::utils::terminate::redistribute_to_pool;
use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::token::TokenAccount;

#[derive(Accounts)]
pub struct SlashNoSell<'info> {
    #[account(address = reward_pool.slash_authority @ ErrorCode::Unauthorized)]
    pub slash_authority: Signer<'info>,

    /// CHECK: rent receiver on close; must match commitment.owner.
    #[account(mut, address = commitment.owner)]
    pub owner: UncheckedAccount<'info>,

    #[account(
        mut,
        close = owner,
        seeds = [NO_SELL_SEED, commitment.owner.as_ref(), commitment.target_mint.as_ref()],
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

    /// CHECK: receives last-staker funds; must match reward_pool.treasury.
    #[account(mut, address = reward_pool.treasury)]
    pub treasury: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler<'info>(ctx: Context<'_, '_, 'info, 'info, SlashNoSell<'info>>) -> Result<()> {
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
    let vault_bump = ctx.accounts.commitment.vault_bump;

    let redistributed = redistribute_to_pool(&mut ctx.accounts.reward_pool, weight, stake)?;

    let vault_seeds: &[&[u8]] = &[VAULT_SEED, commitment_key.as_ref(), &[vault_bump]];
    let vault_signer: &[&[&[u8]]] = &[vault_seeds];
    let vault_lamports = ctx.accounts.vault.lamports();
    let owner_refund = vault_lamports.saturating_sub(stake);

    let principal_dest = if redistributed {
        ctx.accounts.protocol_vault.to_account_info()
    } else {
        ctx.accounts.treasury.to_account_info()
    };
    transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: principal_dest,
            },
            vault_signer,
        ),
        stake,
    )?;

    if owner_refund > 0 {
        transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.owner.to_account_info(),
                },
                vault_signer,
            ),
            owner_refund,
        )?;
    }

    emit!(Slashed {
        commitment: commitment_key,
        owner: owner_key,
        principal: stake,
    });

    Ok(())
}
