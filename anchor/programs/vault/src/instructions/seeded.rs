// devnet-seed feature: backdated commitment creation for seed scripts.
// See DESIGN.md OQ-15 + PLAN_AGENT.md §2.4.
//
// All four seed_create_* mirror their regular create_* counterparts but:
// - require SEED_AUTHORITY signer (hardcoded)
// - accept commit_timestamp: i64 instead of using Clock::get()
// - SEED_AUTHORITY pays init rent + provides stake_amount (not owner)
// - skip remaining_accounts validation (conflict checks + token baseline)
//
// Builds only with `--features devnet-seed`. Mainnet builds do not contain.

use crate::constants::*;
use crate::events::{
    Created, TYPE_DISC_AGENT_GUARDIAN, TYPE_DISC_HOLD_ABOVE, TYPE_DISC_NO_SELL,
    TYPE_DISC_NO_TRADE_WINDOW,
};
use crate::state::{
    AgentGuardianCommitment, HoldAboveCommitment, NoSellCommitment, NoTradeWindowCommitment,
    RewardPool,
};
use crate::utils::errors::ErrorCode;
use crate::utils::math::integer_sqrt_u128;
use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

pub const SEED_AUTHORITY: Pubkey = pubkey!("7xnji33BGTxreohNTGfHtLuWCuqu8Sj2zGb7Qm5kgF67");

fn validate_common(
    stake_amount: u64,
    duration_seconds: u64,
    commit_timestamp: i64,
    now: i64,
) -> Result<()> {
    require!(stake_amount >= MIN_STAKE_LAMPORTS, ErrorCode::StakeBelowMin);
    require!(stake_amount <= MAX_STAKE_LAMPORTS, ErrorCode::StakeAboveMax);
    require!(
        duration_seconds >= MIN_DURATION_SECONDS && duration_seconds <= MAX_DURATION_SECONDS,
        ErrorCode::DurationOutOfRange
    );
    require!(commit_timestamp <= now, ErrorCode::DurationOutOfRange);
    require!(
        commit_timestamp >= now - 365 * SECONDS_PER_DAY,
        ErrorCode::DurationOutOfRange
    );
    Ok(())
}

// ───── seed NoSell ─────

#[derive(Accounts)]
pub struct SeedCreateNoSell<'info> {
    #[account(mut, address = SEED_AUTHORITY @ ErrorCode::Unauthorized)]
    pub seed_authority: Signer<'info>,

    /// CHECK: pubkey only; this commitment is recorded as belonging to `owner`.
    pub owner: UncheckedAccount<'info>,

    /// CHECK: target_mint pubkey stored on the commitment.
    pub target_mint: UncheckedAccount<'info>,

    #[account(
        init,
        payer = seed_authority,
        space = 8 + NoSellCommitment::INIT_SPACE,
        seeds = [NO_SELL_SEED, owner.key().as_ref(), target_mint.key().as_ref()],
        bump,
    )]
    pub commitment: Account<'info, NoSellCommitment>,

    /// CHECK: program-owned 0-data PDA.
    #[account(
        init,
        payer = seed_authority,
        space = 0,
        seeds = [VAULT_SEED, commitment.key().as_ref()],
        bump,
    )]
    pub vault: UncheckedAccount<'info>,

    #[account(mut, seeds = [REWARD_POOL_SEED], bump = reward_pool.bump)]
    pub reward_pool: Account<'info, RewardPool>,

    pub system_program: Program<'info, System>,
}

pub fn seed_create_no_sell(
    ctx: Context<SeedCreateNoSell>,
    stake_amount: u64,
    duration_seconds: u64,
    floor_amount: u64,
    commit_timestamp: i64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    validate_common(stake_amount, duration_seconds, commit_timestamp, now)?;
    require!(floor_amount > 0, ErrorCode::FloorOutOfRange);

    transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.seed_authority.to_account_info(),
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

    let expires_at = commit_timestamp
        .checked_add(duration_seconds as i64)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    let owner_key = ctx.accounts.owner.key();
    let mint_key = ctx.accounts.target_mint.key();
    let commitment = &mut ctx.accounts.commitment;
    commitment.owner = owner_key;
    commitment.target_mint = mint_key;
    commitment.floor_amount = floor_amount;
    commitment.stake_amount = stake_amount;
    commitment.weight = weight;
    commitment.reward_debt = reward_debt;
    commitment.created_at = commit_timestamp;
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

// ───── seed HoldAbove ─────

#[derive(Accounts)]
pub struct SeedCreateHoldAbove<'info> {
    #[account(mut, address = SEED_AUTHORITY @ ErrorCode::Unauthorized)]
    pub seed_authority: Signer<'info>,

    /// CHECK: pubkey only.
    pub owner: UncheckedAccount<'info>,

    /// CHECK: target_mint pubkey stored on the commitment.
    pub target_mint: UncheckedAccount<'info>,

    #[account(
        init,
        payer = seed_authority,
        space = 8 + HoldAboveCommitment::INIT_SPACE,
        seeds = [HOLD_ABOVE_SEED, owner.key().as_ref(), target_mint.key().as_ref()],
        bump,
    )]
    pub commitment: Account<'info, HoldAboveCommitment>,

    /// CHECK: program-owned 0-data PDA.
    #[account(
        init,
        payer = seed_authority,
        space = 0,
        seeds = [VAULT_SEED, commitment.key().as_ref()],
        bump,
    )]
    pub vault: UncheckedAccount<'info>,

    #[account(mut, seeds = [REWARD_POOL_SEED], bump = reward_pool.bump)]
    pub reward_pool: Account<'info, RewardPool>,

    pub system_program: Program<'info, System>,
}

pub fn seed_create_hold_above(
    ctx: Context<SeedCreateHoldAbove>,
    stake_amount: u64,
    duration_seconds: u64,
    floor_amount: u64,
    commit_timestamp: i64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    validate_common(stake_amount, duration_seconds, commit_timestamp, now)?;
    require!(floor_amount > 0, ErrorCode::FloorOutOfRange);

    transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.seed_authority.to_account_info(),
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

    let expires_at = commit_timestamp
        .checked_add(duration_seconds as i64)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    let owner_key = ctx.accounts.owner.key();
    let mint_key = ctx.accounts.target_mint.key();
    let commitment = &mut ctx.accounts.commitment;
    commitment.owner = owner_key;
    commitment.target_mint = mint_key;
    commitment.floor_amount = floor_amount;
    commitment.stake_amount = stake_amount;
    commitment.weight = weight;
    commitment.reward_debt = reward_debt;
    commitment.created_at = commit_timestamp;
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
        type_disc: TYPE_DISC_HOLD_ABOVE,
        stake_amount,
        weight,
        expires_at,
    });
    Ok(())
}

// ───── seed NoTradeWindow ─────

#[derive(Accounts)]
#[instruction(stake_amount: u64, duration_seconds: u64, window_start_hour: u8, window_end_hour: u8, nonce: u64, commit_timestamp: i64)]
pub struct SeedCreateNoTradeWindow<'info> {
    #[account(mut, address = SEED_AUTHORITY @ ErrorCode::Unauthorized)]
    pub seed_authority: Signer<'info>,

    /// CHECK: pubkey only.
    pub owner: UncheckedAccount<'info>,

    #[account(
        init,
        payer = seed_authority,
        space = 8 + NoTradeWindowCommitment::INIT_SPACE,
        seeds = [NO_TRADE_SEED, owner.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub commitment: Account<'info, NoTradeWindowCommitment>,

    /// CHECK: program-owned 0-data PDA.
    #[account(
        init,
        payer = seed_authority,
        space = 0,
        seeds = [VAULT_SEED, commitment.key().as_ref()],
        bump,
    )]
    pub vault: UncheckedAccount<'info>,

    #[account(mut, seeds = [REWARD_POOL_SEED], bump = reward_pool.bump)]
    pub reward_pool: Account<'info, RewardPool>,

    pub system_program: Program<'info, System>,
}

pub fn seed_create_no_trade_window(
    ctx: Context<SeedCreateNoTradeWindow>,
    stake_amount: u64,
    duration_seconds: u64,
    window_start_hour: u8,
    window_end_hour: u8,
    nonce: u64,
    commit_timestamp: i64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    validate_common(stake_amount, duration_seconds, commit_timestamp, now)?;
    require!(window_start_hour < 24 && window_end_hour < 24, ErrorCode::DurationOutOfRange);
    require!(window_start_hour != window_end_hour, ErrorCode::DurationOutOfRange);

    transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.seed_authority.to_account_info(),
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

    let expires_at = commit_timestamp
        .checked_add(duration_seconds as i64)
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
    commitment.created_at = commit_timestamp;
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

// ───── seed AgentGuardian ─────

#[derive(Accounts)]
pub struct SeedCreateAgentGuardian<'info> {
    #[account(mut, address = SEED_AUTHORITY @ ErrorCode::Unauthorized)]
    pub seed_authority: Signer<'info>,

    /// CHECK: pubkey only.
    pub owner: UncheckedAccount<'info>,

    #[account(
        init,
        payer = seed_authority,
        space = 8 + AgentGuardianCommitment::INIT_SPACE,
        seeds = [AGENT_GUARD_SEED, owner.key().as_ref()],
        bump,
    )]
    pub commitment: Account<'info, AgentGuardianCommitment>,

    /// CHECK: program-owned 0-data PDA.
    #[account(
        init,
        payer = seed_authority,
        space = 0,
        seeds = [VAULT_SEED, commitment.key().as_ref()],
        bump,
    )]
    pub vault: UncheckedAccount<'info>,

    #[account(mut, seeds = [REWARD_POOL_SEED], bump = reward_pool.bump)]
    pub reward_pool: Account<'info, RewardPool>,

    pub system_program: Program<'info, System>,
}

pub fn seed_create_agent_guardian(
    ctx: Context<SeedCreateAgentGuardian>,
    stake_amount: u64,
    duration_seconds: u64,
    guardian_pubkey: Pubkey,
    commit_timestamp: i64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    validate_common(stake_amount, duration_seconds, commit_timestamp, now)?;

    transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.seed_authority.to_account_info(),
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

    let expires_at = commit_timestamp
        .checked_add(duration_seconds as i64)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    let owner_key = ctx.accounts.owner.key();
    let commitment = &mut ctx.accounts.commitment;
    commitment.owner = owner_key;
    commitment.guardian_pubkey = guardian_pubkey;
    commitment.stake_amount = stake_amount;
    commitment.weight = weight;
    commitment.reward_debt = reward_debt;
    commitment.created_at = commit_timestamp;
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
        type_disc: TYPE_DISC_AGENT_GUARDIAN,
        stake_amount,
        weight,
        expires_at,
    });
    Ok(())
}
