import { describe, expect, it } from "vitest"
import {
  DEFAULT_CAP_BYTES,
  MAX_PRUNE_BLOCKS_PER_TICK,
  RAW_RETENTION_BLOCKS,
  pruneThrough,
  usageOf,
} from "../src/maintenance"

describe("pruneThrough", () => {
  const head = 12_000_000n

  it("keeps the retention window behind ingest", () => {
    expect(
      pruneThrough({
        projected: head,
        ingested: head,
        firstRaw: head - 200_000n,
      }),
    ).toBe(head - RAW_RETENTION_BLOCKS)
  })

  it("never deletes raw the projection has not read", () => {
    expect(
      pruneThrough({
        projected: head - 500_000n,
        ingested: head,
        firstRaw: head - 600_000n,
      }),
    ).toBe(head - 500_000n)
  })

  it("bounds one tick's delete, and can be unbounded", () => {
    const firstRaw = 178_630n
    expect(pruneThrough({ projected: head, ingested: head, firstRaw })).toBe(
      firstRaw + MAX_PRUNE_BLOCKS_PER_TICK - 1n,
    )
    expect(
      pruneThrough({
        projected: head,
        ingested: head,
        firstRaw,
        maxBlocks: null,
      }),
    ).toBe(head - RAW_RETENTION_BLOCKS)
  })

  it("has nothing to do inside the window or before any checkpoint", () => {
    expect(
      pruneThrough({
        projected: head,
        ingested: head,
        firstRaw: head - 1_000n,
      }),
    ).toBeNull()
    expect(
      pruneThrough({ projected: null, ingested: head, firstRaw: 1n }),
    ).toBeNull()
    expect(
      pruneThrough({ projected: head, ingested: head, firstRaw: null }),
    ).toBeNull()
  })
})

describe("usageOf", () => {
  it("stops writes at 90% of the cap", () => {
    const cap = 1_000_000n
    expect(usageOf(899_999n, cap).writable).toBe(true)
    expect(usageOf(900_000n, cap).writable).toBe(false)
    expect(usageOf(800_000_000n, DEFAULT_CAP_BYTES).writable).toBe(true)
  })
})
