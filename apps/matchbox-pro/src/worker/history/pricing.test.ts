import { beforeEach, describe, expect, it, vi } from "vitest"

// The block search runs against a fake chain: block n is at 1_000 + 4n
// seconds, except a 60s stall at block 500 (to break naive extrapolation).
function blockTime(number: bigint): bigint {
  return 1_000n + number * 4n + (number >= 500n ? 60n : 0n)
}
const HEAD = 10_000n
const getBlock = vi.fn(
  async ({
    blockNumber,
  }: { blockNumber?: bigint; blockTag?: string }): Promise<{
    number: bigint
    timestamp: bigint
  }> => {
    const number = blockNumber ?? HEAD
    return { number, timestamp: blockTime(number) }
  },
)

vi.mock("./chain", () => ({
  mezoHistoryClient: () => ({ getBlock }),
  ORACLE_ABI: [],
}))

const {
  baseBlockAtOrBefore,
  mezoBlocksAtOrBefore,
  mezoPriceFromPool,
  nextGuess,
  tokenPrice,
  usdMicro,
} = await import("./pricing")

describe("mezoBlocksAtOrBefore", () => {
  beforeEach(() => {
    getBlock.mockClear()
  })

  it("finds a block at or before each target within two minutes", async () => {
    const targets = [2_000n, 3_050n, 21_000n, 40_000n]
    const found = await mezoBlocksAtOrBefore(targets)
    for (const target of targets) {
      const block = found.get(target)
      expect(block).toBeTruthy()
      if (!block) continue
      expect(block.timestamp).toBeLessThanOrEqual(target)
      expect(target - block.timestamp).toBeLessThanOrEqual(120n)
    }
    // Batched rounds, not a per-target binary search.
    expect(getBlock.mock.calls.length).toBeLessThan(targets.length * 8)
  })

  it("uses the head for targets at or after it", async () => {
    const found = await mezoBlocksAtOrBefore([blockTime(HEAD) + 100n])
    expect(found.get(blockTime(HEAD) + 100n)?.number).toBe(HEAD)
  })
})

describe("nextGuess", () => {
  it("interpolates inside the bracket and never leaves it", () => {
    const head = { number: 1_000n, timestamp: 5_000n }
    const guess = nextGuess(
      {
        target: 1_500n,
        guess: 0n,
        below: { number: 100n, timestamp: 1_000n },
        above: { number: 300n, timestamp: 2_000n },
        done: false,
      },
      head,
    )
    expect(guess).toBe(200n)
  })
})

describe("prices", () => {
  it("maps Base timestamps to the exact 2s block", () => {
    // Verified on mainnet.base.org: block 52616526 is at 1792022399.
    expect(baseBlockAtOrBefore(1_792_022_399n)).toBe(52_616_526n)
  })

  it("reads MEZO from slot0 and rejects empty pools", () => {
    const sqrt = 4_426_822_676_624_806_263_466_413_680n
    expect(mezoPriceFromPool(sqrt, 1n)?.startsWith("0.0031")).toBe(true)
    expect(mezoPriceFromPool(sqrt, 0n)).toBeNull()
    expect(mezoPriceFromPool(0n, 1n)).toBeNull()
  })

  it("prices stables at $1 and leaves unknown tokens unpriced", () => {
    const refs = { btcUsd: "80000", mezoUsd: null }
    expect(
      tokenPrice("0xdd468a1ddc392dcdbef6db6e34e89aa338f9f186", "MUSD", refs),
    ).toBe("1")
    expect(
      tokenPrice("0x7b7c000000000000000000000000000000000000", "BTC", refs),
    ).toBe("80000")
    expect(
      tokenPrice("0x7b7c000000000000000000000000000000000001", "MEZO", refs),
    ).toBeNull()
    expect(
      tokenPrice("0x9d36f8f62347538440a212e9162f534f797542df", "SATS", refs),
    ).toBeNull()
  })

  it("never turns a missing price into $0", () => {
    expect(usdMicro(10n ** 18n, 18, null)).toBeNull()
    expect(usdMicro(10n ** 18n, 18, "2.5")).toBe(2_500_000n)
  })
})
