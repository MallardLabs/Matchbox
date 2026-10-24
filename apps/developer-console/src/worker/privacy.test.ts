import { describe, expect, it } from "vitest"
import { privacyPolicyUrl, privacyRedirect } from "./privacy"

describe("privacy redirect", () => {
  it("sends the old console privacy page to the Matchbox policy", () => {
    for (const path of ["/privacy", "/privacy/"]) {
      const response = privacyRedirect(
        new URL(`https://developer.matchbox.markets${path}`),
      )
      expect(response?.status).toBe(301)
      expect(response?.headers.get("Location")).toBe(privacyPolicyUrl)
    }
  })

  it("leaves other paths alone", () => {
    for (const path of ["/", "/privacy-notes", "/api/privacy", "/docs"]) {
      expect(
        privacyRedirect(new URL(`https://developer.matchbox.markets${path}`)),
      ).toBeNull()
    }
  })
})
