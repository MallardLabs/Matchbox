import { z } from "zod"

// Wire contract for the Pro Worker history endpoints. Big integers (wei,
// weights, blocks, token ids, epoch timestamps) travel as decimal strings; USD
// as decimal strings with up to 6 fraction digits, or null when unpriced. The
// Worker builds these shapes and the hooks validate them.

export const EPOCH_SECONDS = 604_800

const uint = z.string().regex(/^\d+$/)
const usd = z.string().regex(/^\d+(\.\d{1,6})?$/)
/** A unit price (USD per whole token), up to 18 fraction digits. */
const price = z.string().regex(/^\d+(\.\d{1,18})?$/)
const hexAddress = z.string().regex(/^0x[0-9a-f]{40}$/)
const txHash = z.string().regex(/^0x[0-9a-f]{64}$/)

export const freshnessSchema = z.object({
  source: z.enum(["warehouse", "rpc", "frozen-explorer"]),
  /** Last block the activity projection has applied. */
  indexedThroughBlock: uint.nullable(),
  /** ISO time of that checkpoint. */
  indexedAt: z.string().nullable(),
  headBlock: uint.nullable(),
  lagBlocks: uint.nullable(),
  lagSeconds: z.number().int().nonnegative().nullable(),
  state: z.enum(["fresh", "stale", "unavailable"]),
})
export type WireFreshness = z.infer<typeof freshnessSchema>

export function envelopeSchema<T extends z.ZodType>(data: T) {
  return z.object({
    network: z.string(),
    generatedAt: z.string(),
    freshness: freshnessSchema,
    data,
  })
}
export type WireEnvelope<T> = {
  network: string
  generatedAt: string
  freshness: WireFreshness
  data: T
}

export const tokenAmountSchema = z.object({
  token: hexAddress,
  symbol: z.string(),
  decimals: z.number().int().min(0).max(36),
  amount: uint,
  usdAtEarn: usd.nullable(),
  usdNow: usd.nullable(),
  /** In aggregates: this token's lines left out of the USD sums. */
  unpriced: z.number().int().nonnegative().optional(),
})
export type WireTokenAmount = z.infer<typeof tokenAmountSchema>

const epochRef = { epochStart: uint, epochEnd: uint }

// USD sums cover the priced token lines; `unpriced` counts the lines left
// out (show "Unpriced" for null, a partial marker when unpriced > 0).
const totalsSchema = z.object({
  tokens: z.array(tokenAmountSchema),
  usdAtEarn: usd.nullable(),
  usdNow: usd.nullable(),
  unpriced: z.number().int().nonnegative(),
})
export type WireTotals = z.infer<typeof totalsSchema>

export const earningsSchema = z.object({
  /** veMEZO locks included, as resolved by the Worker or passed in. */
  tokenIds: z.array(uint),
  current: z.object({
    ...epochRef,
    status: z.literal("projected"),
    tokens: z.array(tokenAmountSchema),
    usdNow: usd.nullable(),
  }),
  /** Sealed epochs, oldest first. */
  epochs: z.array(
    z.object({
      ...epochRef,
      status: z.literal("sealed"),
      tokens: z.array(tokenAmountSchema),
      usdAtEarn: usd.nullable(),
      usdNow: usd.nullable(),
      /** Token lines in this epoch with no historical price. */
      unpriced: z.number().int().nonnegative(),
    }),
  ),
  totals: z.object({
    /** Every sealed epoch since the lock's first vote, not just `epochs`. */
    realized: totalsSchema,
    claimed: totalsSchema,
    claimable: totalsSchema,
    projected: totalsSchema,
  }),
  /** Σ claimable per (lock, bribe, token) equals the contract's `earned()`. */
  verified: z.boolean(),
  /**
   * A price read missed transiently: USD sums are lower bounds ("≥") and
   * the response isn't cached; refetch shortly.
   */
  partial: z.boolean(),
})
export type WireEarnings = z.infer<typeof earningsSchema>

export const ledgerStatusSchema = z.enum(["pending", "claimable", "claimed"])

export const ledgerRowSchema = z.object({
  id: z.string(),
  ...epochRef,
  /** ISO of epochEnd. */
  date: z.string(),
  tokenId: uint,
  escrow: z.enum(["veMEZO", "veBTC"]),
  voter: z.enum(["boost", "pools", "validators", "third_party"]),
  gauge: hexAddress,
  rewardContract: hexAddress,
  rewardType: z.enum(["Bribe", "Fee"]),
  token: hexAddress,
  symbol: z.string(),
  decimals: z.number().int().min(0).max(36),
  amount: uint,
  balance: uint,
  supply: uint,
  deposited: uint,
  usdAtEarn: usd.nullable(),
  usdNow: usd.nullable(),
  status: ledgerStatusSchema,
  claim: z
    .object({
      txHash,
      blockNumber: uint,
      timestamp: uint,
      confidence: z.enum(["exact", "wallet"]),
    })
    .nullable(),
  method: z.enum(["rpc-checkpoints-v1", "warehouse-replay-v1"]),
})
export type WireLedgerRow = z.infer<typeof ledgerRowSchema>

export const ledgerSchema = z.object({
  rows: z.array(ledgerRowSchema),
  nextCursor: z.string().nullable(),
  /** Same as earnings `partial`: some USD at earn is still missing. */
  partial: z.boolean(),
})
export type WireLedger = z.infer<typeof ledgerSchema>

export const ACTIVITY_KINDS = [
  "voted",
  "vote_reset",
  "pool_ballot",
  "validator_ballot",
  "claimed",
  "incentive_deposited",
  "boost_refreshed",
  "lock_created",
  "lock_increased",
  "lock_extended",
  "lock_merged",
  "lock_withdrawn",
  "lock_permanent",
  "lock_unlocked",
  "lock_transferred",
  "profile_published",
  "protocol",
] as const
export const activityKindSchema = z.enum(ACTIVITY_KINDS)
export type ActivityKind = z.infer<typeof activityKindSchema>

const nullableUint = uint.nullable()
const nullableAddress = hexAddress.nullable()

export const activityItemSchema = z.object({
  id: z.string(),
  kind: activityKindSchema,
  actionType: z.string(),
  source: z.string(),
  /** "0" when the source row carries no block (earn-votes fallback). */
  blockNumber: uint,
  logIndex: z.number().int().nonnegative().nullable(),
  txHash: txHash.nullable(),
  txFrom: nullableAddress,
  timestamp: uint,
  epochStart: uint,
  status: z.enum(["final", "signed"]),
  actor: nullableAddress,
  recipient: nullableAddress,
  tokenId: nullableUint,
  gauge: nullableAddress,
  pool: nullableAddress,
  rewardContract: nullableAddress,
  rewardType: z.string().nullable(),
  token: nullableAddress,
  amount: nullableUint,
  weight: nullableUint,
  totalWeight: nullableUint,
  boost: nullableUint,
  boostableTokenId: nullableUint,
  /** Escrow the row's lock belongs to (locks, ballots, boost refreshes). */
  escrow: z.enum(["veMEZO", "veBTC"]).nullable(),
  /** Token of `amount` (lock rows: the escrow's MEZO / BTC); null if unknown. */
  symbol: z.string().nullable(),
  decimals: z.number().int().min(0).max(36).nullable(),
  lock: z
    .object({
      prevAmount: nullableUint,
      prevDuration: nullableUint,
      prevIsPermanent: z.boolean().nullable(),
      postAmount: nullableUint,
      postDuration: nullableUint,
      postIsPermanent: z.boolean().nullable(),
      mergeSourceTokenId: nullableUint,
      mergeDestTokenId: nullableUint,
    })
    .optional(),
})
export type WireActivityItem = z.infer<typeof activityItemSchema>

export const activityPageSchema = z.object({
  items: z.array(activityItemSchema),
  nextCursor: z.string().nullable(),
  /** The source ended before the range did (frozen explorer row window). */
  truncated: z.boolean().optional(),
})
export type WireActivityPage = z.infer<typeof activityPageSchema>

export const activityTxSchema = z.object({
  /**
   * `indexed`: rows found. `not_indexed`: no rows and the index is past the
   * tx's block (or the tx doesn't exist). `pending_index`: the tx is newer
   * than the index.
   */
  index: z.enum(["indexed", "not_indexed", "pending_index"]),
  tx: z
    .object({
      hash: txHash,
      blockNumber: uint,
      timestamp: uint,
      from: nullableAddress,
      epochStart: uint,
    })
    .nullable(),
  items: z.array(activityItemSchema),
})
export type WireActivityTx = z.infer<typeof activityTxSchema>

export const gaugeEpochsSchema = z.object({
  rows: z.array(
    z.object({
      ...epochRef,
      status: z.enum(["sealed", "current"]),
      /** Bribe supply at epoch close (current: live supply). */
      veMezo: uint,
      /** 1e18 = 1×; null when the gauge has no veBTC lock or it can't be read. */
      boostWad: nullableUint,
      incentives: z.array(tokenAmountSchema),
      incentivesUsd: usd.nullable(),
      apyBps: nullableUint,
    }),
  ),
})
export type WireGaugeEpochs = z.infer<typeof gaugeEpochsSchema>

export const incentiveEpochsSchema = z.object({
  rows: z.array(
    z.object({
      ...epochRef,
      status: z.enum(["sealed", "current"]),
      /** Gauges with a non-zero deposit that epoch. */
      gauges: z.number().int().nonnegative(),
      /** Count of BribesAdded deposits, or null when not indexed. */
      deposits: z.number().int().nonnegative().nullable(),
      tokens: z.array(tokenAmountSchema),
      usdAtDeposit: usd.nullable(),
    }),
  ),
})
export type WireIncentiveEpochs = z.infer<typeof incentiveEpochsSchema>

export const pricingEpochsSchema = z.object({
  rows: z.array(
    z.object({
      ...epochRef,
      btcUsd: price.nullable(),
      mezoUsd: price.nullable(),
      mezoBlock: nullableUint,
      baseBlock: nullableUint,
      sources: z.object({
        btc: z.enum(["skip-oracle"]).nullable(),
        mezo: z.enum(["aerodrome-cl"]).nullable(),
      }),
    }),
  ),
})
export type WirePricingEpochs = z.infer<typeof pricingEpochsSchema>

export const historyStatusSchema = z.object({
  coverage: z.object({
    earnings: z.literal("rpc"),
    claims: z.enum(["indexed", "partial", "unavailable"]),
    boostClaims: z.boolean(),
    deposits: z.enum(["warehouse", "rpc"]),
    activity: z.enum(["warehouse", "frozen-explorer", "unavailable"]),
  }),
})
export type WireHistoryStatus = z.infer<typeof historyStatusSchema>
