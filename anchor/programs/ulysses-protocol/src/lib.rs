use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

#[cfg(test)]
mod tests;

use instructions::*;
use state::CommitmentType;

declare_id!("7s1UK1nQWK7CrNcaS576gbpMjMqrph1vArRepnQYLki7");

#[program]
pub mod ulysses_protocol {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, authority: Pubkey) -> Result<()> {
        instructions::initialize::handler(ctx, authority)
    }

    pub fn create_commitment(
        ctx: Context<CreateCommitment>,
        commitment_type: CommitmentType,
        stake_amount: u64,
        duration_secs: u32,
        guardian_pubkey: Option<Pubkey>,
    ) -> Result<()> {
        instructions::create_commitment::handler(ctx, commitment_type, stake_amount, duration_secs, guardian_pubkey)
    }

    pub fn slash(ctx: Context<Slash>, tx_signature: [u8; 64]) -> Result<()> {
        instructions::slash::handler(ctx, tx_signature)
    }

    pub fn cancel_commitment(ctx: Context<CancelCommitment>) -> Result<()> {
        instructions::cancel_commitment::handler(ctx)
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim::handler(ctx)
    }
}
