use crate::constants::*;
use crate::events::{Created, TYPE_DISC_NO_SELL};
use crate::state::{NoSellCommitment, RewardPool};
use crate::utils::errors::ErrorCode;
use crate::utils::math::integer_sqrt_u128;
use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use anchor_spl::token::{Mint, TokenAccount};

#[derive(Accounts)]
pub struct CreateNoSell<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    pub target_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = owner,
        space = 8 + NoSellCommitment::INIT_SPACE,
        seeds = [NO_SELL_SEED, owner.key().as_ref(), target_mint.key().as_ref()],
        bump,
    )]
    pub commitment: Account<'info, NoSellCommitment>,

    /// CHECK: 0-data PDA created here; subsequent reads use SystemAccount.
    #[account(
        init,
        payer = owner,
        space = 0,
        seeds = [VAULT_SEED, commitment.key().as_ref()],
        bump,
    )]
    pub vault: UncheckedAccount<'info>,

    #[account(mut, seeds = [REWARD_POOL_SEED], bump = reward_pool.bump)]
    pub reward_pool: Account<'info, RewardPool>,

    /// CHECK: must not exist (no HoldAbove conflict). Address verified via seeds.
    #[account(
        seeds = [HOLD_ABOVE_SEED, owner.key().as_ref(), target_mint.key().as_ref()],
        bump,
    )]
    pub hold_above_pda: UncheckedAccount<'info>,

    /// CHECK: must not exist (no AgentGuardian conflict). Address verified via seeds.
    #[account(
        seeds = [AGENT_GUARD_SEED, owner.key().as_ref()],
        bump,
    )]
    pub agent_guardian_pda: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler<'info>(
    ctx: Context<'_, '_, 'info, 'info, CreateNoSell<'info>>,
    stake_amount: u64,
    duration_seconds: u64,
) -> Result<()> {
    require!(stake_amount >= MIN_STAKE_LAMPORTS, ErrorCode::StakeBelowMin);
    require!(stake_amount <= MAX_STAKE_LAMPORTS, ErrorCode::StakeAboveMax);
    require!(
        duration_seconds >= MIN_DURATION_SECONDS && duration_seconds <= MAX_DURATION_SECONDS,
        ErrorCode::DurationOutOfRange
    );

    require!(
        ctx.accounts.hold_above_pda.data_is_empty()
            && ctx.accounts.hold_above_pda.lamports() == 0,
        ErrorCode::ConflictingCommitment
    );
    require!(
        ctx.accounts.agent_guardian_pda.data_is_empty()
            && ctx.accounts.agent_guardian_pda.lamports() == 0,
        ErrorCode::ConflictingCommitment
    );

    let owner_key = ctx.accounts.owner.key();
    let mint_key = ctx.accounts.target_mint.key();
    let mut baseline: u64 = 0;
    for ai in ctx.remaining_accounts.iter() {
        let ta = Account::<TokenAccount>::try_from(ai)?;
        require_keys_eq!(ta.owner, owner_key, ErrorCode::TokenAccountOwnerMismatch);
        require_keys_eq!(ta.mint, mint_key, ErrorCode::TokenAccountMintMismatch);
        baseline = baseline
            .checked_add(ta.amount)
            .ok_or(ErrorCode::ArithmeticOverflow)?;
    }
    require!(baseline > 0, ErrorCode::BaselineZero);

    transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.owner.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        stake_amount,
    )?;

    let weight_u128 = (stake_amount as u128)
        .checked_mul(duration_seconds as u128)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    let weight = integer_sqrt_u128(weight_u128);
    require!(weight > 0, ErrorCode::ArithmeticOverflow);

    let pool = &mut ctx.accounts.reward_pool;
    let reward_debt = (weight as u128)
        .checked_mul(pool.acc_reward_per_weight)
        .ok_or(ErrorCode::ArithmeticOverflow)?
        / PRECISION;

    let now = Clock::get()?.unix_timestamp;
    let expires_at = now
        .checked_add(duration_seconds as i64)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    let commitment = &mut ctx.accounts.commitment;
    commitment.owner = owner_key;
    commitment.target_mint = mint_key;
    commitment.floor_amount = baseline;
    commitment.stake_amount = stake_amount;
    commitment.weight = weight;
    commitment.reward_debt = reward_debt;
    commitment.created_at = now;
    commitment.expires_at = expires_at;
    commitment.bump = ctx.bumps.commitment;
    commitment.vault_bump = ctx.bumps.vault;

    pool.total_weight = pool
        .total_weight
        .checked_add(weight as u128)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    emit!(Created {
        commitment: commitment.key(),
        owner: owner_key,
        type_disc: TYPE_DISC_NO_SELL,
        stake_amount,
        weight,
        expires_at,
    });

    Ok(())
}
