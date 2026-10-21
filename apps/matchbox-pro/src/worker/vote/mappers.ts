import { type Address, getAddress, isAddress, zeroAddress } from "viem"
import { z } from "zod"
import type {
  WirePoolMarket,
  WireRewardToken,
  WireValidatorMarket,
} from "../../features/vote/contract"

// Pure mapping from multicall results to the vote wire contract. The chain
// reads live in ./chain.ts; everything here is deterministic and tested.

export type CallResult = {
  status: "success" | "failure"
  result?: unknown
}

/** Reward lists are short; a runaway length must not explode the fan-out. */
export const MAX_REWARD_TOKENS = 16

export function okAddress(call: CallResult | undefined): Address | null {
  if (call?.status !== "success" || typeof call.result !== "string") return null
  if (!isAddress(call.result, { strict: false })) return null
  const address = getAddress(call.result)
  return address === zeroAddress ? null : address
}

export function okBigint(call: CallResult | undefined): bigint | null {
  return call?.status === "success" && typeof call.result === "bigint"
    ? call.result
    : null
}

export function okBool(call: CallResult | undefined): boolean {
  return call?.status === "success" && call.result === true
}

export function okText(call: CallResult | undefined, max = 64): string | null {
  if (call?.status !== "success" || typeof call.result !== "string") return null
  const text = call.result.trim()
  return text === "" ? null : text.slice(0, max)
}

function okDecimals(call: CallResult | undefined): number | null {
  if (call?.status !== "success") return null
  const value = Number(call.result)
  return Number.isInteger(value) && value >= 0 && value <= 36 ? value : null
}

export type RewardSlot = { contract: Address; index: bigint }
export type RewardPair = { contract: Address; token: Address }
export type TokenMeta = { symbol: string; decimals: number }

/** `rewards(i)` slots for each reward contract from `rewardsListLength()`. */
export function rewardSlots(
  contracts: readonly Address[],
  lengths: readonly CallResult[],
): RewardSlot[] {
  return contracts.flatMap((contract, index) => {
    const length = okBigint(lengths[index]) ?? 0n
    const capped = Number(
      length > BigInt(MAX_REWARD_TOKENS) ? BigInt(MAX_REWARD_TOKENS) : length,
    )
    return Array.from({ length: capped }, (_, slot) => ({
      contract,
      index: BigInt(slot),
    }))
  })
}

export function rewardPairs(
  slots: readonly RewardSlot[],
  tokens: readonly CallResult[],
): RewardPair[] {
  const seen = new Set<string>()
  return slots.flatMap((slot, index) => {
    const token = okAddress(tokens[index])
    if (!token) return []
    const key = `${slot.contract.toLowerCase()}:${token.toLowerCase()}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ contract: slot.contract, token }]
  })
}

export function uniqueTokens(pairs: readonly RewardPair[]): Address[] {
  return [
    ...new Map(
      pairs.map((pair) => [pair.token.toLowerCase(), pair.token]),
    ).values(),
  ]
}

/** Two reads per token: symbol, decimals. */
export function tokenMeta(
  tokens: readonly Address[],
  results: readonly CallResult[],
): Map<string, TokenMeta> {
  return new Map(
    tokens.map((token, index) => [
      token.toLowerCase(),
      {
        symbol: okText(results[index * 2], 32) ?? "Token",
        decimals: okDecimals(results[index * 2 + 1]) ?? 18,
      },
    ]),
  )
}

/** Epoch amounts per reward contract, dropping empty entries. */
export function groupRewards(
  pairs: readonly RewardPair[],
  amounts: readonly CallResult[],
  meta: ReadonlyMap<string, TokenMeta>,
  prices: ReadonlyMap<string, string>,
): Map<string, WireRewardToken[]> {
  const grouped = new Map<string, WireRewardToken[]>()
  pairs.forEach((pair, index) => {
    const amount = okBigint(amounts[index]) ?? 0n
    if (amount <= 0n) return
    const info = meta.get(pair.token.toLowerCase())
    const key = pair.contract.toLowerCase()
    const list = grouped.get(key) ?? []
    list.push({
      tokenAddress: pair.token,
      symbol: info?.symbol ?? "Token",
      decimals: info?.decimals ?? 18,
      epochAmount: amount.toString(),
      priceUsd: prices.get(pair.token.toLowerCase()) ?? null,
    })
    grouped.set(key, list)
  })
  return grouped
}

function rewardsFor(
  rewards: ReadonlyMap<string, WireRewardToken[]>,
  contract: Address | null,
): WireRewardToken[] {
  return contract ? (rewards.get(contract.toLowerCase()) ?? []) : []
}

const registryDescription = z.object({
  moniker: z.string(),
  details: z.string(),
})

/**
 * `ValidatorPool.validator(op)` returns `[consPubKey, description]`; pull the
 * moniker and details out of whatever shape viem decoded.
 */
export function registryEntry(
  call: CallResult | undefined,
): { moniker: string; details: string } | null {
  if (call?.status !== "success" || !Array.isArray(call.result)) return null
  const parsed = registryDescription.safeParse(call.result[1])
  if (!parsed.success) return null
  return {
    moniker: parsed.data.moniker.trim().slice(0, 140),
    details: parsed.data.details.trim().slice(0, 400),
  }
}

export function mapValidatorMarket(input: {
  chainId: number
  generatedAt: string
  epochStart: bigint
  totalWeight: bigint
  gauges: readonly Address[]
  /** Three per gauge: weights, isAlive, gaugeToBribe. */
  states: readonly CallResult[]
  operators: readonly Address[]
  /** Two per operator: validator(op), validatorToGauge(op). */
  registry: readonly CallResult[]
  rewards: ReadonlyMap<string, WireRewardToken[]>
}): WireValidatorMarket {
  const byGauge = new Map<
    string,
    { operator: Address; moniker: string; details: string }
  >()
  input.operators.forEach((operator, index) => {
    const gauge = okAddress(input.registry[index * 2 + 1])
    if (!gauge) return
    const entry = registryEntry(input.registry[index * 2])
    byGauge.set(gauge.toLowerCase(), {
      operator,
      moniker: entry?.moniker ?? "",
      details: entry?.details ?? "",
    })
  })
  return {
    chainId: input.chainId,
    generatedAt: input.generatedAt,
    epochStart: input.epochStart.toString(),
    totalWeight: input.totalWeight.toString(),
    gauges: input.gauges.map((gauge, index) => {
      const bribe = okAddress(input.states[index * 3 + 2])
      const entry = byGauge.get(gauge.toLowerCase())
      return {
        gauge,
        bribe,
        isAlive: okBool(input.states[index * 3 + 1]),
        weight: (okBigint(input.states[index * 3]) ?? 0n).toString(),
        // Validators that left the PoA set keep their gauge but drop out of
        // the registry; they still show (and still hold bribes).
        operator: entry?.operator ?? null,
        moniker: entry?.moniker ?? "",
        details: entry?.details ?? "",
        rewardTokens: rewardsFor(input.rewards, bribe),
      }
    }),
  }
}

export type GaugedPool = { pool: Address; gauge: Address; weight: bigint }

/** Two reads per pool: gauges(pool), weights(pool). Ungauged pools drop out. */
export function gaugedPools(
  pools: readonly Address[],
  reads: readonly CallResult[],
): GaugedPool[] {
  return pools.flatMap((pool, index) => {
    const gauge = okAddress(reads[index * 2])
    if (!gauge) return []
    return [{ pool, gauge, weight: okBigint(reads[index * 2 + 1]) ?? 0n }]
  })
}

/** Pair tokens (token0/token1) that need a symbol read. */
export function pairTokenAddresses(
  rows: readonly GaugedPool[],
  meta: readonly CallResult[],
): Address[] {
  const tokens = new Map<string, Address>()
  rows.forEach((_, index) => {
    for (const offset of [2, 3]) {
      const token = okAddress(meta[index * 4 + offset])
      if (token) tokens.set(token.toLowerCase(), token)
    }
  })
  return [...tokens.values()]
}

export function mapPoolMarket(input: {
  chainId: number
  generatedAt: string
  epochStart: bigint
  totalWeight: bigint
  rows: readonly GaugedPool[]
  /** Three per row: isAlive, gaugeToBribe, gaugeToFees (all by gauge). */
  states: readonly CallResult[]
  /** Four per row: name, symbol, token0, token1 (by pool). */
  meta: readonly CallResult[]
  pairSymbols: ReadonlyMap<string, string>
  rewards: ReadonlyMap<string, WireRewardToken[]>
}): WirePoolMarket {
  return {
    chainId: input.chainId,
    generatedAt: input.generatedAt,
    epochStart: input.epochStart.toString(),
    totalWeight: input.totalWeight.toString(),
    targets: input.rows.map((row, index) => {
      const token0 = okAddress(input.meta[index * 4 + 2])
      const token1 = okAddress(input.meta[index * 4 + 3])
      const tokens =
        token0 && token1
          ? [token0, token1].map((address) => ({
              address,
              symbol:
                input.pairSymbols.get(address.toLowerCase()) ??
                `${address.slice(0, 6)}…`,
            }))
          : []
      return {
        target: row.pool,
        // Vaults (sMUSD, lending vaults) have no token0/token1.
        kind: tokens.length === 2 ? "pool" : "vault",
        gauge: row.gauge,
        isAlive: okBool(input.states[index * 3]),
        weight: row.weight.toString(),
        name: okText(input.meta[index * 4], 140),
        symbol: okText(input.meta[index * 4 + 1]),
        tokens,
        fees: rewardsFor(input.rewards, okAddress(input.states[index * 3 + 2])),
        bribes: rewardsFor(
          input.rewards,
          okAddress(input.states[index * 3 + 1]),
        ),
      }
    }),
  }
}

const poolsApiSchema = z.object({
  data: z.array(
    z.object({
      token0: z.object({ address: z.string(), price: z.string().nullable() }),
      token1: z.object({ address: z.string(), price: z.string().nullable() }),
    }),
  ),
})

/**
 * Token prices from the Mezo pools API, keyed by lower-case address. These
 * cover pool fee tokens (mT, SATS, …) that have no verified reference price.
 */
export function poolsApiPrices(body: unknown): Map<string, string> {
  const parsed = poolsApiSchema.safeParse(body)
  const prices = new Map<string, string>()
  if (!parsed.success) return prices
  for (const pool of parsed.data.data) {
    for (const token of [pool.token0, pool.token1]) {
      if (
        token.price !== null &&
        /^\d+(\.\d+)?$/.test(token.price) &&
        isAddress(token.address, { strict: false })
      )
        prices.set(token.address.toLowerCase(), token.price)
    }
  }
  return prices
}
