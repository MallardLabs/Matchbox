import type { SupabaseClient } from "@supabase/supabase-js"
import ipaddr from "ipaddr.js"
import { hmacSha256Base64Url, timingSafeEqual } from "./crypto"
import { apiKeyRowSchema, appRowSchema } from "./schemas"
import type { ApiKeyContext, ApiScope, Environment } from "./types"

const KEY_PATTERN =
  /^(mbx_(?:pk|sk)_live_[A-Za-z0-9]{16})_([A-Za-z0-9_-]{32,})$/

export type AuthenticationResult =
  | { ok: true; context: ApiKeyContext }
  | { ok: false; reason: "invalid-key" | "expired-key" | "inactive-app" }

function isScopeAllowed(scopes: ApiScope[], requiredScope: ApiScope): boolean {
  return scopes.includes(requiredScope)
}

export async function authenticateApiKey(
  request: Request,
  database: SupabaseClient,
  environment: Environment,
): Promise<AuthenticationResult> {
  const authorization = request.headers.get("Authorization")
  if (!authorization?.startsWith("Bearer ")) {
    return { ok: false, reason: "invalid-key" }
  }

  const rawKey = authorization.slice("Bearer ".length).trim()
  const match = KEY_PATTERN.exec(rawKey)
  if (!match) return { ok: false, reason: "invalid-key" }

  const keyPrefix = match[1]
  const { data: rawKeyRow, error: keyError } = await database
    .from("developer_api_keys")
    .select(
      "id,app_id,key_type,key_prefix,secret_hash,scopes,allowed_cidrs,expires_at,revoked_at",
    )
    .eq("key_prefix", keyPrefix)
    .maybeSingle()

  if (keyError || !rawKeyRow) return { ok: false, reason: "invalid-key" }
  const parsedKey = apiKeyRowSchema.safeParse(rawKeyRow)
  if (!parsedKey.success || parsedKey.data.revoked_at) {
    return { ok: false, reason: "invalid-key" }
  }

  if (
    parsedKey.data.expires_at &&
    Date.parse(parsedKey.data.expires_at) <= Date.now()
  ) {
    return { ok: false, reason: "expired-key" }
  }

  const computedHash = await hmacSha256Base64Url(
    environment.API_KEY_PEPPER,
    rawKey,
  )
  if (!timingSafeEqual(computedHash, parsedKey.data.secret_hash)) {
    return { ok: false, reason: "invalid-key" }
  }

  const { data: rawApp, error: appError } = await database
    .from("developer_apps")
    .select(
      "id,client_id,name,status,approved_scopes,scope_version,gauge_requests_per_minute,gauge_requests_per_day,profile_requests_per_minute,profile_requests_per_day",
    )
    .eq("id", parsedKey.data.app_id)
    .maybeSingle()

  if (appError || !rawApp) return { ok: false, reason: "inactive-app" }
  const parsedApp = appRowSchema.safeParse(rawApp)
  if (!parsedApp.success || parsedApp.data.status !== "approved") {
    return { ok: false, reason: "inactive-app" }
  }

  return {
    ok: true,
    context: {
      keyId: parsedKey.data.id,
      appId: parsedKey.data.app_id,
      keyType: parsedKey.data.key_type,
      scopes: parsedKey.data.scopes,
      allowedCidrs: parsedKey.data.allowed_cidrs,
      app: {
        id: parsedApp.data.id,
        clientId: parsedApp.data.client_id,
        name: parsedApp.data.name,
        status: parsedApp.data.status,
        approvedScopes: parsedApp.data.approved_scopes,
        scopeVersion: parsedApp.data.scope_version,
        gaugeRequestsPerMinute: parsedApp.data.gauge_requests_per_minute,
        gaugeRequestsPerDay: parsedApp.data.gauge_requests_per_day,
        profileRequestsPerMinute: parsedApp.data.profile_requests_per_minute,
        profileRequestsPerDay: parsedApp.data.profile_requests_per_day,
      },
    },
  }
}

export function hasScope(context: ApiKeyContext, scope: ApiScope): boolean {
  return (
    isScopeAllowed(context.scopes, scope) &&
    isScopeAllowed(context.app.approvedScopes, scope)
  )
}

export function requestIpIsAllowed(
  request: Request,
  cidrs: string[],
  gatewaySecret?: string,
): boolean {
  if (cidrs.length === 0) return true
  const suppliedGatewaySecret = request.headers.get("X-Matchbox-Gateway-Secret")
  const isTrustedGateway =
    !!gatewaySecret &&
    !!suppliedGatewaySecret &&
    timingSafeEqual(gatewaySecret, suppliedGatewaySecret)
  const rawIp = isTrustedGateway
    ? request.headers.get("X-Matchbox-Client-IP")
    : request.headers.get("CF-Connecting-IP")
  if (!rawIp || !ipaddr.isValid(rawIp)) return false
  const requestIp = ipaddr.process(rawIp)

  return cidrs.some((cidr) => {
    try {
      const [network, prefix] = ipaddr.parseCIDR(cidr)
      return (
        requestIp.kind() === network.kind() && requestIp.match(network, prefix)
      )
    } catch {
      return false
    }
  })
}

export async function publishableOriginIsAllowed(
  request: Request,
  database: SupabaseClient,
  context: ApiKeyContext,
): Promise<boolean> {
  if (context.keyType !== "publishable") return true
  const origin = request.headers.get("Origin")
  if (!origin) return false

  const { data, error } = await database
    .from("developer_app_origins")
    .select("id")
    .eq("app_id", context.appId)
    .eq("origin", origin)
    .maybeSingle()

  return !error && !!data
}

export function secretKeyIsServerSide(
  request: Request,
  context: ApiKeyContext,
): boolean {
  return context.keyType !== "secret" || request.headers.get("Origin") === null
}
