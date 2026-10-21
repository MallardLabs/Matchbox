import { readFileSync } from "node:fs"
import { tokenUsdMicro } from "@/lib/tokenUsd"
import type { GaugeTopologyEntry } from "@/lib/topology"
import { type Address, getAddress } from "viem"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  type ReadResult,
  type VoteAllocation,
  aggregateAllocations,
  allocationsByToken,
  incentiveMicroByGauge,
  projectedMicro,
  votePairs,
  votedGaugesFromScan,
} from "./personalProjected"

// Real mainnet reads (block of 2026-10-21) for four wallets with 1–17 veMEZO
// locks: each lock's `gaugeVote` list, every non-zero `votes(tokenId, gauge)`
// across all 719 boost gauges, and `weights(gauge)` for the voted gauges.
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
const fixtureSchema = z.array(
  z.object({
    wallet: address,
    tokenIds: z.array(z.string()),
    votedLists: z.array(z.array(address)),
    votes: z.array(z.tuple([z.string(), address, z.string()])),
    weights: z.record(z.string(), z.string()),
  }),
)
const FIXTURES = fixtureSchema.parse(
  JSON.parse(
    readFileSync(
      new URL("./__fixtures__/projected-votes.json", import.meta.url),
      "utf8",
    ),
  ),
)

const SCAN = 30
const MEZO = "0x7B7c000000000000000000000000000000000001"
const BTC = "0x7b7C000000000000000000000000000000000000"
const MUSD = "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186"
const UNKNOWN = "0x0000000000000000000000000000000000000abc"
const PRICES = { btcPriceUsd: "108420.5", mezoPriceUsd: "0.0842" }

type Gauge = { address: Address; totalWeight: bigint }

// ---- The previous implementation (votes against every gauge), verbatim in
// behaviour, kept here as the reference the new reads must match.

function oldAllocations(
  tokenIds: bigint[],
  gaugeAddresses: Address[],
  matrix: ReadResult[],
): VoteAllocation[] {
  const byToken = new Map<string, VoteAllocation[]>()
  tokenIds.forEach((tokenId, tokenIndex) => {
    const rows: VoteAllocation[] = []
    gaugeAddresses.forEach((gaugeAddress, gaugeIndex) => {
      const result =
        matrix[tokenIndex * gaugeAddresses.length + gaugeIndex]?.result
      const weight = typeof result === "bigint" ? result : 0n
      if (weight > 0n) rows.push({ gaugeAddress, weight })
    })
    byToken.set(tokenId.toString(), rows)
  })
  const weights = new Map<string, bigint>()
  for (const rows of byToken.values()) {
    for (const row of rows) {
      const key = row.gaugeAddress.toLowerCase()
      weights.set(key, (weights.get(key) ?? 0n) + row.weight)
    }
  }
  return gaugeAddresses
    .map((gaugeAddress) => ({
      gaugeAddress,
      weight: weights.get(gaugeAddress.toLowerCase()) ?? 0n,
    }))
    .filter((row) => row.weight > 0n)
}

function oldProjected(
  aggregated: VoteAllocation[],
  gauges: Gauge[],
  topology: GaugeTopologyEntry[],
): bigint {
  const incentiveByGauge = new Map<string, bigint>()
  for (const entry of topology) {
    const micro = entry.rewardTokens.reduce(
      (sum, token) =>
        sum +
        tokenUsdMicro({
          amount: BigInt(token.epochAmount),
          decimals: token.decimals,
          tokenAddress: token.tokenAddress,
          symbol: token.symbol,
          ...PRICES,
        }),
      0n,
    )
    incentiveByGauge.set(entry.gaugeAddress.toLowerCase(), micro)
  }
  return aggregated.reduce((sum, allocation) => {
    const gauge = gauges.find(
      (item) =>
        item.address.toLowerCase() === allocation.gaugeAddress.toLowerCase(),
    )
    if (!gauge || gauge.totalWeight === 0n || allocation.weight === 0n) {
      return sum
    }
    const incentives =
      incentiveByGauge.get(allocation.gaugeAddress.toLowerCase()) ?? 0n
    return sum + (incentives * allocation.weight) / gauge.totalWeight
  }, 0n)
}

// ---- Chain fakes built from a fixture.

type Chain = {
  tokenIds: bigint[]
  gauges: Gauge[]
  votes: Map<string, bigint>
  lists: Address[][]
  topology: GaugeTopologyEntry[]
}

const ok = (result: unknown): ReadResult => ({ status: "success", result })
const reverted: ReadResult = { status: "failure" }

function distractor(index: number): Address {
  return getAddress(`0x${(index + 1).toString(16).padStart(40, "d")}`)
}

/** Incentives in every priced and unpriced shape, varied per gauge. */
function rewardTokens(seed: number): GaugeTopologyEntry["rewardTokens"] {
  return [
    {
      tokenAddress: MEZO,
      symbol: "MEZO",
      decimals: 18,
      epochAmount: (BigInt(seed * 7919 + 13) * 10n ** 18n).toString(),
    },
    {
      tokenAddress: BTC,
      symbol: "BTC",
      decimals: 18,
      epochAmount: (BigInt(seed * 104729 + 1) * 10n ** 11n).toString(),
    },
    {
      tokenAddress: MUSD,
      symbol: "MUSD",
      decimals: 18,
      epochAmount: (BigInt(seed * 31 + 3) * 10n ** 17n).toString(),
    },
    {
      tokenAddress: UNKNOWN,
      symbol: "SATS",
      decimals: 18,
      epochAmount: (10n ** 21n).toString(),
    },
    { tokenAddress: MEZO, symbol: "MEZO", decimals: 18, epochAmount: "0" },
  ]
}

function chainFrom(fixture: (typeof FIXTURES)[number]): Chain {
  const voted = Object.keys(fixture.weights).map((gauge) => getAddress(gauge))
  // Interleave never-voted gauges so the old full scan has misses to skip.
  const gauges: Gauge[] = []
  voted.forEach((gauge, index) => {
    gauges.push({ address: distractor(index * 3), totalWeight: 10n ** 24n })
    gauges.push({
      address: gauge,
      totalWeight: BigInt(fixture.weights[gauge] ?? "0"),
    })
    gauges.push({ address: distractor(index * 3 + 1), totalWeight: 0n })
  })
  return {
    tokenIds: fixture.tokenIds.map(BigInt),
    gauges,
    votes: new Map(
      fixture.votes.map(([tokenId, gauge, weight]) => [
        `${tokenId}:${gauge.toLowerCase()}`,
        BigInt(weight),
      ]),
    ),
    lists: fixture.votedLists.map((list) =>
      list.map((gauge) => getAddress(gauge)),
    ),
    topology: gauges.map((gauge, index) => ({
      gaugeAddress: gauge.address,
      bribeAddress: null,
      rewardTokens: rewardTokens(index + 1),
    })),
  }
}

function runOld(chain: Chain) {
  const addresses = chain.gauges.map((gauge) => gauge.address)
  const matrix = chain.tokenIds.flatMap((tokenId) =>
    addresses.map((gauge) =>
      ok(chain.votes.get(`${tokenId}:${gauge.toLowerCase()}`) ?? 0n),
    ),
  )
  const aggregated = oldAllocations(chain.tokenIds, addresses, matrix)
  return {
    aggregated,
    projected: oldProjected(aggregated, chain.gauges, chain.topology),
  }
}

function runNew(chain: Chain) {
  const scan = chain.lists.flatMap((list) =>
    Array.from({ length: SCAN }, (_, index) => {
      const gauge = list[index]
      return gauge ? ok(gauge) : reverted
    }),
  )
  const pairs = votePairs(
    chain.tokenIds,
    votedGaugesFromScan(chain.tokenIds.length, scan, SCAN),
  )
  const voteReads = pairs.map((pair) =>
    ok(chain.votes.get(`${pair.tokenId}:${pair.gauge.toLowerCase()}`) ?? 0n),
  )
  const aggregated = aggregateAllocations(
    allocationsByToken(chain.tokenIds, pairs, voteReads),
  )
  const weights = new Map(
    chain.gauges.map((gauge) => [
      gauge.address.toLowerCase(),
      gauge.totalWeight,
    ]),
  )
  return {
    aggregated,
    projected: projectedMicro(
      aggregated,
      (gauge) => weights.get(gauge),
      incentiveMicroByGauge(chain.topology, PRICES),
    ),
  }
}

function byGauge(rows: VoteAllocation[]): Record<string, string> {
  return Object.fromEntries(
    rows
      .map(
        (row) =>
          [row.gaugeAddress.toLowerCase(), row.weight.toString()] as const,
      )
      .sort(([a], [b]) => a.localeCompare(b)),
  )
}

describe("projected this epoch: voted-gauge reads match the full scan", () => {
  it.each(FIXTURES.map((fixture) => [fixture.wallet, fixture] as const))(
    "%s",
    (_wallet, fixture) => {
      const chain = chainFrom(fixture)
      const before = runOld(chain)
      const after = runNew(chain)
      expect(after.projected).toBe(before.projected)
      expect(byGauge(after.aggregated)).toEqual(byGauge(before.aggregated))
      expect(after.aggregated.length > 0).toBe(before.aggregated.length > 0)
      expect(before.projected).toBeGreaterThan(0n)
    },
  )

  it("sums locks per gauge before dividing, like the full scan", () => {
    const shared = getAddress(`0x${"1".repeat(40)}`)
    const chain: Chain = {
      tokenIds: [1n, 2n, 3n],
      gauges: [{ address: shared, totalWeight: 3n }],
      // Divided per lock this would floor to 0 + 0; summed first it's 1.
      votes: new Map([
        [`1:${shared.toLowerCase()}`, 1n],
        [`2:${shared.toLowerCase()}`, 1n],
      ]),
      lists: [[shared], [shared], []],
      topology: [
        {
          gaugeAddress: shared,
          bribeAddress: null,
          rewardTokens: [
            {
              tokenAddress: MUSD,
              symbol: "MUSD",
              decimals: 18,
              epochAmount: "2000000000000",
            },
          ],
        },
      ],
    }
    expect(runNew(chain).projected).toBe(runOld(chain).projected)
    expect(runNew(chain).projected).toBe(1n)
  })

  it("skips gauges with no weight and wallets that never voted", () => {
    const empty = getAddress(`0x${"2".repeat(40)}`)
    const chain: Chain = {
      tokenIds: [7n, 8n],
      gauges: [{ address: empty, totalWeight: 0n }],
      votes: new Map([[`7:${empty.toLowerCase()}`, 5n]]),
      lists: [[empty], []],
      topology: [
        {
          gaugeAddress: empty,
          bribeAddress: null,
          rewardTokens: rewardTokens(1),
        },
      ],
    }
    expect(runNew(chain)).toEqual(runOld(chain))
    expect(runNew(chain).projected).toBe(0n)

    const none: Chain = { ...chain, votes: new Map(), lists: [[], []] }
    expect(runNew(none).aggregated).toEqual([])
    expect(runOld(none).aggregated).toEqual([])
  })

  it("ends a lock's list at the first reverted index", () => {
    const a = getAddress(`0x${"3".repeat(40)}`)
    const b = getAddress(`0x${"4".repeat(40)}`)
    expect(
      votedGaugesFromScan(
        2,
        [ok(a), ok(b), reverted, ok(a), reverted, reverted],
        3,
      ),
    ).toEqual([[a, b], [a]])
    expect(votedGaugesFromScan(1, undefined, 3)).toEqual([[]])
  })
})
