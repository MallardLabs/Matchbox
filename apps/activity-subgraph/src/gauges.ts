import {
  ClaimRewards,
  Deposit,
  Withdraw,
} from "../generated/templates/Gauge/Gauge"
import {
  baseActivity,
  GAUGE,
  LP_STAKED,
  LP_UNSTAKED,
  MATCHBOX_GAUGE_BOOST,
  REWARD_DISTRIBUTED,
  saveActivity,
  UNKNOWN,
} from "./helpers"

export function handleGaugeDeposit(event: Deposit): void {
  const activity = baseActivity(event, LP_STAKED, MATCHBOX_GAUGE_BOOST, GAUGE)
  // Prefer the deposit recipient (`to`); fall back to `from` for same-account stakes.
  activity.actor = event.params.to
  activity.recipient = event.params.from
  activity.amount = event.params.amount
  activity.gauge = event.address
  saveActivity(activity)
}

export function handleGaugeWithdraw(event: Withdraw): void {
  const activity = baseActivity(event, LP_UNSTAKED, MATCHBOX_GAUGE_BOOST, GAUGE)
  activity.actor = event.params.from
  activity.amount = event.params.amount
  activity.gauge = event.address
  saveActivity(activity)
}

export function handleGaugeClaimRewards(event: ClaimRewards): void {
  const activity = baseActivity(
    event,
    REWARD_DISTRIBUTED,
    UNKNOWN,
    GAUGE,
  )
  activity.actor = event.params.from
  activity.amount = event.params.amount
  activity.gauge = event.address
  activity.rewardType = "Gauge"
  saveActivity(activity)
}
