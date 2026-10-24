import { describe, expect, it } from "vitest"
import { barLabel, errorStacks, groupSeries, requestBars } from "./usage-chart"
import { rangeWindow, usageRanges } from "./usage-range"

const day = (date: string, requests: number, split = true) => ({
  start: `${date}T00:00:00.000Z`,
  requests,
  errors: 6,
  ...(split ? { clientErrors: 3, rateLimited: 2, serverErrors: 1 } : {}),
})

describe("rangeWindow", () => {
  const now = Date.parse("2026-10-21T14:37:12.000Z")

  it("covers today and the six UTC days before it for 7 d", () => {
    expect(rangeWindow("7d", now)).toEqual({
      from: "2026-10-15T00:00:00.000Z",
      to: "2026-10-21T14:38:00.000Z",
      bucket: "day",
    })
  })

  it("ends 24 h at the current hour and 1 h at the current minute", () => {
    expect(rangeWindow("24h", now).from).toBe("2026-10-20T15:00:00.000Z")
    expect(rangeWindow("1h", now)).toMatchObject({
      from: "2026-10-21T13:38:00.000Z",
      bucket: "minute",
    })
  })

  it("never exceeds the bucket's maximum range", () => {
    const late = Date.parse("2026-10-21T23:59:30.000Z")
    const window = rangeWindow("90d", late)
    expect(
      (Date.parse(window.to) - Date.parse(window.from)) / 1000,
    ).toBeLessThanOrEqual(90 * 86_400)
  })
})

describe("groupSeries", () => {
  it("merges from the end so the last bar holds the current bucket", () => {
    const points = [
      day("2026-10-15", 1),
      day("2026-10-16", 2),
      day("2026-10-17", 3),
      day("2026-10-18", 4),
      day("2026-10-19", 5),
    ]
    const groups = groupSeries(points, 2)
    expect(groups.map((group) => group.requests)).toEqual([1, 5, 9])
    expect(groups.map((group) => group.start)).toEqual([
      "2026-10-15T00:00:00.000Z",
      "2026-10-16T00:00:00.000Z",
      "2026-10-18T00:00:00.000Z",
    ])
    expect(groups[2]?.split).toEqual({
      clientErrors: 6,
      rateLimited: 4,
      serverErrors: 2,
    })
  })

  it("drops the split when any merged point lacks it", () => {
    const groups = groupSeries(
      [day("2026-10-20", 1), day("2026-10-21", 1, false)],
      2,
    )
    expect(groups[0]?.split).toBeNull()
    expect(groups[0]?.errors).toBe(12)
  })

  it("keeps every range at 13 bars or fewer", () => {
    for (const spec of Object.values(usageRanges)) {
      expect(Math.ceil(spec.buckets / spec.perBar)).toBeLessThanOrEqual(13)
    }
  })
})

describe("bars", () => {
  it("labels UTC days and highlights the current bar", () => {
    const bars = requestBars(
      groupSeries([day("2026-10-20", 15_100), day("2026-10-21", 18_400)], 1),
      "day",
    )
    expect(bars).toEqual([
      {
        key: "2026-10-20T00:00:00.000Z",
        label: "10/20",
        value: 15_100,
        display: "15.1K",
        tone: "past",
      },
      {
        key: "2026-10-21T00:00:00.000Z",
        label: "10/21",
        value: 18_400,
        display: "18.4K",
        tone: "current",
      },
    ])
    expect(barLabel("2026-10-01T00:00:00.000Z", "day")).toBe("10/1")
  })

  it("carries the error split per stack", () => {
    const stacks = errorStacks(groupSeries([day("2026-10-21", 9)], 1), "day")
    expect(stacks[0]).toMatchObject({
      total: 6,
      current: true,
      split: { clientErrors: 3, rateLimited: 2, serverErrors: 1 },
    })
  })
})
