import { utf8Encode } from "@repo/platform-contracts/encoding"
import { themeScript } from "@repo/ui/theme-script"

/**
 * Headers for SPA documents served through the Worker (`ASSETS` fallthrough).
 * The only inline script is the `@repo/ui` theme script, allowed by hash.
 */

async function sha256Base64(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", utf8Encode(value)),
  )
  let binary = ""
  for (const byte of digest) binary += String.fromCharCode(byte)
  return btoa(binary)
}

let cachedPolicy: Promise<string> | null = null

export function documentContentSecurityPolicy(): Promise<string> {
  cachedPolicy ??= sha256Base64(themeScript).then((hash) =>
    [
      "default-src 'self'",
      `script-src 'self' 'sha256-${hash}'`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  )
  return cachedPolicy
}

const baseHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
} as const

const documentHeaders = {
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), publickey-credentials-get=(self), publickey-credentials-create=(self)",
} as const

/**
 * Adds security headers (and the CSP for HTML documents) to an asset. Local
 * development skips the CSP: Vite injects inline HMR/React Refresh scripts.
 */
export async function withDocumentHeaders(
  response: Response,
  options: { development?: boolean } = {},
): Promise<Response> {
  const secured = new Response(response.body, response)
  for (const [name, value] of Object.entries(baseHeaders)) {
    secured.headers.set(name, value)
  }
  const contentType = secured.headers.get("Content-Type") ?? ""
  if (contentType.startsWith("text/html")) {
    if (options.development !== true) {
      secured.headers.set(
        "Content-Security-Policy",
        await documentContentSecurityPolicy(),
      )
    }
    for (const [name, value] of Object.entries(documentHeaders)) {
      secured.headers.set(name, value)
    }
  }
  return secured
}
