import { CONTRACTS } from "@repo/shared/contracts"
import { describe, expect, it } from "vitest"
import { optimizedBallotSchema } from "./optimizer"
import { createVoteAllocationDiff } from "./proposals"

function ballot(basisPoints: number, projectedReturnUsd: string) {
  return optimizedBallotSchema.parse({
    votingContract: CONTRACTS.mainnet.poolsVoter,
    votingBucket: "pool-gauges",
    governanceAsset: "veBTC",
    position: {
      governanceAsset: "veBTC",
      tokenId: "42",
      votingPower: "1000000000000000000",
      votingPowerFormatted: "1",
    },
    allocations: [
      {
        gaugeId: "pool-a",
        gaugeAddress: "0x1111111111111111111111111111111111111111",
        gaugeName: "BTC / MUSD",
        gaugeType: "pool",
        tokenPair: ["BTC", "MUSD"],
        pricingStatus: "complete",
        percentage: basisPoints / 100,
        basisPoints,
        depositedUsd: "100",
        projectedReturnUsd,
        consistencyBps: 10_000,
      },
      {
        gaugeId: "pool-b",
        gaugeAddress: "0x2222222222222222222222222222222222222222",
        gaugeName: "MEZO / MUSD",
        gaugeType: "pool",
        tokenPair: ["MEZO", "MUSD"],
        pricingStatus: "complete",
        percentage: (10_000 - basisPoints) / 100,
        basisPoints: 10_000 - basisPoints,
        depositedUsd: "100",
        projectedReturnUsd: "0",
        consistencyBps: 10_000,
      },
    ],
    projectedReturnUsd,
  })
}

describe("proposal refresh diff", () => {
  it("marks a one-percentage-point allocation change as material", () => {
    const diff = createVoteAllocationDiff({
      before: [ballot(5_000, "100")],
      after: [ballot(5_100, "100")],
      callsChanged: false,
    })

    expect(diff.material).toBe(true)
    expect(diff.allocationChanged).toBe(true)
    expect(diff.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ deltaBasisPoints: 100 }),
      ]),
    )
  })

  it("marks a one-percent projected-USD change as material", () => {
    const diff = createVoteAllocationDiff({
      before: [ballot(5_000, "100")],
      after: [ballot(5_000, "101")],
      callsChanged: false,
    })

    expect(diff.material).toBe(true)
    expect(diff.projectedChangeMaterial).toBe(true)
  })
})
