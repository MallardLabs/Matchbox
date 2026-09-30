import {
  consolePaths,
  environmentSchema,
  oauthStatsQuerySchema,
  oauthStatsResponseSchema,
  replaceOriginsRequestSchema,
  replaceRedirectUrisRequestSchema,
  submitReviewRequestSchema,
  submitReviewResponseSchema,
  updateEnvironmentRequestSchema,
  updateRequestedScopesRequestSchema,
} from "@repo/platform-contracts/console"
import type { ErrorIssue } from "@repo/platform-contracts/errors"
import {
  type AuthorizationRequestDetail,
  authorizationRequestDetailSchema,
} from "@repo/platform-contracts/identity"
import {
  type UrlValidationResult,
  urlRejectionMessages,
  validateOrigin,
  validateRedirectUri,
} from "@repo/platform-contracts/redirects"
import {
  type OidcClaim,
  claimLabels,
  normalizeScopes,
  oidcScopeSchema,
  oidcScopesOf,
  scopeDefinitions,
} from "@repo/platform-contracts/scopes"
import {
  PlatformError,
  jsonBody,
  pathParams,
  queryParams,
} from "@repo/platform-server"
import { assertAppWritable, environmentAccess } from "../access"
import type { EnvironmentAccess } from "../access"
import {
  type ConsoleApp,
  type ConsoleContext,
  audit,
  deps,
  nowIso,
  requireStepUp,
} from "../context"
import { loadEnvironment, respond, toReview } from "../mappers"
import {
  approvalOutcome,
  environmentReviewState,
  evaluateSubmission,
} from "../review-policy"
import type { EnvironmentRecord } from "../store/console-store"

function validateAll(
  values: string[],
  field: string,
  validate: (value: string) => UrlValidationResult,
): string[] {
  const issues: ErrorIssue[] = []
  const accepted: string[] = []
  values.forEach((raw, index) => {
    const value = raw.trim()
    const result = validate(value)
    if (result.ok) {
      if (!accepted.includes(result.value)) accepted.push(result.value)
      return
    }
    const suggestion =
      result.suggestion === null ? "" : ` (use ${result.suggestion})`
    issues.push({
      path: `${field}.${index}`,
      message: `${urlRejectionMessages[result.reason]}${suggestion}`,
    })
  })
  if (issues.length > 0) {
    throw new PlatformError("invalid_request", { issues })
  }
  return accepted
}

function addedValues(existing: string[], next: string[]): string[] {
  const current = new Set(existing)
  return next.filter((value) => !current.has(value))
}

function auditScope(access: EnvironmentAccess) {
  return {
    organizationId: access.app.organizationId,
    appId: access.app.id,
    environmentId: access.environment.id,
  }
}

const previewValues = {
  sub: "mbx_ExampleSubjectExampleSubject00",
  wallet_address: "0x0000000000000000000000000000000000000000",
  wallet_network: null,
  discord_id: "000000000000000000",
  discord_username: "example",
  discord_display_name: "Example",
  discord_avatar_url: "https://cdn.discordapp.com/embed/avatars/0.png",
} as const satisfies Record<OidcClaim, string | null>

function consentPreview(
  environment: EnvironmentRecord,
  app: EnvironmentAccess["app"],
  redirectUris: string[],
  now: Date,
): AuthorizationRequestDetail {
  const requested = oidcScopesOf(environment.requestedScopes)
  const scopes = requested.length > 0 ? requested : ["openid" as const]
  const approved = new Set(environment.approvedScopes)
  const firstRedirect = redirectUris[0]
  const consentScopes = scopes.map((scope) => {
    const definition = scopeDefinitions[scope]
    const available = approved.has(scope)
    return {
      scope,
      label: definition.label,
      description: definition.consentDescription,
      claims: definition.claims.map((claim) => ({
        claim,
        label: claimLabels[claim],
        value:
          claim === "wallet_network"
            ? environment.network
            : previewValues[claim],
      })),
      available,
      unavailableReason: available ? null : ("not-approved" as const),
      previouslyGranted: false,
    }
  })
  return {
    id: environment.id,
    app: {
      name: app.name,
      logoUrl: app.logoUrl,
      websiteUrl: app.websiteUrl,
      privacyUrl: app.privacyUrl,
      termsUrl: app.termsUrl,
      status: app.status === "active" ? "active" : "restricted",
    },
    environmentKind: environment.kind,
    network: environment.network,
    redirectOrigin:
      firstRedirect === undefined ? "" : new URL(firstRedirect).origin,
    scopes: consentScopes,
    existingGrant: null,
    diff: {
      added: normalizeScopes(scopes),
      removed: [],
      unchanged: [],
    },
    approvable: consentScopes.every((scope) => scope.available),
    expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
  }
}

async function environmentResponse(
  c: ConsoleContext,
  environment: EnvironmentRecord,
) {
  return loadEnvironment(c, environment)
}

export default function registerEnvironmentRoutes(app: ConsoleApp): void {
  app.get("/api/environments/:environmentId", async (c) => {
    const { environmentId } = pathParams(c, consolePaths.environmentId)
    const access = await environmentAccess(c, environmentId, "developer")
    return respond(
      c,
      environmentSchema,
      await environmentResponse(c, access.environment),
    )
  })

  app.patch("/api/environments/:environmentId", async (c) => {
    const { environmentId } = pathParams(c, consolePaths.environmentId)
    const access = await environmentAccess(c, environmentId, "admin")
    assertAppWritable(access.app)
    const body = await jsonBody(c, updateEnvironmentRequestSchema)
    const { store, now } = deps(c)
    let environment = access.environment
    if (body.clientType !== environment.clientType) {
      requireStepUp(c)
      // Confidential -> public: tokens minted for the confidential client
      // stop working and users must re-consent (scope_version bump). Done
      // before the flip so a failed flip can simply be retried.
      const revocation =
        body.clientType === "public"
          ? await store.revokeEnvironmentTokens(
              environmentId,
              "client-type-public",
            )
          : null
      environment = await store.updateEnvironment(environmentId, {
        clientType: body.clientType,
      })
      if (body.clientType === "public") {
        const at = now()
        for (const secret of await store.listClientSecrets(environmentId)) {
          if (secret.revokedAt !== null) continue
          await store.revokeClientSecret(secret.id, at.toISOString())
          await audit(c, {
            ...auditScope(access),
            action: "client-secret-revoked",
            targetType: "client-secret",
            targetId: secret.id,
            metadata: { reason: "client-type-public" },
          })
        }
      }
      await audit(c, {
        ...auditScope(access),
        action: "environment-updated",
        targetType: "environment",
        targetId: environmentId,
        metadata: {
          clientType: {
            from: access.environment.clientType,
            to: body.clientType,
          },
          ...(revocation === null ? {} : { tokensRevoked: revocation }),
        },
      })
    }
    return respond(
      c,
      environmentSchema,
      await environmentResponse(c, environment),
    )
  })

  app.put("/api/environments/:environmentId/redirect-uris", async (c) => {
    const { environmentId } = pathParams(c, consolePaths.environmentId)
    const access = await environmentAccess(c, environmentId, "admin")
    assertAppWritable(access.app)
    const body = await jsonBody(c, replaceRedirectUrisRequestSchema)
    const kind = access.environment.kind
    const uris = validateAll(body.uris, "uris", (value) =>
      validateRedirectUri(value, kind),
    )
    const { store } = deps(c)
    const added = addedValues(await store.listRedirectUris(environmentId), uris)
    // Adding a redirect URI can send authorization codes somewhere new;
    // removing one only narrows the client.
    if (added.length > 0) requireStepUp(c)
    await store.replaceRedirectUris(environmentId, uris)
    await audit(c, {
      ...auditScope(access),
      action: "redirect-uris-updated",
      targetType: "environment",
      targetId: environmentId,
      metadata: { uris, added },
    })
    return respond(
      c,
      environmentSchema,
      await environmentResponse(c, access.environment),
    )
  })

  app.put("/api/environments/:environmentId/origins", async (c) => {
    const { environmentId } = pathParams(c, consolePaths.environmentId)
    const access = await environmentAccess(c, environmentId, "admin")
    assertAppWritable(access.app)
    const body = await jsonBody(c, replaceOriginsRequestSchema)
    const kind = access.environment.kind
    const origins = validateAll(body.origins, "origins", (value) =>
      validateOrigin(value, kind),
    )
    const { store } = deps(c)
    const added = addedValues(await store.listOrigins(environmentId), origins)
    if (added.length > 0) requireStepUp(c)
    await store.replaceOrigins(environmentId, origins)
    await audit(c, {
      ...auditScope(access),
      action: "origins-updated",
      targetType: "environment",
      targetId: environmentId,
      metadata: { origins, added },
    })
    return respond(
      c,
      environmentSchema,
      await environmentResponse(c, access.environment),
    )
  })

  app.put("/api/environments/:environmentId/scopes", async (c) => {
    const { environmentId } = pathParams(c, consolePaths.environmentId)
    const access = await environmentAccess(c, environmentId, "admin")
    assertAppWritable(access.app)
    const body = await jsonBody(c, updateRequestedScopesRequestSchema)
    const { store } = deps(c)
    if ((await store.getOpenReview(environmentId)) !== null) {
      throw new PlatformError("conflict", {
        message: "Withdraw the open review before changing scopes.",
      })
    }
    const requestedScopes = normalizeScopes(body.requestedScopes)
    const approvedScopes = access.environment.approvedScopes.filter((scope) =>
      requestedScopes.includes(scope),
    )
    const environment = await store.updateEnvironment(environmentId, {
      requestedScopes,
      approvedScopes,
      reviewState: environmentReviewState(approvedScopes, "development"),
    })
    await audit(c, {
      ...auditScope(access),
      action: "scopes-requested",
      targetType: "environment",
      targetId: environmentId,
      metadata: {
        requestedScopes,
        previous: access.environment.requestedScopes,
      },
    })
    return respond(
      c,
      environmentSchema,
      await environmentResponse(c, environment),
    )
  })

  app.post("/api/environments/:environmentId/submit-review", async (c) => {
    const { environmentId } = pathParams(c, consolePaths.environmentId)
    const access = await environmentAccess(c, environmentId, "admin")
    assertAppWritable(access.app)
    const body = await jsonBody(c, submitReviewRequestSchema)
    const { store } = deps(c)
    const environment = access.environment
    if (environment.requestedScopes.length === 0) {
      throw new PlatformError("invalid_request", {
        message: "Request at least one scope.",
      })
    }
    if ((await store.getOpenReview(environmentId)) !== null) {
      throw new PlatformError("conflict", { message: "A review is open." })
    }
    const evaluation = evaluateSubmission({
      environment,
      app: access.app,
      ownerEmailVerified: await store.organizationHasVerifiedOwner(
        access.app.organizationId,
      ),
    })
    if (evaluation.added.length === 0) {
      throw new PlatformError("conflict", {
        message: "All requested scopes are already approved.",
      })
    }
    const at = nowIso(c)
    const note =
      body.note === undefined || body.note.length === 0 ? null : body.note
    if (evaluation.autoApprove) {
      const outcome = approvalOutcome({
        environment,
        approve: environment.requestedScopes,
      })
      const review = await store.createReview({
        environmentId,
        requestedScopes: environment.requestedScopes,
        state: "approved",
        submitterId: access.account.id,
        submitterNote: note,
        reviewerId: null,
        reviewerNote: "Auto-approved",
        createdAt: at,
        decidedAt: at,
      })
      const updated = await store.updateEnvironment(environmentId, {
        approvedScopes: outcome.approvedScopes,
        scopeVersion: outcome.scopeVersion,
        reviewState: "approved",
      })
      await audit(c, {
        ...auditScope(access),
        action: "review-auto-approved",
        targetType: "review",
        targetId: review.id,
        metadata: {
          approvedScopes: outcome.approvedScopes,
          scopeVersion: outcome.scopeVersion,
        },
      })
      return respond(c, submitReviewResponseSchema, {
        environment: await environmentResponse(c, updated),
        review: toReview(review),
        autoApproved: true,
      })
    }
    const review = await store.createReview({
      environmentId,
      requestedScopes: environment.requestedScopes,
      state: "open",
      submitterId: access.account.id,
      submitterNote: note,
      reviewerId: null,
      reviewerNote: null,
      decidedAt: null,
    })
    const updated = await store.updateEnvironment(environmentId, {
      reviewState: environmentReviewState(
        environment.approvedScopes,
        "submitted",
      ),
    })
    await audit(c, {
      ...auditScope(access),
      action: "review-submitted",
      targetType: "review",
      targetId: review.id,
      metadata: {
        requestedScopes: environment.requestedScopes,
        added: evaluation.added,
      },
    })
    return respond(c, submitReviewResponseSchema, {
      environment: await environmentResponse(c, updated),
      review: toReview(review),
      autoApproved: false,
    })
  })

  app.post("/api/environments/:environmentId/withdraw-review", async (c) => {
    const { environmentId } = pathParams(c, consolePaths.environmentId)
    const access = await environmentAccess(c, environmentId, "admin")
    const { store } = deps(c)
    const review = await store.getOpenReview(environmentId)
    if (review === null) {
      throw new PlatformError("conflict", { message: "No open review." })
    }
    await store.updateReview(review.id, {
      state: "withdrawn",
      decidedAt: nowIso(c),
    })
    const environment = await store.updateEnvironment(environmentId, {
      reviewState: environmentReviewState(
        access.environment.approvedScopes,
        "development",
      ),
    })
    await audit(c, {
      ...auditScope(access),
      action: "review-withdrawn",
      targetType: "review",
      targetId: review.id,
    })
    return respond(
      c,
      environmentSchema,
      await environmentResponse(c, environment),
    )
  })

  // OAuth -----------------------------------------------------------------

  app.get("/api/environments/:environmentId/oauth", async (c) => {
    const { environmentId } = pathParams(c, consolePaths.environmentId)
    await environmentAccess(c, environmentId, "developer")
    const query = queryParams(c, oauthStatsQuerySchema)
    if (Date.parse(query.from) >= Date.parse(query.to)) {
      throw new PlatformError("invalid_request", {
        issues: [{ path: "from", message: "`from` must be before `to`" }],
      })
    }
    const stats = await deps(c).store.oauthStats({
      environmentId,
      from: new Date(query.from).toISOString(),
      to: new Date(query.to).toISOString(),
    })
    const revocationTotal = Object.values(stats.revocationsByReason).reduce(
      (sum, count) => sum + count,
      0,
    )
    return respond(c, oauthStatsResponseSchema, {
      activeGrants: stats.activeGrants,
      grantsCreated: stats.grantsCreated,
      revocations: {
        total: revocationTotal,
        byReason: stats.revocationsByReason,
      },
      grantsByScope: oidcScopeSchema.options.map((scope) => ({
        scope,
        activeGrants: stats.activeGrantsByScope[scope],
      })),
    })
  })

  app.get("/api/environments/:environmentId/consent-preview", async (c) => {
    const { environmentId } = pathParams(c, consolePaths.environmentId)
    const access = await environmentAccess(c, environmentId, "developer")
    const { store, now } = deps(c)
    const redirectUris = await store.listRedirectUris(environmentId)
    return respond(
      c,
      authorizationRequestDetailSchema,
      consentPreview(access.environment, access.app, redirectUris, now()),
    )
  })
}
