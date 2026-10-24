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

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|matchbox\\.png|matchbox_icon\\.png|ogx\\.png|trellium\\.svg).*)",
  ],
}
