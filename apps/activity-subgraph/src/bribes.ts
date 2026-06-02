import { NotifyReward } from "../generated/templates/BribeVotingReward/BribeVotingReward"
import { BribeToPool } from "../generated/schema"
import {
  baseActivity,
  getOrCreateAccount,
  getOrCreateGauge,
  getOrCreateGaugeEpoch,
  getOrCreateToken,
  INCENTIVE_ADDED,
  MATCHBOX_GAUGE_BOOST,
  ONE,
  POOLS_VOTER,
  saveActivity,
} from "./helpers"

export function handleBribeNotifyReward(event: NotifyReward): void {
  const bribeAddress = event.address.toHexString()
  const mapping = BribeToPool.load(bribeAddress)
  if (mapping == null) {
    return
  }

  const activity = baseActivity(
    event,
    INCENTIVE_ADDED,
    MATCHBOX_GAUGE_BOOST,
    POOLS_VOTER,
  )
  activity.actor = event.params.from
  activity.gauge = mapping.gaugeAddress
  activity.pool = mapping.poolAddress
  activity.token = event.params.reward
  activity.amount = event.params.amount
  activity.rewardType = "Bribe"
  saveActivity(activity)

  const account = getOrCreateAccount(event.params.from, event.block.timestamp)
  account.incentiveCount = account.incentiveCount.plus(ONE)
  account.totalIncentiveAmount = account.totalIncentiveAmount.plus(event.params.amount)
  account.save()

  const token = getOrCreateToken(event.params.reward, event.block.timestamp)
  token.incentiveCount = token.incentiveCount.plus(ONE)
  token.totalIncentiveAmount = token.totalIncentiveAmount.plus(event.params.amount)
  token.save()

  const gauge = getOrCreateGauge(mapping.gaugeAddress, MATCHBOX_GAUGE_BOOST, POOLS_VOTER)
  gauge.incentiveCount = gauge.incentiveCount.plus(ONE)
  gauge.totalIncentiveAmount = gauge.totalIncentiveAmount.plus(event.params.amount)
  gauge.lastIncentiveAt = event.block.timestamp
  gauge.save()

  const gaugeEpoch = getOrCreateGaugeEpoch(
    mapping.gaugeAddress,
    MATCHBOX_GAUGE_BOOST,
    POOLS_VOTER,
    event.block.timestamp,
  )
  gaugeEpoch.incentiveCount = gaugeEpoch.incentiveCount.plus(ONE)
  gaugeEpoch.totalIncentiveAmount = gaugeEpoch.totalIncentiveAmount.plus(event.params.amount)
  gaugeEpoch.save()
}
