import { describe, expect, it } from "vitest"
import { isolatedRpcUrl } from "./mezoClient"

describe("isolatedRpcUrl", () => {
  it("gives each client its own batch queue without changing the request", () => {
    const first = new URL(isolatedRpcUrl("https://rpc-internal.mezo.org"))
    const second = new URL(isolatedRpcUrl("https://rpc-internal.mezo.org"))

    expect(first.href).not.toBe(second.href)
    // Only the fragment differs, and fetch never sends a fragment.
    expect(first.origin + first.pathname + first.search).toBe(
      second.origin + second.pathname + second.search,
    )
    expect(first.hash).toMatch(/^#c\d+$/)
  })
})
