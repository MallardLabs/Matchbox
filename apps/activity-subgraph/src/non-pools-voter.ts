import {
  Abstained,
  BribesAdded,
  DistributeReward,
  GaugeCreated,
  GaugeKilled,
  GaugeRevived,
  NotifyReward,
  ThirdPartyGaugeCreated,
  ValidatorGaugeCreated,
  ValidatorLeft,
  Voted,
} from "../generated/ThirdPartyVoter/NonPoolsVoter"
import {
  BOOST_ABSTAIN,
  BOOST_VOTE,
  GAUGE_CREATED,
  GAUGE_KILLED,
  GAUGE_REVIVED,
  INCENTIVE_ADDED,
  ONE,
  REWARD_DISTRIBUTED,
  REWARD_NOTIFIED,
  THIRD_PARTY_GAUGE_CREATED,
  THIRD_PARTY_VOTER,
  UNKNOWN,
  VALIDATOR_GAUGE_CREATED,
  VALIDATOR_LEFT,
  VALIDATORS_VOTER,
  baseActivity,
  getOrCreateAccount,
  getOrCreateGauge,
  getOrCreateGaugeEpoch,
  getOrCreateToken,
  saveActivity,
} from "./helpers"

function handleVoted(event: Voted, source: string): void {
  const activity = baseActivity(event, BOOST_VOTE, UNKNOWN, source)
  activity.actor = event.params.voter
  activity.gauge = event.params.gauge
  activity.tokenId = event.params.tokenId
  activity.weight = event.params.weight
  activity.totalWeight = event.params.totalWeight
  saveActivity(activity)

  const account = getOrCreateAccount(event.params.voter, event.block.timestamp)
  account.voteCount = account.voteCount.plus(ONE)
  account.save()

  const gauge = getOrCreateGauge(event.params.gauge, UNKNOWN, source)
  gauge.voteCount = gauge.voteCount.plus(ONE)
  gauge.lastVoteAt = event.block.timestamp
  gauge.save()

  const gaugeEpoch = getOrCreateGaugeEpoch(
    event.params.gauge,
    UNKNOWN,
    source,
    event.block.timestamp,
  )
  gaugeEpoch.voteCount = gaugeEpoch.voteCount.plus(ONE)
  gaugeEpoch.totalWeight = gaugeEpoch.totalWeight.plus(event.params.weight)
  gaugeEpoch.save()
}

function handleAbstained(event: Abstained, source: string): void {
  const activity = baseActivity(event, BOOST_ABSTAIN, UNKNOWN, source)
  activity.actor = event.params.voter
  activity.gauge = event.params.gauge
  activity.tokenId = event.params.tokenId
  activity.weight = event.params.weight
  activity.totalWeight = event.params.totalWeight
  saveActivity(activity)
}

function handleGaugeCreated(event: GaugeCreated, source: string): void {
  const activity = baseActivity(event, GAUGE_CREATED, UNKNOWN, source)
  activity.actor = event.params.creator
  activity.gauge = event.params.gauge
  activity.rewardContract = event.params.bribeVotingReward
  saveActivity(activity)

  const gauge = getOrCreateGauge(event.params.gauge, UNKNOWN, source)
  gauge.creator = event.params.creator
  gauge.rewardContract = event.params.bribeVotingReward
  gauge.createdAt = event.block.timestamp
  gauge.isAlive = true
  gauge.save()
}

function handleGaugeKilled(event: GaugeKilled, source: string): void {
  const activity = baseActivity(event, GAUGE_KILLED, UNKNOWN, source)
  activity.gauge = event.params.gauge
  saveActivity(activity)

  const gauge = getOrCreateGauge(event.params.gauge, UNKNOWN, source)
  gauge.isAlive = false
  gauge.killedAt = event.block.timestamp
  gauge.save()
}

function handleGaugeRevived(event: GaugeRevived, source: string): void {
  const activity = baseActivity(event, GAUGE_REVIVED, UNKNOWN, source)
  activity.gauge = event.params.gauge
  saveActivity(activity)

  const gauge = getOrCreateGauge(event.params.gauge, UNKNOWN, source)
  gauge.isAlive = true
  gauge.revivedAt = event.block.timestamp
  gauge.save()
}

function handleBribesAdded(event: BribesAdded, source: string): void {
  const activity = baseActivity(event, INCENTIVE_ADDED, UNKNOWN, source)
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

  const gauge = getOrCreateGauge(event.params.gauge, UNKNOWN, source)
  gauge.incentiveCount = gauge.incentiveCount.plus(ONE)
  gauge.totalIncentiveAmount = gauge.totalIncentiveAmount.plus(event.params.amount)
  gauge.lastIncentiveAt = event.block.timestamp
  gauge.save()
}

function handleDistributeReward(event: DistributeReward, source: string): void {
  const activity = baseActivity(event, REWARD_DISTRIBUTED, UNKNOWN, source)
  activity.actor = event.params.sender
  activity.gauge = event.params.gauge
  activity.amount = event.params.amount
  saveActivity(activity)
}

function handleNotifyReward(event: NotifyReward, source: string): void {
  const activity = baseActivity(event, REWARD_NOTIFIED, UNKNOWN, source)
  activity.actor = event.params.sender
  activity.token = event.params.reward
  activity.amount = event.params.amount
  saveActivity(activity)
}

export function handleThirdPartyVoted(event: Voted): void {
  handleVoted(event, THIRD_PARTY_VOTER)
}
export function handleThirdPartyAbstained(event: Abstained): void {
  handleAbstained(event, THIRD_PARTY_VOTER)
}
export function handleThirdPartyGaugeCreated(event: GaugeCreated): void {
  handleGaugeCreated(event, THIRD_PARTY_VOTER)
}
export function handleThirdPartyGaugeKilled(event: GaugeKilled): void {
  handleGaugeKilled(event, THIRD_PARTY_VOTER)
}
export function handleThirdPartyGaugeRevived(event: GaugeRevived): void {
  handleGaugeRevived(event, THIRD_PARTY_VOTER)
}
export function handleThirdPartyBribesAdded(event: BribesAdded): void {
  handleBribesAdded(event, THIRD_PARTY_VOTER)
}
export function handleThirdPartyDistributeReward(event: DistributeReward): void {
  handleDistributeReward(event, THIRD_PARTY_VOTER)
}
export function handleThirdPartyNotifyReward(event: NotifyReward): void {
  handleNotifyReward(event, THIRD_PARTY_VOTER)
}
export function handleThirdPartyGaugeRegistered(event: ThirdPartyGaugeCreated): void {
  const activity = baseActivity(
    event,
    THIRD_PARTY_GAUGE_CREATED,
    UNKNOWN,
    THIRD_PARTY_VOTER,
  )
  activity.actor = event.params.thirdParty
  activity.gauge = event.params.gauge
  activity.metadata = event.params.metadata
  saveActivity(activity)
}

export function handleValidatorsVoted(event: Voted): void {
  handleVoted(event, VALIDATORS_VOTER)
}
export function handleValidatorsAbstained(event: Abstained): void {
  handleAbstained(event, VALIDATORS_VOTER)
}
export function handleValidatorsGaugeCreated(event: GaugeCreated): void {
  handleGaugeCreated(event, VALIDATORS_VOTER)
}
export function handleValidatorsGaugeKilled(event: GaugeKilled): void {
  handleGaugeKilled(event, VALIDATORS_VOTER)
}
export function handleValidatorsGaugeRevived(event: GaugeRevived): void {
  handleGaugeRevived(event, VALIDATORS_VOTER)
}
export function handleValidatorsBribesAdded(event: BribesAdded): void {
  handleBribesAdded(event, VALIDATORS_VOTER)
}
export function handleValidatorsDistributeReward(event: DistributeReward): void {
  handleDistributeReward(event, VALIDATORS_VOTER)
}
export function handleValidatorsNotifyReward(event: NotifyReward): void {
  handleNotifyReward(event, VALIDATORS_VOTER)
}
export function handleValidatorGaugeCreated(event: ValidatorGaugeCreated): void {
  const activity = baseActivity(
    event,
    VALIDATOR_GAUGE_CREATED,
    UNKNOWN,
    VALIDATORS_VOTER,
  )
  activity.actor = event.params.operator
  activity.gauge = event.params.gauge
  activity.recipient = event.params.beneficiary
  saveActivity(activity)
}
export function handleValidatorLeft(event: ValidatorLeft): void {
  const activity = baseActivity(event, VALIDATOR_LEFT, UNKNOWN, VALIDATORS_VOTER)
  activity.actor = event.params.operator
  activity.gauge = event.params.gauge
  saveActivity(activity)
}
