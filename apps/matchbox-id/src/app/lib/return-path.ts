import { authorizationRequestIdSchema } from "@repo/platform-contracts/identity"

/**
 * `?return=` values must be same-origin relative paths ("/authorize?..."),
 * never protocol-relative ("//evil"), backslash tricks or absolute URLs.
 */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return null
  }
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return null
  }
  const base = "https://id.invalid"
  let url: URL
  try {
    url = new URL(value, base)
  } catch {
    return null
  }
  if (url.origin !== base) return null
  return `${url.pathname}${url.search}`
}

/** The request id when a return path is the consent page, else null. */
export function authorizationRequestIdOf(path: string | null): string | null {
  if (path === null) return null
  const url = new URL(path, "https://id.invalid")
  if (url.pathname !== "/authorize") return null
  const id = authorizationRequestIdSchema.safeParse(
    url.searchParams.get("request"),
  )
  return id.success ? id.data : null
}
