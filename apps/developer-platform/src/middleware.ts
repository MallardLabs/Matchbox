import { type NextRequest, NextResponse } from "next/server"

export function middleware(request: NextRequest): NextResponse {
  const host = request.headers.get("host")?.split(":")[0]
  const pathname = request.nextUrl.pathname

  if (host === "api.matchbox.markets") {
    const apiOrigin = process.env.DEVELOPER_API_ORIGIN
    if (!apiOrigin) {
      return NextResponse.json(
        { error: "api_gateway_not_configured" },
        { status: 503 },
      )
    }
    const upstream = new URL(`${pathname}${request.nextUrl.search}`, apiOrigin)
    if (upstream.protocol !== "https:") {
      return NextResponse.json(
        { error: "invalid_api_gateway" },
        { status: 503 },
      )
    }
    const headers = new Headers(request.headers)
    headers.delete("X-Matchbox-Client-IP")
    headers.delete("X-Matchbox-Gateway-Secret")
    const clientIp = request.headers.get("x-nf-client-connection-ip")
    if (clientIp) headers.set("X-Matchbox-Client-IP", clientIp)
    if (process.env.API_GATEWAY_SECRET)
      headers.set("X-Matchbox-Gateway-Secret", process.env.API_GATEWAY_SECRET)
    return NextResponse.rewrite(upstream, { request: { headers } })
  }

  if (host === "id.matchbox.markets" && pathname === "/") {
    return NextResponse.redirect(new URL("/apps", request.url), 308)
  }
  if (host === "developer.matchbox.markets" && pathname === "/") {
    return NextResponse.redirect(new URL("/developers", request.url), 308)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
