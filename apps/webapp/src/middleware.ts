import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const MARKETING_HOST = "matchbox.markets"
const APP_HOST = "app.matchbox.markets"
const DOCS_HOST = "docs.matchbox.markets"
// The docs are a separate Astro site. Netlify used to proxy these paths via
// netlify.toml; on Cloudflare Workers nothing reads that file, so proxy here.
const DOCS_ORIGIN = "https://matchdocs.netlify.app"

const DOCS_PROXY_PREFIXES = ["/docs", "/_astro", "/pagefind", "/favicon.svg"]

function docsUpstreamUrl(pathname: string, search: string): URL {
  // Next strips trailing slashes before middleware runs, but Astro 301s
  // slashless page paths back to the slashed form, so re-add it upstream to
  // avoid a redirect loop. Asset paths (with an extension) pass through as-is.
  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1)
  const isDocsPage =
    pathname.startsWith("/docs") &&
    !lastSegment.includes(".") &&
    !pathname.endsWith("/")
  return new URL(`${pathname}${isDocsPage ? "/" : ""}${search}`, DOCS_ORIGIN)
}

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]
  const { pathname } = request.nextUrl

  if (host === DOCS_HOST) {
    return NextResponse.redirect(
      new URL(
        `https://${MARKETING_HOST}/docs${pathname === "/" ? "" : pathname}${request.nextUrl.search}`,
      ),
      301,
    )
  }

  if (host === MARKETING_HOST) {
    if (DOCS_PROXY_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      return NextResponse.rewrite(
        docsUpstreamUrl(pathname, request.nextUrl.search),
      )
    }
    // Keep /api on the marketing host so same-origin fetches (e.g. pricing) are not
    // redirected to app.* — cross-origin redirects break CORS for browser fetch().
    if (pathname !== "/" && !pathname.startsWith("/api")) {
      return NextResponse.redirect(
        new URL(`https://${APP_HOST}${pathname}${request.nextUrl.search}`),
        308,
      )
    }
  }

  if (host === APP_HOST && pathname === "/") {
    return NextResponse.redirect(new URL(`https://${APP_HOST}/dashboard`), 308)
  }

  if (host === APP_HOST && pathname === "/id-bridge") {
    const response = NextResponse.next()
    const idOrigin = new URL(
      process.env.NEXT_PUBLIC_ID_URL ?? "https://id.matchbox.markets",
    ).origin
    response.headers.set("Cache-Control", "private, no-store, max-age=0")
    response.headers.set("X-Content-Type-Options", "nosniff")
    response.headers.set("Referrer-Policy", "no-referrer")
    response.headers.set(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://*.walletconnect.com wss://*.walletconnect.com https://api.web3modal.org https://*.reown.com wss://*.reown.com https://mezo-mainnet.boar.network https://cloudflare-eth.com; frame-ancestors ${idOrigin}; base-uri 'none'; form-action 'none'`,
    )
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|matchbox\\.png|matchbox_icon\\.png|ogx\\.png|trellium\\.svg).*)",
  ],
}
