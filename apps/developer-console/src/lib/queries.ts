import type { EnvironmentKind } from "@repo/platform-contracts/network"
import { QueryCache, QueryClient, queryOptions } from "@tanstack/react-query"
import * as api from "./api"
import { ApiError } from "./api-client"
import { markServiceDisabled } from "./service-status"

/** Query keys + options for every read. Mutations invalidate by prefix. */
export const keys = {
  me: ["me"] as const,
  passkeys: ["me", "passkeys"] as const,
  sessions: ["me", "sessions"] as const,
  orgs: ["orgs"] as const,
  org: (orgId: string) => ["orgs", orgId] as const,
  members: (orgId: string) => ["orgs", orgId, "members"] as const,
  invitations: (orgId: string) => ["orgs", orgId, "invitations"] as const,
  orgAudit: (orgId: string) => ["orgs", orgId, "audit"] as const,
  apps: (orgId: string) => ["orgs", orgId, "apps"] as const,
  app: (appId: string) => ["apps", appId] as const,
  appAudit: (appId: string) => ["apps", appId, "audit"] as const,
  environment: (appId: string, kind: EnvironmentKind) =>
    ["apps", appId, "environments", kind] as const,
  apiKeys: (environmentId: string) =>
    ["environments", environmentId, "api-keys"] as const,
  clientSecrets: (environmentId: string) =>
    ["environments", environmentId, "client-secrets"] as const,
  usage: (params: api.UsageParams) =>
    ["environments", params.environmentId, "usage", params] as const,
  request: (environmentId: string, requestId: string) =>
    ["environments", environmentId, "requests", requestId] as const,
  oauth: (environmentId: string, from: string) =>
    ["environments", environmentId, "oauth", from] as const,
  consentPreview: (environmentId: string) =>
    ["environments", environmentId, "consent-preview"] as const,
  admin: ["admin"] as const,
}

function retry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.status >= 400 && error.status < 500) return false
    if (
      error.code === "service_disabled" ||
      error.code === "invalid_response"
    ) {
      return false
    }
  }
  return failureCount < 2
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError(error) {
        if (error instanceof ApiError && error.code === "service_disabled") {
          markServiceDisabled()
        }
      },
    }),
    defaultOptions: {
      queries: { retry, staleTime: 15_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

export const meQuery = queryOptions({
  queryKey: keys.me,
  queryFn: () => api.me.get(),
  staleTime: 60_000,
})

export function orgsQuery() {
  return queryOptions({ queryKey: keys.orgs, queryFn: () => api.orgs.list() })
}

export function appsQuery(orgId: string) {
  return queryOptions({
    queryKey: keys.apps(orgId),
    queryFn: () => api.orgs.apps(orgId),
  })
}

export function appQuery(appId: string) {
  return queryOptions({
    queryKey: keys.app(appId),
    queryFn: () => api.apps.get(appId),
  })
}

export function environmentQuery(appId: string, kind: EnvironmentKind) {
  return queryOptions({
    queryKey: keys.environment(appId, kind),
    queryFn: () => api.apps.environment(appId, kind),
  })
}

export function apiKeysQuery(environmentId: string) {
  return queryOptions({
    queryKey: keys.apiKeys(environmentId),
    queryFn: () => api.environments.apiKeys(environmentId),
  })
}

export function usageQuery(params: api.UsageParams) {
  return queryOptions({
    queryKey: keys.usage(params),
    queryFn: () => api.environments.usage(params),
    staleTime: 60_000,
  })
}

export function orgAuditQuery(orgId: string, limit: number) {
  return queryOptions({
    queryKey: [...keys.orgAudit(orgId), limit],
    queryFn: () => api.orgs.audit(orgId, { limit }),
  })
}
