use anchor_lang::prelude::*;

pub mod constants;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("3TyFQro3GCCfd4yV5Wmbb2Rrzh35TreXJWMfbFs5dz5S");

#[program]
pub mod vault {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handler(ctx)
    }

    pub fn create_no_sell<'info>(
        ctx: Context<'_, '_, 'info, 'info, CreateNoSell<'info>>,
        stake_amount: u64,
        duration_days: u16,
    ) -> Result<()> {
        instructions::create_no_sell::handler(ctx, stake_amount, duration_days)
    }

    pub fn claim_no_sell(ctx: Context<ClaimNoSell>) -> Result<()> {
        instructions::claim_no_sell::handler(ctx)
    }

    pub fn cancel_no_sell(ctx: Context<CancelNoSell>) -> Result<()> {
        instructions::cancel_no_sell::handler(ctx)
    }

    pub fn slash_no_sell<'info>(ctx: Context<'_, '_, 'info, 'info, SlashNoSell<'info>>) -> Result<()> {
        instructions::slash_no_sell::handler(ctx)
    }
}
