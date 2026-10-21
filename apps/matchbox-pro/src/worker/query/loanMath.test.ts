import { describe, expect, it } from "vitest"
import { displayRatioBps, displayUsd } from "./format"
import {
  collateralRatio,
  dropToLiquidationBps,
  liquidationPrice,
  liquidationShockBps,
  maxPartialRepay,
  ratioToBps,
  repaySplit,
  scenarioPoint,
  wadToMicroCeilCent,
} from "./loanMath"

const E18 = 10n ** 18n
const MCR = (11n * E18) / 10n
const CCR = (15n * E18) / 10n
// The design's inputs: 2.4 BTC, 48,200 mUSD debt, BTC $59,200. The Pencil
// figures (212%, $41,280) are inconsistent; these are the correct values.
const COLL = (24n * E18) / 10n
const DEBT = 48_200n * E18
const PRICE = 59_200n * E18

function ratioText(price: bigint, debt = DEBT): string {
  const ratio = collateralRatio(COLL, price, debt)
  if (ratio === null) throw new Error("no ratio")
  return displayRatioBps(ratioToBps(ratio))
}

describe("trove math (musd spec worked example)", () => {
  it("computes the current collateral ratio", () => {
    expect(ratioText(PRICE)).toBe("294.77%")
  })

  it("computes the liquidation price rounded up to the cent", () => {
    const liq = liquidationPrice(MCR, DEBT, COLL)
    if (liq === null) throw new Error("no liquidation price")
    expect(displayUsd(wadToMicroCeilCent(liq))).toBe("$22,091.67")
    expect(dropToLiquidationBps(PRICE, liq)).toBe(6268)
  })

  it("models the scenario table rows", () => {
    const rows = [-1000, -1500, -3500, -4800].map((shockBps) =>
      scenarioPoint({
        coll: COLL,
        debt: DEBT,
        price: PRICE,
        shockBps,
        mcr: MCR,
        ccr: CCR,
      }),
    )
    expect(
      rows.map((row) => displayRatioBps(ratioToBps(row.ratio ?? 0n))),
    ).toEqual(["265.29%", "250.56%", "191.60%", "153.28%"])
    expect(rows.every((row) => row.band === "healthy")).toBe(true)
  })

  it("finds the first liquidatable shock (strict ICR < MCR)", () => {
    const shock = liquidationShockBps({
      coll: COLL,
      debt: DEBT,
      price: PRICE,
      mcr: MCR,
    })
    expect(shock).toBe(-6269)
    const at = scenarioPoint({
      coll: COLL,
      debt: DEBT,
      price: PRICE,
      shockBps: shock ?? 0,
      mcr: MCR,
      ccr: CCR,
    })
    expect(at.band).toBe("liquidatable")
    const before = scenarioPoint({
      coll: COLL,
      debt: DEBT,
      price: PRICE,
      shockBps: -6267,
      mcr: MCR,
      ccr: CCR,
    })
    expect(before.band).not.toBe("liquidatable")
  })

  it("moves the liquidation price after a repay (frame 43 'unchanged' is wrong)", () => {
    const after = DEBT - 5_000n * E18
    expect(ratioText(PRICE, after)).toBe("328.89%")
    const liq = liquidationPrice(MCR, after, COLL)
    if (liq === null) throw new Error("no liquidation price")
    expect(displayUsd(wadToMicroCeilCent(liq))).toBe("$19,800.00")
  })

  it("matches the live testnet trove check", () => {
    const coll = 46_427_500_556_000_000n
    const debt = 2_402_200_000_000_000_000_000n + 34_489_000_000_000_000_000n
    const price = 82_602_840_000_000_000_000_000n
    const ratio = collateralRatio(coll, price, debt)
    expect(displayRatioBps(ratioToBps(ratio ?? 0n))).toBe("157.39%")
  })

  it("bands near liquidation below CCR and liquidatable below MCR", () => {
    const near = scenarioPoint({
      coll: COLL,
      debt: DEBT,
      price: PRICE,
      shockBps: -5000,
      mcr: MCR,
      ccr: CCR,
    })
    expect(near.band).toBe("near_liquidation")
    const gone = scenarioPoint({
      coll: COLL,
      debt: DEBT,
      price: PRICE,
      shockBps: -7000,
      mcr: MCR,
      ccr: CCR,
    })
    expect(gone.band).toBe("liquidatable")
  })

  it("caps a partial repay at debt − gas compensation − min net debt", () => {
    expect(maxPartialRepay(DEBT, 200n * E18, 1_800n * E18)).toBe(46_200n * E18)
    expect(maxPartialRepay(1_500n * E18, 200n * E18, 1_800n * E18)).toBe(0n)
  })

  it("repays interest before principal", () => {
    expect(repaySplit(100n, 30n)).toEqual({
      interestRepaid: 30n,
      principalRepaid: 70n,
    })
    expect(repaySplit(10n, 30n)).toEqual({
      interestRepaid: 10n,
      principalRepaid: 0n,
    })
  })
})
