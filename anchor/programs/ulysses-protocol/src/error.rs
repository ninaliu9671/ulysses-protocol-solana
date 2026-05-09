use anchor_lang::prelude::*;

#[error_code]
pub enum UlyssesError {
    #[msg("Stake amount below minimum (0.01 SOL)")]
    StakeTooSmall,
    #[msg("Commitment is not active")]
    CommitmentNotActive,
    #[msg("Only the owner can cancel their commitment")]
    NotOwner,
    #[msg("Only the protocol authority can slash")]
    NotAuthority,
    #[msg("HoldUntil: unlock time must be in the future")]
    UnlockTimeInPast,
    #[msg("NoTradeWindow: start and end hours must be 0-23")]
    InvalidWindowHours,
    #[msg("HoldAbove: threshold must be greater than zero")]
    InvalidThreshold,
    #[msg("Commitment is still within its lock period")]
    CommitmentStillLocked,
    #[msg("Duration must be at least 1 day (86400 seconds)")]
    DurationTooShort,
    #[msg("Target mint is not a valid SPL token mint")]
    InvalidTargetMint,
    #[msg("Insufficient pool balance to pay reward")]
    InsufficientPoolBalance,
}
