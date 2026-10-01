import { decodeEventLog } from "viem"
import type { RawLog, RawTx } from "../../types"
import gaugeAbi from "../abis/gauge"
import poolAbi from "../abis/pool"
import poolFactoryAbi from "../abis/pool-factory"
import { ACTION, BOOST_CONTEXT, SOURCE } from "../constants"
import { type Handler, baseActivity, eventTopics, lower } from "../helpers"
import type { Store } from "../store"

// Ports of apps/activity-subgraph/src/{pools,gauges}.ts.

function handlePoolCreated(log: RawLog, tx: RawTx, store: Store): void {
  const event = decodeEventLog({
    abi: poolFactoryAbi,
    topics: eventTopics(log),
    data: log.data,
  })
  if (event.eventName !== "PoolCreated") return
  const activity = baseActivity(
    log,
    tx,
    ACTION.POOL_CREATED,
    BOOST_CONTEXT.UNKNOWN,
    SOURCE.POOL_FACTORY,
  )
  activity.actor = lower(tx.from)
  activity.pool = lower(event.args.pool)
  activity.token = lower(event.args.token0)
  activity.recipient = lower(event.args.token1)
  activity.metadata = event.args.stable ? "stable" : "volatile"
  store.addActivity(activity)

  store.putDataSource({
    network: log.network,
    address: lower(event.args.pool),
    template: "Pool",
    createdBlock: log.blockNumber,
  })
}

function decodePool(log: RawLog) {
  return decodeEventLog({
    abi: poolAbi,
    topics: eventTopics(log),
    data: log.data,
  })
}

function handlePoolMint(log: RawLog, tx: RawTx, store: Store): void {
  const event = decodePool(log)
  if (event.eventName !== "Mint") return
  const activity = baseActivity(
    log,
    tx,
    ACTION.LP_ADDED,
    BOOST_CONTEXT.UNKNOWN,
    SOURCE.POOL,
  )
  // The tx initiator (smart account / EOA) rather than the router.
  activity.actor = lower(tx.from)
  activity.recipient = lower(event.args.sender)
  activity.pool = lower(log.address)
  activity.amount = event.args.amount0
  activity.firstRecipientAmount = event.args.amount0
  activity.secondRecipientAmount = event.args.amount1
  store.addActivity(activity)
}

function handlePoolBurn(log: RawLog, tx: RawTx, store: Store): void {
  const event = decodePool(log)
  if (event.eventName !== "Burn") return
  const activity = baseActivity(
    log,
    tx,
    ACTION.LP_REMOVED,
    BOOST_CONTEXT.UNKNOWN,
    SOURCE.POOL,
  )
  activity.actor = lower(tx.from)
  activity.recipient = lower(event.args.to)
  activity.pool = lower(log.address)
  activity.amount = event.args.amount0
  activity.firstRecipientAmount = event.args.amount0
  activity.secondRecipientAmount = event.args.amount1
  store.addActivity(activity)
}

function handlePoolSwap(log: RawLog, tx: RawTx, store: Store): void {
  const event = decodePool(log)
  if (event.eventName !== "Swap") return
  const params = event.args
  const activity = baseActivity(
    log,
    tx,
    ACTION.SWAP,
    BOOST_CONTEXT.UNKNOWN,
    SOURCE.POOL,
  )
  activity.actor = lower(tx.from)
  activity.recipient = lower(params.to)
  activity.pool = lower(log.address)
  const out0 = params.amount0Out
  const out1 = params.amount1Out
  activity.amount = out0 > out1 ? out0 : out1
  activity.firstRecipientAmount = params.amount0In + out0
  activity.secondRecipientAmount = params.amount1In + out1
  activity.metadata = `in0=${params.amount0In},in1=${params.amount1In},out0=${out0},out1=${out1}`
  store.addActivity(activity)
}

function decodeGauge(log: RawLog) {
  return decodeEventLog({
    abi: gaugeAbi,
    topics: eventTopics(log),
    data: log.data,
  })
}

function handleGaugeDeposit(log: RawLog, tx: RawTx, store: Store): void {
  const event = decodeGauge(log)
  if (event.eventName !== "Deposit") return
  const activity = baseActivity(
    log,
    tx,
    ACTION.LP_STAKED,
    BOOST_CONTEXT.MATCHBOX_GAUGE_BOOST,
    SOURCE.GAUGE,
  )
  activity.actor = lower(event.args.to)
  activity.recipient = lower(event.args.from)
  activity.amount = event.args.amount
  activity.gauge = lower(log.address)
  store.addActivity(activity)
}

function handleGaugeWithdraw(log: RawLog, tx: RawTx, store: Store): void {
  const event = decodeGauge(log)
  if (event.eventName !== "Withdraw") return
  const activity = baseActivity(
    log,
    tx,
    ACTION.LP_UNSTAKED,
    BOOST_CONTEXT.MATCHBOX_GAUGE_BOOST,
    SOURCE.GAUGE,
  )
  activity.actor = lower(event.args.from)
  activity.amount = event.args.amount
  activity.gauge = lower(log.address)
  store.addActivity(activity)
}

function handleGaugeClaimRewards(log: RawLog, tx: RawTx, store: Store): void {
  const event = decodeGauge(log)
  if (event.eventName !== "ClaimRewards") return
  const activity = baseActivity(
    log,
    tx,
    ACTION.REWARD_DISTRIBUTED,
    BOOST_CONTEXT.UNKNOWN,
    SOURCE.GAUGE,
  )
  activity.actor = lower(event.args.from)
  activity.amount = event.args.amount
  activity.gauge = lower(log.address)
  activity.rewardType = "Gauge"
  store.addActivity(activity)
}

export const poolFactoryHandlers: Record<string, Handler> = {
  PoolCreated: handlePoolCreated,
}

export const poolHandlers: Record<string, Handler> = {
  Mint: handlePoolMint,
  Burn: handlePoolBurn,
  Swap: handlePoolSwap,
}

export const gaugeHandlers: Record<string, Handler> = {
  Deposit: handleGaugeDeposit,
  Withdraw: handleGaugeWithdraw,
  ClaimRewards: handleGaugeClaimRewards,
}
