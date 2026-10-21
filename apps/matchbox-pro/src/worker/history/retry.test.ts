import { describe, expect, it } from "vitest"
import { type Attempt, backoffMs, readEach } from "./retry"

const instant = { sleep: async () => undefined, random: () => 0.5 }

describe("readEach", () => {
  it("retries transient misses until each item settles", async () => {
    const tries = new Map<number, number>()
    const results = await readEach(
      [1, 2, 3, 4, 5],
      async (item): Promise<Attempt<number | null>> => {
        const count = (tries.get(item) ?? 0) + 1
        tries.set(item, count)
        // Item n fails n-1 times first, like a burst of 429s.
        return count < item
          ? { value: null, retry: true }
          : { value: item * 10, retry: false }
      },
      { attempts: 6, concurrency: 2, baseDelayMs: 100, jitterMs: 50 },
      instant,
    )
    expect(results.map((result) => result.value)).toEqual([10, 20, 30, 40, 50])
    expect(results.every((result) => !result.retry)).toBe(true)
  })

  it("gives up after the attempt budget and reports the miss", async () => {
    let calls = 0
    const [result] = await readEach(
      ["x"],
      async (): Promise<Attempt<null>> => {
        calls += 1
        return { value: null, retry: true }
      },
      { attempts: 3, concurrency: 1, baseDelayMs: 1, jitterMs: 1 },
      instant,
    )
    expect(calls).toBe(3)
    expect(result?.retry).toBe(true)
  })

  it("never runs more reads at once than the cap", async () => {
    let active = 0
    let peak = 0
    await readEach(
      Array.from({ length: 20 }, (_, index) => index),
      async (): Promise<Attempt<number>> => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 1))
        active -= 1
        return { value: 1, retry: false }
      },
      { attempts: 1, concurrency: 4, baseDelayMs: 0, jitterMs: 0 },
      instant,
    )
    expect(peak).toBe(4)
  })

  it("backs off exponentially with bounded jitter", () => {
    const policy = {
      attempts: 5,
      concurrency: 1,
      baseDelayMs: 400,
      jitterMs: 400,
    }
    expect(backoffMs(policy, 1, () => 0)).toBe(400)
    expect(backoffMs(policy, 3, () => 0)).toBe(1_600)
    expect(backoffMs(policy, 3, () => 0.999)).toBe(1_999)
  })
})
