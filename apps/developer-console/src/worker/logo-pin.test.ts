import { submitReviewResponseSchema } from "@repo/platform-contracts/console"
import { describe, expect, it } from "vitest"
import {
  type LogoFetch,
  logoUrlProblem,
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

function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location } })
}

/** Answers each URL from `routes`; records every request. */
function routed(routes: Record<string, () => Response>) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchLogo: LogoFetch = async (url, init) => {
    calls.push({ url, init })
    const route = routes[url]
    return route === undefined ? new Response(null, { status: 404 }) : route()
  }
  return { calls, fetchLogo }
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
          throw new Error("network")
        },
        logoUrl,
        "fetch-failed",
      ],
    ]
    for (const [fetchLogo, url, reason] of cases) {
      expect(await pinLogo(fetchLogo, url)).toEqual({ ok: false, reason })
    }
  })

  it("refuses IP literals, local names, ports and credentials", async () => {
    const refused = [
      "https://127.0.0.1/logo.png",
      "https://10.0.0.8/logo.png",
      "https://[::1]/logo.png",
      "https://localhost/logo.png",
      "https://intranet/logo.png",
      "https://printer.local/logo.png",
      "https://metadata.google.internal/logo.png",
      "https://cdn.example.com:8443/logo.png",
      "https://user:pass@cdn.example.com/logo.png",
    ]
    for (const url of refused) {
      expect(logoUrlProblem(new URL(url))).toBe("bad-host")
      const { calls, fetchLogo } = routed({})
      expect(await pinLogo(fetchLogo, url)).toEqual({
        ok: false,
        reason: "bad-host",
      })
      expect(calls).toEqual([])
    }
    expect(logoUrlProblem(new URL(logoUrl))).toBeNull()
  })

  it("follows up to three redirects by hand, re-checking each hop", async () => {
    const { calls, fetchLogo } = routed({
      [logoUrl]: () => redirectTo("/a"),
      "https://cdn.example.com/a": () =>
        redirectTo("https://img.example.net/b"),
      "https://img.example.net/b": () => redirectTo("/c"),
      "https://img.example.net/c": () => new Response(png),
    })
    const result = await pinLogo(fetchLogo, logoUrl)
    expect(result.ok).toBe(true)
    expect(calls.map((call) => call.url)).toEqual([
      logoUrl,
      "https://cdn.example.com/a",
      "https://img.example.net/b",
      "https://img.example.net/c",
    ])
    for (const call of calls) expect(call.init.redirect).toBe("manual")
  })

  it("refuses a fourth redirect and redirects off HTTPS or public hosts", async () => {
    const chain = routed({
      [logoUrl]: () => redirectTo("/1"),
      "https://cdn.example.com/1": () => redirectTo("/2"),
      "https://cdn.example.com/2": () => redirectTo("/3"),
      "https://cdn.example.com/3": () => redirectTo("/4"),
      "https://cdn.example.com/4": () => new Response(png),
    })
    expect(await pinLogo(chain.fetchLogo, logoUrl)).toEqual({
      ok: false,
      reason: "too-many-redirects",
    })
    expect(chain.calls).toHaveLength(4)

    const targets: [string, string][] = [
      ["http://cdn.example.com/logo.png", "not-https"],
      ["https://169.254.169.254/latest", "bad-host"],
      ["https://localhost/logo.png", "bad-host"],
    ]
    for (const [target, reason] of targets) {
      const hop = routed({
        [logoUrl]: () => redirectTo(target),
        [target]: () => new Response(png),
      })
      expect(await pinLogo(hop.fetchLogo, logoUrl)).toEqual({
        ok: false,
        reason,
      })
      expect(hop.calls).toHaveLength(1)
    }
  })

  it("bounds a slow body, not just slow headers, by one deadline", async () => {
    let cancelled = false
    const trickle: LogoFetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            // The magic bytes, then nothing: the body never ends.
            controller.enqueue(png.subarray(0, 4))
          },
          cancel() {
            cancelled = true
          },
        }),
      )
    const started = Date.now()
    expect(await pinLogo(trickle, logoUrl, 50)).toEqual({
      ok: false,
      reason: "timeout",
    })
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(cancelled).toBe(true)

    const hang: LogoFetch = () => new Promise<Response>(() => undefined)
    expect(await pinLogo(hang, logoUrl, 50)).toEqual({
      ok: false,
      reason: "timeout",
    })
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
