import { decodeEventLog } from "viem"
import type { RawLog, RawTx } from "../../ingest/rpc"
import poolsVoterAbi from "../abis/pools-voter"
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

// Port of apps/activity-subgraph/src/pools-voter.ts (Matchbox pool gauges).

const CONTEXT = BOOST_CONTEXT.MATCHBOX_GAUGE_BOOST
const VOTER = SOURCE.POOLS_VOTER

function decode(log: RawLog) {
  return decodeEventLog({
    abi: poolsVoterAbi,
    topics: eventTopics(log),
    data: log.data,
  })
}

function handleGaugeCreated(log: RawLog, tx: RawTx, store: Store): void {
  const event = decode(log)
  if (event.eventName !== "GaugeCreated") return
  const params = event.args
  const activity = baseActivity(log, tx, ACTION.GAUGE_CREATED, CONTEXT, VOTER)
  activity.actor = lower(params.creator)
  activity.pool = lower(params.pool)
  activity.gauge = lower(params.gauge)
  activity.rewardContract = lower(params.bribeVotingReward)
  activity.rewardType = "Bribe"
  store.addActivity(activity)

  // Track the spawned bribe, fee and gauge contracts, as the subgraph's
  // templates do.
  const createdBlock = log.blockNumber
  store.putDataSource({
    network: log.network,
    address: lower(params.bribeVotingReward),
    template: "BribeVotingReward",
    createdBlock,
  })
  store.putDataSource({
    network: log.network,
    address: lower(params.feeVotingReward),
    template: "FeeVotingReward",
    createdBlock,
  })
  store.putDataSource({
    network: log.network,
    address: lower(params.gauge),
    template: "Gauge",
    createdBlock,
  })

  store.putRewardMapping({
    id: lower(params.bribeVotingReward),
    poolAddress: lower(params.pool),
    gaugeAddress: lower(params.gauge),
  })
  store.putRewardMapping({
    id: lower(params.feeVotingReward),
    poolAddress: lower(params.pool),
    gaugeAddress: lower(params.gauge),
  })
}

function handleVoted(log: RawLog, tx: RawTx, store: Store): void {
  const event = decode(log)
  if (event.eventName !== "Voted") return
  const params = event.args
  const actor = resolveVoteActor(store, params.tokenId, params.voter, tx.input)
  const activity = baseActivity(log, tx, ACTION.BOOST_VOTE, CONTEXT, VOTER)
  activity.actor = actor
  activity.pool = lower(params.pool)
  // Pool mirrored into `gauge` so readers have one "voted for" field.
  activity.gauge = lower(params.pool)
  activity.tokenId = params.tokenId
  activity.weight = params.weight
  activity.totalWeight = params.totalWeight
  store.addActivity(activity)
  upsertVote(
    store,
    log.address,
    params.tokenId,
    params.pool,
    actor,
    params.weight,
    log.blockTimestamp,
  )
}

function handleAbstained(log: RawLog, tx: RawTx, store: Store): void {
  const event = decode(log)
  if (event.eventName !== "Abstained") return
  const params = event.args
  const actor = resolveVoteActor(store, params.tokenId, params.voter, tx.input)
  const activity = baseActivity(log, tx, ACTION.BOOST_ABSTAIN, CONTEXT, VOTER)
  activity.actor = actor
  activity.pool = lower(params.pool)
  activity.gauge = lower(params.pool)
  activity.tokenId = params.tokenId
  activity.weight = params.weight
  activity.totalWeight = params.totalWeight
  store.addActivity(activity)
  upsertVote(
    store,
    log.address,
    params.tokenId,
    params.pool,
    actor,
    ZERO,
    log.blockTimestamp,
  )
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

export const poolsVoterHandlers: Record<string, Handler> = {
  Abstained: handleAbstained,
  GaugeCreated: handleGaugeCreated,
  Voted: handleVoted,
  DistributeReward: handleDistributeReward,
  GaugeKilled: handleGaugeKilled,
  GaugeRevived: handleGaugeRevived,
  NotifyReward: handleNotifyReward,
}
