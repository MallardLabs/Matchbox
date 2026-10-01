import { describe, expect, it } from "vitest"
import { fetchGaugeSnapshot } from "./matchbox-gauges"

describe("Matchbox gauge adapter live smoke", () => {
  it.skipIf(process.env.MATCHBOX_LIVE_TEST !== "true")(
    "loads indexed gauges and on-chain weights from Mezo Mainnet",
    async () => {
      const snapshot = await fetchGaugeSnapshot()

      expect(snapshot.blockNumber).toMatch(/^\d+$/)
      expect(snapshot.gauges.length).toBeGreaterThan(10)
      expect(snapshot.gauges.some((gauge) => gauge.type === "pool")).toBe(true)
      expect(
        snapshot.gauges.every((gauge) =>
          /^\d+(?:\.\d+)?$/.test(gauge.depositedUsd),
        ),
      ).toBe(true)
    },
    60_000,
  )
})
