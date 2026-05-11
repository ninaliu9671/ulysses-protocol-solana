use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("stake_amount below minimum")]
    StakeBelowMin,
    #[msg("stake_amount above protocol cap")]
    StakeAboveMax,
    #[msg("duration_seconds out of range [60, 31536000]")]
    DurationOutOfRange,
    #[msg("baseline must be greater than zero")]
    BaselineZero,
    #[msg("floor_amount must be in (0, baseline]")]
    FloorOutOfRange,
    #[msg("token account owner mismatch")]
    TokenAccountOwnerMismatch,
    #[msg("token account mint mismatch")]
    TokenAccountMintMismatch,
    #[msg("conflicting commitment exists")]
    ConflictingCommitment,
    #[msg("commitment not yet expired")]
    NotYetExpired,
    #[msg("violation not present")]
    NoViolation,
    #[msg("arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("unauthorized signer")]
    Unauthorized,
}
