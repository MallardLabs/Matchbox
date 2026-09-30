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
