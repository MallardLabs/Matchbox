import { describe, expect, it } from "vitest"
import { requestIpIsAllowed, secretKeyIsServerSide } from "./auth"
import { hmacSha256Base64Url, timingSafeEqual } from "./crypto"

describe("API credential security", () => {
  it("creates deterministic URL-safe HMAC hashes", async () => {
    const first = await hmacSha256Base64Url(
      "pepper",
      "mbx_sk_live_example_secret",
    )
    const second = await hmacSha256Base64Url(
      "pepper",
      "mbx_sk_live_example_secret",
    )
    expect(first).toBe(second)
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(timingSafeEqual(first, second)).toBe(true)
    expect(timingSafeEqual(first, `${second}x`)).toBe(false)
  })

  it("enforces IPv4 and IPv6 CIDR allowlists", () => {
    const ipv4Request = new Request("https://api.matchbox.markets", {
      headers: { "CF-Connecting-IP": "203.0.113.42" },
    })
    const ipv6Request = new Request("https://api.matchbox.markets", {
      headers: { "CF-Connecting-IP": "2001:db8::42" },
    })
    expect(requestIpIsAllowed(ipv4Request, ["203.0.113.0/24"])).toBe(true)
    expect(requestIpIsAllowed(ipv4Request, ["198.51.100.0/24"])).toBe(false)
    expect(requestIpIsAllowed(ipv6Request, ["2001:db8::/32"])).toBe(true)
  })

  it("trusts a proxied client IP only with the gateway secret", () => {
    const request = new Request("https://api.matchbox.markets", {
      headers: {
        "CF-Connecting-IP": "198.51.100.10",
        "X-Matchbox-Client-IP": "203.0.113.42",
        "X-Matchbox-Gateway-Secret": "gateway-secret",
      },
    })
    expect(
      requestIpIsAllowed(request, ["203.0.113.0/24"], "gateway-secret"),
    ).toBe(true)
    expect(
      requestIpIsAllowed(request, ["203.0.113.0/24"], "wrong-secret"),
    ).toBe(false)
  })

  it("rejects secret keys presented by browser origins", () => {
    const browserRequest = new Request("https://api.matchbox.markets", {
      headers: { Origin: "https://partner.example" },
    })
    expect(
      secretKeyIsServerSide(browserRequest, {
        keyId: "key",
        appId: "app",
        keyType: "secret",
        scopes: ["profile:read"],
        allowedCidrs: [],
        app: {
          id: "app",
          clientId: "mbx_app_test",
          name: "Test",
          status: "approved",
          approvedScopes: ["profile:read"],
          scopeVersion: 1,
          gaugeRequestsPerMinute: 120,
          gaugeRequestsPerDay: 10_000,
          profileRequestsPerMinute: 60,
          profileRequestsPerDay: 2_000,
        },
      }),
    ).toBe(false)
  })
})
