import type { Address, Hex } from "viem"
import type { RewardToken } from "./projection"

export const VOTE_TYPES = ["vemezo", "validators", "pools"] as const
export type VoteType = (typeof VOTE_TYPES)[number]

export const SORT_KEYS = [
  "apy",
  "incentives",
  "vebtc",
  "vemezo",
  "boost",
  "votes",
  "share",
] as const
export type SortKey = (typeof SORT_KEYS)[number]

export const STATUS_FILTERS = ["all", "active", "watching"] as const
export type StatusFilter = (typeof STATUS_FILTERS)[number]

export const DENSITIES = ["comfortable", "compact"] as const
export type Density = (typeof DENSITIES)[number]

export type PowerAsset = "veMEZO" | "veBTC"

export type LockState = "votable" | "voted" | "expired" | "managed" | "empty"

export type VoteLock = {
  tokenId: bigint
  votingPower: bigint
  state: LockState
  /** "Auto max-lock", "Unlocks in 2mo 27d", "Voted this epoch", "Managed by #12". */
  detail: string
}

export type TargetStat = { label: string; value: string }

export type TargetFooter = {
  label: string
  value: string
  side: { text: string; tone: "muted" | "neg" } | null
  multiplier: { text: string; atMax: boolean } | null
  /** Bottom meter, fractions 0–1 of the card width. */
  meter: { fill: number; tone: "accent" | "pos"; over: number }
}

export type TargetMark =
  | { kind: "image"; url: string }
  | { kind: "monogram"; name: string; seed: string }
  | { kind: "pair"; tokens: Array<{ symbol: string; address: string }> }

export type VoteTarget = {
  /** The address `vote()` takes: a gauge, or a pool/vault for PoolsVoter. */
  id: Address
  name: string
  description: string | null
  mark: TargetMark
  /** `#221` chip: the boosted veBTC token or similar. */
  chip: string | null
  isAlive: boolean
  needsBoost: boolean
  totalWeight: bigint
  rewards: RewardToken[]
  /** Priced rewards only. */
  incentiveMicroUsd: bigint
  hasUnpriced: boolean
  apyBps: bigint | null
  /** Reward for one more `unitLabel` of votes, e.g. "$21.40 / 10k veMEZO". */
  perUnitMicroUsd: bigint | null
  stats: [TargetStat, TargetStat]
  footer: TargetFooter | null
  sortValues: Partial<Record<SortKey, bigint>>
  searchText: string
  /** Boost gauges open `/gauges/$address`; validators and pools have no page yet. */
  hasDetail: boolean
}

export type VoteCall = {
  call: { to: Address; data: Hex }
  write: () => Promise<Hex>
}

export type SortOption = { key: SortKey; label: string }

export type VoteTypeMeta = {
  type: VoteType
  title: string
  subtitle: string
  mobileLabel: string
  asset: PowerAsset
  /** Ballot rail labels. */
  optimizeLabel: string
  ballotLabel: string
  signLabel: string
  stepLabel: (tokenId: bigint) => string
  targetNoun: string
  perUnitLabel: string
  sorts: SortOption[]
}

export const VOTE_TYPE_META: Record<VoteType, VoteTypeMeta> = {
  vemezo: {
    type: "vemezo",
    title: "veMEZO Voting",
    subtitle: "Boost veBTC gauges",
    mobileLabel: "veMEZO boost",
    asset: "veMEZO",
    optimizeLabel: "Optimize my votes",
    ballotLabel: "Ballot",
    signLabel: "Vote",
    stepLabel: (tokenId) => `Vote with veMEZO #${tokenId}`,
    targetNoun: "gauges",
    perUnitLabel: "10k veMEZO",
    sorts: [
      { key: "apy", label: "APY" },
      { key: "incentives", label: "Incentives" },
      { key: "vebtc", label: "veBTC" },
      { key: "vemezo", label: "veMEZO" },
      { key: "boost", label: "Boost" },
    ],
  },
  validators: {
    type: "validators",
    title: "Validator Voting",
    subtitle: "veBTC → validators",
    mobileLabel: "Validators",
    asset: "veBTC",
    optimizeLabel: "Optimize validator votes",
    ballotLabel: "Validator ballot",
    signLabel: "Sign validator votes",
    stepLabel: (tokenId) => `Vote with veBTC #${tokenId} · Validators`,
    targetNoun: "validators",
    perUnitLabel: "1 veBTC",
    sorts: [
      { key: "apy", label: "APY" },
      { key: "incentives", label: "Incentives" },
      { key: "votes", label: "Votes" },
      { key: "share", label: "Share" },
    ],
  },
  pools: {
    type: "pools",
    title: "Pools",
    subtitle: "veBTC → pools & vaults",
    mobileLabel: "Pools",
    asset: "veBTC",
    optimizeLabel: "Optimize pool votes",
    ballotLabel: "Pool ballot",
    signLabel: "Sign pool votes",
    stepLabel: (tokenId) => `Vote with veBTC #${tokenId} · Pools`,
    targetNoun: "pools",
    perUnitLabel: "1 veBTC",
    sorts: [
      { key: "apy", label: "APY" },
      { key: "incentives", label: "Incentives" },
      { key: "votes", label: "Votes" },
      { key: "share", label: "Share" },
    ],
  },
}
