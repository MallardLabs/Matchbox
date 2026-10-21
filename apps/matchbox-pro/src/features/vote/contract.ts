import { getAddress, isAddress } from "viem"
import { z } from "zod"

// Wire contract for the Worker's validator and pool ballot data
// (`src/worker/vote/**`). Chain amounts travel as decimal strings and parse
// back to bigint; addresses arrive checksummed.

const address = z
  .string()
  .refine((value) => isAddress(value, { strict: false }), "address")
  .transform((value) => getAddress(value))

const uint = z
  .string()
  .regex(/^\d+$/)
  .transform((value) => BigInt(value))

// A plain decimal price ("0.990578"), or null when the source has none.
const price = z
  .string()
  .regex(/^\d+(\.\d+)?$/)
  .nullable()

export const wireRewardTokenSchema = z.object({
  tokenAddress: address,
  symbol: z.string().max(32),
  decimals: z.number().int().min(0).max(36),
  /** `tokenRewardsPerEpoch` for the current epoch, base units. */
  epochAmount: uint,
  /** Mezo pools API price; only used when no verified reference price exists. */
  priceUsd: price,
})

export const validatorMarketSchema = z.object({
  chainId: z.number().int(),
  generatedAt: z.string(),
  epochStart: uint,
  totalWeight: uint,
  gauges: z.array(
    z.object({
      gauge: address,
      bribe: address.nullable(),
      isAlive: z.boolean(),
      weight: uint,
      operator: address.nullable(),
      moniker: z.string().max(140),
      details: z.string().max(400),
      rewardTokens: z.array(wireRewardTokenSchema),
    }),
  ),
})

export const poolMarketSchema = z.object({
  chainId: z.number().int(),
  generatedAt: z.string(),
  epochStart: uint,
  totalWeight: uint,
  targets: z.array(
    z.object({
      /** The pool or vault address `PoolsVoter.vote` takes. */
      target: address,
      kind: z.enum(["pool", "vault"]),
      gauge: address,
      isAlive: z.boolean(),
      weight: uint,
      name: z.string().max(140).nullable(),
      symbol: z.string().max(64).nullable(),
      /** Pair tokens for pools; empty for vaults. */
      tokens: z.array(z.object({ address, symbol: z.string().max(32) })),
      fees: z.array(wireRewardTokenSchema),
      bribes: z.array(wireRewardTokenSchema),
    }),
  ),
})

/** Mezo pools API prices by lower-case token address (`/api/vote/prices`). */
export const tokenPricesSchema = z.object({
  chainId: z.number().int(),
  prices: z.record(z.string(), z.string().regex(/^\d+(\.\d+)?$/)),
})

export type WireTokenPrices = z.input<typeof tokenPricesSchema>

/** What the Worker serialises. */
export type WireValidatorMarket = z.input<typeof validatorMarketSchema>
export type WirePoolMarket = z.input<typeof poolMarketSchema>
export type WireRewardToken = z.input<typeof wireRewardTokenSchema>

/** What the client works with after parsing. */
export type ValidatorMarket = z.output<typeof validatorMarketSchema>
export type PoolMarket = z.output<typeof poolMarketSchema>
export type MarketRewardToken = z.output<typeof wireRewardTokenSchema>
