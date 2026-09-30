/** Guide pages under /docs/$page (content lives in components/docs/guides). */
export const docPages = [
  { slug: "auth", title: "Authentication & keys" },
  { slug: "oidc", title: "Sign in with Matchbox" },
  { slug: "rate-limits", title: "Rate limits" },
  { slug: "errors", title: "Errors" },
  { slug: "pagination", title: "Pagination" },
  { slug: "environments", title: "Environments" },
  { slug: "changelog", title: "Changelog" },
] as const

export type DocPageSlug = (typeof docPages)[number]["slug"]

export function isDocPageSlug(value: string): value is DocPageSlug {
  return docPages.some((page) => page.slug === value)
}
