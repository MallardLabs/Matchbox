import type {
  EnvironmentKindFilter,
  ReviewRecordState,
} from "@repo/platform-contracts/console"
import type { EnvironmentKind } from "@repo/platform-contracts/network"
import type { PlatformScope } from "@repo/platform-contracts/scopes"
import { QueryCache, QueryClient, queryOptions } from "@tanstack/react-query"
import * as api from "./api"
import { ApiError } from "./api-client"
import { markServiceDisabled } from "./service-status"

/** Query keys + options for every read. Mutations invalidate by prefix. */
export const keys = {
  me: ["me"] as const,
  sessions: ["me", "sessions"] as const,
  orgs: ["orgs"] as const,
  org: (orgId: string) => ["orgs", orgId] as const,
  members: (orgId: string) => ["orgs", orgId, "members"] as const,
  invitations: (orgId: string) => ["orgs", orgId, "invitations"] as const,
  orgAudit: (orgId: string) => ["orgs", orgId, "audit"] as const,
  apps: (orgId: string) => ["orgs", orgId, "apps"] as const,
  orgUsage: (params: api.OrgUsageParams) =>
    ["orgs", params.orgId, "usage", params] as const,
  orgQuotas: (orgId: string, kind: EnvironmentKindFilter) =>
    ["orgs", orgId, "quotas", kind] as const,
  orgReviews: (orgId: string) => ["orgs", orgId, "reviews"] as const,
  app: (appId: string) => ["apps", appId] as const,
  appAudit: (appId: string) => ["apps", appId, "audit"] as const,
  environment: (appId: string, kind: EnvironmentKind) =>
    ["apps", appId, "environments", kind] as const,
  environmentReviews: (environmentId: string) =>
    ["environments", environmentId, "reviews"] as const,
  quota: (environmentId: string) =>
    ["environments", environmentId, "quota"] as const,
  requests: (params: api.RequestLogParams) =>
    ["environments", params.environmentId, "requests", params] as const,
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
  adminReviews: (state: ReviewRecordState, scope: PlatformScope | undefined) =>
    ["admin", "reviews", state, scope ?? "any"] as const,
  adminReviewStats: ["admin", "review-stats"] as const,
  health: ["platform", "health"] as const,
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
      // Only the session read signals the kill switch; usage and health
      // also answer 503 service_disabled when analytics is unavailable.
      onError(error, query) {
        if (
          query.queryKey[0] === keys.me[0] &&
          query.queryKey.length === 1 &&
          error instanceof ApiError &&
          error.code === "service_disabled"
        ) {
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

export function orgUsageQuery(params: api.OrgUsageParams) {
  return queryOptions({
    queryKey: keys.orgUsage(params),
    queryFn: () => api.orgs.usage(params),
    staleTime: 60_000,
  })
}

export function orgQuotasQuery(orgId: string, kind: EnvironmentKindFilter) {
  return queryOptions({
    queryKey: keys.orgQuotas(orgId, kind),
    queryFn: () => api.orgs.quotas(orgId, kind),
    staleTime: 30_000,
  })
}

export function orgReviewsQuery(orgId: string) {
  return queryOptions({
    queryKey: keys.orgReviews(orgId),
    queryFn: () => api.orgs.reviews(orgId, { limit: 10 }),
  })
}

export function environmentReviewsQuery(environmentId: string) {
  return queryOptions({
    queryKey: keys.environmentReviews(environmentId),
    queryFn: () => api.environments.reviews(environmentId),
  })
}

export function quotaQuery(environmentId: string) {
  return queryOptions({
    queryKey: keys.quota(environmentId),
    queryFn: () => api.environments.quota(environmentId),
    staleTime: 30_000,
  })
}

export const healthQuery = queryOptions({
  queryKey: keys.health,
  queryFn: () => api.platform.health(),
  staleTime: 60_000,
  refetchInterval: 60_000,
})

export function orgAuditQuery(orgId: string, limit: number) {
  return queryOptions({
    queryKey: [...keys.orgAudit(orgId), limit],
    queryFn: () => api.orgs.audit(orgId, { limit }),
  })
}
