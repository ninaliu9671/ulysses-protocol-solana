use crate::constants::*;
use crate::events::{Created, TYPE_DISC_AGENT_GUARDIAN};
use crate::state::{AgentGuardianCommitment, RewardPool};
use crate::utils::errors::ErrorCode;
use crate::utils::math::integer_sqrt_u128;
use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

#[derive(Accounts)]
pub struct CreateAgentGuardian<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + AgentGuardianCommitment::INIT_SPACE,
        seeds = [AGENT_GUARD_SEED, owner.key().as_ref()],
        bump,
    )]
    pub commitment: Account<'info, AgentGuardianCommitment>,

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

    pub system_program: Program<'info, System>,
}

pub fn handler<'info>(
    ctx: Context<'_, '_, 'info, 'info, CreateAgentGuardian<'info>>,
    stake_amount: u64,
    duration_days: u16,
    guardian_pubkey: Pubkey,
) -> Result<()> {
    require!(stake_amount >= MIN_STAKE_LAMPORTS, ErrorCode::StakeBelowMin);
    require!(stake_amount <= MAX_STAKE_LAMPORTS, ErrorCode::StakeAboveMax);
    require!(
        duration_days >= MIN_DURATION_DAYS && duration_days <= MAX_DURATION_DAYS,
        ErrorCode::DurationOutOfRange
    );

    // §11.5.2: AG creation requires NO other commitment PDA exists for owner.
    // Client must enumerate via getProgramAccounts(filter=owner) and pass all
    // results as remaining_accounts. Program rejects if any is program-owned
    // and non-empty. Lying client only hurts itself (other commitments will
    // still be slashable).
    let program_id = ctx.program_id;
    for ai in ctx.remaining_accounts.iter() {
        let is_active = ai.owner == program_id && !ai.data_is_empty();
        require!(!is_active, ErrorCode::ConflictingCommitment);
    }

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
    commitment.guardian_pubkey = guardian_pubkey;
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
        type_disc: TYPE_DISC_AGENT_GUARDIAN,
        stake_amount,
        weight,
        expires_at,
    });

    Ok(())
}
