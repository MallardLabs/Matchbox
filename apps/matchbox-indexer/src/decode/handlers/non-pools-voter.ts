import { decodeEventLog } from "viem"
import type { RawLog, RawTx } from "../../types"
import nonPoolsVoterAbi from "../abis/non-pools-voter"
import { ACTION, BOOST_CONTEXT, SOURCE, ZERO } from "../constants"
import {
  type Handler,
  baseActivity,
  eventTopics,
  lower,
  resolveVoteActor,
  upsertVote,
} from "../helpers"
import type { Store } from "../store"

// Port of apps/activity-subgraph/src/non-pools-voter.ts. ThirdPartyVoter and
// ValidatorsVoter share the ABI and differ only by source.

const CONTEXT = BOOST_CONTEXT.UNKNOWN

function decode(log: RawLog) {
  return decodeEventLog({
    abi: nonPoolsVoterAbi,
    topics: eventTopics(log),
    data: log.data,
  })
}

function sharedHandlers(source: string): Record<string, Handler> {
  function handleVoted(log: RawLog, tx: RawTx, store: Store): void {
    const event = decode(log)
    if (event.eventName !== "Voted") return
    const params = event.args
    const actor = resolveVoteActor(
      store,
      params.tokenId,
      params.voter,
      tx.input,
    )
    const activity = baseActivity(log, tx, ACTION.BOOST_VOTE, CONTEXT, source)
    activity.actor = actor
    activity.gauge = lower(params.gauge)
    activity.tokenId = params.tokenId
    activity.weight = params.weight
    activity.totalWeight = params.totalWeight
    store.addActivity(activity)
    upsertVote(
      store,
      log.address,
      params.tokenId,
      params.gauge,
      actor,
      params.weight,
      log.blockTimestamp,
    )
  }

  function handleAbstained(log: RawLog, tx: RawTx, store: Store): void {
    const event = decode(log)
    if (event.eventName !== "Abstained") return
    const params = event.args
    const actor = resolveVoteActor(
      store,
      params.tokenId,
      params.voter,
      tx.input,
    )
    const activity = baseActivity(
      log,
      tx,
      ACTION.BOOST_ABSTAIN,
      CONTEXT,
      source,
    )
    activity.actor = actor
    activity.gauge = lower(params.gauge)
    activity.tokenId = params.tokenId
    activity.weight = params.weight
    activity.totalWeight = params.totalWeight
    store.addActivity(activity)
    upsertVote(
      store,
      log.address,
      params.tokenId,
      params.gauge,
      actor,
      ZERO,
      log.blockTimestamp,
    )
  }

  function handleGaugeCreated(log: RawLog, tx: RawTx, store: Store): void {
    const event = decode(log)
    if (event.eventName !== "GaugeCreated") return
    const activity = baseActivity(
      log,
      tx,
      ACTION.GAUGE_CREATED,
      CONTEXT,
      source,
    )
    activity.actor = lower(event.args.creator)
    activity.gauge = lower(event.args.gauge)
    activity.rewardContract = lower(event.args.bribeVotingReward)
    store.addActivity(activity)
  }

  function handleGaugeKilled(log: RawLog, tx: RawTx, store: Store): void {
    const event = decode(log)
    if (event.eventName !== "GaugeKilled") return
    const activity = baseActivity(log, tx, ACTION.GAUGE_KILLED, CONTEXT, source)
    activity.gauge = lower(event.args.gauge)
    store.addActivity(activity)
  }

  function handleGaugeRevived(log: RawLog, tx: RawTx, store: Store): void {
    const event = decode(log)
    if (event.eventName !== "GaugeRevived") return
    const activity = baseActivity(
      log,
      tx,
      ACTION.GAUGE_REVIVED,
      CONTEXT,
      source,
    )
    activity.gauge = lower(event.args.gauge)
    store.addActivity(activity)
  }

  function handleBribesAdded(log: RawLog, tx: RawTx, store: Store): void {
    const event = decode(log)
    if (event.eventName !== "BribesAdded") return
    const activity = baseActivity(
      log,
      tx,
      ACTION.INCENTIVE_ADDED,
      CONTEXT,
      source,
    )
    activity.actor = lower(event.args.sender)
    activity.gauge = lower(event.args.gauge)
    activity.token = lower(event.args.token)
    activity.amount = event.args.amount
    activity.rewardType = "Bribe"
    store.addActivity(activity)
  }

  function handleDistributeReward(log: RawLog, tx: RawTx, store: Store): void {
    const event = decode(log)
    if (event.eventName !== "DistributeReward") return
    const activity = baseActivity(
      log,
      tx,
      ACTION.REWARD_DISTRIBUTED,
      CONTEXT,
      source,
    )
    activity.actor = lower(event.args.sender)
    activity.gauge = lower(event.args.gauge)
    activity.amount = event.args.amount
    store.addActivity(activity)
  }

  function handleNotifyReward(log: RawLog, tx: RawTx, store: Store): void {
    const event = decode(log)
    if (event.eventName !== "NotifyReward") return
    const activity = baseActivity(
      log,
      tx,
      ACTION.REWARD_NOTIFIED,
      CONTEXT,
      source,
    )
    activity.actor = lower(event.args.sender)
    activity.token = lower(event.args.reward)
    activity.amount = event.args.amount
    store.addActivity(activity)
  }

  return {
    Abstained: handleAbstained,
    Voted: handleVoted,
    GaugeCreated: handleGaugeCreated,
    GaugeKilled: handleGaugeKilled,
    GaugeRevived: handleGaugeRevived,
    BribesAdded: handleBribesAdded,
    DistributeReward: handleDistributeReward,
    NotifyReward: handleNotifyReward,
  }
}

function handleThirdPartyGaugeRegistered(
  log: RawLog,
  tx: RawTx,
  store: Store,
): void {
  const event = decode(log)
  if (event.eventName !== "ThirdPartyGaugeCreated") return
  const activity = baseActivity(
    log,
    tx,
    ACTION.THIRD_PARTY_GAUGE_CREATED,
    CONTEXT,
    SOURCE.THIRD_PARTY_VOTER,
  )
  activity.actor = lower(event.args.thirdParty)
  activity.gauge = lower(event.args.gauge)
  activity.metadata = event.args.metadata
  store.addActivity(activity)
}

function handleValidatorGaugeCreated(
  log: RawLog,
  tx: RawTx,
  store: Store,
): void {
  const event = decode(log)
  if (event.eventName !== "ValidatorGaugeCreated") return
  const activity = baseActivity(
    log,
    tx,
    ACTION.VALIDATOR_GAUGE_CREATED,
    CONTEXT,
    SOURCE.VALIDATORS_VOTER,
  )
  activity.actor = lower(event.args.operator)
  activity.gauge = lower(event.args.gauge)
  activity.recipient = lower(event.args.beneficiary)
  store.addActivity(activity)
}

function handleValidatorLeft(log: RawLog, tx: RawTx, store: Store): void {
  const event = decode(log)
  if (event.eventName !== "ValidatorLeft") return
  const activity = baseActivity(
    log,
    tx,
    ACTION.VALIDATOR_LEFT,
    CONTEXT,
    SOURCE.VALIDATORS_VOTER,
  )
  activity.actor = lower(event.args.operator)
  activity.gauge = lower(event.args.gauge)
  store.addActivity(activity)
}

export const thirdPartyVoterHandlers: Record<string, Handler> = {
  ...sharedHandlers(SOURCE.THIRD_PARTY_VOTER),
  ThirdPartyGaugeCreated: handleThirdPartyGaugeRegistered,
}

export const validatorsVoterHandlers: Record<string, Handler> = {
  ...sharedHandlers(SOURCE.VALIDATORS_VOTER),
  ValidatorGaugeCreated: handleValidatorGaugeCreated,
  ValidatorLeft: handleValidatorLeft,
}
