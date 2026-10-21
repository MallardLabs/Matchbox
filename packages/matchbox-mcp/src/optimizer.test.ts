import { CHAIN_ID, CONTRACTS } from "@repo/shared/contracts"
import { describe, expect, it } from "vitest"
import { optimizeRewardAllocations } from "@repo/shared/rewards"
import { gaugeSnapshotSchema } from "./adapters/matchbox-gauges"
import {
  REWARD_OPTIMIZER_VERSION,
  optimizeGaugeSnapshot,
  votingPositionSchema,
} from "./optimizer"

const snapshot = gaugeSnapshotSchema.parse({
  chainId: CHAIN_ID.mainnet,
  blockNumber: "12482113",
  epochStart: "1786320000",
  generatedAt: "2026-08-11T12:00:00.000Z",
  source: {
    name: "Matchbox mainnet indexer + Mezo RPC",
    url: "https://app.matchbox.markets",
    status: "live",
  },
  gauges: [
    {
      id: "pool-a",
      address: "0x1111111111111111111111111111111111111111",
      targetAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      name: "BTC / MUSD",
      type: "pool",
      governanceAsset: "veBTC",
      votingBucket: "pool-gauges",
      votingContract: CONTRACTS.mainnet.poolsVoter,
      depositedUsd: "1000",
      currentWeight: "100000000000000000000",
      consistencyBps: 10_000,
      fundedEpochs: 8,
      observedEpochs: 8,
      tokenPair: ["BTC", "MUSD"],
      pricingStatus: "complete",
      unpricedTokenCount: 0,
    },
    {
      id: "pool-b",
      address: "0x2222222222222222222222222222222222222222",
      targetAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      name: "MEZO / MUSD",
      type: "pool",
      governanceAsset: "veBTC",
      votingBucket: "pool-gauges",
      votingContract: CONTRACTS.mainnet.poolsVoter,
      depositedUsd: "400",
      currentWeight: "10000000000000000000",
      consistencyBps: 5000,
      fundedEpochs: 4,
      observedEpochs: 8,
      tokenPair: ["MEZO", "MUSD"],
      pricingStatus: "complete",
      unpricedTokenCount: 0,
    },
  ],
})

describe("gauge optimizer", () => {
  it("allocates a full ballot in exact basis points", () => {
    const position = votingPositionSchema.parse({
      governanceAsset: "veBTC",
      tokenId: "42",
      votingPower: "50000000000000000000",
      votingPowerFormatted: "50",
    })
    const result = optimizeGaugeSnapshot({ snapshot, positions: [position] })
    const ballot = result.ballots[0]

    expect(ballot).toBeDefined()
    expect(
      ballot?.allocations.reduce(
        (total, allocation) => total + allocation.basisPoints,
        0,
      ),
    ).toBe(10_000)
    expect(result.projectedTotalUsd).toMatch(/^[1-9]/)
    expect(result.calculationVersion).toBe(REWARD_OPTIMIZER_VERSION)
  })

  it("returns rankings without inventing an eligible wallet position", () => {
    const result = optimizeGaugeSnapshot({ snapshot, positions: [] })

    expect(result.ballots).toEqual([])
    expect(result.projectedTotalUsd).toBe("0.00")
    expect(result.notices).toContain(
      "No eligible veBTC lock was found for this wallet.",
    )
  })

  it("matches Pro's reward optimizer exactly (one optimizer)", () => {
    const position = votingPositionSchema.parse({
      governanceAsset: "veBTC",
      tokenId: "42",
      votingPower: "50000000000000000000",
      votingPowerFormatted: "50",
    })
    const result = optimizeGaugeSnapshot({ snapshot, positions: [position] })
    const direct = optimizeRewardAllocations({
      gauges: snapshot.gauges.map((gauge) => ({
        id: gauge.id,
        existingWeight: BigInt(gauge.currentWeight),
        incentiveValueMicroUsd: BigInt(gauge.depositedUsd) * 1_000_000n,
      })),
      votingPowers: [50n * 10n ** 18n],
    })
    expect(
      result.ballots[0]?.allocations.map((allocation) => [
        allocation.gaugeId,
        allocation.basisPoints,
      ]),
    ).toEqual(
      direct?.allocations.map((allocation) => [
        allocation.id,
        Number(allocation.basisPoints),
      ]),
    )
  })

  it("optimizes multiple locks jointly, one independent ballot each", () => {
    const positions = ["42", "43"].map((tokenId) =>
      votingPositionSchema.parse({
        governanceAsset: "veBTC",
        tokenId,
        votingPower: "50000000000000000000",
        votingPowerFormatted: "50",
      }),
    )
    const result = optimizeGaugeSnapshot({ snapshot, positions })

    expect(result.positions).toHaveLength(2)
    expect(result.ballots.map((ballot) => ballot.position.tokenId)).toEqual([
      "42",
      "43",
    ])
    expect(
      result.ballots.every(
        (ballot) =>
          ballot.allocations.reduce(
            (total, allocation) => total + allocation.basisPoints,
            0,
          ) === 10_000,
      ),
    ).toBe(true)
  })
})
