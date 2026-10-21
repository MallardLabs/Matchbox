import { describe, expect, it } from "vitest"
import {
  PLATFORM_HEALTH_LAYOUT,
  chainSyncOutcome,
  chainSyncTarget,
  healthProbeDataPoint,
  healthProbeSchema,
  healthStatusFromProbes,
  httpProbeOutcome,
} from "./platform-health"

const now = new Date("2026-10-21T14:02:10.000Z")
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000)

describe("healthProbeDataPoint", () => {
  it("places every field in its documented column", () => {
    const probe = healthProbeSchema.parse({
      target: "chain-sync:mezo",
      deployment: "production",
      outcome: "degraded",
      errorCode: "stale",
      network: "mezo",
      version: null,
      blockNumber: "4128440",
      chainCheckedAt: "2026-10-21T13:40:00.000Z",
      headBlock: "4128900",
      latencyMs: 0,
      httpStatus: 0,
      lagSeconds: 1330,
      blocksBehind: 460,
    })
    const point = healthProbeDataPoint(probe)
    expect(point).toEqual({
      indexes: ["chain-sync:mezo"],
      blobs: [
        "production",
        "degraded",
        "stale",
        "mezo",
        "",
        "4128440",
        "2026-10-21T13:40:00.000Z",
        "4128900",
      ],
      doubles: [0, 0, 1330, 460],
    })
    const columns = Object.values(PLATFORM_HEALTH_LAYOUT)
    expect(columns.filter((column) => column.startsWith("blob"))).toHaveLength(
      point.blobs.length,
    )
    expect(
      columns.filter((column) => column.startsWith("double")),
    ).toHaveLength(point.doubles.length)
  })

  it("maps networks to chain-sync targets", () => {
    expect(chainSyncTarget("mezo")).toBe("chain-sync:mezo")
    expect(chainSyncTarget("mezo-testnet")).toBe("chain-sync:mezo-testnet")
  })
})

describe("probe outcomes", () => {
  it("grades HTTP probes by status and latency", () => {
    expect(httpProbeOutcome({ ok: true, latencyMs: 80 })).toEqual({
      outcome: "up",
      errorCode: null,
    })
    expect(httpProbeOutcome({ ok: true, latencyMs: 1_500 })).toEqual({
      outcome: "degraded",
      errorCode: "slow",
    })
    expect(httpProbeOutcome({ ok: false, latencyMs: 20 })).toEqual({
      outcome: "down",
      errorCode: "http-error",
    })
  })

  it("grades chain sync by the age of the newest state row", () => {
    expect(chainSyncOutcome(240).outcome).toBe("up")
    expect(chainSyncOutcome(20 * 60)).toEqual({
      outcome: "degraded",
      errorCode: "stale",
    })
    expect(chainSyncOutcome(60 * 60)).toEqual({
      outcome: "down",
      errorCode: "stale",
    })
    expect(chainSyncOutcome(null)).toEqual({
      outcome: "down",
      errorCode: "no-data",
    })
  })
})

describe("healthStatusFromProbes", () => {
  it("is unknown without a fresh probe", () => {
    expect(healthStatusFromProbes([], now)).toBe("unknown")
    expect(healthStatusFromProbes([{ outcome: "up", at: ago(301) }], now)).toBe(
      "unknown",
    )
  })

  it("follows the latest probe, degrading after a recent failure", () => {
    expect(
      healthStatusFromProbes(
        [
          { outcome: "up", at: ago(10) },
          { outcome: "up", at: ago(70) },
        ],
        now,
      ),
    ).toBe("operational")
    expect(
      healthStatusFromProbes(
        [
          { outcome: "up", at: ago(70) },
          { outcome: "down", at: ago(10) },
        ],
        now,
      ),
    ).toBe("down")
    expect(
      healthStatusFromProbes(
        [
          { outcome: "up", at: ago(10) },
          { outcome: "down", at: ago(300) },
        ],
        now,
      ),
    ).toBe("degraded")
    expect(
      healthStatusFromProbes(
        [
          { outcome: "up", at: ago(10) },
          { outcome: "down", at: ago(700) },
        ],
        now,
      ),
    ).toBe("operational")
    expect(
      healthStatusFromProbes([{ outcome: "degraded", at: ago(10) }], now),
    ).toBe("degraded")
  })
})
