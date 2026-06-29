import { createLogger } from "@repo/shared/logger"
import openApiDocument from "../openapi.json"
import {
  authenticateApiKey,
  hasScope,
  publishableOriginIsAllowed,
  requestIpIsAllowed,
  secretKeyIsServerSide,
} from "./auth"
import { exchangeAuthorizationCode } from "./authorizations"
import { sha256Base64Url } from "./crypto"
import { createDatabase } from "./database"
import { getGauge } from "./gauges"
import {
  corsPreflight,
  errorResponse,
  jsonResponse,
  requiredScopeForPath,
} from "./http"
import { getConsentedProfile } from "./profiles"
import { ApiQuotaLimiter, consumeQuota } from "./quota"
import type { Environment, Execution } from "./types"

export { ApiQuotaLimiter }

const logger = createLogger("developer-api")

function rateLimitHeaders(result: {
  limit: number
  remaining: number
  resetSeconds: number
}): HeadersInit {
  return {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(result.resetSeconds),
  }
}

function withResponseHeaders(
  response: Response,
  requestId: string,
  origin: string | null,
): Response {
  const headers = new Headers(response.headers)
  headers.set("X-Request-Id", requestId)
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin)
    headers.set("Vary", "Origin")
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

async function routeRequest(
  request: Request,
  environment: Environment,
  execution: Execution,
): Promise<Response> {
  const requestId = crypto.randomUUID()
  const url = new URL(request.url)

  if (request.method === "OPTIONS") return corsPreflight(request)
  if (url.pathname === "/health") {
    return jsonResponse({
      status: "ok",
      platformEnabled: environment.DEVELOPER_PLATFORM_ENABLED === "true",
    })
  }
  if (url.pathname === "/openapi.json") {
    return jsonResponse(openApiDocument, 200, {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    })
  }
  if (environment.DEVELOPER_PLATFORM_ENABLED !== "true") {
    return errorResponse(
      requestId,
      503,
      "platform_disabled",
      "The Matchbox Developer Platform is not currently available.",
    )
  }
  if (
    !environment.SUPABASE_URL ||
    !environment.SUPABASE_SERVICE_ROLE_KEY ||
    !environment.API_KEY_PEPPER
  ) {
    return errorResponse(
      requestId,
      503,
      "platform_not_configured",
      "The Matchbox Developer Platform is not configured.",
    )
  }
  if (!url.pathname.startsWith("/v1/")) {
    return errorResponse(
      requestId,
      404,
      "not_found",
      "The requested resource was not found.",
    )
  }

  const database = createDatabase(environment)
  const authentication = await authenticateApiKey(
    request,
    database,
    environment,
  )
  if (!authentication.ok) {
    return errorResponse(
      requestId,
      authentication.reason === "inactive-app" ? 403 : 401,
      authentication.reason,
      "The API key is invalid or cannot access this application.",
    )
  }
  const context = authentication.context
  const requiredScope = requiredScopeForPath(url.pathname)
  if (!hasScope(context, requiredScope)) {
    return errorResponse(
      requestId,
      403,
      "insufficient_scope",
      "The API key does not have the required scope.",
    )
  }
  if (
    !requestIpIsAllowed(
      request,
      context.allowedCidrs,
      environment.API_GATEWAY_SECRET,
    )
  ) {
    return errorResponse(
      requestId,
      403,
      "ip_not_allowed",
      "This request did not originate from an allowed network.",
    )
  }
  if (!(await publishableOriginIsAllowed(request, database, context))) {
    return errorResponse(
      requestId,
      403,
      "origin_not_allowed",
      "This origin is not registered for the application.",
    )
  }
  if (!secretKeyIsServerSide(request, context)) {
    return errorResponse(
      requestId,
      403,
      "server_side_key_required",
      "Secret API keys cannot be used from a browser origin.",
    )
  }
  if (
    requiredScope === "profile:read" &&
    environment.DEVELOPER_PROFILE_API_ENABLED !== "true"
  ) {
    return errorResponse(
      requestId,
      503,
      "profile_api_disabled",
      "Profile access is not currently available.",
    )
  }

  const bucket = requiredScope === "gauges:read" ? "gauge" : "profile"
  const quota = await consumeQuota(environment, context, bucket)
  if (!quota.allowed) {
    return errorResponse(
      requestId,
      429,
      "rate_limit_exceeded",
      "This API key has exceeded its request quota.",
      { ...rateLimitHeaders(quota), "Retry-After": String(quota.resetSeconds) },
    )
  }

  execution.waitUntil(
    Promise.resolve(
      database
        .from("developer_api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", context.keyId),
    ).then(() => undefined),
  )
  execution.waitUntil(
    Promise.resolve(
      database.rpc("increment_developer_usage", {
        api_key_id: context.keyId,
        usage_bucket: bucket,
        was_error: false,
      }),
    ).then(() => undefined),
  )

  let response: Response
  const gaugeAddressMatch = /^\/v1\/gauges\/([^/]+)$/.exec(url.pathname)
  const veBtcMatch = /^\/v1\/vebtc\/(\d+)\/gauge$/.exec(url.pathname)
  const profileMatch = /^\/v1\/profiles\/by-wallet\/([^/]+)$/.exec(url.pathname)

  if (request.method === "GET" && gaugeAddressMatch) {
    const gauge = await getGauge(
      {
        type: "address",
        value: decodeURIComponent(gaugeAddressMatch[1] ?? ""),
      },
      database,
      environment,
    )
    if (!gauge) {
      response = errorResponse(
        requestId,
        404,
        "gauge_not_found",
        "The requested gauge was not found.",
      )
    } else {
      const body = { data: gauge }
      const etag = `"${await sha256Base64Url(JSON.stringify(body))}"`
      response = jsonResponse(body, 200, {
        "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
        ETag: etag,
        ...rateLimitHeaders(quota),
      })
    }
  } else if (request.method === "GET" && veBtcMatch) {
    const gauge = await getGauge(
      { type: "token-id", value: veBtcMatch[1] ?? "" },
      database,
      environment,
    )
    response = gauge
      ? jsonResponse({ data: gauge }, 200, {
          "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
          ...rateLimitHeaders(quota),
        })
      : errorResponse(
          requestId,
          404,
          "gauge_not_found",
          "The requested gauge was not found.",
        )
  } else if (request.method === "GET" && profileMatch) {
    const profile = await getConsentedProfile(
      decodeURIComponent(profileMatch[1] ?? ""),
      context,
      database,
    )
    response = profile
      ? jsonResponse({ data: profile }, 200, rateLimitHeaders(quota))
      : errorResponse(
          requestId,
          404,
          "profile_not_available",
          "The requested profile is not available to this application.",
        )
  } else if (
    request.method === "POST" &&
    url.pathname === "/v1/authorizations/exchange"
  ) {
    const rawBody: unknown = await request.json()
    const result = await exchangeAuthorizationCode(rawBody, context, database)
    response =
      result.type === "success"
        ? jsonResponse({ data: result.data }, 200, rateLimitHeaders(quota))
        : errorResponse(
            requestId,
            result.type === "malformed" ? 400 : 400,
            result.type === "malformed" ? "invalid_request" : "invalid_grant",
            result.type === "malformed"
              ? "The authorization exchange request is invalid."
              : "The authorization code is invalid, expired, or already used.",
          )
  } else {
    response = errorResponse(
      requestId,
      404,
      "not_found",
      "The requested resource was not found.",
    )
  }

  return withResponseHeaders(response, requestId, request.headers.get("Origin"))
}

export default {
  async fetch(
    request: Request,
    environment: Environment,
    execution: Execution,
  ): Promise<Response> {
    try {
      return await routeRequest(request, environment, execution)
    } catch (error) {
      const requestId = crypto.randomUUID()
      logger.error({
        message: "Unhandled Developer API request failure",
        requestId,
        error: error instanceof Error ? error.message : "Unknown error",
      })
      return errorResponse(
        requestId,
        500,
        "internal_error",
        "The request could not be completed.",
      )
    }
  },
}
