import { describe, expect, it } from "vitest"
import { authorizationInputSchema, discordAvatarUrl } from "./identity"

describe("Matchbox ID authorization", () => {
  it("requires exact HTTPS authorization inputs", () => {
    expect(
      authorizationInputSchema.safeParse({
        clientId: "mbx_app_1234567890",
        redirectUri: "https://partner.example/callback",
        state: "opaque-state",
      }).success,
    ).toBe(true)
    expect(
      authorizationInputSchema.safeParse({
        clientId: "mbx_app_1234567890",
        redirectUri: "javascript:alert(1)",
        state: "opaque-state",
      }).success,
    ).toBe(false)
  })

  it("builds Discord avatars without exposing a bot token", () => {
    expect(discordAvatarUrl("123", "a_hash")).toBe(
      "https://cdn.discordapp.com/avatars/123/a_hash.gif?size=256",
    )
    expect(discordAvatarUrl("123", null)).toBeNull()
  })
})
