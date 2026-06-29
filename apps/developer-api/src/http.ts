import type { ApiScope } from "./types"

export const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
} as const

export function jsonResponse(
  value: unknown,
  status = 200,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...NO_STORE_HEADERS, ...headers },
  })
}

export function errorResponse(
  requestId: string,
  status: number,
  code: string,
  message: string,
  headers: HeadersInit = {},
): Response {
  return jsonResponse({ error: { code, message, requestId } }, status, {
    "X-Request-Id": requestId,
    ...headers,
  })
}

export function requiredScopeForPath(pathname: string): ApiScope {
  return pathname.startsWith("/v1/gauges/") || pathname.startsWith("/v1/vebtc/")
    ? "gauges:read"
    : "profile:read"
}

export function corsPreflight(request: Request): Response {
  const origin = request.headers.get("Origin") ?? "*"
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  })
}
