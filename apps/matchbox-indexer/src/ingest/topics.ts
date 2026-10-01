import { type Hex, toEventSelector } from "viem"
import type { ContractKind } from "../types"

// Events the explorer subgraph handles, per contract kind (canonical
// signatures from apps/activity-subgraph/subgraph.yaml on main;
// test/ingest/topics.test.ts fails on drift). Ingest stores only these:
// pools alone emit Sync/Fees/LP Transfer/Approval at roughly twice the rate of
// everything the decoder reads, which would not fit the warehouse. Widening a
// set is a config change plus a re-backfill (about 15 minutes).
const VOTE_EVENTS = [
  "Abstained(address,address,uint256,uint256,uint256,uint256)",
  "Voted(address,address,uint256,uint256,uint256,uint256)",
  "DistributeReward(address,address,uint256)",
  "GaugeKilled(address)",
  "GaugeRevived(address)",
  "NotifyReward(address,address,uint256)",
]

const REWARD_EVENTS = [
  "NotifyReward(address,address,uint256,uint256)",
  "ClaimRewards(address,address,uint256)",
]

export const HANDLED_EVENTS: Record<ContractKind, string[]> = {
  votingEscrow: [
    "Deposit(address,uint256,uint8,uint256,uint256,uint256)",
    "LockPermanent(address,uint256,uint256,uint256)",
    "Merge(address,uint256,uint256,uint256,uint256,uint256,uint256,uint256)",
    "UnlockPermanent(address,uint256,uint256,uint256)",
    "Withdraw(address,uint256,uint256,uint256)",
    "Transfer(address,address,uint256)",
    "UpdateBoost(uint256,uint256)",
  ],
  boostVoter: [
    ...VOTE_EVENTS,
    "GaugeCreated(address,address,address)",
    "BoostPoked(uint256,uint256)",
    "BoostableTokenBurned(uint256,address)",
    "BribesAdded(address,address,uint256,address)",
  ],
  poolsVoter: [
    ...VOTE_EVENTS,
    "GaugeCreated(address,address,address,address,address,address,address,address)",
  ],
  thirdPartyVoter: [
    ...VOTE_EVENTS,
    "GaugeCreated(address,address,address)",
    "BribesAdded(address,address,uint256,address)",
    "ThirdPartyGaugeCreated(address,address,string)",
  ],
  validatorsVoter: [
    ...VOTE_EVENTS,
    "GaugeCreated(address,address,address)",
    "BribesAdded(address,address,uint256,address)",
    "ValidatorGaugeCreated(address,address,address)",
    "ValidatorLeft(address,address)",
  ],
  splitter: [
    "PeriodUpdated(uint256,uint256,uint256,uint256)",
    "Nudge(uint256,uint256,uint256)",
  ],
  minter: [
    "EpochProcessed(uint256,uint256,uint256,uint256,uint256,uint256,address)",
    "EmissionsEnabled(uint256)",
  ],
  rebaseDistributor: [
    "Claimed(uint256,uint256,uint256,uint256)",
    "CheckpointToken(uint256,uint256)",
  ],
  merkleDistributor: [
    "Claimed(uint256,uint256,address,uint256)",
    "DistributionAdded(uint256,bytes32,uint256,address,bytes)",
  ],
  musdSavingsRate: [
    "Deposit(address,uint256)",
    "Withdraw(address,uint256)",
    "YieldClaimed(address,uint256)",
    "ProtocolYieldReceived(uint256)",
    "StrategyYieldReceived(uint256)",
  ],
  pcv: ["PCVDistribution(address,uint256)", "PCVDebtPayment(uint256)"],
  poolFactory: ["PoolCreated(address,address,bool,address,uint256)"],
  pool: [
    "Mint(address,uint256,uint256)",
    "Burn(address,address,uint256,uint256)",
    "Swap(address,address,uint256,uint256,uint256,uint256)",
  ],
  gauge: [
    "Deposit(address,address,uint256)",
    "Withdraw(address,uint256)",
    "ClaimRewards(address,uint256)",
  ],
  bribeVotingReward: REWARD_EVENTS,
  feeVotingReward: REWARD_EVENTS,
}

// eth_getLogs ANDs addresses with topics, so kinds share a filter only when no
// kind in the group emits another kind's topic it doesn't handle. Escrows
// (Transfer) and pools (LP Transfer, Swap) get their own filters; the rest
// share one, which over-includes nothing the probe found.
export const FILTER_GROUPS: ContractKind[][] = [
  ["votingEscrow"],
  ["pool"],
  [
    "boostVoter",
    "poolsVoter",
    "thirdPartyVoter",
    "validatorsVoter",
    "splitter",
    "minter",
    "rebaseDistributor",
    "merkleDistributor",
    "musdSavingsRate",
    "pcv",
    "poolFactory",
    "gauge",
    "bribeVotingReward",
    "feeVotingReward",
  ],
]

export function topic0sFor(kinds: ContractKind[]): Hex[] {
  return [
    ...new Set(
      kinds.flatMap((kind) =>
        HANDLED_EVENTS[kind].map((signature) => toEventSelector(signature)),
      ),
    ),
  ].sort()
}

export function filterGroupOf(kind: ContractKind): number {
  const index = FILTER_GROUPS.findIndex((group) => group.includes(kind))
  if (index === -1) throw new Error(`Contract kind ${kind} has no log filter`)
  return index
}
