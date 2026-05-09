use crate::constants::PRECISION;
use crate::state::RewardPool;
use crate::utils::errors::ErrorCode;
use anchor_lang::prelude::*;

pub fn compute_pending_yield(weight: u64, acc: u128, reward_debt: u128) -> Result<u64> {
    let delta = acc.saturating_sub(reward_debt);
    let scaled = (weight as u128)
        .checked_mul(delta)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    let raw = scaled / PRECISION;
    u64::try_from(raw).map_err(|_| ErrorCode::ArithmeticOverflow.into())
}

pub fn redistribute_to_pool(pool: &mut RewardPool, weight: u64, stake: u64) -> Result<bool> {
    let w = weight as u128;
    let new_total = pool
        .total_weight
        .checked_sub(w)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    if new_total == 0 {
        pool.total_weight = 0;
        return Ok(false);
    }
    let inc = (stake as u128)
        .checked_mul(PRECISION)
        .ok_or(ErrorCode::ArithmeticOverflow)?
        / new_total;
    pool.acc_reward_per_weight = pool
        .acc_reward_per_weight
        .checked_add(inc)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    pool.total_weight = new_total;
    Ok(true)
}

pub fn deduct_weight(pool: &mut RewardPool, weight: u64) -> Result<()> {
    pool.total_weight = pool
        .total_weight
        .checked_sub(weight as u128)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    Ok(())
}

pub fn move_lamports<'info>(
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let from_lamports = from.lamports();
    require!(from_lamports >= amount, ErrorCode::ArithmeticOverflow);
    **from.try_borrow_mut_lamports()? = from_lamports - amount;
    **to.try_borrow_mut_lamports()? = to
        .lamports()
        .checked_add(amount)
        .ok_or(ErrorCode::ArithmeticOverflow)?;
    Ok(())
}
