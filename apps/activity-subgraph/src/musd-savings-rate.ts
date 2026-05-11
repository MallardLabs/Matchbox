import {
  Deposit,
  ProtocolYieldReceived,
  StrategyYieldReceived,
  Withdraw,
  YieldClaimed,
} from "../generated/MUSDSavingsRate/MUSDSavingsRate"
import {
  MUSD_SAVINGS_RATE,
  PROTOCOL_YIELD_RECEIVED,
  SAVINGS_DEPOSIT,
  SAVINGS_WITHDRAW,
  SAVINGS_YIELD_CLAIMED,
  STRATEGY_YIELD_RECEIVED,
  UNKNOWN,
  baseActivity,
  saveActivity,
} from "./helpers"

export function handleSavingsDeposit(event: Deposit): void {
  const activity = baseActivity(
    event,
    SAVINGS_DEPOSIT,
    UNKNOWN,
    MUSD_SAVINGS_RATE,
  )
  activity.actor = event.params.user
  activity.amount = event.params.amount
  saveActivity(activity)
}

export function handleSavingsWithdraw(event: Withdraw): void {
  const activity = baseActivity(
    event,
    SAVINGS_WITHDRAW,
    UNKNOWN,
    MUSD_SAVINGS_RATE,
  )
  activity.actor = event.params.user
  activity.amount = event.params.amount
  saveActivity(activity)
}

export function handleSavingsYieldClaimed(event: YieldClaimed): void {
  const activity = baseActivity(
    event,
    SAVINGS_YIELD_CLAIMED,
    UNKNOWN,
    MUSD_SAVINGS_RATE,
  )
  activity.actor = event.params.user
  activity.amount = event.params.amount
  saveActivity(activity)
}

export function handleProtocolYieldReceived(event: ProtocolYieldReceived): void {
  const activity = baseActivity(
    event,
    PROTOCOL_YIELD_RECEIVED,
    UNKNOWN,
    MUSD_SAVINGS_RATE,
  )
  activity.amount = event.params.amount
  saveActivity(activity)
}

export function handleStrategyYieldReceived(event: StrategyYieldReceived): void {
  const activity = baseActivity(
    event,
    STRATEGY_YIELD_RECEIVED,
    UNKNOWN,
    MUSD_SAVINGS_RATE,
  )
  activity.amount = event.params.amount
  saveActivity(activity)
}
