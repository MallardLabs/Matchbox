import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const MARKETING_HOST = "matchbox.markets"
const APP_HOST = "app.matchbox.markets"
const DOCS_HOST = "docs.matchbox.markets"

const MARKETING_PASSTHROUGH = ["/docs", "/_astro", "/pagefind", "/favicon.svg"]

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
    if (
      pathname !== "/" &&
      !MARKETING_PASSTHROUGH.some((prefix) => pathname.startsWith(prefix))
    ) {
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
