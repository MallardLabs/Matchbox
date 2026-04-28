import {
  Abstained,
  DistributeReward,
  GaugeCreated,
  GaugeKilled,
  GaugeRevived,
  NotifyReward,
  Voted,
} from "../generated/PoolsVoter/PoolsVoter"
import {
  baseActivity,
  BOOST_ABSTAIN,
  BOOST_VOTE,
  GAUGE_CREATED,
  GAUGE_KILLED,
  GAUGE_REVIVED,
  getOrCreateAccount,
  getOrCreateGauge,
  getOrCreateGaugeEpoch,
  MATCHBOX_GAUGE_BOOST,
  ONE,
  POOLS_VOTER,
  REWARD_DISTRIBUTED,
  REWARD_NOTIFIED,
  saveActivity,
} from "./helpers"

export function handlePoolGaugeCreated(event: GaugeCreated): void {
  const activity = baseActivity(
    event,
    GAUGE_CREATED,
    MATCHBOX_GAUGE_BOOST,
    POOLS_VOTER,
  )
  activity.actor = event.params.creator
  activity.pool = event.params.pool
  activity.gauge = event.params.gauge
  activity.rewardContract = event.params.bribeVotingReward
  activity.rewardType = "Bribe"
  saveActivity(activity)

  const gauge = getOrCreateGauge(event.params.gauge, MATCHBOX_GAUGE_BOOST, POOLS_VOTER)
  gauge.creator = event.params.creator
  gauge.pool = event.params.pool
  gauge.rewardContract = event.params.bribeVotingReward
  gauge.feeRewardContract = event.params.feeVotingReward
  gauge.createdAt = event.block.timestamp
  gauge.isAlive = true
  gauge.save()
}

export function handlePoolVoted(event: Voted): void {
  const activity = baseActivity(
    event,
    BOOST_VOTE,
    MATCHBOX_GAUGE_BOOST,
    POOLS_VOTER,
  )
  activity.actor = event.params.voter
  activity.pool = event.params.pool
  activity.tokenId = event.params.tokenId
  activity.weight = event.params.weight
  activity.totalWeight = event.params.totalWeight
  saveActivity(activity)

  const account = getOrCreateAccount(event.params.voter, event.block.timestamp)
  account.voteCount = account.voteCount.plus(ONE)
  account.save()

  const gauge = getOrCreateGauge(event.params.pool, MATCHBOX_GAUGE_BOOST, POOLS_VOTER)
  gauge.voteCount = gauge.voteCount.plus(ONE)
  gauge.lastVoteAt = event.block.timestamp
  gauge.save()

  const gaugeEpoch = getOrCreateGaugeEpoch(
    event.params.pool,
    MATCHBOX_GAUGE_BOOST,
    POOLS_VOTER,
    event.block.timestamp,
  )
  gaugeEpoch.voteCount = gaugeEpoch.voteCount.plus(ONE)
  gaugeEpoch.totalWeight = gaugeEpoch.totalWeight.plus(event.params.weight)
  gaugeEpoch.save()
}

export function handlePoolAbstained(event: Abstained): void {
  const activity = baseActivity(
    event,
    BOOST_ABSTAIN,
    MATCHBOX_GAUGE_BOOST,
    POOLS_VOTER,
  )
  activity.actor = event.params.voter
  activity.pool = event.params.pool
  activity.tokenId = event.params.tokenId
  activity.weight = event.params.weight
  activity.totalWeight = event.params.totalWeight
  saveActivity(activity)
}

export function handlePoolDistributeReward(event: DistributeReward): void {
  const activity = baseActivity(
    event,
    REWARD_DISTRIBUTED,
    MATCHBOX_GAUGE_BOOST,
    POOLS_VOTER,
  )
  activity.actor = event.params.sender
  activity.gauge = event.params.gauge
  activity.amount = event.params.amount
  saveActivity(activity)
}

export function handlePoolNotifyReward(event: NotifyReward): void {
  const activity = baseActivity(
    event,
    REWARD_NOTIFIED,
    MATCHBOX_GAUGE_BOOST,
    POOLS_VOTER,
  )
  activity.actor = event.params.sender
  activity.token = event.params.reward
  activity.amount = event.params.amount
  saveActivity(activity)
}

export function handlePoolGaugeKilled(event: GaugeKilled): void {
  const activity = baseActivity(
    event,
    GAUGE_KILLED,
    MATCHBOX_GAUGE_BOOST,
    POOLS_VOTER,
  )
  activity.gauge = event.params.gauge
  saveActivity(activity)

  const gauge = getOrCreateGauge(event.params.gauge, MATCHBOX_GAUGE_BOOST, POOLS_VOTER)
  gauge.isAlive = false
  gauge.killedAt = event.block.timestamp
  gauge.save()
}

export function handlePoolGaugeRevived(event: GaugeRevived): void {
  const activity = baseActivity(
    event,
    GAUGE_REVIVED,
    MATCHBOX_GAUGE_BOOST,
    POOLS_VOTER,
  )
  activity.gauge = event.params.gauge
  saveActivity(activity)

  const gauge = getOrCreateGauge(event.params.gauge, MATCHBOX_GAUGE_BOOST, POOLS_VOTER)
  gauge.isAlive = true
  gauge.revivedAt = event.block.timestamp
  gauge.save()
}
