import { CONTRACTS } from "@repo/shared/contracts"
import { z } from "zod"
import type {
  ActivityKind,
  WireActivityItem,
} from "../../features/history/schema"
import { epochStartOf } from "./math"

// Normalizes activity rows from the warehouse (matchbox.activity_events) and
// from the frozen explorer API (app.matchbox.markets/api/activity) into the
// Pro ActivityItem shape. Action types and sources use the warehouse's
// UPPER_SNAKE names in both cases.

export const CLAIM_ACTIONS = [
  "VOTE_BRIBE_CLAIMED",
  "VOTE_FEE_CLAIMED",
  "REBASE_CLAIMED",
  "MERKLE_CLAIMED",
  "SAVINGS_YIELD_CLAIMED",
] as const

export const PROTOCOL_ACTIONS = [
  "EPOCH_PROCESSED",
  "EMISSIONS_ENABLED",
  "REWARD_DISTRIBUTED",
  "REWARD_NOTIFIED",
  "GAUGE_CREATED",
  "GAUGE_KILLED",
  "GAUGE_REVIVED",
  "PAIR_CREATED",
  "BOOSTABLE_TOKEN_BURNED",
  "VALIDATOR_GAUGE_CREATED",
  "VALIDATOR_LEFT",
  "THIRD_PARTY_GAUGE_CREATED",
  "PERIOD_UPDATED",
  "REBASE_CHECKPOINT",
  "PCV_DISTRIBUTION",
  "PCV_DEBT_PAYMENT",
  "PROTOCOL_YIELD_RECEIVED",
  "STRATEGY_YIELD_RECEIVED",
  "MERKLE_DISTRIBUTION_ADDED",
  "INCENTIVE_ADDED",
] as const

const LOCK_KINDS: Record<string, ActivityKind> = {
  LOCK_CREATED: "lock_created",
  LOCK_AMOUNT_INCREASED: "lock_increased",
  LOCK_EXTENDED: "lock_extended",
  LOCK_MERGED: "lock_merged",
  LOCK_WITHDRAWN: "lock_withdrawn",
  LOCK_PERMANENT: "lock_permanent",
  LOCK_PERMANENT_UNLOCKED: "lock_unlocked",
  LOCK_TRANSFERRED: "lock_transferred",
}

const CLAIM_SET: ReadonlySet<string> = new Set(CLAIM_ACTIONS)

export function activityKind(actionType: string, source: string): ActivityKind {
  if (actionType === "BOOST_VOTE") {
    if (source === "POOLS_VOTER") return "pool_ballot"
    if (source === "VALIDATORS_VOTER") return "validator_ballot"
    return "voted"
  }
  if (actionType === "BOOST_ABSTAIN") return "vote_reset"
  if (actionType === "BOOST_POKE") return "boost_refreshed"
  if (actionType === "INCENTIVE_ADDED") return "incentive_deposited"
  if (CLAIM_SET.has(actionType)) return "claimed"
  return LOCK_KINDS[actionType] ?? "protocol"
}

/** Upstream action types that can produce the requested kinds. */
export function actionTypesForKinds(kinds: readonly ActivityKind[]): string[] {
  const types = new Set<string>()
  for (const kind of kinds) {
    if (
      kind === "voted" ||
      kind === "pool_ballot" ||
      kind === "validator_ballot"
    ) {
      types.add("BOOST_VOTE")
    } else if (kind === "vote_reset") {
      types.add("BOOST_ABSTAIN")
    } else if (kind === "boost_refreshed") {
      types.add("BOOST_POKE")
    } else if (kind === "incentive_deposited") {
      types.add("INCENTIVE_ADDED")
    } else if (kind === "claimed") {
      for (const action of CLAIM_ACTIONS) types.add(action)
    } else if (kind === "protocol") {
      for (const action of PROTOCOL_ACTIONS) {
        if (action !== "INCENTIVE_ADDED") types.add(action)
      }
    } else {
      for (const [action, lockKind] of Object.entries(LOCK_KINDS)) {
        if (lockKind === kind) types.add(action)
      }
    }
  }
  return [...types]
}

const hex = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((value) => value.toLowerCase())
const hash = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => value.toLowerCase())
const uint = z.string().regex(/^\d+$/)

function addressOrNull(value: string | null | undefined): string | null {
  const parsed = hex.safeParse(value)
  return parsed.success ? parsed.data : null
}

function uintOrNull(value: string | null | undefined): string | null {
  const parsed = uint.safeParse(value)
  return parsed.success ? parsed.data : null
}

function flagOrNull(
  value: string | boolean | null | undefined,
): boolean | null {
  if (typeof value === "boolean") return value
  if (value === "true" || value === "t") return true
  if (value === "false" || value === "f") return false
  return null
}

export type Escrow = "veMEZO" | "veBTC"

const ESCROWS: Record<string, Escrow> = {
  [CONTRACTS.mainnet.veMEZO.toLowerCase()]: "veMEZO",
  [CONTRACTS.mainnet.veBTC.toLowerCase()]: "veBTC",
}

/** The token a lock in each escrow holds (what LOCK_* `amount` is in). */
export const ESCROW_TOKENS: Record<Escrow, TokenMeta> = {
  veMEZO: { symbol: "MEZO", decimals: 18 },
  veBTC: { symbol: "BTC", decimals: 18 },
}

export type TokenMeta = { symbol: string; decimals: number }

/** Core Mezo tokens; anything else is looked up on chain (see enrich.ts). */
export const KNOWN_TOKENS: Record<string, TokenMeta> = {
  "0x7b7c000000000000000000000000000000000000": { symbol: "BTC", decimals: 18 },
  "0x7b7c000000000000000000000000000000000001": {
    symbol: "MEZO",
    decimals: 18,
  },
  "0xdd468a1ddc392dcdbef6db6e34e89aa338f9f186": {
    symbol: "MUSD",
    decimals: 18,
  },
  "0x04671c72aab5ac02a03c1098314b1bb6b560c197": {
    symbol: "mUSDC",
    decimals: 6,
  },
  "0xeb5a5d39de4ea42c2aa6a57eca2894376683bb8e": {
    symbol: "mUSDT",
    decimals: 6,
  },
}

export function escrowOf(
  actionType: string,
  source: string,
  contractAddress: string | null,
): Escrow | null {
  if (actionType.startsWith("LOCK_")) {
    return contractAddress ? (ESCROWS[contractAddress] ?? null) : null
  }
  if (actionType === "BOOST_VOTE" || actionType === "BOOST_ABSTAIN") {
    if (source === "BOOST_VOTER" || source === "THIRD_PARTY_VOTER") {
      return "veMEZO"
    }
    if (source === "POOLS_VOTER" || source === "VALIDATORS_VOTER") {
      return "veBTC"
    }
  }
  // Boost refreshes are keyed by the gauge owner's veBTC lock.
  if (actionType === "BOOST_POKE") return "veBTC"
  return null
}

/** Symbol and decimals of a row's `amount`, when they're known locally. */
export function amountToken(
  item: Pick<WireActivityItem, "actionType" | "escrow" | "token">,
): TokenMeta | null {
  if (item.actionType.startsWith("LOCK_")) {
    return item.escrow ? ESCROW_TOKENS[item.escrow] : null
  }
  return item.token ? (KNOWN_TOKENS[item.token] ?? null) : null
}

type RawActivity = {
  id: string
  actionType: string
  source: string
  blockNumber: string
  logIndex: number | null
  txHash: string | null
  txFrom: string | null
  timestamp: string
  actor: string | null
  recipient: string | null
  tokenId: string | null
  gauge: string | null
  pool: string | null
  rewardContract: string | null
  rewardType: string | null
  token: string | null
  amount: string | null
  weight: string | null
  totalWeight: string | null
  boost: string | null
  boostableTokenId: string | null
  contractAddress: string | null
  lock: WireActivityItem["lock"]
}

function toItem(raw: RawActivity): WireActivityItem {
  const item: WireActivityItem = {
    id: raw.id,
    kind: activityKind(raw.actionType, raw.source),
    actionType: raw.actionType,
    source: raw.source,
    blockNumber: raw.blockNumber,
    logIndex: raw.logIndex,
    txHash: raw.txHash,
    txFrom: raw.txFrom,
    timestamp: raw.timestamp,
    epochStart: epochStartOf(BigInt(raw.timestamp)).toString(),
    status: "final",
    actor: raw.actor,
    recipient: raw.recipient,
    tokenId: raw.tokenId,
    gauge: raw.gauge,
    pool: raw.pool,
    rewardContract: raw.rewardContract,
    rewardType: raw.rewardType,
    token: raw.token,
    amount: raw.amount,
    weight: raw.weight,
    totalWeight: raw.totalWeight,
    boost: raw.boost,
    boostableTokenId: raw.boostableTokenId,
    escrow: escrowOf(raw.actionType, raw.source, raw.contractAddress),
    symbol: null,
    decimals: null,
  }
  const meta = amountToken(item)
  if (meta) {
    item.symbol = meta.symbol
    item.decimals = meta.decimals
  }
  if (raw.lock) item.lock = raw.lock
  return item
}

// ------------------------------------------------------------ warehouse

export const WAREHOUSE_COLUMNS = [
  "id",
  "action_type",
  "source",
  "tx_hash",
  "tx_from",
  "log_index",
  "block_number",
  "timestamp",
  "actor",
  "recipient",
  "token_id",
  "amount",
  "prev_amount",
  "prev_duration",
  "prev_is_permanent",
  "post_amount",
  "post_duration",
  "post_is_permanent",
  "merge_source_token_id",
  "merge_dest_token_id",
  "token",
  "gauge",
  "pool",
  "reward_contract",
  "reward_type",
  "boostable_token_id",
  "boost",
  "weight",
  "total_weight",
  "contract_address",
] as const

const text = z.string().nullable().optional()

const warehouseRowSchema = z.object({
  id: z.string(),
  action_type: z.string(),
  source: z.string(),
  tx_hash: hash,
  tx_from: text,
  log_index: uint,
  block_number: uint,
  timestamp: uint,
  actor: text,
  recipient: text,
  token_id: text,
  amount: text,
  prev_amount: text,
  prev_duration: text,
  prev_is_permanent: text,
  post_amount: text,
  post_duration: text,
  post_is_permanent: text,
  merge_source_token_id: text,
  merge_dest_token_id: text,
  token: text,
  gauge: text,
  pool: text,
  reward_contract: text,
  reward_type: text,
  boostable_token_id: text,
  boost: text,
  weight: text,
  total_weight: text,
  contract_address: text,
})

export function fromWarehouseRow(row: unknown): WireActivityItem | null {
  const parsed = warehouseRowSchema.safeParse(row)
  if (!parsed.success) return null
  const value = parsed.data
  const isLock = value.action_type.startsWith("LOCK_")
  return toItem({
    id: value.id,
    actionType: value.action_type,
    source: value.source,
    blockNumber: value.block_number,
    logIndex: Number(value.log_index),
    txHash: value.tx_hash,
    txFrom: addressOrNull(value.tx_from),
    timestamp: value.timestamp,
    actor: addressOrNull(value.actor),
    recipient: addressOrNull(value.recipient),
    tokenId: uintOrNull(value.token_id),
    gauge: addressOrNull(value.gauge),
    pool: addressOrNull(value.pool),
    rewardContract: addressOrNull(value.reward_contract),
    rewardType: value.reward_type ?? null,
    token: addressOrNull(value.token),
    amount: uintOrNull(value.amount),
    weight: uintOrNull(value.weight),
    totalWeight: uintOrNull(value.total_weight),
    boost: uintOrNull(value.boost),
    boostableTokenId: uintOrNull(value.boostable_token_id),
    contractAddress: addressOrNull(value.contract_address),
    lock: isLock
      ? {
          prevAmount: uintOrNull(value.prev_amount),
          prevDuration: uintOrNull(value.prev_duration),
          prevIsPermanent: flagOrNull(value.prev_is_permanent),
          postAmount: uintOrNull(value.post_amount),
          postDuration: uintOrNull(value.post_duration),
          postIsPermanent: flagOrNull(value.post_is_permanent),
          mergeSourceTokenId: uintOrNull(value.merge_source_token_id),
          mergeDestTokenId: uintOrNull(value.merge_dest_token_id),
        }
      : undefined,
  })
}

// -------------------------------------------------------------- explorer

const CONTRACT_SOURCES: Record<string, string> = {
  votingEscrow: "VOTING_ESCROW",
  boostVoter: "BOOST_VOTER",
  poolsVoter: "POOLS_VOTER",
  thirdPartyVoter: "THIRD_PARTY_VOTER",
  validatorsVoter: "VALIDATORS_VOTER",
  chainFeeSplitter: "CHAIN_FEE_SPLITTER",
  mezoChainSplitter: "MEZO_CHAIN_SPLITTER",
  mezoEcosystemSplitter: "MEZO_ECOSYSTEM_SPLITTER",
  mezoMinter: "MEZO_MINTER",
  rebaseDistributor: "MEZO_REBASE_DISTRIBUTOR",
  merkleDistributor: "MEZO_MERKLE_DISTRIBUTOR",
  musdSavingsRate: "MUSD_SAVINGS_RATE",
  pcv: "PCV",
  poolFactory: "POOL_FACTORY",
  pool: "POOL",
  gauge: "GAUGE",
  feeVotingReward: "FEE_VOTING_REWARD",
  bribeVotingReward: "BRIBE_VOTING_REWARD",
}

/** `lockPermanentUnlocked` → `LOCK_PERMANENT_UNLOCKED`. */
export function upperSnake(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()
}

const optional = z.string().optional()

export const explorerItemSchema = z.object({
  id: z.string(),
  blockNumber: uint,
  timestamp: z.number().int().nonnegative(),
  actionType: z.string(),
  source: z.string(),
  contract: optional,
  txHash: optional,
  txFrom: optional,
  actorAddress: optional,
  recipient: optional,
  tokenId: optional,
  amount: optional,
  prevAmount: optional,
  prevDuration: optional,
  prevIsPermanent: z.boolean().optional(),
  postAmount: optional,
  postDuration: optional,
  postIsPermanent: z.boolean().optional(),
  mergeSourceTokenId: optional,
  mergeDestTokenId: optional,
  weight: optional,
  totalWeight: optional,
  boost: optional,
  boostableTokenId: optional,
  tokenAddress: optional,
  gaugeAddress: optional,
  rewardType: optional,
  logIndex: z.number().int().nonnegative().optional(),
})
export type ExplorerItem = z.infer<typeof explorerItemSchema>

export const explorerResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(z.unknown()),
  page: z.number().int().nonnegative(),
  hasMore: z.boolean(),
})

export function fromExplorerItem(input: unknown): WireActivityItem | null {
  const parsed = explorerItemSchema.safeParse(input)
  if (!parsed.success) return null
  const item = parsed.data
  const actionType = upperSnake(item.actionType)
  const txHash = hash.safeParse(item.txHash)
  const isLock = actionType.startsWith("LOCK_")
  return toItem({
    id: item.id,
    actionType,
    source: item.contract
      ? (CONTRACT_SOURCES[item.contract] ?? upperSnake(item.contract))
      : "UNKNOWN",
    blockNumber: item.blockNumber,
    logIndex: item.logIndex ?? null,
    txHash: txHash.success ? txHash.data : null,
    txFrom: addressOrNull(item.txFrom),
    timestamp: String(item.timestamp),
    actor: addressOrNull(item.actorAddress),
    recipient: addressOrNull(item.recipient),
    tokenId: uintOrNull(item.tokenId),
    gauge: addressOrNull(item.gaugeAddress),
    pool: null,
    rewardContract: null,
    rewardType: item.rewardType ?? null,
    token: addressOrNull(item.tokenAddress),
    amount: uintOrNull(item.amount),
    weight: uintOrNull(item.weight),
    totalWeight: uintOrNull(item.totalWeight),
    boost: uintOrNull(item.boost),
    boostableTokenId: uintOrNull(item.boostableTokenId),
    // The explorer doesn't say which escrow; enrich.ts reads it from the
    // tx receipt for lock rows.
    contractAddress: null,
    lock: isLock
      ? {
          prevAmount: uintOrNull(item.prevAmount),
          prevDuration: uintOrNull(item.prevDuration),
          prevIsPermanent: item.prevIsPermanent ?? null,
          postAmount: uintOrNull(item.postAmount),
          postDuration: uintOrNull(item.postDuration),
          postIsPermanent: item.postIsPermanent ?? null,
          mergeSourceTokenId: uintOrNull(item.mergeSourceTokenId),
          mergeDestTokenId: uintOrNull(item.mergeDestTokenId),
        }
      : undefined,
  })
}

// --------------------------------------------------------------- shaping

/**
 * A re-vote emits Abstained then Voted for the same lock in one tx; show it
 * as one "voted" row by dropping the abstains that have a matching vote.
 */
export function collapseRevotes(
  items: readonly WireActivityItem[],
): WireActivityItem[] {
  const votes = new Set(
    items
      .filter((item) => item.actionType === "BOOST_VOTE" && item.txHash)
      .map((item) => `${item.txHash}:${item.tokenId}:${item.source}`),
  )
  return items.filter(
    (item) =>
      item.actionType !== "BOOST_ABSTAIN" ||
      !votes.has(`${item.txHash}:${item.tokenId}:${item.source}`),
  )
}

export type ActivityScope = {
  kinds: readonly ActivityKind[]
  tokenId: string | undefined
  gauge: string | undefined
  source: string | undefined
}

/** Post-filters for what the upstream query can't express. */
export function matchesScope(
  item: WireActivityItem,
  scope: ActivityScope,
): boolean {
  if (scope.kinds.length > 0 && !scope.kinds.includes(item.kind)) return false
  if (scope.tokenId !== undefined && item.tokenId !== scope.tokenId) {
    return false
  }
  if (scope.gauge !== undefined && item.gauge !== scope.gauge) return false
  if (scope.source !== undefined && item.source !== scope.source) return false
  return true
}

/** Newest first: timestamp, block, log index, then id. */
export function compareActivityDesc(
  a: WireActivityItem,
  b: WireActivityItem,
): number {
  const keys: Array<[bigint, bigint]> = [
    [BigInt(a.timestamp), BigInt(b.timestamp)],
    [BigInt(a.blockNumber), BigInt(b.blockNumber)],
    [BigInt(a.logIndex ?? 0), BigInt(b.logIndex ?? 0)],
  ]
  for (const [left, right] of keys) {
    if (left !== right) return left > right ? -1 : 1
  }
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}
