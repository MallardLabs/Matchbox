import { submitReviewResponseSchema } from "@repo/platform-contracts/console"
import { describe, expect, it } from "vitest"
import {
  type LogoFetch,
  maxPinnedLogoBytes,
  pinLogo,
  sniffLogoType,
} from "./logo-pin"
import { createHarness } from "./test/harness"

const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
])
const logoUrl = "https://cdn.example.com/logo.png"

function serve(body: Uint8Array | string, init: ResponseInit = {}): LogoFetch {
  return async () => new Response(body, init)
}

describe("pinLogo", () => {
  it("pins PNG bytes with their hash, whatever Content-Type says", async () => {
    const result = await pinLogo(
      serve(png, { headers: { "Content-Type": "text/html" } }),
      logoUrl,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.logo.contentType).toBe("image/png")
    expect(result.logo.sourceUrl).toBe(logoUrl)
    expect(atob(result.logo.dataBase64)).toHaveLength(png.length)
    expect(result.logo.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it("refuses non-images, oversize bodies, errors and plain HTTP", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"/>'
    const big = new Uint8Array(maxPinnedLogoBytes + 1)
    big.set(png)
    const cases: [LogoFetch, string, string][] = [
      [serve(svg), logoUrl, "not-an-image"],
      [serve(big), logoUrl, "too-large"],
      [serve(png, { status: 404 }), logoUrl, "status-404"],
      [serve(png), "http://cdn.example.com/logo.png", "not-https"],
      [
        async () => {
          throw new Error("timeout")
        },
        logoUrl,
        "fetch-failed",
      ],
    ]
    for (const [fetchLogo, url, reason] of cases) {
      expect(await pinLogo(fetchLogo, url)).toEqual({ ok: false, reason })
    }
  })

  it("recognises the four allowed formats by magic bytes", () => {
    const webp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    ])
    expect(sniffLogoType(png)).toBe("image/png")
    expect(sniffLogoType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg",
    )
    expect(sniffLogoType(new TextEncoder().encode("GIF89a"))).toBe("image/gif")
    expect(sniffLogoType(webp)).toBe("image/webp")
    expect(sniffLogoType(new TextEncoder().encode("<svg"))).toBeNull()
  })
})

describe("staff approval pins the logo", () => {
  async function approveWithLogo(logoFetch: LogoFetch) {
    const harness = createHarness({ logoFetch })
    const owner = await harness.account("owner@example.com")
    const organization = await harness.organization(owner)
    const { app, live } = await harness.appWithEnvironments(organization.id)
    await harness.store.updateApp(app.id, { logoUrl })
    const cookie = await harness.signIn(owner, { steppedUp: true })
    const reviewer = await harness.account("staff@matchbox.local")
    harness.store.seedStaff(reviewer.id, "reviewer")
    const staffCookie = await harness.signIn(reviewer, { steppedUp: true })
    await harness.request("PUT", `/api/environments/${live.id}/scopes`, {
      cookie,
      body: { requestedScopes: ["openid", "wallet"] },
    })
    const submitted = await harness.json(
      await harness.request(
        "POST",
        `/api/environments/${live.id}/submit-review`,
        { cookie, body: {} },
      ),
      submitReviewResponseSchema,
    )
    const decision = await harness.request(
      "POST",
      `/api/admin/reviews/${submitted.review?.id}/decision`,
      { cookie: staffCookie, body: { decision: "approve" } },
    )
    expect(decision.status).toBe(200)
    const environment = await harness.store.getEnvironment(live.id)
    expect(environment?.verifiedAt).not.toBeNull()
    const approved = harness.store
      .auditEvents()
      .find((event) => event.action === "review-approved")
    return {
      logo: harness.store.verifiedLogo(live.id),
      metadata: approved?.metadata,
    }
  }

  it("stores the bytes staff saw", async () => {
    const { logo, metadata } = await approveWithLogo(serve(png))
    expect(logo?.contentType).toBe("image/png")
    expect(logo?.sourceUrl).toBe(logoUrl)
    expect(metadata).toMatchObject({ verified: true, logoPinned: true })
  })

  it("verifies without a logo when it cannot be pinned", async () => {
    const { logo, metadata } = await approveWithLogo(serve("<svg/>"))
    expect(logo).toBeNull()
    expect(metadata).toMatchObject({ verified: true, logoPinned: false })
  })
})
