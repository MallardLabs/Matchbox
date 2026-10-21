import { LAUNCH_EPOCH_START, epochLabel, epochNumberFor } from "@/lib/epoch"
import { describe, expect, it } from "vitest"
import { earningsBars, formatTick } from "./earnings"

const WEEK = 604_800n

describe("epochNumberFor", () => {
  it("numbers epochs from the launch cohort", () => {
    expect(epochNumberFor(LAUNCH_EPOCH_START)).toBe(0)
    expect(epochNumberFor(LAUNCH_EPOCH_START + WEEK)).toBe(1)
    expect(epochNumberFor(LAUNCH_EPOCH_START + 7n * WEEK)).toBe(7)
  })

  it("has no number before launch or before the boundary loads", () => {
    expect(epochNumberFor(LAUNCH_EPOCH_START - WEEK)).toBeNull()
    expect(epochNumberFor(undefined)).toBeNull()
    expect(epochLabel(undefined)).toBe("Epoch")
    expect(epochLabel(LAUNCH_EPOCH_START + 2n * WEEK)).toBe("Epoch 2")
  })
})

describe("earningsBars", () => {
  const epochStart = LAUNCH_EPOCH_START + 7n * WEEK

  it("draws dashed history stubs when history is unavailable", () => {
    const bars = earningsBars({
      history: {
        status: "unavailable",
        data: undefined,
        lagSeconds: undefined,
      },
      epochStart,
      current: { status: "ready", usdMicro: 1_049_900_000n },
      next: { status: "ready", usdMicro: 24_400_000n },
    })
    expect(bars.map((bar) => bar.label)).toEqual([
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "Next",
    ])
    expect(bars.slice(0, 5).every((bar) => bar.tone === "unavailable")).toBe(
      true,
    )
    expect(bars.slice(0, 5).every((bar) => bar.value === null)).toBe(true)
    expect(bars[5]).toMatchObject({
      tone: "current",
      display: "$1,050",
      value: 1049.9,
    })
    expect(bars[6]).toMatchObject({ tone: "projected", display: "$24" })
  })

  it("keeps realized epochs before the current one, newest last", () => {
    const bars = earningsBars({
      history: {
        status: "ready",
        lagSeconds: 10,
        data: [5n, 6n, 7n].map((n) => ({
          epoch: Number(n),
          startsAt: Number(LAUNCH_EPOCH_START + n * WEEK),
          usdMicro: n === 6n ? null : n * 100_000_000n,
        })),
      },
      epochStart,
      current: { status: "loading" },
      next: { status: "unavailable" },
    })
    expect(bars.map((bar) => [bar.label, bar.tone, bar.display])).toEqual([
      ["5", "past", "$500"],
      ["6", "unavailable", "Unpriced"],
      ["7", "unavailable", "—"],
      ["Next", "unavailable", "—"],
    ])
  })
})

describe("earningsBars with an accruing epoch", () => {
  it("never counts the projected entry as realized; it backs up Next", () => {
    const epochStart = LAUNCH_EPOCH_START + 7n * WEEK
    const bars = earningsBars({
      history: {
        status: "ready",
        lagSeconds: 0,
        data: [
          {
            epoch: 1,
            startsAt: Number(epochStart - WEEK),
            usdMicro: null,
          },
          {
            epoch: 2,
            startsAt: Number(epochStart),
            usdMicro: 24_400_000n,
            projected: true,
          },
        ],
      },
      epochStart,
      current: { status: "ready", usdMicro: 1_000_000_000n },
      next: { status: "unavailable" },
    })
    expect(bars.map((bar) => [bar.label, bar.tone, bar.display])).toEqual([
      ["6", "unavailable", "Unpriced"],
      ["7", "current", "$1,000"],
      ["Next", "projected", "$24"],
    ])
  })

  it("labels pre-launch epochs by date", () => {
    const start = LAUNCH_EPOCH_START - 2n * WEEK
    const bars = earningsBars({
      history: {
        status: "unavailable",
        data: undefined,
        lagSeconds: undefined,
      },
      epochStart: start,
      current: { status: "loading" },
      next: { status: "none" },
      historyEpochs: 1,
    })
    expect(bars.map((bar) => bar.label)).toEqual(["Aug 13", "Aug 20", "Next"])
  })
})

describe("formatTick", () => {
  it("compacts axis values", () => {
    expect(formatTick(0)).toBe("$0")
    expect(formatTick(500)).toBe("$500")
    expect(formatTick(1000)).toBe("$1k")
    expect(formatTick(2500)).toBe("$2.5k")
    expect(formatTick(0.25)).toBe("$0.25")
    expect(formatTick(2_000_000)).toBe("$2M")
  })
})
