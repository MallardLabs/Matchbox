/**
 * Content-Security-Policy for the Matchbox ID SPA (served from ASSETS with a
 * generated `_headers` file). Scripts are same-origin plus the hashes of the
 * inline boot scripts (theme + process shim). Connections cover the Mezo RPCs
 * and WalletConnect/Coinbase endpoints the wallet stack uses.
 */

const connectSources = [
  "'self'",
  "https://rpc-internal.mezo.org",
  "https://rpc.test.mezo.org",
  "https://*.mezo.org",
  "https://cloudflare-eth.com",
  "https://*.walletconnect.com",
  "https://*.walletconnect.org",
  "wss://relay.walletconnect.com",
  "wss://relay.walletconnect.org",
  "wss://*.walletconnect.com",
  "wss://*.walletconnect.org",
  "https://*.web3modal.org",
  "https://*.web3modal.com",
  "https://*.reown.com",
  "wss://*.reown.com",
  "https://*.coinbase.com",
  "wss://www.walletlink.org",
]

const frameSources = [
  "https://verify.walletconnect.com",
  "https://verify.walletconnect.org",
  "https://secure.walletconnect.org",
  "https://secure.reown.com",
]

export function spaContentSecurityPolicy(
  scriptHashes: readonly string[],
): string {
  const scripts = ["'self'", ...scriptHashes.map((hash) => `'${hash}'`)]
  return [
    "default-src 'self'",
    `script-src ${scripts.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    `frame-src ${frameSources.join(" ")}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ")
}

/** Cloudflare static-assets `_headers` file for the SPA. */
export function spaHeadersFile(scriptHashes: readonly string[]): string {
  return [
    "/*",
    `  Content-Security-Policy: ${spaContentSecurityPolicy(scriptHashes)}`,
    "  Strict-Transport-Security: max-age=63072000; includeSubDomains",
    "  X-Content-Type-Options: nosniff",
    "  X-Frame-Options: DENY",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  Cross-Origin-Opener-Policy: same-origin-allow-popups",
    "  Permissions-Policy: camera=(), microphone=(), geolocation=()",
    "/authorize",
    "  ! Referrer-Policy",
    "  Referrer-Policy: no-referrer",
    "",
  ].join("\n")
}
