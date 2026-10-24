import { okResponseSchema } from "@repo/platform-contracts/common"
import {
  type AppStatusChangeRequest,
  type AuditSearchQuery,
  type CreateApiKeyRequest,
  type CreateAppRequest,
  type EnvironmentKindFilter,
  type GoogleNoncePurpose,
  type GoogleSignInRequest,
  type MembershipRole,
  type ReviewDecisionRequest,
  type ReviewRecordState,
  type UpdateAppRequest,
  type UsageBucket,
  adminAppListResponseSchema,
  adminAppSchema,
  adminReviewContextResponseSchema,
  adminReviewListResponseSchema,
  adminReviewSchema,
  adminReviewStatsResponseSchema,
  apiKeyListResponseSchema,
  apiKeyRecordSchema,
  appListResponseSchema,
  appSchema,
  auditSearchResponseSchema,
  clientSecretListResponseSchema,
  clientSecretRecordSchema,
  consoleSessionListResponseSchema,
  createdApiKeyResponseSchema,
  createdClientSecretResponseSchema,
  environmentReviewListResponseSchema,
  environmentSchema,
  googleNonceResponseSchema,
  invitationListResponseSchema,
  invitationSchema,
  meResponseSchema,
  memberListResponseSchema,
  memberSchema,
  oauthStatsResponseSchema,
  orgReviewListResponseSchema,
  orgUsageResponseSchema,
  organizationListResponseSchema,
  organizationSchema,
  quotaOverrideListResponseSchema,
  quotaOverrideRecordSchema,
  requestLogEntrySchema,
  requestLogResponseSchema,
  type requestStatusClassSchema,
  revokeOtherSessionsResponseSchema,
  rotatedApiKeyResponseSchema,
  stepUpResponseSchema,
  submitReviewResponseSchema,
  usageResponseSchema,
} from "@repo/platform-contracts/console"
import { authorizationRequestDetailSchema } from "@repo/platform-contracts/identity"
import type { EnvironmentKind } from "@repo/platform-contracts/network"
import { platformHealthResponseSchema } from "@repo/platform-contracts/platform-health"
import {
  type EndpointClass,
  environmentQuotaListResponseSchema,
  environmentQuotaStatusSchema,
} from "@repo/platform-contracts/rate-limits"
import type { OidcScope, PlatformScope } from "@repo/platform-contracts/scopes"
import type { z } from "zod"
import { type QueryValue, apiRequest, buildUrl } from "./api-client"

/** Typed client for every console `/api/*` route in the contract. */

const post = "POST" as const

function enc(value: string): string {
  return encodeURIComponent(value)
}

export type UsageParams = {
  environmentId: string
  from: string
  to: string
  bucket: UsageBucket
  apiKeyId?: string | undefined
}

function usageQuery(params: UsageParams): Record<string, QueryValue> {
  return {
    from: params.from,
    to: params.to,
    bucket: params.bucket,
    apiKeyId: params.apiKeyId,
  }
}

export type OrgUsageParams = {
  orgId: string
  from: string
  to: string
  bucket: UsageBucket
  environmentKind: EnvironmentKindFilter
  appId?: string | undefined
  apiKeyId?: string | undefined
}

function orgUsageQuery(params: OrgUsageParams): Record<string, QueryValue> {
  return {
    from: params.from,
    to: params.to,
    bucket: params.bucket,
    environmentKind: params.environmentKind,
    appId: params.appId,
    apiKeyId: params.apiKeyId,
  }
}

export type RequestLogParams = {
  environmentId: string
  from: string
  to: string
  statusClass?: z.infer<typeof requestStatusClassSchema> | undefined
  apiKeyId?: string | undefined
  limit?: number
}

type AuditFilters = Partial<Omit<AuditSearchQuery, "limit">> & {
  limit?: number
}

function auditQuery(filters: AuditFilters): Record<string, QueryValue> {
  return { ...filters }
}

export const auth = {
  googleNonce(purpose: GoogleNoncePurpose) {
    return apiRequest(googleNonceResponseSchema, "/api/auth/google/nonce", {
      method: post,
      body: { purpose },
    })
  },
  googleSignIn(body: GoogleSignInRequest) {
    return apiRequest(meResponseSchema, "/api/auth/google", {
      method: post,
      body,
    })
  },
  googleStepUp(credential: string) {
    return apiRequest(stepUpResponseSchema, "/api/auth/step-up/google", {
      method: post,
      body: { credential },
    })
  },
  signOut() {
    return apiRequest(okResponseSchema, "/api/auth/sign-out", { method: post })
  },
  devSignIn() {
    return apiRequest(meResponseSchema, "/api/auth/dev-sign-in", {
      method: post,
    })
  },
  devStepUp() {
    return apiRequest(stepUpResponseSchema, "/api/auth/dev-step-up", {
      method: post,
    })
  },
}

export const me = {
  get() {
    return apiRequest(meResponseSchema, "/api/me")
  },
  update(body: { displayName: string }) {
    return apiRequest(meResponseSchema, "/api/me", {
      method: "PATCH",
      body,
    })
  },
  sessions() {
    return apiRequest(consoleSessionListResponseSchema, "/api/me/sessions")
  },
  revokeOtherSessions() {
    return apiRequest(
      revokeOtherSessionsResponseSchema,
      "/api/me/sessions/revoke-others",
      { method: post },
    )
  },
  revokeSession(sessionId: string) {
    return apiRequest(okResponseSchema, `/api/me/sessions/${enc(sessionId)}`, {
      method: "DELETE",
    })
  },
}

export const orgs = {
  list() {
    return apiRequest(organizationListResponseSchema, "/api/orgs")
  },
  get(orgId: string) {
    return apiRequest(organizationSchema, `/api/orgs/${enc(orgId)}`)
  },
  create(body: { name: string; slug?: string }) {
    return apiRequest(organizationSchema, "/api/orgs", { method: post, body })
  },
  update(orgId: string, body: { name?: string; slug?: string }) {
    return apiRequest(organizationSchema, `/api/orgs/${enc(orgId)}`, {
      method: "PATCH",
      body,
    })
  },
  remove(orgId: string) {
    return apiRequest(okResponseSchema, `/api/orgs/${enc(orgId)}`, {
      method: "DELETE",
    })
  },
  members(orgId: string) {
    return apiRequest(
      memberListResponseSchema,
      `/api/orgs/${enc(orgId)}/members`,
    )
  },
  updateMember(orgId: string, accountId: string, role: MembershipRole) {
    return apiRequest(
      memberSchema,
      `/api/orgs/${enc(orgId)}/members/${enc(accountId)}`,
      { method: "PATCH", body: { role } },
    )
  },
  removeMember(orgId: string, accountId: string) {
    return apiRequest(
      okResponseSchema,
      `/api/orgs/${enc(orgId)}/members/${enc(accountId)}`,
      { method: "DELETE" },
    )
  },
  invitations(orgId: string) {
    return apiRequest(
      invitationListResponseSchema,
      `/api/orgs/${enc(orgId)}/invitations`,
    )
  },
  invite(orgId: string, body: { email: string; role: MembershipRole }) {
    return apiRequest(invitationSchema, `/api/orgs/${enc(orgId)}/invitations`, {
      method: post,
      body,
    })
  },
  revokeInvitation(orgId: string, invitationId: string) {
    return apiRequest(
      okResponseSchema,
      `/api/orgs/${enc(orgId)}/invitations/${enc(invitationId)}`,
      { method: "DELETE" },
    )
  },
  acceptInvitation(token: string) {
    return apiRequest(organizationSchema, "/api/invitations/accept", {
      method: post,
      body: { token },
    })
  },
  audit(orgId: string, filters: AuditFilters = {}) {
    return apiRequest(
      auditSearchResponseSchema,
      `/api/orgs/${enc(orgId)}/audit`,
      {
        query: auditQuery(filters),
      },
    )
  },
  apps(orgId: string) {
    return apiRequest(appListResponseSchema, `/api/orgs/${enc(orgId)}/apps`)
  },
  usage(params: OrgUsageParams) {
    return apiRequest(
      orgUsageResponseSchema,
      `/api/orgs/${enc(params.orgId)}/usage`,
      { query: orgUsageQuery(params) },
    )
  },
  usageCsvUrl(params: OrgUsageParams): string {
    return buildUrl(
      `/api/orgs/${enc(params.orgId)}/usage.csv`,
      orgUsageQuery(params),
    )
  },
  quotas(orgId: string, environmentKind: EnvironmentKindFilter = "both") {
    return apiRequest(
      environmentQuotaListResponseSchema,
      `/api/orgs/${enc(orgId)}/quotas`,
      { query: { environmentKind } },
    )
  },
  reviews(
    orgId: string,
    query: { state?: ReviewRecordState | undefined; limit?: number } = {},
  ) {
    return apiRequest(
      orgReviewListResponseSchema,
      `/api/orgs/${enc(orgId)}/reviews`,
      { query: { state: query.state, limit: query.limit } },
    )
  },
  createApp(orgId: string, body: CreateAppRequest) {
    return apiRequest(appSchema, `/api/orgs/${enc(orgId)}/apps`, {
      method: post,
      body,
    })
  },
}

export const apps = {
  get(appId: string) {
    return apiRequest(appSchema, `/api/apps/${enc(appId)}`)
  },
  update(appId: string, body: UpdateAppRequest) {
    return apiRequest(appSchema, `/api/apps/${enc(appId)}`, {
      method: "PATCH",
      body,
    })
  },
  retire(appId: string) {
    return apiRequest(appSchema, `/api/apps/${enc(appId)}/retire`, {
      method: post,
    })
  },
  environment(appId: string, kind: EnvironmentKind) {
    return apiRequest(
      environmentSchema,
      `/api/apps/${enc(appId)}/environments/${kind}`,
    )
  },
  createEnvironment(appId: string, kind: EnvironmentKind) {
    return apiRequest(
      environmentSchema,
      `/api/apps/${enc(appId)}/environments/${kind}`,
      { method: post },
    )
  },
  audit(appId: string, filters: AuditFilters = {}) {
    return apiRequest(
      auditSearchResponseSchema,
      `/api/apps/${enc(appId)}/audit`,
      {
        query: auditQuery(filters),
      },
    )
  },
}

function envPath(environmentId: string, suffix = ""): string {
  return `/api/environments/${enc(environmentId)}${suffix}`
}

export const environments = {
  get(environmentId: string) {
    return apiRequest(environmentSchema, envPath(environmentId))
  },
  update(
    environmentId: string,
    body: { clientType: "confidential" | "public" },
  ) {
    return apiRequest(environmentSchema, envPath(environmentId), {
      method: "PATCH",
      body,
    })
  },
  replaceRedirectUris(environmentId: string, uris: string[]) {
    return apiRequest(
      environmentSchema,
      envPath(environmentId, "/redirect-uris"),
      {
        method: "PUT",
        body: { uris },
      },
    )
  },
  replaceOrigins(environmentId: string, origins: string[]) {
    return apiRequest(environmentSchema, envPath(environmentId, "/origins"), {
      method: "PUT",
      body: { origins },
    })
  },
  updateScopes(
    environmentId: string,
    requestedScopes: PlatformScope[],
    optionalScopes?: OidcScope[],
  ) {
    return apiRequest(environmentSchema, envPath(environmentId, "/scopes"), {
      method: "PUT",
      body:
        optionalScopes === undefined
          ? { requestedScopes }
          : { requestedScopes, optionalScopes },
    })
  },
  reviews(environmentId: string) {
    return apiRequest(
      environmentReviewListResponseSchema,
      envPath(environmentId, "/reviews"),
    )
  },
  quota(environmentId: string) {
    return apiRequest(
      environmentQuotaStatusSchema,
      envPath(environmentId, "/quota"),
    )
  },
  submitReview(environmentId: string, note: string) {
    return apiRequest(
      submitReviewResponseSchema,
      envPath(environmentId, "/submit-review"),
      { method: post, body: note === "" ? {} : { note } },
    )
  },
  withdrawReview(environmentId: string) {
    return apiRequest(
      environmentSchema,
      envPath(environmentId, "/withdraw-review"),
      { method: post },
    )
  },
  apiKeys(environmentId: string) {
    return apiRequest(
      apiKeyListResponseSchema,
      envPath(environmentId, "/api-keys"),
    )
  },
  createApiKey(environmentId: string, body: CreateApiKeyRequest) {
    return apiRequest(
      createdApiKeyResponseSchema,
      envPath(environmentId, "/api-keys"),
      { method: post, body },
    )
  },
  clientSecrets(environmentId: string) {
    return apiRequest(
      clientSecretListResponseSchema,
      envPath(environmentId, "/client-secrets"),
    )
  },
  createClientSecret(environmentId: string, expiresAt: string | null) {
    return apiRequest(
      createdClientSecretResponseSchema,
      envPath(environmentId, "/client-secrets"),
      { method: post, body: { expiresAt } },
    )
  },
  usage(params: UsageParams) {
    return apiRequest(
      usageResponseSchema,
      envPath(params.environmentId, "/usage"),
      {
        query: usageQuery(params),
      },
    )
  },
  usageCsvUrl(params: UsageParams): string {
    return buildUrl(
      envPath(params.environmentId, "/usage.csv"),
      usageQuery(params),
    )
  },
  requests(params: RequestLogParams) {
    return apiRequest(
      requestLogResponseSchema,
      envPath(params.environmentId, "/requests"),
      {
        query: {
          from: params.from,
          to: params.to,
          statusClass: params.statusClass,
          apiKeyId: params.apiKeyId,
          limit: params.limit,
        },
      },
    )
  },
  request(environmentId: string, requestId: string) {
    return apiRequest(
      requestLogEntrySchema,
      envPath(environmentId, `/requests/${enc(requestId)}`),
    )
  },
  oauth(environmentId: string, range: { from: string; to: string }) {
    return apiRequest(
      oauthStatsResponseSchema,
      envPath(environmentId, "/oauth"),
      {
        query: range,
      },
    )
  },
  consentPreview(environmentId: string) {
    return apiRequest(
      authorizationRequestDetailSchema,
      envPath(environmentId, "/consent-preview"),
    )
  },
}

export const apiKeys = {
  update(apiKeyId: string, body: { name?: string; allowedCidrs?: string[] }) {
    return apiRequest(apiKeyRecordSchema, `/api/api-keys/${enc(apiKeyId)}`, {
      method: "PATCH",
      body,
    })
  },
  rotate(apiKeyId: string, overlapSeconds: number) {
    return apiRequest(
      rotatedApiKeyResponseSchema,
      `/api/api-keys/${enc(apiKeyId)}/rotate`,
      { method: post, body: { overlapSeconds } },
    )
  },
  expire(apiKeyId: string, expiresAt: string) {
    return apiRequest(
      apiKeyRecordSchema,
      `/api/api-keys/${enc(apiKeyId)}/expire`,
      {
        method: post,
        body: { expiresAt },
      },
    )
  },
  revoke(apiKeyId: string) {
    return apiRequest(
      apiKeyRecordSchema,
      `/api/api-keys/${enc(apiKeyId)}/revoke`,
      {
        method: post,
      },
    )
  },
}

export const clientSecrets = {
  revoke(clientSecretId: string) {
    return apiRequest(
      clientSecretRecordSchema,
      `/api/client-secrets/${enc(clientSecretId)}/revoke`,
      { method: post },
    )
  },
}

export const platform = {
  health() {
    return apiRequest(platformHealthResponseSchema, "/api/platform/health")
  },
}

export const admin = {
  reviews(query: {
    state: ReviewRecordState
    scope?: PlatformScope | undefined
    cursor?: string | undefined
  }) {
    return apiRequest(adminReviewListResponseSchema, "/api/admin/reviews", {
      query: { ...query, limit: 50 },
    })
  },
  reviewStats() {
    return apiRequest(
      adminReviewStatsResponseSchema,
      "/api/admin/reviews/stats",
    )
  },
  review(reviewId: string) {
    return apiRequest(adminReviewSchema, `/api/admin/reviews/${enc(reviewId)}`)
  },
  reviewContext(reviewId: string) {
    return apiRequest(
      adminReviewContextResponseSchema,
      `/api/admin/reviews/${enc(reviewId)}/context`,
    )
  },
  decide(reviewId: string, body: ReviewDecisionRequest) {
    return apiRequest(
      adminReviewSchema,
      `/api/admin/reviews/${enc(reviewId)}/decision`,
      { method: post, body },
    )
  },
  apps(query: {
    query?: string | undefined
    status?: string | undefined
    cursor?: string | undefined
  }) {
    return apiRequest(adminAppListResponseSchema, "/api/admin/apps", {
      query: { ...query, limit: 50 },
    })
  },
  changeAppStatus(appId: string, body: AppStatusChangeRequest) {
    return apiRequest(adminAppSchema, `/api/admin/apps/${enc(appId)}/status`, {
      method: post,
      body,
    })
  },
  quotaOverrides(environmentId: string) {
    return apiRequest(
      quotaOverrideListResponseSchema,
      `/api/admin/environments/${enc(environmentId)}/quota-overrides`,
    )
  },
  createQuotaOverride(
    environmentId: string,
    body: {
      endpointClass: EndpointClass
      perMinute: number
      perDay: number
      reason: string
      expiresAt: string | null
    },
  ) {
    return apiRequest(
      quotaOverrideRecordSchema,
      `/api/admin/environments/${enc(environmentId)}/quota-overrides`,
      { method: post, body },
    )
  },
  expireQuotaOverride(quotaOverrideId: string) {
    return apiRequest(
      okResponseSchema,
      `/api/admin/quota-overrides/${enc(quotaOverrideId)}`,
      { method: "DELETE" },
    )
  },
  audit(filters: AuditFilters) {
    return apiRequest(auditSearchResponseSchema, "/api/admin/audit", {
      query: auditQuery(filters),
    })
  },
}
