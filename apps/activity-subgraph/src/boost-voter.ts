import {
  Abstained,
  BoostableTokenBurned,
  BoostPoked,
  BribesAdded,
  DistributeReward,
  GaugeCreated,
  GaugeKilled,
  GaugeRevived,
  NotifyReward,
  Voted,
} from "../generated/BoostVoter/BoostVoter"
import {
  baseActivity,
  BOOST_ABSTAIN,
  BOOST_POKE,
  BOOST_VOTE,
  BOOST_VOTER,
  BOOSTABLE_TOKEN_BURNED,
  detectPokeMethod,
  getOrCreateAccount,
  getOrCreateGauge,
  getOrCreateGaugeEpoch,
  getOrCreateToken,
  GAUGE_KILLED,
  GAUGE_REVIVED,
  INCENTIVE_ADDED,
  MEZO_VEBTC_PAIR_BOOST,
  ONE,
  PAIR_CREATED,
  REWARD_DISTRIBUTED,
  REWARD_NOTIFIED,
  saveActivity,
} from "./helpers"

export function handleBoostGaugeCreated(event: GaugeCreated): void {
  const activity = baseActivity(
    event,
    PAIR_CREATED,
    MEZO_VEBTC_PAIR_BOOST,
    BOOST_VOTER,
  )
  activity.actor = event.params.creator
  activity.gauge = event.params.gauge
  activity.rewardContract = event.params.bribeVotingReward
  saveActivity(activity)

  const gauge = getOrCreateGauge(event.params.gauge, MEZO_VEBTC_PAIR_BOOST, BOOST_VOTER)
  gauge.creator = event.params.creator
  gauge.rewardContract = event.params.bribeVotingReward
  gauge.createdAt = event.block.timestamp
  gauge.isAlive = true
  gauge.save()
}

export function handleBoostVoted(event: Voted): void {
  const activity = baseActivity(
    event,
    BOOST_VOTE,
    MEZO_VEBTC_PAIR_BOOST,
    BOOST_VOTER,
  )
  activity.actor = event.params.voter
  activity.gauge = event.params.gauge
  activity.tokenId = event.params.tokenId
  activity.weight = event.params.weight
  activity.totalWeight = event.params.totalWeight
  saveActivity(activity)

  const account = getOrCreateAccount(event.params.voter, event.block.timestamp)
  account.voteCount = account.voteCount.plus(ONE)
  account.save()

  const gauge = getOrCreateGauge(event.params.gauge, MEZO_VEBTC_PAIR_BOOST, BOOST_VOTER)
  gauge.voteCount = gauge.voteCount.plus(ONE)
  gauge.lastVoteAt = event.block.timestamp
  gauge.save()

  const gaugeEpoch = getOrCreateGaugeEpoch(
    event.params.gauge,
    MEZO_VEBTC_PAIR_BOOST,
    BOOST_VOTER,
    event.block.timestamp,
  )
  gaugeEpoch.voteCount = gaugeEpoch.voteCount.plus(ONE)
  gaugeEpoch.totalWeight = gaugeEpoch.totalWeight.plus(event.params.weight)
  gaugeEpoch.save()
}

export function handleBoostPoked(event: BoostPoked): void {
  const activity = baseActivity(
    event,
    BOOST_POKE,
    MEZO_VEBTC_PAIR_BOOST,
    BOOST_VOTER,
  )
  activity.boostableTokenId = event.params.boostableTokenId
  activity.boost = event.params.boost
  const method = detectPokeMethod(event.transaction.input)
  if (method != null) {
    activity.pokeMethod = method
  }
  saveActivity(activity)
}

export function handleBoostAbstained(event: Abstained): void {
  const activity = baseActivity(
    event,
    BOOST_ABSTAIN,
    MEZO_VEBTC_PAIR_BOOST,
    BOOST_VOTER,
  )
  activity.actor = event.params.voter
  activity.gauge = event.params.gauge
  activity.tokenId = event.params.tokenId
  activity.weight = event.params.weight
  activity.totalWeight = event.params.totalWeight
  saveActivity(activity)
}

export function handleBoostableTokenBurned(event: BoostableTokenBurned): void {
  const activity = baseActivity(
    event,
    BOOSTABLE_TOKEN_BURNED,
    MEZO_VEBTC_PAIR_BOOST,
    BOOST_VOTER,
  )
  activity.boostableTokenId = event.params.boostableTokenId
  activity.gauge = event.params.gauge
  saveActivity(activity)
}

export function handleBoostBribesAdded(event: BribesAdded): void {
  const activity = baseActivity(
    event,
    INCENTIVE_ADDED,
    MEZO_VEBTC_PAIR_BOOST,
    BOOST_VOTER,
  )
  activity.actor = event.params.sender
  activity.gauge = event.params.gauge
  activity.token = event.params.token
  activity.amount = event.params.amount
  activity.rewardType = "Bribe"
  saveActivity(activity)

  const account = getOrCreateAccount(event.params.sender, event.block.timestamp)
  account.incentiveCount = account.incentiveCount.plus(ONE)
  account.totalIncentiveAmount = account.totalIncentiveAmount.plus(event.params.amount)
  account.save()

  const token = getOrCreateToken(event.params.token, event.block.timestamp)
  token.incentiveCount = token.incentiveCount.plus(ONE)
  token.totalIncentiveAmount = token.totalIncentiveAmount.plus(event.params.amount)
  token.save()

  const gauge = getOrCreateGauge(event.params.gauge, MEZO_VEBTC_PAIR_BOOST, BOOST_VOTER)
  gauge.incentiveCount = gauge.incentiveCount.plus(ONE)
  gauge.totalIncentiveAmount = gauge.totalIncentiveAmount.plus(event.params.amount)
  gauge.lastIncentiveAt = event.block.timestamp
  gauge.save()

  const gaugeEpoch = getOrCreateGaugeEpoch(
    event.params.gauge,
    MEZO_VEBTC_PAIR_BOOST,
    BOOST_VOTER,
    event.block.timestamp,
  )
  gaugeEpoch.incentiveCount = gaugeEpoch.incentiveCount.plus(ONE)
  gaugeEpoch.totalIncentiveAmount = gaugeEpoch.totalIncentiveAmount.plus(event.params.amount)
  gaugeEpoch.save()
}

export function handleBoostDistributeReward(event: DistributeReward): void {
  const activity = baseActivity(
    event,
    REWARD_DISTRIBUTED,
    MEZO_VEBTC_PAIR_BOOST,
    BOOST_VOTER,
  )
  activity.actor = event.params.sender
  activity.gauge = event.params.gauge
  activity.amount = event.params.amount
  saveActivity(activity)
}

export function handleBoostNotifyReward(event: NotifyReward): void {
  const activity = baseActivity(
    event,
    REWARD_NOTIFIED,
    MEZO_VEBTC_PAIR_BOOST,
    BOOST_VOTER,
  )
  activity.actor = event.params.sender
  activity.token = event.params.reward
  activity.amount = event.params.amount
  saveActivity(activity)
}

export function handleBoostGaugeKilled(event: GaugeKilled): void {
  const activity = baseActivity(
    event,
    GAUGE_KILLED,
    MEZO_VEBTC_PAIR_BOOST,
    BOOST_VOTER,
  )
  activity.gauge = event.params.gauge
  saveActivity(activity)

  const gauge = getOrCreateGauge(event.params.gauge, MEZO_VEBTC_PAIR_BOOST, BOOST_VOTER)
  gauge.isAlive = false
  gauge.killedAt = event.block.timestamp
  gauge.save()
}

export function handleBoostGaugeRevived(event: GaugeRevived): void {
  const activity = baseActivity(
    event,
    GAUGE_REVIVED,
    MEZO_VEBTC_PAIR_BOOST,
    BOOST_VOTER,
  )
  activity.gauge = event.params.gauge
  saveActivity(activity)

  const gauge = getOrCreateGauge(event.params.gauge, MEZO_VEBTC_PAIR_BOOST, BOOST_VOTER)
  gauge.isAlive = true
  gauge.revivedAt = event.block.timestamp
  gauge.save()
}
