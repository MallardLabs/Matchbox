import { decodeEventLog } from "viem"
import type { RawLog, RawTx } from "../../ingest/rpc"
import merkleDistributorAbi from "../abis/merkle-distributor"
import mezoMinterAbi from "../abis/mezo-minter"
import musdSavingsRateAbi from "../abis/musd-savings-rate"
import pcvAbi from "../abis/pcv"
import rebaseDistributorAbi from "../abis/rebase-distributor"
import splitterAbi from "../abis/splitter"
import { ACTION, BOOST_CONTEXT, SOURCE } from "../constants"
import { type Handler, baseActivity, eventTopics, lower } from "../helpers"
import type { Store } from "../store"

// Ports of apps/activity-subgraph/src/{splitters,mezo-minter,
// rebase-distributor,merkle-distributor,musd-savings-rate,pcv}.ts.

const CONTEXT = BOOST_CONTEXT.UNKNOWN

function splitterHandlers(source: string): Record<string, Handler> {
  function decode(log: RawLog) {
    return decodeEventLog({
      abi: splitterAbi,
      topics: eventTopics(log),
      data: log.data,
    })
  }

  function handlePeriodUpdated(log: RawLog, tx: RawTx, store: Store): void {
    const event = decode(log)
    if (event.eventName !== "PeriodUpdated") return
    const activity = baseActivity(
      log,
      tx,
      ACTION.PERIOD_UPDATED,
      CONTEXT,
      source,
    )
    activity.period = event.args.oldPeriod
    activity.newPeriod = event.args.newPeriod
    activity.firstRecipientAmount = event.args.firstRecipientAmount
    activity.secondRecipientAmount = event.args.secondRecipientAmount
    store.addActivity(activity)
  }

  // The subgraph records nudges as PERIOD_UPDATED with the rate fields set.
  function handleNudge(log: RawLog, tx: RawTx, store: Store): void {
    const event = decode(log)
    if (event.eventName !== "Nudge") return
    const activity = baseActivity(
      log,
      tx,
      ACTION.PERIOD_UPDATED,
      CONTEXT,
      source,
    )
    activity.period = event.args._period
    activity.oldRate = event.args._oldRate
    activity.newRate = event.args._newRate
    store.addActivity(activity)
  }

  return { PeriodUpdated: handlePeriodUpdated, Nudge: handleNudge }
}

function decodeMinter(log: RawLog) {
  return decodeEventLog({
    abi: mezoMinterAbi,
    topics: eventTopics(log),
    data: log.data,
  })
}

function handleEpochProcessed(log: RawLog, tx: RawTx, store: Store): void {
  const event = decodeMinter(log)
  if (event.eventName !== "EpochProcessed") return
  const params = event.args
  const activity = baseActivity(
    log,
    tx,
    ACTION.EPOCH_PROCESSED,
    CONTEXT,
    SOURCE.MEZO_MINTER,
  )
  activity.actor = lower(params.caller)
  activity.period = params.period
  activity.epochIndex = params.epochIndex
  activity.emission = params.emission
  activity.rebase = params.rebase
  activity.rewards = params.rewards
  activity.totalSupply = params.totalSupply
  store.addActivity(activity)
}

function handleEmissionsEnabled(log: RawLog, tx: RawTx, store: Store): void {
  const event = decodeMinter(log)
  if (event.eventName !== "EmissionsEnabled") return
  const activity = baseActivity(
    log,
    tx,
    ACTION.EMISSIONS_ENABLED,
    CONTEXT,
    SOURCE.MEZO_MINTER,
  )
  activity.period = event.args.activePeriod
  store.addActivity(activity)
}

function decodeRebase(log: RawLog) {
  return decodeEventLog({
    abi: rebaseDistributorAbi,
    topics: eventTopics(log),
    data: log.data,
  })
}

function handleRebaseClaimed(log: RawLog, tx: RawTx, store: Store): void {
  const event = decodeRebase(log)
  if (event.eventName !== "Claimed") return
  const activity = baseActivity(
    log,
    tx,
    ACTION.REBASE_CLAIMED,
    CONTEXT,
    SOURCE.MEZO_REBASE_DISTRIBUTOR,
  )
  activity.tokenId = event.args.tokenId
  activity.epochStart = event.args.epochStart
  activity.epochEnd = event.args.epochEnd
  activity.amount = event.args.amount
  store.addActivity(activity)
}

function handleCheckpointToken(log: RawLog, tx: RawTx, store: Store): void {
  const event = decodeRebase(log)
  if (event.eventName !== "CheckpointToken") return
  const activity = baseActivity(
    log,
    tx,
    ACTION.REBASE_CHECKPOINT,
    CONTEXT,
    SOURCE.MEZO_REBASE_DISTRIBUTOR,
  )
  activity.period = event.args.time
  activity.amount = event.args.tokens
  store.addActivity(activity)
}

function decodeMerkle(log: RawLog) {
  return decodeEventLog({
    abi: merkleDistributorAbi,
    topics: eventTopics(log),
    data: log.data,
  })
}

function handleMerkleClaimed(log: RawLog, tx: RawTx, store: Store): void {
  const event = decodeMerkle(log)
  if (event.eventName !== "Claimed") return
  const activity = baseActivity(
    log,
    tx,
    ACTION.MERKLE_CLAIMED,
    CONTEXT,
    SOURCE.MEZO_MERKLE_DISTRIBUTOR,
  )
  activity.actor = lower(event.args.account)
  activity.distributionId = event.args.distributionId
  activity.amount = event.args.amount
  activity.epochIndex = event.args.index
  store.addActivity(activity)
}

function handleDistributionAdded(log: RawLog, tx: RawTx, store: Store): void {
  const event = decodeMerkle(log)
  if (event.eventName !== "DistributionAdded") return
  const activity = baseActivity(
    log,
    tx,
    ACTION.MERKLE_DISTRIBUTION_ADDED,
    CONTEXT,
    SOURCE.MEZO_MERKLE_DISTRIBUTOR,
  )
  activity.distributionId = event.args.distributionId
  activity.merkleRoot = lower(event.args.merkleRoot)
  activity.epochStart = event.args.startTimestamp
  activity.recipient = lower(event.args.handler)
  store.addActivity(activity)
}

function decodeSavings(log: RawLog) {
  return decodeEventLog({
    abi: musdSavingsRateAbi,
    topics: eventTopics(log),
    data: log.data,
  })
}

function handleSavingsDeposit(log: RawLog, tx: RawTx, store: Store): void {
  const event = decodeSavings(log)
  if (event.eventName !== "Deposit") return
  const activity = baseActivity(
    log,
    tx,
    ACTION.SAVINGS_DEPOSIT,
    CONTEXT,
    SOURCE.MUSD_SAVINGS_RATE,
  )
  activity.actor = lower(event.args.user)
  activity.amount = event.args.amount
  store.addActivity(activity)
}

function handleSavingsWithdraw(log: RawLog, tx: RawTx, store: Store): void {
  const event = decodeSavings(log)
  if (event.eventName !== "Withdraw") return
  const activity = baseActivity(
    log,
    tx,
    ACTION.SAVINGS_WITHDRAW,
    CONTEXT,
    SOURCE.MUSD_SAVINGS_RATE,
  )
  activity.actor = lower(event.args.user)
  activity.amount = event.args.amount
  store.addActivity(activity)
}

function handleSavingsYieldClaimed(log: RawLog, tx: RawTx, store: Store): void {
  const event = decodeSavings(log)
  if (event.eventName !== "YieldClaimed") return
  const activity = baseActivity(
    log,
    tx,
    ACTION.SAVINGS_YIELD_CLAIMED,
    CONTEXT,
    SOURCE.MUSD_SAVINGS_RATE,
  )
  activity.actor = lower(event.args.user)
  activity.amount = event.args.amount
  store.addActivity(activity)
}

function handleProtocolYieldReceived(
  log: RawLog,
  tx: RawTx,
  store: Store,
): void {
  const event = decodeSavings(log)
  if (event.eventName !== "ProtocolYieldReceived") return
  const activity = baseActivity(
    log,
    tx,
    ACTION.PROTOCOL_YIELD_RECEIVED,
    CONTEXT,
    SOURCE.MUSD_SAVINGS_RATE,
  )
  activity.amount = event.args.amount
  store.addActivity(activity)
}

function handleStrategyYieldReceived(
  log: RawLog,
  tx: RawTx,
  store: Store,
): void {
  const event = decodeSavings(log)
  if (event.eventName !== "StrategyYieldReceived") return
  const activity = baseActivity(
    log,
    tx,
    ACTION.STRATEGY_YIELD_RECEIVED,
    CONTEXT,
    SOURCE.MUSD_SAVINGS_RATE,
  )
  activity.amount = event.args.amount
  store.addActivity(activity)
}

function decodePcv(log: RawLog) {
  return decodeEventLog({
    abi: pcvAbi,
    topics: eventTopics(log),
    data: log.data,
  })
}

function handlePcvDistribution(log: RawLog, tx: RawTx, store: Store): void {
  const event = decodePcv(log)
  if (event.eventName !== "PCVDistribution") return
  const activity = baseActivity(
    log,
    tx,
    ACTION.PCV_DISTRIBUTION,
    CONTEXT,
    SOURCE.PCV,
  )
  activity.recipient = lower(event.args._recipient)
  activity.amount = event.args._amount
  store.addActivity(activity)
}

function handlePcvDebtPayment(log: RawLog, tx: RawTx, store: Store): void {
  const event = decodePcv(log)
  if (event.eventName !== "PCVDebtPayment") return
  const activity = baseActivity(
    log,
    tx,
    ACTION.PCV_DEBT_PAYMENT,
    CONTEXT,
    SOURCE.PCV,
  )
  activity.amount = event.args._paidDebt
  store.addActivity(activity)
}

export const chainFeeSplitterHandlers = splitterHandlers(
  SOURCE.CHAIN_FEE_SPLITTER,
)
export const mezoChainSplitterHandlers = splitterHandlers(
  SOURCE.MEZO_CHAIN_SPLITTER,
)
export const mezoEcosystemSplitterHandlers = splitterHandlers(
  SOURCE.MEZO_ECOSYSTEM_SPLITTER,
)

export const mezoMinterHandlers: Record<string, Handler> = {
  EpochProcessed: handleEpochProcessed,
  EmissionsEnabled: handleEmissionsEnabled,
}

export const rebaseDistributorHandlers: Record<string, Handler> = {
  Claimed: handleRebaseClaimed,
  CheckpointToken: handleCheckpointToken,
}

export const merkleDistributorHandlers: Record<string, Handler> = {
  Claimed: handleMerkleClaimed,
  DistributionAdded: handleDistributionAdded,
}

export const musdSavingsRateHandlers: Record<string, Handler> = {
  Deposit: handleSavingsDeposit,
  Withdraw: handleSavingsWithdraw,
  YieldClaimed: handleSavingsYieldClaimed,
  ProtocolYieldReceived: handleProtocolYieldReceived,
  StrategyYieldReceived: handleStrategyYieldReceived,
}

export const pcvHandlers: Record<string, Handler> = {
  PCVDistribution: handlePcvDistribution,
  PCVDebtPayment: handlePcvDebtPayment,
}
