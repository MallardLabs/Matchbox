import {
  ClaimRewards,
  NotifyReward,
} from "../generated/templates/FeeVotingReward/FeeVotingReward"
import { resolveRewardMapping } from "./legacy-pool-rewards"
import {
  baseActivity,
  FEE_VOTING_REWARD,
  getOrCreateAccount,
  getOrCreateGauge,
  getOrCreateGaugeEpoch,
  getOrCreateToken,
  INCENTIVE_ADDED,
  MATCHBOX_GAUGE_BOOST,
  ONE,
  POOLS_VOTER,
  saveActivity,
  VOTE_FEE_CLAIMED,
} from "./helpers"

// Fee reward contracts share the BribeToPool entity (id = fee contract address)
// so pool/gauge can be resolved on claims.

export function handleFeeNotifyReward(event: NotifyReward): void {
  const mapping = resolveRewardMapping(event.address)
  if (mapping == null) {
    return
  }

  const activity = baseActivity(
    event,
    INCENTIVE_ADDED,
    MATCHBOX_GAUGE_BOOST,
    FEE_VOTING_REWARD,
  )
  activity.actor = event.params.from
  activity.gauge = mapping.gaugeAddress
  activity.pool = mapping.poolAddress
  activity.token = event.params.reward
  activity.amount = event.params.amount
  activity.rewardType = "Fee"
  activity.rewardContract = event.address
  saveActivity(activity)

  const account = getOrCreateAccount(event.params.from, event.block.timestamp)
  account.incentiveCount = account.incentiveCount.plus(ONE)
  account.totalIncentiveAmount = account.totalIncentiveAmount.plus(
    event.params.amount,
  )
  account.save()

  const token = getOrCreateToken(event.params.reward, event.block.timestamp)
  token.incentiveCount = token.incentiveCount.plus(ONE)
  token.totalIncentiveAmount = token.totalIncentiveAmount.plus(
    event.params.amount,
  )
  token.save()

  const gauge = getOrCreateGauge(
    mapping.gaugeAddress,
    MATCHBOX_GAUGE_BOOST,
    POOLS_VOTER,
  )
  gauge.incentiveCount = gauge.incentiveCount.plus(ONE)
  gauge.totalIncentiveAmount = gauge.totalIncentiveAmount.plus(
    event.params.amount,
  )
  gauge.lastIncentiveAt = event.block.timestamp
  gauge.save()

  const gaugeEpoch = getOrCreateGaugeEpoch(
    mapping.gaugeAddress,
    MATCHBOX_GAUGE_BOOST,
    POOLS_VOTER,
    event.block.timestamp,
  )
  gaugeEpoch.incentiveCount = gaugeEpoch.incentiveCount.plus(ONE)
  gaugeEpoch.totalIncentiveAmount = gaugeEpoch.totalIncentiveAmount.plus(
    event.params.amount,
  )
  gaugeEpoch.save()
}

export function handleFeeClaimRewards(event: ClaimRewards): void {
  const mapping = resolveRewardMapping(event.address)

  const activity = baseActivity(
    event,
    VOTE_FEE_CLAIMED,
    MATCHBOX_GAUGE_BOOST,
    FEE_VOTING_REWARD,
  )
  activity.actor = event.params.from
  activity.token = event.params.reward
  activity.amount = event.params.amount
  activity.rewardType = "Fee"
  activity.rewardContract = event.address
  if (mapping != null) {
    activity.gauge = mapping.gaugeAddress
    activity.pool = mapping.poolAddress
  }
  saveActivity(activity)
}
