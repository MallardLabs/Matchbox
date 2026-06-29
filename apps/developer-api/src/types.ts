import type { DurableObjectNamespace } from "@cloudflare/workers-types"

export type Environment = {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  API_KEY_PEPPER: string
  API_GATEWAY_SECRET?: string
  MEZO_RPC_URL: string
  DEVELOPER_PLATFORM_ENABLED: string
  DEVELOPER_PROFILE_API_ENABLED: string
  API_QUOTAS: DurableObjectNamespace
}

export type Execution = {
  waitUntil(promise: Promise<unknown>): void
}

export type ApiScope = "gauges:read" | "profile:read"

export type ApiKeyContext = {
  keyId: string
  appId: string
  keyType: "publishable" | "secret"
  scopes: ApiScope[]
  allowedCidrs: string[]
  app: {
    id: string
    clientId: string
    name: string
    status: "draft" | "pending-review" | "approved" | "suspended"
    approvedScopes: ApiScope[]
    scopeVersion: number
    gaugeRequestsPerMinute: number
    gaugeRequestsPerDay: number
    profileRequestsPerMinute: number
    profileRequestsPerDay: number
  }
}
