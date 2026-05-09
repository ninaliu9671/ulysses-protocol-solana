use crate::constants::*;
use crate::events::{Created, TYPE_DISC_NO_TRADE_WINDOW};
use crate::state::{NoTradeWindowCommitment, RewardPool};
use crate::utils::errors::ErrorCode;
use crate::utils::math::integer_sqrt_u128;
use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

#[derive(Accounts)]
#[instruction(stake_amount: u64, duration_days: u16, window_start_hour: u8, window_end_hour: u8, nonce: u64)]
pub struct CreateNoTradeWindow<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + NoTradeWindowCommitment::INIT_SPACE,
        seeds = [NO_TRADE_SEED, owner.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub commitment: Account<'info, NoTradeWindowCommitment>,

    /// CHECK: program-owned 0-data PDA.
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

    /// CHECK: must not exist (no AgentGuardian conflict).
    #[account(seeds = [AGENT_GUARD_SEED, owner.key().as_ref()], bump)]
    pub agent_guardian_pda: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateNoTradeWindow>,
    stake_amount: u64,
    duration_days: u16,
    window_start_hour: u8,
    window_end_hour: u8,
    nonce: u64,
) -> Result<()> {
    require!(stake_amount >= MIN_STAKE_LAMPORTS, ErrorCode::StakeBelowMin);
    require!(stake_amount <= MAX_STAKE_LAMPORTS, ErrorCode::StakeAboveMax);
    require!(
        duration_days >= MIN_DURATION_DAYS && duration_days <= MAX_DURATION_DAYS,
        ErrorCode::DurationOutOfRange
    );
    require!(window_start_hour < 24 && window_end_hour < 24, ErrorCode::DurationOutOfRange);
    require!(window_start_hour != window_end_hour, ErrorCode::DurationOutOfRange);

    require!(
        ctx.accounts.agent_guardian_pda.data_is_empty()
            && ctx.accounts.agent_guardian_pda.lamports() == 0,
        ErrorCode::ConflictingCommitment
    );

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
        .checked_mul(duration_days as u128)
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
        .checked_add((duration_days as i64) * SECONDS_PER_DAY)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    let owner_key = ctx.accounts.owner.key();
    let commitment = &mut ctx.accounts.commitment;
    commitment.owner = owner_key;
    commitment.nonce = nonce;
    commitment.window_start_hour = window_start_hour;
    commitment.window_end_hour = window_end_hour;
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
        type_disc: TYPE_DISC_NO_TRADE_WINDOW,
        stake_amount,
        weight,
        expires_at,
    });

    Ok(())
}
