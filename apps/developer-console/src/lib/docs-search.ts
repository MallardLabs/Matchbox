import { changelog } from "./changelog"
import { type DocPageSlug, docPages } from "./docs-pages"
import type { EndpointGroup } from "./openapi"

export type DocsTarget =
  | { kind: "quickstart" }
  | { kind: "reference"; anchor?: string }
  | { kind: "guide"; page: DocPageSlug }

export type DocsEntry = {
  id: string
  group: "Guides" | "Reference"
  title: string
  /** Secondary text: guide keywords or the endpoint summary. */
  detail: string
  /** HTTP method for endpoints. */
  method: string | null
  keywords: string
  target: DocsTarget
}

/** Short keyword hints per guide (design: "keys · origins"). */
const guideHints: Record<DocPageSlug, string> = {
  auth: "keys · origins",
  oidc: "OIDC · PKCE",
  "rate-limits": "429 · headers",
  errors: "codes",
  pagination: "cursors",
  environments: "test · live",
  changelog: "releases",
}

const guideKeywords: Record<DocPageSlug, string> = {
  auth: "api key secret publishable bearer authorization origin cidr rotate",
  oidc: "openid oauth sign in login pkce token userinfo redirect consent claims discord wallet",
  "rate-limits": "quota limit burst retry-after ratelimit",
  errors: "error code status problem request id",
  pagination: "cursor next page limit",
  environments: "test live mezo testnet network review",
  changelog: changelog
    .map((entry) => `${entry.version} ${entry.title}`)
    .join(" "),
}

export function buildDocsIndex(groups: EndpointGroup[]): DocsEntry[] {
  const pages: DocsEntry[] = [
    {
      id: "quickstart",
      group: "Guides",
      title: "Quickstart",
      detail: "install · first request",
      method: null,
      keywords: "start sdk install npm pnpm curl typescript base url",
      target: { kind: "quickstart" },
    },
    ...docPages.map(
      (page): DocsEntry => ({
        id: `guide-${page.slug}`,
        group: "Guides",
        title: page.title,
        detail: guideHints[page.slug],
        method: null,
        keywords: guideKeywords[page.slug],
        target: { kind: "guide", page: page.slug },
      }),
    ),
    {
      id: "reference",
      group: "Reference",
      title: "API reference",
      detail: "OpenAPI",
      method: null,
      keywords: "openapi endpoints schema",
      target: { kind: "reference" },
    },
  ]
  const endpoints = groups.flatMap((group) =>
    group.endpoints.map(
      (endpoint): DocsEntry => ({
        id: `endpoint-${endpoint.id}`,
        group: "Reference",
        title: endpoint.path,
        detail: endpoint.summary,
        method: endpoint.method.toUpperCase(),
        keywords: `${group.tag} ${endpoint.operationId} ${endpoint.description ?? ""}`,
        target: { kind: "reference", anchor: endpoint.id },
      }),
    ),
  )
  return [...pages, ...endpoints]
}

function rank(entry: DocsEntry, query: string): number {
  const title = entry.title.toLowerCase()
  if (title === query) return 0
  if (title.startsWith(query)) return 1
  if (title.includes(query)) return 2
  if (entry.detail.toLowerCase().includes(query)) return 3
  return 4
}

/**
 * Every term must appear in the title, detail or keywords. Exact and
 * prefix title matches first; guides before endpoints on ties. An empty
 * query lists the guides.
 */
export function searchDocs(
  index: DocsEntry[],
  query: string,
  limit = 8,
): DocsEntry[] {
  const normalized = query.trim().toLowerCase()
  if (normalized === "") {
    return index.filter((entry) => entry.method === null).slice(0, limit)
  }
  const terms = normalized.split(/\s+/)
  return index
    .map((entry, position) => ({
      entry,
      position,
      haystack:
        `${entry.title} ${entry.detail} ${entry.method ?? ""} ${entry.keywords}`.toLowerCase(),
    }))
    .filter(({ haystack }) => terms.every((term) => haystack.includes(term)))
    .map((item) => ({ ...item, score: rank(item.entry, normalized) }))
    .sort(
      (left, right) =>
        left.score - right.score ||
        Number(left.entry.method !== null) -
          Number(right.entry.method !== null) ||
        left.position - right.position,
    )
    .slice(0, limit)
    .map((item) => item.entry)
}
