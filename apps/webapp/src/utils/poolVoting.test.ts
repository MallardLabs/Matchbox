import assert from "node:assert/strict"
import test from "node:test"
import {
  type PoolVoteSortEntry,
  addNullableMicroUsd,
  aprNumberToBasisPoints,
  comparePoolVoteSortEntries,
  formatCompactMicroUsd,
  pricedRewardMicroUsd,
  sumUsdStringsMicroUsd,
  totalRewardMicroUsd,
  usdStringToMicroUsd,
} from "./poolVoting"

test("scales API USD strings to integer micro-USD", () => {
  assert.equal(usdStringToMicroUsd("12.345678"), 12_345_678n)
  assert.equal(usdStringToMicroUsd("0.1"), 100_000n)
  assert.equal(usdStringToMicroUsd("1e3"), 1_000_000_000n)
  assert.equal(usdStringToMicroUsd(""), 0n)
  assert.equal(usdStringToMicroUsd(null), 0n)
  assert.equal(usdStringToMicroUsd("not a number"), 0n)
})

test("sums USD strings without floating-point drift", () => {
  assert.equal(sumUsdStringsMicroUsd(["0.1", "0.2"]), 300_000n)
  assert.equal(sumUsdStringsMicroUsd([]), 0n)
})

test("treats a reward total as unknown when any token is unpriced", () => {
  assert.equal(
    totalRewardMicroUsd([{ valueMicroUsd: 5n }, { valueMicroUsd: 7n }]),
    12n,
  )
  assert.equal(
    totalRewardMicroUsd([{ valueMicroUsd: 5n }, { valueMicroUsd: null }]),
    null,
  )
  assert.equal(totalRewardMicroUsd([]), 0n)
})

test("keeps the priced portion of rewards for the optimizer", () => {
  assert.deepEqual(
    pricedRewardMicroUsd([
      { valueMicroUsd: 5n },
      { valueMicroUsd: null },
      { valueMicroUsd: 7n },
    ]),
    { valueMicroUsd: 12n, unpricedCount: 1 },
  )
})

test("propagates unknown totals when combining bribes and fees", () => {
  assert.equal(addNullableMicroUsd(1n, 2n), 3n)
  assert.equal(addNullableMicroUsd(null, 2n), null)
  assert.equal(addNullableMicroUsd(1n, null), null)
})

function entry(overrides: Partial<PoolVoteSortEntry>): PoolVoteSortEntry {
  return {
    pool: "0x0000000000000000000000000000000000000001",
    name: "BTC / MUSD",
    weight: 0n,
    shareBasisPoints: 0n,
    rewardsMicroUsd: 0n,
    apyBasisPoints: null,
    tvlMicroUsd: 0n,
    volumeMicroUsd: 0n,
    ...overrides,
  }
}

test("sorts pools by rewards with unknown totals last when descending", () => {
  const sorted = [
    entry({ pool: "0xa", name: "A", rewardsMicroUsd: null }),
    entry({ pool: "0xb", name: "B", rewardsMicroUsd: 10n }),
    entry({ pool: "0xc", name: "C", rewardsMicroUsd: 20n }),
  ].sort((a, b) => comparePoolVoteSortEntries(a, b, "rewards", "desc"))
  assert.deepEqual(
    sorted.map((item) => item.name),
    ["C", "B", "A"],
  )
})

test("ranks unbounded APY above every finite APY", () => {
  const sorted = [
    entry({ pool: "0xa", name: "A", apyBasisPoints: 5_000n }),
    entry({ pool: "0xb", name: "B", apyBasisPoints: -1n }),
    entry({ pool: "0xc", name: "C", apyBasisPoints: null }),
  ].sort((a, b) => comparePoolVoteSortEntries(a, b, "apy", "desc"))
  assert.deepEqual(
    sorted.map((item) => item.name),
    ["B", "A", "C"],
  )
})

test("sorts pools by TVL and volume and breaks ties by name", () => {
  const byTvl = [
    entry({ pool: "0xa", name: "A", tvlMicroUsd: 1n }),
    entry({ pool: "0xb", name: "B", tvlMicroUsd: 3n }),
  ].sort((a, b) => comparePoolVoteSortEntries(a, b, "tvl", "desc"))
  assert.deepEqual(
    byTvl.map((item) => item.name),
    ["B", "A"],
  )

  const tied = [
    entry({ pool: "0xb", name: "B", volumeMicroUsd: 1n }),
    entry({ pool: "0xa", name: "A", volumeMicroUsd: 1n }),
  ].sort((a, b) => comparePoolVoteSortEntries(a, b, "volume", "desc"))
  assert.deepEqual(
    tied.map((item) => item.name),
    ["A", "B"],
  )
})

test("formats headline USD figures compactly", () => {
  assert.equal(formatCompactMicroUsd(0n), "$0.00")
  assert.equal(formatCompactMicroUsd(999_990_000n), "$999.99")
  assert.equal(formatCompactMicroUsd(1_500_000_000n), "$1.5K")
  assert.equal(formatCompactMicroUsd(1_239_000_000_000n), "$1.23M")
  assert.equal(formatCompactMicroUsd(2_000_000_000_000_000n), "$2B")
})

test("rounds API APR numbers to non-negative basis points", () => {
  assert.equal(aprNumberToBasisPoints(1234.6), 1235n)
  assert.equal(aprNumberToBasisPoints(-5), 0n)
  assert.equal(aprNumberToBasisPoints(Number.NaN), 0n)
})
