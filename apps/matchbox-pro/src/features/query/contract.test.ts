import { describe, expect, it } from "vitest"
import {
  UI_BLOCK_TYPES,
  callStatusSchema,
  stuartErrorSchema,
  stuartRequestSchema,
  uiBlockSchema,
  usd6Schema,
} from "./contract"

const metric = {
  type: "metric_summary",
  version: 1,
  id: "c1.b.summary",
  evidenceRefs: ["c1.e.domain"],
  label: "Projected this epoch",
  primaryUsd: "86.400000",
  primaryStatus: "projected",
  secondary: { raw: "1024800000000000000000", decimals: 18, symbol: "MEZO" },
  apyBps: 1480,
  apyStatus: "extrapolated",
  objectiveNote: "maximize_projected_personal_usd",
  snapshotBlock: "4128440",
}

describe("Stuart contract", () => {
  it("defaults the request context and accepts testnet for a graceful answer", () => {
    const parsed = stuartRequestSchema.parse({
      version: 1,
      query: "  optimize my votes  ",
      sessionId: "6f1c1b8e-3c55-4a3f-9b8a-1d2e3f4a5b6c",
      turn: 0,
      surface: "palette",
      chainId: 31_611,
    })
    expect(parsed.query).toBe("optimize my votes")
    expect(parsed.context).toEqual({})
  })

  it("rejects requests that would carry model-controlled or oversized data", () => {
    const base = {
      version: 1,
      sessionId: "6f1c1b8e-3c55-4a3f-9b8a-1d2e3f4a5b6c",
      turn: 0,
      surface: "palette",
      chainId: 31_612,
    }
    expect(
      stuartRequestSchema.safeParse({ ...base, query: "x".repeat(2_001) })
        .success,
    ).toBe(false)
    expect(
      stuartRequestSchema.safeParse({ ...base, query: "hi", chainId: 1 })
        .success,
    ).toBe(false)
    expect(
      stuartRequestSchema.safeParse({
        ...base,
        query: "hi",
        wallet: { address: "not-an-address", mode: "connected" },
      }).success,
    ).toBe(false)
  })

  it("round-trips a block and rejects unknown types or versions", () => {
    expect(uiBlockSchema.parse(metric)).toEqual(metric)
    expect(uiBlockSchema.safeParse({ ...metric, version: 2 }).success).toBe(
      false,
    )
    expect(
      uiBlockSchema.safeParse({ ...metric, type: "raw_html" }).success,
    ).toBe(false)
  })

  it("registers every block type in the discriminated union", () => {
    const options = uiBlockSchema.options.map(
      (option) => option.shape.type.value,
    )
    expect([...options].sort()).toEqual([...UI_BLOCK_TYPES].sort())
    expect(UI_BLOCK_TYPES).toHaveLength(15)
  })

  it("keeps money as fixed 6-dp strings, never numbers", () => {
    expect(usd6Schema.safeParse("86.400000").success).toBe(true)
    expect(usd6Schema.safeParse("-2.100000").success).toBe(true)
    expect(usd6Schema.safeParse("86.4").success).toBe(false)
    expect(usd6Schema.safeParse(86.4).success).toBe(false)
  })

  it("describes client-only call status and the error envelope", () => {
    expect(
      callStatusSchema.safeParse({
        type: "call_status",
        version: 1,
        proposalId: "zap_1234abcd",
        outcome: "partial",
        calls: [
          {
            index: 0,
            label: "1 · Approve 17,400.00 MEZO",
            status: "mined",
            hash: `0x${"ab".repeat(32)}`,
            error: null,
            doNotRepeat: true,
            retryable: false,
          },
        ],
        remaining: null,
      }).success,
    ).toBe(true)
    expect(
      stuartErrorSchema.parse({
        error: {
          code: "rate_limited",
          message: "Too many requests.",
          retryAfterSeconds: 30,
        },
      }).error.code,
    ).toBe("rate_limited")
  })
})
