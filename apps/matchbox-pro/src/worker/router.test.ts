import { afterEach, describe, expect, it, vi } from "vitest"
import { cachedStale } from "./router"

describe("cachedStale", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("serves the stale value while one background refresh runs", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const ttl = { freshMs: 1_000, staleMs: 10_000 }
    const background: Promise<unknown>[] = []
    const waitUntil = (promise: Promise<unknown>): void => {
      background.push(promise)
    }
    let release: (value: number) => void = () => {}
    let calls = 0
    const load = (): Promise<number> => {
      calls += 1
      if (calls === 1) return Promise.resolve(1)
      return new Promise((resolve) => {
        release = resolve
      })
    }

    expect(await cachedStale("k-stale", ttl, load, waitUntil)).toBe(1)

    vi.setSystemTime(2_000)
    expect(await cachedStale("k-stale", ttl, load, waitUntil)).toBe(1)
    expect(await cachedStale("k-stale", ttl, load, waitUntil)).toBe(1)
    expect(background).toHaveLength(1)
    expect(calls).toBe(2)

    release(2)
    await Promise.all(background)
    expect(await cachedStale("k-stale", ttl, load, waitUntil)).toBe(2)
  })

  it("waits for a fresh load once the stale window has passed", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const ttl = { freshMs: 1_000, staleMs: 1_000 }
    let calls = 0
    const load = async (): Promise<number> => {
      calls += 1
      return calls
    }
    const waitUntil = (): void => {}

    expect(await cachedStale("k-expired", ttl, load, waitUntil)).toBe(1)
    vi.setSystemTime(5_000)
    expect(await cachedStale("k-expired", ttl, load, waitUntil)).toBe(2)
  })
})
