import { type DocPageSlug, docPages } from "../lib/docs-pages"

/**
 * Per-route title, description, canonical URL and Open Graph / Twitter card
 * tags for SPA documents. Link unfurlers (Slack, Discord, X, iMessage,
 * LinkedIn) don't run JS, so the Worker replaces the shell's defaults
 * (index.html) on the way out. Cards: public/og/*.png (scripts/og).
 */

export const siteOrigin = "https://developer.matchbox.markets"
const siteName = "Matchbox Developer"

const cards = {
  default: {
    path: "/og/default.png",
    alt: "Matchbox Developer: API keys, gauge data and Sign in with Matchbox",
  },
  docs: {
    path: "/og/docs.png",
    alt: "Matchbox Developer docs: quickstart, guides and API reference",
  },
} as const

export type PageMeta = {
  /** Document title, matching what the route's `useTitle` sets. */
  title: string
  description: string
  /** Canonical path. */
  path: string
  card: keyof typeof cards
}

const home: PageMeta = {
  title: siteName,
  description: "API keys, Mezo Earn gauge data and Sign in with Matchbox.",
  path: "/",
  card: "default",
}

export const guideDescriptions: Partial<Record<DocPageSlug, string>> = {
  auth: "Bearer API keys per environment: secret and publishable keys, allowed origins and rotation.",
  oidc: "Add Sign in with Matchbox: OpenID Connect with wallet sign-in, PKCE, scopes and consent.",
  "rate-limits":
    "Per-environment burst limits and daily quotas, rate-limit headers and 429 Retry-After.",
  errors:
    "JSON error bodies with a stable code and request id, plus validation issues.",
  pagination:
    "Cursor pagination for list endpoints: pass nextCursor back as cursor until it is null.",
  environments:
    "Test and live environments on Mezo testnet and mainnet, with separate keys, secrets and redirect URIs.",
  changelog: "Releases and changes to the Matchbox API, SDK and console.",
}

function docsTitle(title: string): string {
  return `${title} · Docs · ${siteName}`
}

/** Meta for a pathname; unknown and signed-in routes get the home meta. */
export function pageMeta(pathname: string): PageMeta {
  const trimmed = pathname.replace(/\/+$/, "")
  const path = trimmed === "" ? "/" : trimmed
  if (path === "/sign-in") {
    return {
      title: `Sign in · ${siteName}`,
      description: "Manage apps, API keys and usage for the Matchbox API.",
      path,
      card: "default",
    }
  }
  if (path === "/docs") {
    return {
      title: docsTitle("Quickstart"),
      description:
        "Install the SDK and make a first Matchbox API request: read Mezo Earn gauge profiles.",
      path,
      card: "docs",
    }
  }
  if (path === "/docs/reference") {
    return {
      title: docsTitle("API reference"),
      description:
        "Matchbox API endpoints, parameters and response schemas: gauges, incentives, epochs and gauge profiles.",
      path,
      card: "docs",
    }
  }
  const slug = path.startsWith("/docs/") ? path.slice("/docs/".length) : null
  const guide = docPages.find((page) => page.slug === slug)
  if (guide !== undefined) {
    return {
      title: docsTitle(guide.title),
      description:
        guideDescriptions[guide.slug] ??
        `${guide.title} in the Matchbox API docs.`,
      path,
      card: "docs",
    }
  }
  return home
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

/** Canonical link plus description, Open Graph and Twitter card tags. */
export function metaTags(meta: PageMeta): string {
  const url = `${siteOrigin}${meta.path}`
  const card = cards[meta.card]
  const image = `${siteOrigin}${card.path}`
  const tags: Array<["name" | "property", string, string]> = [
    ["name", "description", meta.description],
    ["property", "og:type", "website"],
    ["property", "og:site_name", siteName],
    ["property", "og:title", meta.title],
    ["property", "og:description", meta.description],
    ["property", "og:url", url],
    ["property", "og:image", image],
    ["property", "og:image:type", "image/png"],
    ["property", "og:image:width", "1200"],
    ["property", "og:image:height", "630"],
    ["property", "og:image:alt", card.alt],
    ["name", "twitter:card", "summary_large_image"],
    ["name", "twitter:title", meta.title],
    ["name", "twitter:description", meta.description],
    ["name", "twitter:image", image],
    ["name", "twitter:image:alt", card.alt],
  ]
  return [
    `<link rel="canonical" href="${escapeAttribute(url)}" />`,
    ...tags.map(
      ([attribute, key, value]) =>
        `<meta ${attribute}="${key}" content="${escapeAttribute(value)}" />`,
    ),
  ].join("\n")
}

/** The shell's tags that `metaTags` replaces (so index.html can't drift). */
const replacedTags = [
  'meta[name="description"]',
  'meta[property^="og:"]',
  'meta[name^="twitter:"]',
  'link[rel="canonical"]',
].join(", ")

/** Rewrites an HTML document's title and meta for its route. */
export function withPageMeta(response: Response, url: URL): Response {
  const contentType = response.headers.get("Content-Type") ?? ""
  if (
    response.status !== 200 ||
    response.body === null ||
    !contentType.startsWith("text/html")
  ) {
    return response
  }
  const meta = pageMeta(url.pathname)
  return new HTMLRewriter()
    .on(replacedTags, {
      element(element) {
        element.remove()
      },
    })
    .on("title", {
      element(element) {
        element.setInnerContent(meta.title)
      },
    })
    .on("head", {
      element(element) {
        element.append(metaTags(meta), { html: true })
      },
    })
    .transform(response)
}
