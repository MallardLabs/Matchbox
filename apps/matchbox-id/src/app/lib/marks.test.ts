import { describe, expect, it } from "vitest"
import { formatShortDate } from "./format"
import { appInitials, appMarkTone, identiconGradient } from "./marks"

describe("appInitials", () => {
  it("takes two words' initials or a single word's first two letters", () => {
    expect(appInitials("Stackbridge Rewards")).toBe("SR")
    expect(appInitials("  epoch   watch ")).toBe("EW")
    expect(appInitials("Gaugeboard")).toBe("GA")
    expect(appInitials("")).toBe("?")
  })
})

describe("appMarkTone", () => {
  it("is stable per name", () => {
    expect(appMarkTone("Gaugeboard")).toBe(appMarkTone("Gaugeboard"))
    expect(["ink", "accent", "neutral"]).toContain(appMarkTone("Epoch Watch"))
  })
})

describe("identiconGradient", () => {
  it("is stable per address and case-insensitive", () => {
    const address = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
    expect(identiconGradient(address)).toBe(
      identiconGradient(address.toUpperCase().replace("0X", "0x")),
    )
    expect(identiconGradient(address)).toMatch(/^linear-gradient\(135deg, hsl/)
    expect(identiconGradient(address)).not.toBe(
      identiconGradient("0x70997970c51812dc3a010c7d01b50e0d17dc79c8"),
    )
  })
})

describe("formatShortDate", () => {
  it("drops the year only for the current year", () => {
    const now = new Date("2026-10-21T12:00:00Z")
    expect(formatShortDate("2026-10-12T12:00:00Z", now)).not.toMatch(/2026/)
    expect(formatShortDate("2025-10-12T12:00:00Z", now)).toMatch(/2025/)
  })
})
