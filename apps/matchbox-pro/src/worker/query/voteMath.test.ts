import { describe, expect, it } from "vitest"
import { optimizeRewardAllocations } from "../../lib/rewardOptimizer"
import { PRICES, fakeTarget } from "./fakes"
import {
  lockShare,
  optimizeCapped,
  optimizerGauges,
  priceTarget,
  projectAllocation,
} from "./voteMath"

const E18 = 10n ** 18n

describe("optimizer inputs and projection", () => {
  const targets = [
    fakeTarget({
      index: 1,
      name: "A",
      weight: 1_000n * E18,
      mezo: 30_000n * E18,
    }),
    fakeTarget({
      index: 2,
      name: "B",
      weight: 2_000n * E18,
      mezo: 40_000n * E18,
    }),
    fakeTarget({
      index: 3,
      name: "C",
      weight: 3_000n * E18,
      mezo: 20_000n * E18,
    }),
  ]
  const powers = [12_400n * E18, 488n * E18]

  it("projects the optimizer's ballot to the same micro-USD (Vote page parity)", () => {
    const gauges = optimizerGauges(
      targets.map((target) => priceTarget(target, PRICES, 0n)),
    )
    const result = optimizeRewardAllocations({ gauges, votingPowers: powers })
    if (!result) throw new Error("expected an allocation")
    const projection = projectAllocation({
      gauges,
      votingPowers: powers,
      bps: new Map(
        result.allocations.map((allocation) => [
          allocation.id,
          allocation.basisPoints,
        ]),
      ),
    })
    expect(projection.total).toBe(result.projectedRewardMicroUsd)
    for (const allocation of result.allocations) {
      expect(projection.perTarget.get(allocation.id)?.projected).toBe(
        allocation.projectedRewardMicroUsd,
      )
    }
    expect(
      result.allocations.reduce(
        (sum, allocation) => sum + allocation.basisPoints,
        0n,
      ),
    ).toBe(10_000n)
  })

  it("subtracts the selected locks' standing votes from competing weight", () => {
    const own = 400n * E18
    const priced = priceTarget(
      targets[0] ??
        targets[1] ??
        fakeTarget({ index: 9, name: "x", weight: 0n, mezo: 0n }),
      PRICES,
      own,
    )
    expect(priced.existingWeight).toBe(600n * E18)
    const clamped = priceTarget(
      targets[0] ?? fakeTarget({ index: 9, name: "x", weight: 0n, mezo: 0n }),
      PRICES,
      5_000n * E18,
    )
    expect(clamped.existingWeight).toBe(0n)
  })

  it("marks unpriced incentives instead of valuing them at $0", () => {
    const target = {
      ...fakeTarget({ index: 5, name: "D", weight: E18, mezo: E18 }),
      incentives: [
        {
          contract: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb5" as const,
          token: "0x9999999999999999999999999999999999999999" as const,
          symbol: "REKT",
          decimals: 18,
          amount: 5n * E18,
        },
      ],
    }
    const priced = priceTarget(target, PRICES, 0n)
    expect(priced.pricingStatus).toBe("unpriced")
    expect(priced.unpricedTokens).toEqual(["REKT"])
    expect(optimizerGauges([priced])).toEqual([])
  })

  it("caps a ballot at the voter's maxVotingNum", () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      priceTarget(
        fakeTarget({
          index: index + 10,
          name: `G${index}`,
          weight: 0n,
          mezo: BigInt(index + 1) * 1_000n * E18,
        }),
        PRICES,
        0n,
      ),
    )
    const bps = optimizeCapped({
      gauges: optimizerGauges(many),
      votingPowers: [1_000_000n * E18],
      maxTargets: 30,
    })
    if (!bps) throw new Error("expected an allocation")
    expect(bps.size).toBeLessThanOrEqual(30)
    expect([...bps.values()].reduce((sum, value) => sum + value, 0n)).toBe(
      10_000n,
    )
  })

  it("splits a target's projection across locks by power", () => {
    const share = lockShare({
      projected: 1_000_000n,
      voteWeight: 100n,
      lockPower: 100n,
      bps: 10_000n,
    })
    expect(share).toBe(1_000_000n)
    const half = lockShare({
      projected: 1_000_000n,
      voteWeight: 200n,
      lockPower: 100n,
      bps: 10_000n,
    })
    expect(half).toBe(500_000n)
  })
})
