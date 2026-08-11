import { describe, expect, it } from "vitest"
import { runDemoQuery } from "./engine"

describe("runDemoQuery", () => {
  it("limits Wormhole queries to explicitly linked Wormhole journeys", () => {
    const response = runDemoQuery("wormhole transactions")
    const records = response.blocks.find(
      (block) => block.type === "bridge_records",
    )

    expect(response.kind).toBe("bridge")
    expect(records?.type).toBe("bridge_records")
    if (records?.type === "bridge_records") {
      expect(records.records).toHaveLength(3)
      expect(
        records.records.every((record) => record.provider === "Wormhole"),
      ).toBe(true)
    }
  })

  it("returns a 100 percent optimizer ballot", () => {
    const response = runDemoQuery("vote on the best gauges this epoch")
    const composer = response.blocks.find(
      (block) => block.type === "vote_composer",
    )

    expect(response.kind).toBe("vote")
    if (composer?.type === "vote_composer") {
      expect(
        composer.ballots[0]?.allocations.reduce(
          (total, allocation) => total + allocation.percentage,
          0,
        ),
      ).toBe(100)
      expect(composer.simulation.status).toBe("not-run")
    }
  })

  it("parses the requested zap amount", () => {
    const response = runDemoQuery("put $75 into the MEZO/MUSD vault")
    const route = response.blocks.find((block) => block.type === "zap_route")

    expect(response.kind).toBe("zap")
    if (route?.type === "zap_route") {
      expect(route.amount).toBe("75")
      expect(route.status).toBe("unavailable")
    }
  })
})
