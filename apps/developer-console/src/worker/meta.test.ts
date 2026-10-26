import { describe, expect, it } from "vitest"
import { docPages } from "../lib/docs-pages"
import {
  guideDescriptions,
  metaTags,
  pageMeta,
  siteOrigin,
  withPageMeta,
} from "./meta"

function content(tags: string, key: string): string | undefined {
  const pattern = new RegExp(
    `<meta (?:name|property)="${key}" content="([^"]*)"`,
  )
  return pattern.exec(tags)?.[1]
}

describe("page meta", () => {
  it("titles public routes the way the SPA does", () => {
    expect(pageMeta("/").title).toBe("Matchbox Developer")
    expect(pageMeta("/sign-in").title).toBe("Sign in · Matchbox Developer")
    expect(pageMeta("/docs").title).toBe(
      "Quickstart · Docs · Matchbox Developer",
    )
    expect(pageMeta("/docs/reference").title).toBe(
      "API reference · Docs · Matchbox Developer",
    )
    expect(pageMeta("/docs/rate-limits").title).toBe(
      "Rate limits · Docs · Matchbox Developer",
    )
  })

  it("uses the docs card under /docs and canonicalizes trailing slashes", () => {
    expect(pageMeta("/docs/")).toMatchObject({ path: "/docs", card: "docs" })
    expect(pageMeta("/docs/oidc/")).toMatchObject({
      path: "/docs/oidc",
      card: "docs",
    })
    expect(pageMeta("/sign-in")).toMatchObject({ card: "default" })
  })

  it("falls back to the home meta for unknown and signed-in routes", () => {
    for (const path of ["/apps/app_1/keys", "/docs/nope", "/invite/abc"]) {
      expect(pageMeta(path)).toEqual(pageMeta("/"))
    }
    expect(pageMeta("/").path).toBe("/")
  })

  it("describes every guide page", () => {
    for (const page of docPages) {
      expect(guideDescriptions[page.slug], page.slug).toBeTruthy()
      expect(pageMeta(`/docs/${page.slug}`).description).toBe(
        guideDescriptions[page.slug],
      )
    }
  })
})

describe("meta tags", () => {
  it("emits absolute URLs and a large Twitter card", () => {
    const tags = metaTags(pageMeta("/docs/reference"))
    expect(tags).toContain(
      `<link rel="canonical" href="${siteOrigin}/docs/reference" />`,
    )
    expect(content(tags, "og:url")).toBe(`${siteOrigin}/docs/reference`)
    expect(content(tags, "og:image")).toBe(`${siteOrigin}/og/docs.png`)
    expect(content(tags, "twitter:image")).toBe(`${siteOrigin}/og/docs.png`)
    expect(content(tags, "og:image:width")).toBe("1200")
    expect(content(tags, "og:image:height")).toBe("630")
    expect(content(tags, "og:site_name")).toBe("Matchbox Developer")
    expect(content(tags, "twitter:card")).toBe("summary_large_image")
    expect(content(tags, "og:title")).toBe(
      "API reference · Docs · Matchbox Developer",
    )
    expect(content(tags, "og:image:alt")).toBeTruthy()
    expect(content(tags, "twitter:image:alt")).toBeTruthy()
  })

  it("uses the default card outside the docs", () => {
    expect(content(metaTags(pageMeta("/")), "og:image")).toBe(
      `${siteOrigin}/og/default.png`,
    )
  })

  it("escapes attribute values", () => {
    const tags = metaTags({
      title: 'A "quoted" <title> & more',
      description: "x",
      path: "/",
      card: "default",
    })
    expect(content(tags, "og:title")).toBe(
      "A &quot;quoted&quot; &lt;title&gt; &amp; more",
    )
  })
})

describe("withPageMeta", () => {
  const url = new URL(`${siteOrigin}/docs`)

  it("leaves non-HTML and non-200 responses alone", () => {
    const image = new Response("png", {
      headers: { "Content-Type": "image/png" },
    })
    expect(withPageMeta(image, url)).toBe(image)
    const notModified = new Response(null, {
      status: 304,
      headers: { "Content-Type": "text/html" },
    })
    expect(withPageMeta(notModified, url)).toBe(notModified)
  })
})
