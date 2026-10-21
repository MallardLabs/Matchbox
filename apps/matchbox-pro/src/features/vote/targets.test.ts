import { describe, expect, it } from "vitest"
import { formatUsd, formatUsdCompact } from "./format"
import { apySortValue, boostFooter, displayApy } from "./targets"

const E18 = 10n ** 18n
const USD = 1_000_000n
// $100,000 BTC; $1 of weekly incentives on 1 veBTC is 52 / 100,000 = 0.052%.
const base = {
  incentiveMicroUsd: 1_000n * USD,
  totalWeight: 10n * E18,
  competingWeight: 10n * E18,
  selectedPower: 0n,
  referenceUnit: E18,
  assetPrice: "100000",
}

describe("displayApy", () => {
  it("uses current weight when nothing is selected", () => {
    // $1,000 × 52 / (10 × $100,000) = 5.2%
    expect(displayApy(base)).toBe(520n)
  })

  it("shows no figure for targets thinner than one reference unit", () => {
    expect(displayApy({ ...base, totalWeight: E18 / 10n })).toBeNull()
    expect(displayApy({ ...base, totalWeight: 0n })).toBeNull()
  })

  it("is marginal once a lock is selected, so empty pools stay finite", () => {
    // Nobody votes here yet; the 2 veBTC selection would take the whole pot.
    expect(
      displayApy({
        ...base,
        totalWeight: 0n,
        competingWeight: 0n,
        selectedPower: 2n * E18,
      }),
    ).toBe(2_600n)
    // The selection's power joins the 10 veBTC already there.
    expect(displayApy({ ...base, selectedPower: 10n * E18 })).toBe(260n)
  })

  it("excludes the selection's own standing votes from competition", () => {
    expect(
      displayApy({
        ...base,
        totalWeight: 10n * E18,
        competingWeight: 0n,
        selectedPower: 10n * E18,
      }),
    ).toBe(520n)
  })

  it("has no figure without incentives or a price", () => {
    expect(displayApy({ ...base, incentiveMicroUsd: 0n })).toBeNull()
    expect(displayApy({ ...base, assetPrice: null })).toBeNull()
  })

  it("sorts targets without a figure after every real APY", () => {
    expect(apySortValue(null)).toBeLessThan(apySortValue(0n))
  })
})

describe("boostFooter", () => {
  it("draws a full green bar past the optimum and keeps the overage in text", () => {
    const footer = boostFooter({
      optimal: 100n * E18,
      weight: 150n * E18,
      boost: 5,
    })
    expect(footer.meter).toEqual({ fill: 1, tone: "pos" })
    expect(footer.side).toEqual({ text: "+50 over", tone: "neg" })
  })

  it("fills toward the optimum below it", () => {
    const footer = boostFooter({
      optimal: 100n * E18,
      weight: 25n * E18,
      boost: 2,
    })
    expect(footer.meter).toEqual({ fill: 0.25, tone: "accent" })
    expect(footer.side?.text).toBe("75 to 5x")
  })
})

describe("money formats", () => {
  it("never shows priced dust as zero", () => {
    expect(formatUsd(1_000n)).toBe("<$0.01")
    expect(formatUsd(0n)).toBe("$0.00")
    expect(formatUsd(86_400_000n)).toBe("$86.40")
  })

  it("keeps phone rows compact", () => {
    expect(formatUsdCompact(18_204_000_000n)).toBe("$18.2K")
    expect(formatUsdCompact(227_980_000n)).toBe("$227")
    expect(formatUsdCompact(400_000n)).toBe("<$1")
    expect(formatUsdCompact(0n)).toBe("$0")
  })
})
