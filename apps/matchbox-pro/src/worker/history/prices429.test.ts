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
const {
  BASE_ARCHIVE_RPCS,
  BASE_POLICY,
  baseClientIndex,
  baseEndpoints,
  closePricesWithin,
  epochClosePrices,
  withinDeadline,
} = await import("./pricing")
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
  hosts: () => Array<{ block: bigint; host: string }>
} {
  const seen = new Map<bigint, number>()
  const hosts: Array<{ block: bigint; host: string }> = []
  let calls = 0
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls += 1
      const body = JSON.parse(String(init?.body)) as {
        id: number
        params: [unknown, string]
      }
      const block = hexToBigInt(body.params[1] as `0x${string}`)
      hosts.push({ block, host: new URL(String(input)).host })
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
  return { calls: () => calls, hosts: () => hosts }
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
    // Each attempt falls through every endpoint once.
    expect(outage.calls()).toBe(
      EPOCHS.length * BASE_POLICY.attempts * BASE_ARCHIVE_RPCS.length,
    )

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

describe("Base endpoint rotation", () => {
  it("puts BASE_RPC_URL first, then the public archive endpoints", () => {
    expect(baseEndpoints({})).toEqual([...BASE_ARCHIVE_RPCS])
    expect(baseEndpoints({ BASE_RPC_URL: "https://keyed.example" })[0]).toBe(
      "https://keyed.example",
    )
    expect(
      baseEndpoints({ BASE_RPC_URL: "https://base.drpc.org" }).filter(
        (url) => url === "https://base.drpc.org",
      ),
    ).toHaveLength(1)
  })

  it("spreads first attempts and rotates retries", () => {
    expect(
      [0, 1, 2, 3, 4, 5].map((item) => baseClientIndex(item, 0, 5, false)),
    ).toEqual([0, 1, 2, 3, 4, 0])
    expect(baseClientIndex(2, 1, 5, false)).toBe(3)
    // A configured endpoint takes every first attempt.
    expect([0, 1, 2].map((item) => baseClientIndex(item, 0, 6, true))).toEqual([
      0, 0, 0,
    ])
    expect(baseClientIndex(2, 1, 6, true)).toBe(1)
  })

  it("sends concurrent epochs to different endpoints, failing over on 429", async () => {
    const stub = stubBase(() => 1)
    await epochClosePrices(EPOCHS, {}, NOW, instant)
    const firstHost = new Map<bigint, string>()
    for (const { block, host } of stub.hosts()) {
      if (!firstHost.has(block)) firstHost.set(block, host)
    }
    expect(new Set(firstHost.values()).size).toBe(EPOCHS.length)
    // The 429 on each block's first endpoint fell over to another one.
    for (const block of firstHost.keys()) {
      const tried = stub.hosts().filter((entry) => entry.block === block)
      expect(tried).toHaveLength(2)
      expect(tried[0]?.host).not.toBe(tried[1]?.host)
    }
  })
})

describe("request time budget", () => {
  it("answers at the deadline and hands the rest to waitUntil", async () => {
    const background: Array<Promise<unknown>> = []
    const started = Date.now()
    const value = await withinDeadline(
      new Promise<string>(() => undefined),
      Date.now() + 30,
      (promise) => background.push(promise),
    )
    expect(value).toBeUndefined()
    expect(Date.now() - started).toBeLessThan(1_000)
    expect(background).toHaveLength(1)
  })

  it("returns the value without background work when it's in time", async () => {
    const background: Array<Promise<unknown>> = []
    const value = await withinDeadline(
      Promise.resolve("done"),
      Date.now() + 1_000,
      (promise) => background.push(promise),
    )
    expect(value).toBe("done")
    expect(background).toHaveLength(0)
  })

  it("serves the epochs that settled and keeps pricing the rest", async () => {
    // One epoch's Base read hangs; the others answer at once.
    const slow = EPOCHS[0] ?? 0n
    const hanging = new Set([baseBlockFor(slow)])
    const base = Array.from({ length: 5 }, () => ({
      multicall: (async ({ blockNumber }: { blockNumber?: bigint }) => {
        if (blockNumber !== undefined && hanging.has(blockNumber)) {
          return new Promise(() => undefined)
        }
        return [
          { status: "success", result: [SQRT_PRICE, 0, 0, 0, 0, true] },
          { status: "success", result: 10n ** 24n },
        ]
      }) as never,
    }))
    const background: Array<Promise<unknown>> = []
    const closes = await closePricesWithin(
      EPOCHS,
      {},
      NOW,
      Date.now() + 300,
      (promise) => background.push(promise),
      { base, ...instant },
    )
    expect(closes.has(slow)).toBe(false)
    expect(EPOCHS.slice(1).every((epoch) => closes.get(epoch)?.settled)).toBe(
      true,
    )
    expect(background).toHaveLength(1)
    const view = earningsView(
      model,
      { now: { btcUsd: "80000", mezoUsd: "0.003" }, closes },
      3,
    )
    expect(view.partial).toBe(true)
  })
})

function baseBlockFor(epochStart: bigint): bigint {
  return (epochStart + EPOCH - 1n - 1_686_789_347n) / 2n
}

describe("settled prices in KV", () => {
  function memoryKv(failing = false): {
    data: Map<string, string>
    kv: {
      get: (key: string) => Promise<string | null>
      put: (key: string, value: string) => Promise<void>
    }
  } {
    const data = new Map<string, string>()
    return {
      data,
      kv: {
        get: async (key) => {
          if (failing) throw new Error("KV unavailable")
          return data.get(key) ?? null
        },
        put: async (key, value) => {
          if (failing) throw new Error("KV unavailable")
          data.set(key, value)
        },
      },
    }
  }

  it("writes settled epochs and serves a cold isolate without RPC", async () => {
    const { data, kv } = memoryKv()
    stubBase(() => 0)
    await epochClosePrices(EPOCHS, { HISTORY_KV: kv }, NOW, instant)
    expect([...data.keys()].sort()).toEqual(
      EPOCHS.map((epoch) => `price:${epoch}`).sort(),
    )

    // New isolate, Base down: everything comes from KV.
    clearHistoryMemo()
    const outage = stubBase(() => Number.POSITIVE_INFINITY)
    const closes = await epochClosePrices(
      EPOCHS,
      { HISTORY_KV: kv },
      NOW,
      instant,
    )
    expect(EPOCHS.every((epoch) => closes.get(epoch)?.settled)).toBe(true)
    expect(closes.get(EPOCHS[0] ?? 0n)?.btcUsd).toBe("80000")
    expect(outage.calls()).toBe(0)
  })

  it("never stores a partial price or the current epoch", async () => {
    const { data, kv } = memoryKv()
    stubBase(() => Number.POSITIVE_INFINITY)
    await epochClosePrices(EPOCHS, { HISTORY_KV: kv }, NOW, instant)
    await epochClosePrices([CURRENT], { HISTORY_KV: kv }, NOW, instant)
    expect(data.size).toBe(0)
  })

  it("falls through to RPC when KV fails", async () => {
    const { kv } = memoryKv(true)
    stubBase(() => 0)
    const closes = await epochClosePrices(
      EPOCHS,
      { HISTORY_KV: kv },
      NOW,
      instant,
    )
    expect(EPOCHS.every((epoch) => closes.get(epoch)?.settled)).toBe(true)
  })

  it("ignores a malformed KV value and prices the epoch", async () => {
    const { data, kv } = memoryKv()
    const epoch = EPOCHS[0] ?? 0n
    data.set(`price:${epoch}`, "{not json")
    stubBase(() => 0)
    const closes = await epochClosePrices(
      [epoch],
      { HISTORY_KV: kv },
      NOW,
      instant,
    )
    expect(closes.get(epoch)?.settled).toBe(true)
    expect(JSON.parse(data.get(`price:${epoch}`) ?? "{}")).toMatchObject({
      btcUsd: "80000",
    })
  })
})
