import { decodeEventLog } from "viem"
import type { RawLog, RawTx } from "../../types"
import boostVoterAbi from "../abis/boost-voter"
import { ACTION, BOOST_CONTEXT, SOURCE, ZERO } from "../constants"
import {
  type Handler,
  baseActivity,
  detectPokeMethod,
  eventTopics,
  lower,
  resolveVoteActor,
  upsertVote,
} from "../helpers"
import type { Store } from "../store"

// Port of apps/activity-subgraph/src/boost-voter.ts (veBTC pair boosts).

const CONTEXT = BOOST_CONTEXT.MEZO_VEBTC_PAIR_BOOST
const VOTER = SOURCE.BOOST_VOTER

function decode(log: RawLog) {
  return decodeEventLog({
    abi: boostVoterAbi,
    topics: eventTopics(log),
    data: log.data,
  })
}

function handleGaugeCreated(log: RawLog, tx: RawTx, store: Store): void {
  const event = decode(log)
  if (event.eventName !== "GaugeCreated") return
  const activity = baseActivity(log, tx, ACTION.PAIR_CREATED, CONTEXT, VOTER)
  activity.actor = lower(event.args.creator)
  activity.gauge = lower(event.args.gauge)
  activity.rewardContract = lower(event.args.bribeVotingReward)
  store.addActivity(activity)
}

function handleVoted(log: RawLog, tx: RawTx, store: Store): void {
  const event = decode(log)
  if (event.eventName !== "Voted") return
  const params = event.args
  const actor = resolveVoteActor(store, params.tokenId, params.voter, tx.input)
  const activity = baseActivity(log, tx, ACTION.BOOST_VOTE, CONTEXT, VOTER)
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

function handleBoostPoked(log: RawLog, tx: RawTx, store: Store): void {
  const event = decode(log)
  if (event.eventName !== "BoostPoked") return
  const activity = baseActivity(log, tx, ACTION.BOOST_POKE, CONTEXT, VOTER)
  activity.boostableTokenId = event.args.boostableTokenId
  activity.boost = event.args.boost
  activity.pokeMethod = detectPokeMethod(tx.input)
  store.addActivity(activity)
}

function handleAbstained(log: RawLog, tx: RawTx, store: Store): void {
  const event = decode(log)
  if (event.eventName !== "Abstained") return
  const params = event.args
  const actor = resolveVoteActor(store, params.tokenId, params.voter, tx.input)
  const activity = baseActivity(log, tx, ACTION.BOOST_ABSTAIN, CONTEXT, VOTER)
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

function handleBoostableTokenBurned(
  log: RawLog,
  tx: RawTx,
  store: Store,
): void {
  const event = decode(log)
  if (event.eventName !== "BoostableTokenBurned") return
  const activity = baseActivity(
    log,
    tx,
    ACTION.BOOSTABLE_TOKEN_BURNED,
    CONTEXT,
    VOTER,
  )
  activity.boostableTokenId = event.args.boostableTokenId
  activity.gauge = lower(event.args.gauge)
  store.addActivity(activity)
}

function handleBribesAdded(log: RawLog, tx: RawTx, store: Store): void {
  const event = decode(log)
  if (event.eventName !== "BribesAdded") return
  const activity = baseActivity(log, tx, ACTION.INCENTIVE_ADDED, CONTEXT, VOTER)
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
    VOTER,
  )
  activity.actor = lower(event.args.sender)
  activity.gauge = lower(event.args.gauge)
  activity.amount = event.args.amount
  store.addActivity(activity)
}

function handleNotifyReward(log: RawLog, tx: RawTx, store: Store): void {
  const event = decode(log)
  if (event.eventName !== "NotifyReward") return
  const activity = baseActivity(log, tx, ACTION.REWARD_NOTIFIED, CONTEXT, VOTER)
  activity.actor = lower(event.args.sender)
  activity.token = lower(event.args.reward)
  activity.amount = event.args.amount
  store.addActivity(activity)
}

function handleGaugeKilled(log: RawLog, tx: RawTx, store: Store): void {
  const event = decode(log)
  if (event.eventName !== "GaugeKilled") return
  const activity = baseActivity(log, tx, ACTION.GAUGE_KILLED, CONTEXT, VOTER)
  activity.gauge = lower(event.args.gauge)
  store.addActivity(activity)
}

function handleGaugeRevived(log: RawLog, tx: RawTx, store: Store): void {
  const event = decode(log)
  if (event.eventName !== "GaugeRevived") return
  const activity = baseActivity(log, tx, ACTION.GAUGE_REVIVED, CONTEXT, VOTER)
  activity.gauge = lower(event.args.gauge)
  store.addActivity(activity)
}

export const boostVoterHandlers: Record<string, Handler> = {
  Abstained: handleAbstained,
  GaugeCreated: handleGaugeCreated,
  Voted: handleVoted,
  BoostPoked: handleBoostPoked,
  BoostableTokenBurned: handleBoostableTokenBurned,
  BribesAdded: handleBribesAdded,
  DistributeReward: handleDistributeReward,
  GaugeKilled: handleGaugeKilled,
  GaugeRevived: handleGaugeRevived,
  NotifyReward: handleNotifyReward,
}
