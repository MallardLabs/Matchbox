import { type Address, decodeEventLog } from "viem"
import type { RawLog, RawTx } from "../../types"
import bribeVotingRewardAbi from "../abis/bribe-voting-reward"
import feeVotingRewardAbi from "../abis/fee-voting-reward"
import { ACTION, BOOST_CONTEXT, SOURCE } from "../constants"
import { type Handler, baseActivity, eventTopics, lower } from "../helpers"
import type { BribeToPoolRow } from "../rows"
import type { Store } from "../store"

// Ports of apps/activity-subgraph/src/{bribes,fee-rewards,legacy-pool-rewards}.ts.

// Reward contracts of pool gauges created before the subgraph's start block.
// The GaugeCreated handler never saw them, so their mapping is seeded on
// first use. Entries are [rewardContract, pool, gauge], read from chain
// state (`gaugeToBribe` / `gaugeToFees`) when the subgraph table was built.
// The set is closed.
export const LEGACY_POOL_REWARDS: ReadonlyArray<
  readonly [Address, Address, Address]
> = [
  // MUSD/mUSDT
  [
    "0x6f3e2afc81a8fd8e3490ddb032a91d339b371afb",
    "0x10906a9e9215939561597b4c8e4b98f93c02031a",
    "0x4887fa1c88f8927932e5e1545b3b29a1a29656e7",
  ],
  [
    "0x24e2d2efc692aab0ae54e0dd8b4c19aabc463c3b",
    "0x10906a9e9215939561597b4c8e4b98f93c02031a",
    "0x4887fa1c88f8927932e5e1545b3b29a1a29656e7",
  ],
  // BTC/mxSolvBTC
  [
    "0x7c90026167ff9051fec3e14a5ec486e484722ded",
    "0x329d64572f8922c3fe90d23a3c74a360d8ea6235",
    "0x3aecbfc4aa3fc152fbefd427f87db1e97226dc20",
  ],
  [
    "0xce8c65d38d3eb67263a658802cb86ce963679871",
    "0x329d64572f8922c3fe90d23a3c74a360d8ea6235",
    "0x3aecbfc4aa3fc152fbefd427f87db1e97226dc20",
  ],
  // mUSDC/mUSDT
  [
    "0xa908809b0602606f86a745e13296881a9b267462",
    "0x2a1ab0224a7a608d3a992cb15594a2934f74f4c0",
    "0x548289b8983398db857efbb1e0cec489d72a6355",
  ],
  [
    "0xbbb03e37546e051f2588e12c47f804a216320c10",
    "0x2a1ab0224a7a608d3a992cb15594a2934f74f4c0",
    "0x548289b8983398db857efbb1e0cec489d72a6355",
  ],
  // BTC/MUSD
  [
    "0x94a9a494872bf7231d8378d0aef7d32ba552e305",
    "0x52e604c44417233b6ccedddc0d640a405caacefb",
    "0x8be20a5ff57e381025ae5e3a121b697269569aaf",
  ],
  [
    "0x0453820c89084e20658068a27ebb90824f1a6c6d",
    "0x52e604c44417233b6ccedddc0d640a405caacefb",
    "0x8be20a5ff57e381025ae5e3a121b697269569aaf",
  ],
  // mSolvBTC/MUSD
  [
    "0xa2e2f01f9342582557917d114cabcce4a26bb47f",
    "0x5cd2a025c001e07ae354a4c22c3009908de1ac59",
    "0xf93b51466519b7c9ca318f1bde0524530632af90",
  ],
  [
    "0x0fcf5322dedbe67b68208199db234e98ef54c888",
    "0x5cd2a025c001e07ae354a4c22c3009908de1ac59",
    "0xf93b51466519b7c9ca318f1bde0524530632af90",
  ],
  // mcbBTC/BTC
  [
    "0x0377249dd6916f335048c7cd5541022b6ec2185c",
    "0x72e6b3f126cf4f6c90c08114ac29038a0e269210",
    "0xf482d0edb24c888d63a031de71d963c4f4fa79e4",
  ],
  [
    "0x7ab52a8fc9f9100fec58a5ee319ddb872c1208d7",
    "0x72e6b3f126cf4f6c90c08114ac29038a0e269210",
    "0xf482d0edb24c888d63a031de71d963c4f4fa79e4",
  ],
  // mT/MUSD
  [
    "0xf4c0067b6a38ca5b28fb2c8e1d8a2a20d20d2af3",
    "0x6688f868e9c81ee671867e77fbc618bbea2e9782",
    "0x39e06c2a671a237897ccbf9166a136eb5bdda432",
  ],
  [
    "0xf702cd0c9fcfd453165aef6c84627937695d5a6c",
    "0x6688f868e9c81ee671867e77fbc618bbea2e9782",
    "0x39e06c2a671a237897ccbf9166a136eb5bdda432",
  ],
  // BTC/mSolvBTC
  [
    "0x52a9a4310a1567ce828df137b2ead4883c0221cf",
    "0xf6f950485b0a65828f07581ca979ef1271778d6a",
    "0x0edca8717ab81363ff722ab7bd45060800632ec8",
  ],
  [
    "0x4989d0128724b8b9d5d12bc98f1df9d4adafbbfa",
    "0xf6f950485b0a65828f07581ca979ef1271778d6a",
    "0x0edca8717ab81363ff722ab7bd45060800632ec8",
  ],
  // mUSDC/MUSD
  [
    "0xf2b88ec68c8fbd5261c5483d1385c46dc7619589",
    "0xed812aec0fecc8fd882ac3eccc43f3aa80a6c356",
    "0x2945401f5e015a122b482de0ea5bf92c005c3c75",
  ],
  [
    "0x898bbe9353dc576745724e8c64a02472645561cd",
    "0xed812aec0fecc8fd882ac3eccc43f3aa80a6c356",
    "0x2945401f5e015a122b482de0ea5bf92c005c3c75",
  ],
]

// Null for a contract the explorer knew nothing about, which keeps its
// "skip the incentive" behaviour.
function resolveRewardMapping(
  store: Store,
  rewardContract: Address,
): BribeToPoolRow | null {
  const id = lower(rewardContract)
  const existing = store.getRewardMapping(id)
  if (existing !== undefined) return existing
  const legacy = LEGACY_POOL_REWARDS.find((entry) => entry[0] === id)
  if (legacy === undefined) return null
  const mapping: BribeToPoolRow = {
    id,
    poolAddress: legacy[1],
    gaugeAddress: legacy[2],
  }
  store.putRewardMapping(mapping)
  return mapping
}

function decodeBribe(log: RawLog) {
  return decodeEventLog({
    abi: bribeVotingRewardAbi,
    topics: eventTopics(log),
    data: log.data,
  })
}

function decodeFee(log: RawLog) {
  return decodeEventLog({
    abi: feeVotingRewardAbi,
    topics: eventTopics(log),
    data: log.data,
  })
}

function handleBribeNotifyReward(log: RawLog, tx: RawTx, store: Store): void {
  const event = decodeBribe(log)
  if (event.eventName !== "NotifyReward") return
  const mapping = resolveRewardMapping(store, log.address)
  if (mapping === null) return
  const activity = baseActivity(
    log,
    tx,
    ACTION.INCENTIVE_ADDED,
    BOOST_CONTEXT.MATCHBOX_GAUGE_BOOST,
    SOURCE.POOLS_VOTER,
  )
  activity.actor = lower(event.args.from)
  activity.gauge = mapping.gaugeAddress
  activity.pool = mapping.poolAddress
  activity.token = lower(event.args.reward)
  activity.amount = event.args.amount
  activity.rewardType = "Bribe"
  activity.rewardContract = lower(log.address)
  store.addActivity(activity)
}

function handleBribeClaimRewards(log: RawLog, tx: RawTx, store: Store): void {
  const event = decodeBribe(log)
  if (event.eventName !== "ClaimRewards") return
  const mapping = resolveRewardMapping(store, log.address)
  const activity = baseActivity(
    log,
    tx,
    ACTION.VOTE_BRIBE_CLAIMED,
    BOOST_CONTEXT.MATCHBOX_GAUGE_BOOST,
    SOURCE.BRIBE_VOTING_REWARD,
  )
  activity.actor = lower(event.args.from)
  activity.token = lower(event.args.reward)
  activity.amount = event.args.amount
  activity.rewardType = "Bribe"
  activity.rewardContract = lower(log.address)
  if (mapping !== null) {
    activity.gauge = mapping.gaugeAddress
    activity.pool = mapping.poolAddress
  }
  store.addActivity(activity)
}

function handleFeeNotifyReward(log: RawLog, tx: RawTx, store: Store): void {
  const event = decodeFee(log)
  if (event.eventName !== "NotifyReward") return
  const mapping = resolveRewardMapping(store, log.address)
  if (mapping === null) return
  const activity = baseActivity(
    log,
    tx,
    ACTION.INCENTIVE_ADDED,
    BOOST_CONTEXT.MATCHBOX_GAUGE_BOOST,
    SOURCE.FEE_VOTING_REWARD,
  )
  activity.actor = lower(event.args.from)
  activity.gauge = mapping.gaugeAddress
  activity.pool = mapping.poolAddress
  activity.token = lower(event.args.reward)
  activity.amount = event.args.amount
  activity.rewardType = "Fee"
  activity.rewardContract = lower(log.address)
  store.addActivity(activity)
}

function handleFeeClaimRewards(log: RawLog, tx: RawTx, store: Store): void {
  const event = decodeFee(log)
  if (event.eventName !== "ClaimRewards") return
  const mapping = resolveRewardMapping(store, log.address)
  const activity = baseActivity(
    log,
    tx,
    ACTION.VOTE_FEE_CLAIMED,
    BOOST_CONTEXT.MATCHBOX_GAUGE_BOOST,
    SOURCE.FEE_VOTING_REWARD,
  )
  activity.actor = lower(event.args.from)
  activity.token = lower(event.args.reward)
  activity.amount = event.args.amount
  activity.rewardType = "Fee"
  activity.rewardContract = lower(log.address)
  if (mapping !== null) {
    activity.gauge = mapping.gaugeAddress
    activity.pool = mapping.poolAddress
  }
  store.addActivity(activity)
}

export const bribeVotingRewardHandlers: Record<string, Handler> = {
  NotifyReward: handleBribeNotifyReward,
  ClaimRewards: handleBribeClaimRewards,
}

export const feeVotingRewardHandlers: Record<string, Handler> = {
  NotifyReward: handleFeeNotifyReward,
  ClaimRewards: handleFeeClaimRewards,
}
