import { describe, expect, it } from "vitest"
import token111 from "./fixtures/token111.json"
import token1629a from "./fixtures/token1629a.json"
import token1629b from "./fixtures/token1629b.json"
import {
  type Checkpoint,
  EPOCH,
  claimableTotal,
  earnStatus,
  epochStartOf,
  pairShares,
  priorIndex,
} from "./math"

// Golden fixtures: head-state reads from a real boost bribe on Mezo mainnet
// (scripts in the PR notes), including the contract's own `earned()`.
type Fixture = {
  currentEpoch: string
  checkpoints: string[][]
  supplyCheckpoints: string[][]
  tokens: Array<{
    token: string
    lastEarn: string
    earned: string
    rewardsPerEpoch: Record<string, string>
  }>
}

function checkpoints(rows: string[][]): Checkpoint[] {
  return rows.map(([timestamp = "0", value = "0"]) => ({
    timestamp: BigInt(timestamp),
    value: BigInt(value),
  }))
}

function sharesFor(fixture: Fixture) {
  const [token] = fixture.tokens
  if (!token) throw new Error("fixture has no token")
  return {
    token,
    shares: pairShares({
      balances: checkpoints(fixture.checkpoints),
      supplies: checkpoints(fixture.supplyCheckpoints),
      deposited: (epoch) =>
        BigInt(token.rewardsPerEpoch[epoch.toString()] ?? "0"),
      lastEarn: BigInt(token.lastEarn),
      currentEpoch: BigInt(fixture.currentEpoch),
    }),
  }
}

describe("per-epoch boost bribe earnings (golden)", () => {
  it("sums to earned() for a lock that never claimed (tokenId 111)", () => {
    const { token, shares } = sharesFor(token111)
    expect(token.earned).toBe("702670804524943038744")
    expect(claimableTotal(shares)).toBe(BigInt(token.earned))
    expect(shares.some((share) => share.status === "claimed")).toBe(false)
    const paying = shares.filter((share) => share.amount > 0n)
    expect(paying).toHaveLength(1)
    expect(paying[0]?.epochStart).toBe(1_775_692_800n)
  })

  it("marks everything before the last claim's epoch claimed (tokenId 1629)", () => {
    for (const fixture of [token1629a, token1629b]) {
      const { token, shares } = sharesFor(fixture)
      expect(token.earned).toBe("0")
      expect(claimableTotal(shares)).toBe(0n)
      const sealed = shares.filter((share) => share.status !== "pending")
      expect(sealed.every((share) => share.status === "claimed")).toBe(true)
      const current = shares[shares.length - 1]
      expect(current?.epochStart).toBe(BigInt(fixture.currentEpoch))
      expect(current?.status).toBe("pending")
    }
    const { shares } = sharesFor(token1629b)
    const claimed = shares.filter(
      (share) => share.status === "claimed" && share.amount > 0n,
    )
    expect(claimed.length).toBeGreaterThan(1)
  })

  it("starts at the epoch of the first checkpoint", () => {
    const { shares } = sharesFor(token111)
    const first = token111.checkpoints[0]?.[0] ?? "0"
    expect(shares[0]?.epochStart).toBe(epochStartOf(BigInt(first)))
  })
})

describe("priorIndex", () => {
  const series = checkpoints([
    ["100", "1"],
    ["200", "2"],
    ["300", "3"],
    ["400", "4"],
  ])

  it("returns the last checkpoint at or before the timestamp", () => {
    expect(priorIndex(series, 250n)).toBe(1)
    expect(priorIndex(series, 300n)).toBe(2)
    expect(priorIndex(series, 399n)).toBe(2)
  })

  it("handles the ends like the contract", () => {
    expect(priorIndex(series, 50n)).toBe(0)
    expect(priorIndex(series, 400n)).toBe(3)
    expect(priorIndex(series, 10_000n)).toBe(3)
    expect(priorIndex([], 10n)).toBe(0)
  })
})

describe("earnStatus", () => {
  const current = 10n * EPOCH
  it("is pending for the current epoch", () => {
    expect(earnStatus(current, 0n, current)).toBe("pending")
  })
  it("is claimed only before the epoch of the last claim", () => {
    const lastEarn = 7n * EPOCH + 3_600n
    expect(earnStatus(6n * EPOCH, lastEarn, current)).toBe("claimed")
    expect(earnStatus(7n * EPOCH, lastEarn, current)).toBe("claimable")
    expect(earnStatus(9n * EPOCH, lastEarn, current)).toBe("claimable")
  })
  it("is claimable when never claimed", () => {
    expect(earnStatus(0n, 0n, current)).toBe("claimable")
  })
})

describe("epoch shares", () => {
  it("uses the balance and supply at the epoch's last second, floor division", () => {
    const shares = pairShares({
      balances: checkpoints([
        [String(EPOCH + 10n), "3"],
        [String(2n * EPOCH + 5n), "0"],
      ]),
      supplies: checkpoints([
        [String(EPOCH + 10n), "7"],
        [String(2n * EPOCH + 5n), "4"],
      ]),
      deposited: () => 100n,
      lastEarn: 0n,
      currentEpoch: 3n * EPOCH,
    })
    expect(shares.map((share) => share.amount)).toEqual([42n, 0n, 0n])
    expect(shares.map((share) => share.status)).toEqual([
      "claimable",
      "claimable",
      "pending",
    ])
  })

  it("treats an empty supply as 1 like the contract", () => {
    const [share] = pairShares({
      balances: checkpoints([[String(EPOCH), "5"]]),
      supplies: checkpoints([[String(EPOCH), "0"]]),
      deposited: () => 2n,
      lastEarn: 0n,
      currentEpoch: 2n * EPOCH,
    })
    expect(share?.supply).toBe(1n)
    expect(share?.amount).toBe(10n)
  })
})
