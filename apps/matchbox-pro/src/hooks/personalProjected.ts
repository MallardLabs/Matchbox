import { tokenUsdMicro } from "@/lib/tokenUsd"
import type { GaugeTopologyEntry } from "@/lib/topology"
import { type Address, isAddress } from "viem"

export type VoteAllocation = {
  gaugeAddress: Address
  weight: bigint
}

/** One multicall result as wagmi returns it with `allowFailure`. */
export type ReadResult = {
  status: "success" | "failure"
  result?: unknown
}

/**
 * Gauges each lock voted for, from `scan` = `gaugeVote(tokenId, 0..size-1)`
 * per lock, flattened. The list getter reverts past its end, so the first
 * failed index closes that lock's list.
 */
export function votedGaugesFromScan(
  lockCount: number,
  scan: readonly ReadResult[] | undefined,
  size: number,
): Address[][] {
  return Array.from({ length: lockCount }, (_, lock) => {
    const gauges: Address[] = []
    for (let index = 0; index < size; index += 1) {
      const row = scan?.[lock * size + index]
      const gauge = row?.status === "success" ? row.result : undefined
      if (typeof gauge !== "string" || !isAddress(gauge, { strict: false }))
        break
      gauges.push(gauge)
    }
    return gauges
  })
}

/** Lock × voted-gauge pairs, in lock order, for the `votes` reads. */
export function votePairs(
  tokenIds: readonly bigint[],
  voted: readonly Address[][],
): { tokenId: bigint; gauge: Address }[] {
  return tokenIds.flatMap((tokenId, lock) =>
    (voted[lock] ?? []).map((gauge) => ({ tokenId, gauge })),
  )
}

/** Per-lock allocations from `votes(tokenId, gauge)` read for each pair. */
export function allocationsByToken(
  tokenIds: readonly bigint[],
  pairs: readonly { tokenId: bigint; gauge: Address }[],
  votes: readonly ReadResult[] | undefined,
): Map<string, VoteAllocation[]> {
  const map = new Map<string, VoteAllocation[]>(
    tokenIds.map((tokenId) => [tokenId.toString(), []]),
  )
  pairs.forEach((pair, index) => {
    const result = votes?.[index]?.result
    const weight = typeof result === "bigint" ? result : 0n
    if (weight > 0n) {
      map.get(pair.tokenId.toString())?.push({
        gaugeAddress: pair.gauge,
        weight,
      })
    }
  })
  return map
}

/** Sums every lock's weight per gauge (case-insensitive), dropping zeros. */
export function aggregateAllocations(
  byToken: ReadonlyMap<string, readonly VoteAllocation[]>,
): VoteAllocation[] {
  const totals = new Map<string, VoteAllocation>()
  for (const rows of byToken.values()) {
    for (const row of rows) {
      const key = row.gaugeAddress.toLowerCase()
      const previous = totals.get(key)
      totals.set(key, {
        gaugeAddress: previous?.gaugeAddress ?? row.gaugeAddress,
        weight: (previous?.weight ?? 0n) + row.weight,
      })
    }
  }
  return [...totals.values()].filter((row) => row.weight > 0n)
}

/** This epoch's incentives per gauge in micro-USD; unpriced tokens add 0. */
export function incentiveMicroByGauge(
  gauges: readonly GaugeTopologyEntry[],
  prices: { btcPriceUsd: string | null; mezoPriceUsd: string | null },
): Map<string, bigint> {
  const map = new Map<string, bigint>()
  for (const entry of gauges) {
    const micro = entry.rewardTokens.reduce(
      (sum, token) =>
        sum +
        tokenUsdMicro({
          amount: BigInt(token.epochAmount),
          decimals: token.decimals,
          tokenAddress: token.tokenAddress,
          symbol: token.symbol,
          ...prices,
        }),
      0n,
    )
    map.set(entry.gaugeAddress.toLowerCase(), micro)
  }
  return map
}

/**
 * The wallet's pro-rata share of each voted gauge's incentives: per gauge,
 * incentives × summed lock weight / gauge weight (one division per gauge).
 * Gauges without a known, non-zero weight are skipped.
 */
export function projectedMicro(
  aggregated: readonly VoteAllocation[],
  gaugeWeight: (gauge: string) => bigint | undefined,
  incentives: ReadonlyMap<string, bigint>,
): bigint {
  return aggregated.reduce((sum, allocation) => {
    const key = allocation.gaugeAddress.toLowerCase()
    const total = gaugeWeight(key)
    if (!total || allocation.weight === 0n) return sum
    return sum + ((incentives.get(key) ?? 0n) * allocation.weight) / total
  }, 0n)
}
