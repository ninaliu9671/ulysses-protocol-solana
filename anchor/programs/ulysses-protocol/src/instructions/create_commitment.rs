use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};
use crate::state::{CommitmentAccount, CommitmentType, compute_weight};
use crate::constants::{MIN_STAKE_LAMPORTS, MIN_DURATION_SECS, COMMITMENT_SPACE};
use crate::error::UlyssesError;
use crate::state::ProtocolState;

// SPL Token Program ID (hardcoded to avoid anchor-spl dependency)
// Bytes: base58-decode of "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
const SPL_TOKEN_PROGRAM_ID: Pubkey = Pubkey::new_from_array([
    6, 221, 246, 225, 215, 101, 161, 147, 217, 203, 225, 70, 206, 235, 121, 172,
    28, 180, 133, 237, 95, 91, 55, 145, 58, 140, 245, 133, 126, 255, 0, 169,
]);

#[event]
pub struct Staked {
    pub owner: Pubkey,
    pub target_mint: Pubkey,
    pub amount: u64,
    pub weight: u64,
    pub pool_id: u8,
    pub unlock_time: i64,
}

pub fn handler(
    ctx: Context<CreateCommitment>,
    commitment_type: CommitmentType,
    stake_amount: u64,
    duration_secs: u32,
    guardian_pubkey: Option<Pubkey>,
) -> Result<()> {
    // 1. Minimum stake check
    require!(stake_amount >= MIN_STAKE_LAMPORTS, UlyssesError::StakeTooSmall);

    // 2. Minimum duration check
    require!(duration_secs >= MIN_DURATION_SECS, UlyssesError::DurationTooShort);

    // 3. Validate target_mint is owned by SPL Token program
    require!(
        ctx.accounts.target_mint.owner == &SPL_TOKEN_PROGRAM_ID,
        UlyssesError::InvalidTargetMint
    );

    // 4. Type-specific validation
    let clock = Clock::get()?;
    match &commitment_type {
        CommitmentType::HoldUntil { unlock_at } => {
            require!(*unlock_at > clock.unix_timestamp, UlyssesError::UnlockTimeInPast);
        }
        CommitmentType::HoldAbove { threshold } => {
            require!(*threshold > 0, UlyssesError::InvalidThreshold);
        }
        CommitmentType::NoTradeWindow { window_start_hour, window_end_hour } => {
            require!(
                *window_start_hour <= 23 && *window_end_hour <= 23,
                UlyssesError::InvalidWindowHours
            );
        }
        _ => {}
    }

    // 5. Compute unlock_time
    let unlock_time = match &commitment_type {
        CommitmentType::HoldUntil { unlock_at } => *unlock_at,
        _ => clock.unix_timestamp + duration_secs as i64,
    };

    // 6. Compute pool_id, difficulty, weight, reward_debt
    let pool_id = commitment_type.pool_id();
    let difficulty = commitment_type.difficulty(duration_secs, clock.unix_timestamp);
    let weight = compute_weight(stake_amount, difficulty);
    let reward_debt = weight as u128
        * ctx.accounts.protocol_state.acc_reward_per_weight[pool_id as usize];

    // 7. Update protocol_state total_weight for this pool
    ctx.accounts.protocol_state.total_weight[pool_id as usize] =
        ctx.accounts.protocol_state.total_weight[pool_id as usize].saturating_add(weight);

    // 8. Transfer stake from owner to commitment_vault
    transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.owner.to_account_info(),
                to: ctx.accounts.commitment_vault.to_account_info(),
            },
        ),
        stake_amount,
    )?;

    // 9. Fill commitment account fields
    let commitment = &mut ctx.accounts.commitment_account;
    commitment.owner = ctx.accounts.owner.key();
    commitment.target_mint = ctx.accounts.target_mint.key();
    commitment.commitment_type = commitment_type;
    commitment.stake_amount = stake_amount;
    commitment.guardian_pubkey = guardian_pubkey;
    commitment.is_active = true;
    commitment.created_at = clock.unix_timestamp;
    commitment.bump = ctx.bumps.commitment_account;
    commitment.vault_bump = ctx.bumps.commitment_vault;
    commitment.weight = weight;
    commitment.reward_debt = reward_debt;
    commitment.unlock_time = unlock_time;
    commitment.pool_id = pool_id;

    // 10. Emit Staked event
    emit!(Staked {
        owner: commitment.owner,
        target_mint: commitment.target_mint,
        amount: stake_amount,
        weight,
        pool_id,
        unlock_time,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct CreateCommitment<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: SPL token mint we are monitoring; validated via owner == spl_token program
    pub target_mint: UncheckedAccount<'info>,
    #[account(
        init,
        payer = owner,
        space = COMMITMENT_SPACE,
        seeds = [b"commitment", owner.key().as_ref(), target_mint.key().as_ref()],
        bump,
    )]
    pub commitment_account: Account<'info, CommitmentAccount>,
    #[account(
        mut,
        seeds = [b"vault", commitment_account.key().as_ref()],
        bump,
    )]
    /// CHECK: System-owned PDA that holds staked lamports
    pub commitment_vault: SystemAccount<'info>,
    #[account(
        mut,
        seeds = [b"protocol"],
        bump = protocol_state.bump,
    )]
    pub protocol_state: Account<'info, ProtocolState>,
    pub system_program: Program<'info, System>,
}
