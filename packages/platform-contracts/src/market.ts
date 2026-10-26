import { z } from "zod"
import {
  addressInputSchema,
  addressSchema,
  decimalStringSchema,
  isoDateTimeSchema,
} from "./common"
import { networkSlugSchema } from "./network"

// ---------------------------------------------------------------------------
// Epochs
// ---------------------------------------------------------------------------

/** Mezo Earn epochs are one week long, starting Thursday 00:00 UTC. */
export const epochSeconds = 604_800

/** Votes open one hour into an epoch and close one hour before it ends. */
export const voteWindowPaddingSeconds = 3_600

export const epochStatusSchema = z.enum(["closed", "current", "upcoming"])

export type EpochStatus = z.infer<typeof epochStatusSchema>

/** Unix seconds; the same on every network. */
export const epochSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  voteStart: z.number().int().nonnegative(),
  voteEnd: z.number().int().nonnegative(),
  status: epochStatusSchema,
})

export type Epoch = z.infer<typeof epochSchema>

export function epochStartOf(timestampSeconds: number): number {
  return timestampSeconds - (timestampSeconds % epochSeconds)
}

export function isEpochStart(timestampSeconds: number): boolean {
  return (
    Number.isSafeInteger(timestampSeconds) &&
    timestampSeconds >= 0 &&
    timestampSeconds % epochSeconds === 0
  )
}

/** The epoch starting at `start`, with its status at `nowSeconds`. */
export function describeEpoch(start: number, nowSeconds: number): Epoch {
  const end = start + epochSeconds
  const status: EpochStatus =
    nowSeconds >= end ? "closed" : nowSeconds < start ? "upcoming" : "current"
  return {
    start,
    end,
    voteStart: start + voteWindowPaddingSeconds,
    voteEnd: end - voteWindowPaddingSeconds,
    status,
  }
}

export const currentEpochResponseSchema = z.object({
  data: z.object({ current: epochSchema, next: epochSchema }),
})

export type CurrentEpochResponse = z.infer<typeof currentEpochResponseSchema>

export function currentEpochResponse(nowSeconds: number): CurrentEpochResponse {
  const start = epochStartOf(nowSeconds)
  return {
    data: {
      current: describeEpoch(start, nowSeconds),
      next: describeEpoch(start + epochSeconds, nowSeconds),
    },
  }
}

// ---------------------------------------------------------------------------
// Voters and values
// ---------------------------------------------------------------------------

/**
 * The four Mezo Earn voters. `boost` and `third-party` count veMEZO voting
 * power; `pools` and `validators` count veBTC voting power.
 */
export const voterKindSchema = z.enum([
  "boost",
  "pools",
  "validators",
  "third-party",
])

export type VoterKind = z.infer<typeof voterKindSchema>

export const voterEscrow = {
  boost: "veMEZO",
  "third-party": "veMEZO",
  pools: "veBTC",
  validators: "veBTC",
} as const satisfies Record<VoterKind, "veMEZO" | "veBTC">

/** Non-negative decimal string with an optional fraction (USD, multipliers). */
export const fixedDecimalSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/, "Expected a non-negative decimal")

export const priceSourceSchema = z.enum([
  /** Skip Connect BTC/USD oracle on Mezo. */
  "skip-oracle",
  /** Aerodrome Slipstream MEZO/MUSD pool on Base. */
  "aerodrome-cl",
  /** Registry stablecoin, valued at $1. */
  "stablecoin",
  /** Registry BTC-pegged token, valued at the BTC price. */
  "btc-pegged",
  /** The MEZO token, valued at the MEZO price. */
  "mezo",
])

export type PriceSource = z.infer<typeof priceSourceSchema>

export const referencePriceSchema = z.object({
  usd: fixedDecimalSchema,
  source: priceSourceSchema,
})

export type ReferencePrice = z.infer<typeof referencePriceSchema>

// ---------------------------------------------------------------------------
// Gauges
// ---------------------------------------------------------------------------

const gaugeFields = {
  network: networkSlugSchema,
  gaugeAddress: addressSchema,
  isAlive: z.boolean().nullable(),
  /** Voting power on this gauge in base units (18 decimals); null if unread. */
  weight: decimalStringSchema.nullable(),
  bribeContract: addressSchema.nullable(),
}

export const boostGaugeSchema = z.object({
  voter: z.literal("boost"),
  ...gaugeFields,
  /** The veBTC lock this gauge boosts. */
  vebtcTokenId: decimalStringSchema.nullable(),
  /** Receives the gauge's emissions (the veBTC owner at creation). */
  beneficiary: addressSchema.nullable(),
  /** `BoostVoter.getBoost`, e.g. "1.25" for 1.25x; between 1 and 5. */
  boostMultiplier: fixedDecimalSchema.nullable(),
})

export type BoostGauge = z.infer<typeof boostGaugeSchema>

export const poolGaugeSchema = z.object({
  voter: z.literal("pools"),
  ...gaugeFields,
  poolAddress: addressSchema,
  poolSymbol: z.string().nullable(),
  feesContract: addressSchema.nullable(),
})

export type PoolGauge = z.infer<typeof poolGaugeSchema>

export const validatorGaugeSchema = z.object({
  voter: z.literal("validators"),
  ...gaugeFields,
  operatorAddress: addressSchema.nullable(),
  moniker: z.string().nullable(),
})

export type ValidatorGauge = z.infer<typeof validatorGaugeSchema>

export const thirdPartyGaugeSchema = z.object({
  voter: z.literal("third-party"),
  ...gaugeFields,
})

export type ThirdPartyGauge = z.infer<typeof thirdPartyGaugeSchema>

export const gaugeSchema = z.discriminatedUnion("voter", [
  boostGaugeSchema,
  poolGaugeSchema,
  validatorGaugeSchema,
  thirdPartyGaugeSchema,
])

export type Gauge = z.infer<typeof gaugeSchema>

// ---------------------------------------------------------------------------
// Incentives
// ---------------------------------------------------------------------------

/** `bribe` = voting incentives; `fees` = pool trading fees (pools only). */
export const rewardKindSchema = z.enum(["bribe", "fees"])

export type RewardKind = z.infer<typeof rewardKindSchema>

export const rewardSchema = z.object({
  kind: rewardKindSchema,
  contract: addressSchema,
  token: addressSchema,
  symbol: z.string().nullable(),
  decimals: z.number().int().min(0).max(36).nullable(),
  /** `tokenRewardsPerEpoch(token, epoch.start)` in token base units. */
  amount: decimalStringSchema,
  /** `null` when the token has no price. */
  usd: fixedDecimalSchema.nullable(),
})

export type Reward = z.infer<typeof rewardSchema>

/**
 * One gauge's rewards for one epoch. `aprPercent` annualizes `totalUsd`
 * against the gauge's voting power valued at the voting token's price
 * (MEZO for veMEZO voters, BTC for veBTC voters):
 * `totalUsd * 52 / (weight / 1e18 * votingTokenUsd) * 100`.
 */
export const gaugeIncentivesSchema = z.object({
  network: networkSlugSchema,
  voter: voterKindSchema,
  gaugeAddress: addressSchema,
  epochStart: z.number().int().nonnegative(),
  isAlive: z.boolean().nullable(),
  weight: decimalStringSchema.nullable(),
  rewards: z.array(rewardSchema),
  /** Sum of priced rewards; `null` when none is priced. */
  totalUsd: fixedDecimalSchema.nullable(),
  /** Rewards left out of `totalUsd` because their token has no price. */
  unpricedRewards: z.number().int().nonnegative(),
  /** `null` with no priced rewards, no weight or no voting-token price. */
  aprPercent: fixedDecimalSchema.nullable(),
})

export type GaugeIncentives = z.infer<typeof gaugeIncentivesSchema>

// ---------------------------------------------------------------------------
// Snapshot metadata and responses
// ---------------------------------------------------------------------------

export const voterTotalWeightsSchema = z.object({
  boost: decimalStringSchema.nullable(),
  pools: decimalStringSchema.nullable(),
  validators: decimalStringSchema.nullable(),
  "third-party": decimalStringSchema.nullable(),
})

export type VoterTotalWeights = z.infer<typeof voterTotalWeightsSchema>

/** Where and when the data was read. Market data is a snapshot, not live. */
export const marketMetaSchema = z.object({
  source: z.literal("matchbox-market"),
  network: networkSlugSchema,
  epoch: epochSchema,
  blockNumber: decimalStringSchema,
  asOf: isoDateTimeSchema,
  totalWeights: voterTotalWeightsSchema,
  prices: z.object({
    btcUsd: referencePriceSchema.nullable(),
    mezoUsd: referencePriceSchema.nullable(),
  }),
})

export type MarketMeta = z.infer<typeof marketMetaSchema>

export const gaugeListSchema = z.object({
  data: z.array(gaugeSchema),
  meta: marketMetaSchema,
})

export type GaugeList = z.infer<typeof gaugeListSchema>

export const gaugeDetailSchema = z.object({
  data: gaugeSchema,
  meta: marketMetaSchema,
})

export type GaugeDetail = z.infer<typeof gaugeDetailSchema>

export const incentiveListSchema = z.object({
  data: z.array(gaugeIncentivesSchema),
  meta: marketMetaSchema,
})

export type IncentiveList = z.infer<typeof incentiveListSchema>

/** One epoch of a gauge's history, as last snapshotted in that epoch. */
export const gaugeEpochSchema = z.object({
  epoch: epochSchema,
  incentives: gaugeIncentivesSchema,
  totalWeight: decimalStringSchema.nullable(),
  blockNumber: decimalStringSchema,
  asOf: isoDateTimeSchema,
  prices: marketMetaSchema.shape.prices,
})

export type GaugeEpoch = z.infer<typeof gaugeEpochSchema>

export const gaugeEpochListSchema = z.object({
  data: z.array(gaugeEpochSchema),
  meta: z.object({
    source: z.literal("matchbox-market"),
    network: networkSlugSchema,
    gaugeAddress: addressSchema,
  }),
})

export type GaugeEpochList = z.infer<typeof gaugeEpochListSchema>

// ---------------------------------------------------------------------------
// Request parameters
// ---------------------------------------------------------------------------

export const marketMaxGaugeFilters = 50
export const gaugeEpochsDefaultLimit = 12
export const gaugeEpochsMaxLimit = 104

/** `current`, `next`, or an epoch's start in unix seconds. */
export type EpochSelector =
  | { kind: "current" }
  | { kind: "next" }
  | { kind: "start"; start: number }

export const epochSelectorSchema = z
  .string()
  .trim()
  .transform((value, context): EpochSelector => {
    if (value === "current") return { kind: "current" }
    if (value === "next") return { kind: "next" }
    const start = /^[0-9]{1,12}$/.test(value) ? Number(value) : Number.NaN
    if (!isEpochStart(start)) {
      context.addIssue({
        code: "custom",
        message:
          "Expected current, next or an epoch start (unix seconds, a multiple of 604800)",
      })
      return z.NEVER
    }
    return { kind: "start", start }
  })

const gaugeFilterSchema = z
  .array(addressInputSchema)
  .min(1)
  .max(marketMaxGaugeFilters)
  .optional()

export const gaugeListQuerySchema = z.object({
  network: networkSlugSchema,
  voter: voterKindSchema.optional(),
  alive: z.enum(["true", "false"]).optional(),
  gauge: gaugeFilterSchema,
})

export type GaugeListQuery = z.output<typeof gaugeListQuerySchema>

export const incentiveListQuerySchema = z.object({
  network: networkSlugSchema,
  epoch: epochSelectorSchema.default({ kind: "current" }),
  voter: voterKindSchema.optional(),
  gauge: gaugeFilterSchema,
})

export type IncentiveListQuery = z.output<typeof incentiveListQuerySchema>

export const gaugeEpochsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(gaugeEpochsMaxLimit)
    .default(gaugeEpochsDefaultLimit),
})

export type GaugeEpochsQuery = z.output<typeof gaugeEpochsQuerySchema>

export type QueryResult<Query> =
  | { ok: true; query: Query }
  | { ok: false; error: z.ZodError }

/** `gauge` is repeatable (`?gauge=0x…&gauge=0x…`) or comma-separated. */
function rawQuery(
  searchParams: URLSearchParams,
  keys: readonly string[],
): Record<string, unknown> {
  const raw: Record<string, unknown> = {}
  for (const key of keys) {
    const value = searchParams.get(key)
    if (value !== null) raw[key] = value
  }
  const gauges = searchParams
    .getAll("gauge")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
  if (gauges.length > 0) raw.gauge = gauges
  return raw
}

export function parseGaugeListQuery(
  searchParams: URLSearchParams,
): QueryResult<GaugeListQuery> {
  const parsed = gaugeListQuerySchema.safeParse(
    rawQuery(searchParams, ["network", "voter", "alive"]),
  )
  return parsed.success
    ? { ok: true, query: parsed.data }
    : { ok: false, error: parsed.error }
}

export function parseIncentiveListQuery(
  searchParams: URLSearchParams,
): QueryResult<IncentiveListQuery> {
  const parsed = incentiveListQuerySchema.safeParse(
    rawQuery(searchParams, ["network", "epoch", "voter"]),
  )
  return parsed.success
    ? { ok: true, query: parsed.data }
    : { ok: false, error: parsed.error }
}

export function parseGaugeEpochsQuery(
  searchParams: URLSearchParams,
): QueryResult<GaugeEpochsQuery> {
  const limit = searchParams.get("limit")
  const parsed = gaugeEpochsQuerySchema.safeParse(
    limit === null ? {} : { limit },
  )
  return parsed.success
    ? { ok: true, query: parsed.data }
    : { ok: false, error: parsed.error }
}

export const gaugeDetailParamsSchema = z.object({
  network: networkSlugSchema,
  gaugeAddress: addressInputSchema,
})

export const vebtcGaugeParamsSchema = z.object({
  network: networkSlugSchema,
  tokenId: decimalStringSchema.max(78),
})
