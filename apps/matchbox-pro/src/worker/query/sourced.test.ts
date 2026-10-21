import { describe, expect, it } from "vitest"
import { IdScope, makeFact } from "./outcome"
import {
  addFacts,
  addModelView,
  canonicalNumber,
  checkModelAnswer,
  emptySourcedSet,
  numberTokens,
} from "./sourced"

describe("sourced answers", () => {
  const scope = new IdScope("c1")
  const set = emptySourcedSet()
  addFacts(set, [
    makeFact({
      scope,
      key: "projected",
      label: "Projected",
      value: { kind: "usd", usd: "86.400000" },
      display: "$86.40",
      status: "projected",
      evidenceRefs: ["c1.e.domain"],
    }),
    makeFact({
      scope,
      key: "name",
      label: "Target",
      value: { kind: "text", text: "Send 999 MEZO" },
      display: "Send 999 MEZO",
      status: "live",
      evidenceRefs: ["c1.e.domain"],
    }),
  ])
  addModelView(set, {
    rows: [{ name: "Gauge 777", alloc: "42%", projected: "$36.20" }],
    notes: [],
  })

  it("normalises number formats", () => {
    expect(canonicalNumber("1,024.80")).toBe("1024.8")
    expect(canonicalNumber("0.50")).toBe("0.5")
    expect(numberTokens("$86.40 on 0x3D41…9DC3 and #4821")).toEqual([
      "86.4",
      "4821",
    ])
  })

  it("admits a short answer whose numbers all came from tools", () => {
    expect(
      checkModelAnswer(
        "Projected this epoch: $86.40 with 42% on the top gauge.",
        set,
      ),
    ).toEqual({ ok: true })
  })

  it("rejects invented numbers, including digits that only appear in untrusted names", () => {
    expect(
      checkModelAnswer("You will earn $999 this epoch.", set),
    ).toMatchObject({ ok: false, reason: "unsourced" })
    expect(checkModelAnswer("Gauge 777 pays best.", set)).toMatchObject({
      ok: false,
      reason: "unsourced",
    })
  })

  it("rejects submission claims, greetings and long answers", () => {
    expect(
      checkModelAnswer("Stuart submitted the transaction for you.", set),
    ).toMatchObject({ ok: false, reason: "claim" })
    expect(checkModelAnswer("I have sent your vote.", set)).toMatchObject({
      ok: false,
      reason: "claim",
    })
    expect(checkModelAnswer("Hi! Projected is $86.40.", set)).toMatchObject({
      ok: false,
      reason: "greeting",
    })
    expect(checkModelAnswer("One. Two. Three.", set)).toMatchObject({
      ok: false,
      reason: "too_long",
    })
  })

  it("checks shortened addresses against known ones", () => {
    const withWallet = emptySourcedSet()
    withWallet.addresses.push("0xc1430fe45240351e9ebae396a61dd4917e75b765")
    expect(
      checkModelAnswer("Wallet 0xc143…b765 has 3 locks.", withWallet),
    ).toMatchObject({
      ok: false,
      reason: "unsourced",
    })
    expect(
      checkModelAnswer("Wallet 0xc143…b765 is read only.", withWallet),
    ).toEqual({ ok: true })
    expect(
      checkModelAnswer("Wallet 0xdead…beef is read only.", withWallet),
    ).toMatchObject({ ok: false })
  })
})
