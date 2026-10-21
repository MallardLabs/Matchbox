import {
  encodeFunctionResult,
  hexToBigInt,
  multicall3Abi,
  parseAbi,
} from "viem"
import { afterEach, describe, expect, it, vi } from "vitest"

// Epoch-close prices against a Base RPC that answers HTTP 429, through the
// real viem HTTP transport (global fetch stubbed). The Mezo side is a fake
// chain: block n at T0 + 4n, and the Skip oracle reads $80,000.

const T0 = 1_780_000_000n
const HEAD = 3_000_000n

vi.mock("./chain", () => ({
  ORACLE_ABI: [],
  mezoHistoryClient: () => ({
    getBlock: async ({ blockNumber }: { blockNumber?: bigint }) => {
      const number = blockNumber ?? HEAD
      return { number, timestamp: T0 + number * 4n }
    },
    readContract: async ({ functionName }: { functionName: string }) =>
      functionName === "decimals" ? 8 : [1n, 8_000_000_000_000n, 0n, 0n, 1n],
  }),
}))

const { clearHistoryMemo } = await import("./store")
const { epochClosePrices } = await import("./pricing")
const { EPOCH } = await import("./math")
const { earningsView, isPartial } = await import("./views")

const POOL_ABI = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, bool unlocked)",
  "function liquidity() view returns (uint128)",
])
const SQRT_PRICE = 4_426_822_676_624_806_263_466_413_680n
const POOL_RESULT = encodeFunctionResult({
  abi: multicall3Abi,
  functionName: "aggregate3",
  result: [
    {
      success: true,
      returnData: encodeFunctionResult({
        abi: POOL_ABI,
        functionName: "slot0",
        result: [SQRT_PRICE, 0, 0, 0, 0, true],
      }),
    },
    {
      success: true,
      returnData: encodeFunctionResult({
        abi: POOL_ABI,
        functionName: "liquidity",
        result: 10n ** 24n,
      }),
    },
  ],
})

const NOW = T0 + HEAD * 4n
const CURRENT = NOW - (NOW % EPOCH)
const EPOCHS = [CURRENT - 3n * EPOCH, CURRENT - 2n * EPOCH, CURRENT - EPOCH]
const instant = { deps: { sleep: async () => undefined, random: () => 0 } }

/** Base RPC stub: each block fails `failures(block)` times with 429 first. */
function stubBase(failures: (block: bigint) => number): {
  calls: () => number
} {
  const seen = new Map<bigint, number>()
  let calls = 0
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      calls += 1
      const body = JSON.parse(String(init?.body)) as {
        id: number
        params: [unknown, string]
      }
      const block = hexToBigInt(body.params[1] as `0x${string}`)
      const count = (seen.get(block) ?? 0) + 1
      seen.set(block, count)
      if (count <= failures(block)) {
        return new Response("Too Many Requests", { status: 429 })
      }
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: body.id, result: POOL_RESULT }),
        { headers: { "content-type": "application/json" } },
      )
    }),
  )
  return { calls: () => calls }
}

const MEZO = "0x7b7c000000000000000000000000000000000001" as const
const model = {
  tokenIds: [1n],
  currentEpoch: CURRENT,
  verified: true,
  lines: [
    {
      tokenId: 1n,
      gauge: "0x449b06b9b6c9b649b610105d1a5e337e1d6d3d1e" as const,
      bribe: "0xb91210b513d7c1515be24c476d807239b56b1b5e" as const,
      token: { token: MEZO, symbol: "MEZO", decimals: 18, currentDeposit: 0n },
      shares: EPOCHS.map((epochStart) => ({
        epochStart,
        amount: 1_000n * 10n ** 18n,
        status: "claimable" as const,
        balance: 1n,
        supply: 2n,
        deposited: 2n,
      })),
      lastEarn: 0n,
      earned: 3_000n * 10n ** 18n,
    },
  ],
}

async function book(): Promise<Parameters<typeof earningsView>[1]> {
  const closes = await epochClosePrices(EPOCHS, {}, NOW, instant)
  return { now: { btcUsd: "80000", mezoUsd: "0.003" }, closes }
}

afterEach(() => {
  vi.unstubAllGlobals()
  clearHistoryMemo()
})

describe("epoch-close prices under Base 429s", () => {
  it("settles every epoch through bursts of 429s, with stable totals", async () => {
    stubBase(() => 2)
    const first = await book()
    expect([...first.closes.values()].every((row) => row.settled)).toBe(true)
    const totals = earningsView(model, first, 3).totals.realized

    clearHistoryMemo()
    stubBase((block) => Number(block % 5n))
    const second = await book()
    const again = earningsView(model, second, 3)

    expect(again.partial).toBe(false)
    expect(again.totals.realized).toEqual(totals)
    expect(totals.unpriced).toBe(0)
    expect(totals.usdAtEarn).toBe("9.365829")
  })

  it("marks a persistent outage partial and fills it on the next request", async () => {
    const outage = stubBase(() => Number.POSITIVE_INFINITY)
    const down = await book()
    expect([...down.closes.values()].some((row) => row.settled)).toBe(false)
    expect(isPartial(model, down)).toBe(true)
    const partialView = earningsView(model, down, 3)
    expect(partialView.partial).toBe(true)
    // Never $0: USD is null (all lines unpriced) until prices settle.
    expect(partialView.totals.realized.usdAtEarn).toBeNull()
    // Bounded: 6 attempts per epoch, no unbounded hammering.
    expect(outage.calls()).toBe(EPOCHS.length * 6)

    stubBase(() => 0)
    const recovered = await book()
    const view = earningsView(model, recovered, 3)
    expect(view.partial).toBe(false)
    expect(view.totals.realized.usdAtEarn).toBe("9.365829")
  })

  it("reuses settled epochs: a second request makes no Base calls", async () => {
    stubBase(() => 1)
    await book()
    const quiet = stubBase(() => 0)
    await book()
    expect(quiet.calls()).toBe(0)
  })
})
