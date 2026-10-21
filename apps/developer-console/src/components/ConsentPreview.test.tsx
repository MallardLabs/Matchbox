import { describe, expect, it } from "vitest"
import { claimDisplayValue } from "./ConsentPreview"

describe("claimDisplayValue", () => {
  it("shortens wallet addresses", () => {
    expect(
      claimDisplayValue({
        claim: "wallet_address",
        label: "Wallet address",
        value: "0x3D41aa00000000000000000000000000000f9DC3",
      }),
    ).toBe("0x3D41…9DC3")
  })

  it("shows the file name of a URL", () => {
    expect(
      claimDisplayValue({
        claim: "discord_avatar_url",
        label: "Avatar",
        value: "https://cdn.discordapp.com/embed/avatars/0.png",
      }),
    ).toBe("0.png")
  })

  it("keeps plain values and marks missing ones", () => {
    expect(
      claimDisplayValue({
        claim: "discord_id",
        label: "Discord ID",
        value: "42",
      }),
    ).toBe("42")
    expect(
      claimDisplayValue({
        claim: "discord_id",
        label: "Discord ID",
        value: null,
      }),
    ).toBe("—")
  })
})
