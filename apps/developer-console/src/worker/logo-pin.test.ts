import {
  adminReviewLogoResponseSchema,
  submitReviewResponseSchema,
} from "@repo/platform-contracts/console"
import { describe, expect, it } from "vitest"
import {
  type LogoFetch,
  logoUrlProblem,
  maxPinnedLogoBytes,
  pinLogo,
  sniffLogoType,
} from "./logo-pin"
import { type Harness, createHarness } from "./test/harness"

const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
])
// Another valid PNG: the lookalike a cloaking server would hand the Worker.
const lookalike = new Uint8Array([...png, 0x4d, 0x45, 0x5a, 0x4f])
const logoUrl = "https://cdn.example.com/logo.png"

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function latin1(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0))
}

/** A PNG chunk (big-endian length, type, data, CRC left zero). */
function pngChunk(type: string, length: number): Uint8Array {
  const out = new Uint8Array(12 + length)
  new DataView(out.buffer).setUint32(0, length)
  out.set(latin1(type), 4)
  return out
}

const stillPng = concat([
  png.subarray(0, 8),
  pngChunk("IHDR", 13),
  pngChunk("IDAT", 10),
  pngChunk("IEND", 0),
])
const apng = concat([
  png.subarray(0, 8),
  pngChunk("IHDR", 13),
  pngChunk("acTL", 8),
  pngChunk("fcTL", 26),
  pngChunk("IDAT", 10),
  pngChunk("IEND", 0),
])

function gif({
  frames,
  loop = false,
  palette = false,
}: {
  frames: number
  loop?: boolean
  palette?: boolean
}): Uint8Array {
  // Logical screen descriptor: 1x1, global color table of 2 entries or none.
  const header = latin1("GIF89a")
  const screen = new Uint8Array([1, 0, 1, 0, palette ? 0x80 : 0, 0, 0])
  const globalTable = new Uint8Array(palette ? 6 : 0)
  const netscape = concat([
    new Uint8Array([0x21, 0xff, 11]),
    latin1("NETSCAPE2.0"),
    new Uint8Array([3, 1, 0, 0, 0]),
  ])
  const control = new Uint8Array([0x21, 0xf9, 4, 0, 100, 0, 0, 0])
  // Descriptor (no local table), LZW minimum code size, one data sub-block.
  const frame = new Uint8Array([
    0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 0x01, 0,
  ])
  return concat([
    header,
    screen,
    globalTable,
    ...(loop ? [netscape] : []),
    ...Array.from({ length: frames }, () => concat([control, frame])),
    new Uint8Array([0x3b]),
  ])
}

/** A RIFF chunk (little-endian size, data padded to even). */
function chunk4(type: string, size: number): Uint8Array {
  const out = new Uint8Array(8 + size + (size % 2))
  out.set(latin1(type), 0)
  new DataView(out.buffer).setUint32(4, size, true)
  return out
}

function vp8x(flags: number): Uint8Array {
  const out = chunk4("VP8X", 10)
  out[8] = flags
  return out
}

function webp(chunks: Uint8Array[]): Uint8Array {
  const body = concat([latin1("WEBP"), ...chunks])
  const header = concat([latin1("RIFF"), new Uint8Array(4)])
  new DataView(header.buffer).setUint32(4, body.length, true)
  return concat([header, body])
}

function deferred() {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

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

  it("refuses animations that could switch frames after review", async () => {
    // PoC: frame one is the logo staff approve; a later frame (or an APNG
    // fcTL frame) is a Matchbox lookalike that appears after N seconds.
    const animated: [string, Uint8Array][] = [
      ["APNG", apng],
      ["two-frame GIF", gif({ frames: 2 })],
      ["looping GIF", gif({ frames: 1, loop: true })],
      ["two-frame GIF, global palette", gif({ frames: 2, palette: true })],
      ["animated WebP (VP8X flag)", webp([vp8x(0x02), chunk4("VP8 ", 4)])],
      ["WebP with ANIM", webp([vp8x(0), chunk4("ANIM", 6)])],
    ]
    for (const [name, bytes] of animated) {
      expect(await pinLogo(serve(bytes), logoUrl), name).toEqual({
        ok: false,
        reason: "animated",
      })
    }
    const still: [string, Uint8Array][] = [
      ["PNG", stillPng],
      ["one-frame GIF", gif({ frames: 1 })],
      ["one-frame GIF, global palette", gif({ frames: 1, palette: true })],
      ["lossy WebP", webp([chunk4("VP8 ", 4)])],
      ["extended WebP", webp([vp8x(0x10), chunk4("VP8L", 5)])],
    ]
    for (const [name, bytes] of still) {
      const result = await pinLogo(serve(bytes), logoUrl)
      expect(result.ok, name).toBe(true)
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

describe("the reviewed logo is the verified logo", () => {
  async function submitted(
    logoFetch: LogoFetch,
    prepare: (harness: Harness) => void = () => undefined,
  ) {
    const harness = createHarness({ logoFetch })
    prepare(harness)
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
    const response = await harness.json(
      await harness.request(
        "POST",
        `/api/environments/${live.id}/submit-review`,
        { cookie, body: {} },
      ),
      submitReviewResponseSchema,
    )
    const reviewId = response.review?.id ?? ""
    expect(reviewId).not.toBe("")
    const shown = await harness.json(
      await harness.request("GET", `/api/admin/reviews/${reviewId}/logo`, {
        cookie: staffCookie,
      }),
      adminReviewLogoResponseSchema,
    )
    function decide(logoSha256?: string | null) {
      return harness.request(
        "POST",
        `/api/admin/reviews/${reviewId}/decision`,
        {
          cookie: staffCookie,
          body: {
            decision: "approve",
            ...(logoSha256 === undefined ? {} : { logoSha256 }),
          },
        },
      )
    }
    async function state() {
      return {
        review: (await harness.store.getReview(reviewId))?.state,
        verifiedAt:
          (await harness.store.getEnvironment(live.id))?.verifiedAt ?? null,
        logo: harness.store.verifiedLogo(live.id),
      }
    }
    return { harness, app, live, cookie, reviewId, shown, decide, state }
  }

  it("shows staff the bytes the Worker will verify, even when cloaked", async () => {
    // PoC: the developer's server gives the first requester (the console at
    // submission) a benign logo and every later one a Matchbox lookalike.
    // Staff used to see nothing pinned, and the Worker fetched the URL again
    // at approval.
    let requests = 0
    const cloak: LogoFetch = async () => {
      requests += 1
      return new Response(requests === 1 ? png : lookalike)
    }
    const { shown, decide, state, harness } = await submitted(cloak)
    expect(requests).toBe(1)
    const benign = shown.logo
    expect(benign?.contentType).toBe("image/png")
    expect(atob(benign?.dataBase64 ?? "")).toHaveLength(png.length)

    expect((await decide(benign?.sha256)).status).toBe(200)
    expect(requests).toBe(1)
    const after = await state()
    expect(after.review).toBe("approved")
    expect(after.verifiedAt).not.toBeNull()
    expect(after.logo).toEqual({
      contentType: "image/png",
      dataBase64: benign?.dataBase64,
      sha256: benign?.sha256,
      sourceUrl: logoUrl,
      verifiedAt: after.verifiedAt,
    })
    const approved = harness.store
      .auditEvents()
      .find((event) => event.action === "review-approved")
    expect(approved?.metadata).toMatchObject({
      verified: true,
      logoSha256: benign?.sha256,
    })
  })

  it("refuses an approval that names other bytes, or none", async () => {
    const { shown, decide, state } = await submitted(serve(png))
    const sha = shown.logo?.sha256 ?? ""
    for (const claimed of [undefined, null, "0".repeat(64)]) {
      expect((await decide(claimed)).status).toBe(409)
      expect(await state()).toEqual({
        review: "open",
        verifiedAt: null,
        logo: null,
      })
    }
    expect((await decide(sha)).status).toBe(200)
  })

  it("refuses when the logo URL moved after submission", async () => {
    const { shown, decide, state, harness, app } = await submitted(serve(png))
    // Only live reviews freeze logoUrl; change it behind the routes' back.
    await harness.store.updateApp(app.id, { logoUrl: `${logoUrl}?v=2` })
    expect((await decide(shown.logo?.sha256)).status).toBe(409)
    expect((await state()).review).toBe("open")
  })

  it("verifies with no logo when none could be pinned", async () => {
    const { shown, decide, state } = await submitted(serve("<svg/>"))
    expect(shown.logo).toBeNull()
    expect(shown.notPinned).toMatchObject({
      reason: "not-an-image",
      sourceUrl: logoUrl,
    })
    expect((await decide(null)).status).toBe(200)
    const after = await state()
    expect(after.verifiedAt).not.toBeNull()
    expect(after.logo).toBeNull()
  })

  it("tells staff why a logo was not pinned, not just None", async () => {
    const animated = await submitted(serve(gif({ frames: 2 })))
    expect(animated.shown).toMatchObject({
      logo: null,
      notPinned: { reason: "animated", sourceUrl: logoUrl },
    })

    // The pin succeeded but its row could not be written.
    let writes = 0
    const unstored = await submitted(serve(png), (harness) => {
      const put = harness.store.putReviewLogo.bind(harness.store)
      harness.store.putReviewLogo = async (reviewId, logo) => {
        writes += 1
        if (logo.status === "pinned") throw new Error("database unavailable")
        await put(reviewId, logo)
      }
    })
    expect(writes).toBe(2)
    expect(unstored.shown).toMatchObject({
      logo: null,
      notPinned: { reason: "not-stored", sourceUrl: logoUrl },
    })
    expect((await unstored.decide(null)).status).toBe(200)
    expect((await unstored.state()).logo).toBeNull()
  })

  it("leaves the review open and nothing granted if storing the logo fails", async () => {
    const { shown, decide, state, harness } = await submitted(serve(png))
    harness.store.putVerifiedLogo = async () => {
      throw new Error("database unavailable")
    }
    expect((await decide(shown.logo?.sha256)).status).toBe(500)
    expect(await state()).toEqual({
      review: "open",
      verifiedAt: null,
      logo: null,
    })
  })

  it("keeps the winner's logo when two staff approve at once", async () => {
    // PoC: approval B passes the open check and stalls before its logo
    // write; approval A (a later clock) writes, closes and verifies; B's
    // write then lands and its close gets 409. With one row per environment
    // B's write replaced A's, the row's verifiedAt no longer matched, and the
    // verified app showed its initial.
    const { shown, decide, state, harness, live } = await submitted(serve(png))
    const sha = shown.logo?.sha256
    const put = harness.store.putVerifiedLogo.bind(harness.store)
    const stalled = deferred()
    const gate = deferred()
    let writes = 0
    harness.store.putVerifiedLogo = async (environmentId, logo) => {
      writes += 1
      if (writes === 1) {
        stalled.resolve()
        await gate.promise
      }
      await put(environmentId, logo)
    }
    const loser = decide(sha)
    await stalled.promise
    harness.advance(1_000)
    expect((await decide(sha)).status).toBe(200)
    const won = await state()
    gate.resolve()
    expect((await loser).status).toBe(409)

    const after = await state()
    expect(after.verifiedAt).toBe(won.verifiedAt)
    expect(after.logo).toMatchObject({
      sha256: sha,
      verifiedAt: won.verifiedAt,
    })
    // The loser's row sits beside it, keyed by its own (never current) time.
    expect(harness.store.verifiedLogoRows(live.id)).toHaveLength(2)
  })

  it("is staff only", async () => {
    const { harness, reviewId, cookie } = await submitted(serve(png))
    const response = await harness.request(
      "GET",
      `/api/admin/reviews/${reviewId}/logo`,
      { cookie },
    )
    expect(response.status).toBe(403)
  })
})
