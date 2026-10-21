import { describe, expect, it } from "vitest"
import type { WireEarnings } from "../../../features/history/schema"
import { fakeProviders } from "../fakes"
import { settledEarnings } from "./earnings"

const complete = await fakeProviders().walletEarnings(
  "0xc1430fe45240351e9EbAe396A61Dd4917E75B765",
)

describe("settledEarnings", () => {
  it("waits for the history worker's background prices and asks again", async () => {
    let calls = 0
    const outer: Promise<unknown>[] = []
    const result = await settledEarnings(
      async (waitUntil) => {
        calls += 1
        if (calls === 1) {
          waitUntil(new Promise((resolve) => setTimeout(resolve, 10)))
          return { ...complete, partial: true }
        }
        return complete
      },
      (promise) => outer.push(promise),
      1_000,
    )
    expect(calls).toBe(2)
    expect(result.partial).toBe(false)
    // Background work is still handed to the request's waitUntil.
    expect(outer).toHaveLength(1)
  })

  it("returns a complete first answer without a second read", async () => {
    let calls = 0
    const result = await settledEarnings(
      async () => {
        calls += 1
        return complete
      },
      () => undefined,
    )
    expect(calls).toBe(1)
    expect(result).toBe(complete)
  })

  it("stays partial only when the history is still partial after waiting", async () => {
    let calls = 0
    const result: WireEarnings = await settledEarnings(
      async (waitUntil) => {
        calls += 1
        // Never settles inside the wait budget.
        waitUntil(new Promise(() => undefined))
        return { ...complete, partial: true }
      },
      () => undefined,
      20,
    )
    expect(calls).toBe(2)
    expect(result.partial).toBe(true)
  })
})
