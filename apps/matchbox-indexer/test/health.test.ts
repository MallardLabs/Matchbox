import { describe, expect, it } from "vitest"
import { STALE_LAG_BLOCKS, isStale, sendHeartbeat } from "../src/health"

const status = (lag: bigint | null) => ({
  head: 1_000_000n,
  safeHead: 999_998n,
  lastBlock: lag === null ? null : 999_998n - lag,
  lag,
})

describe("isStale", () => {
  it("is stale past 700 blocks of lag, or with no checkpoint", () => {
    expect(isStale(status(STALE_LAG_BLOCKS))).toBe(false)
    expect(isStale(status(STALE_LAG_BLOCKS + 1n))).toBe(true)
    expect(isStale(status(null))).toBe(true)
  })
})

describe("sendHeartbeat", () => {
  it("does nothing without a URL", async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls++
      return new Response("OK")
    }) as typeof fetch

    expect(await sendHeartbeat(undefined, fetchImpl)).toBe(false)
    expect(calls).toBe(0)
  })

  it("pings the URL", async () => {
    const urls: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      urls.push(String(input))
      return new Response("OK")
    }) as typeof fetch

    expect(await sendHeartbeat("https://hc.test/ping/x", fetchImpl)).toBe(true)
    expect(urls).toEqual(["https://hc.test/ping/x"])
  })

  it("never throws when the monitor is down", async () => {
    const down = (async () => {
      throw new Error("connection refused")
    }) as typeof fetch
    const refusing = (async () =>
      new Response("nope", { status: 404 })) as typeof fetch

    expect(await sendHeartbeat("https://hc.test/ping/x", down)).toBe(false)
    expect(await sendHeartbeat("https://hc.test/ping/x", refusing)).toBe(false)
  })
})
