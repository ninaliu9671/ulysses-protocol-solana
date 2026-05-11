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

    // ───── NoSell ─────
    pub fn create_no_sell<'info>(
        ctx: Context<'_, '_, 'info, 'info, CreateNoSell<'info>>,
        stake_amount: u64,
        duration_seconds: u64,
    ) -> Result<()> {
        instructions::create_no_sell::handler(ctx, stake_amount, duration_seconds)
    }

    pub fn claim_no_sell(ctx: Context<ClaimNoSell>) -> Result<()> {
        instructions::claim_no_sell::handler(ctx)
    }

    pub fn cancel_no_sell(ctx: Context<CancelNoSell>) -> Result<()> {
        instructions::cancel_no_sell::handler(ctx)
    }

    pub fn slash_no_sell<'info>(
        ctx: Context<'_, '_, 'info, 'info, SlashNoSell<'info>>,
    ) -> Result<()> {
        instructions::slash_no_sell::handler(ctx)
    }

    // ───── HoldAbove ─────
    pub fn create_hold_above<'info>(
        ctx: Context<'_, '_, 'info, 'info, CreateHoldAbove<'info>>,
        stake_amount: u64,
        duration_seconds: u64,
        floor_amount: u64,
    ) -> Result<()> {
        instructions::create_hold_above::handler(ctx, stake_amount, duration_seconds, floor_amount)
    }

    pub fn claim_hold_above(ctx: Context<ClaimHoldAbove>) -> Result<()> {
        instructions::claim_hold_above::handler(ctx)
    }

    pub fn cancel_hold_above(ctx: Context<CancelHoldAbove>) -> Result<()> {
        instructions::cancel_hold_above::handler(ctx)
    }

    pub fn slash_hold_above<'info>(
        ctx: Context<'_, '_, 'info, 'info, SlashHoldAbove<'info>>,
    ) -> Result<()> {
        instructions::slash_hold_above::handler(ctx)
    }

    // ───── NoTradeWindow ─────
    pub fn create_no_trade_window(
        ctx: Context<CreateNoTradeWindow>,
        stake_amount: u64,
        duration_seconds: u64,
        window_start_hour: u8,
        window_end_hour: u8,
        nonce: u64,
    ) -> Result<()> {
        instructions::create_no_trade_window::handler(
            ctx,
            stake_amount,
            duration_seconds,
            window_start_hour,
            window_end_hour,
            nonce,
        )
    }

    pub fn claim_no_trade_window(ctx: Context<ClaimNoTradeWindow>) -> Result<()> {
        instructions::claim_no_trade_window::handler(ctx)
    }

    pub fn cancel_no_trade_window(ctx: Context<CancelNoTradeWindow>) -> Result<()> {
        instructions::cancel_no_trade_window::handler(ctx)
    }

    pub fn slash_no_trade_window(ctx: Context<SlashNoTradeWindow>) -> Result<()> {
        instructions::slash_no_trade_window::handler(ctx)
    }

    // ───── AgentGuardian ─────
    pub fn create_agent_guardian<'info>(
        ctx: Context<'_, '_, 'info, 'info, CreateAgentGuardian<'info>>,
        stake_amount: u64,
        duration_seconds: u64,
        guardian_pubkey: Pubkey,
    ) -> Result<()> {
        instructions::create_agent_guardian::handler(
            ctx,
            stake_amount,
            duration_seconds,
            guardian_pubkey,
        )
    }

    pub fn claim_agent_guardian(ctx: Context<ClaimAgentGuardian>) -> Result<()> {
        instructions::claim_agent_guardian::handler(ctx)
    }

    pub fn cancel_agent_guardian(ctx: Context<CancelAgentGuardian>) -> Result<()> {
        instructions::cancel_agent_guardian::handler(ctx)
    }

    pub fn slash_agent_guardian(ctx: Context<SlashAgentGuardian>) -> Result<()> {
        instructions::slash_agent_guardian::handler(ctx)
    }

    // ───── Seeded (devnet-seed feature) ─────
    #[cfg(feature = "devnet-seed")]
    pub fn seed_create_no_sell(
        ctx: Context<SeedCreateNoSell>,
        stake_amount: u64,
        duration_seconds: u64,
        floor_amount: u64,
        commit_timestamp: i64,
    ) -> Result<()> {
        instructions::seeded::seed_create_no_sell(
            ctx,
            stake_amount,
            duration_seconds,
            floor_amount,
            commit_timestamp,
        )
    }

    #[cfg(feature = "devnet-seed")]
    pub fn seed_create_hold_above(
        ctx: Context<SeedCreateHoldAbove>,
        stake_amount: u64,
        duration_seconds: u64,
        floor_amount: u64,
        commit_timestamp: i64,
    ) -> Result<()> {
        instructions::seeded::seed_create_hold_above(
            ctx,
            stake_amount,
            duration_seconds,
            floor_amount,
            commit_timestamp,
        )
    }

    #[cfg(feature = "devnet-seed")]
    pub fn seed_create_no_trade_window(
        ctx: Context<SeedCreateNoTradeWindow>,
        stake_amount: u64,
        duration_seconds: u64,
        window_start_hour: u8,
        window_end_hour: u8,
        nonce: u64,
        commit_timestamp: i64,
    ) -> Result<()> {
        instructions::seeded::seed_create_no_trade_window(
            ctx,
            stake_amount,
            duration_seconds,
            window_start_hour,
            window_end_hour,
            nonce,
            commit_timestamp,
        )
    }

    #[cfg(feature = "devnet-seed")]
    pub fn seed_create_agent_guardian(
        ctx: Context<SeedCreateAgentGuardian>,
        stake_amount: u64,
        duration_seconds: u64,
        guardian_pubkey: Pubkey,
        commit_timestamp: i64,
    ) -> Result<()> {
        instructions::seeded::seed_create_agent_guardian(
            ctx,
            stake_amount,
            duration_seconds,
            guardian_pubkey,
            commit_timestamp,
        )
    }
}
