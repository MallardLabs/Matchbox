import { okResponseSchema } from "@repo/platform-contracts/common"
import {
  type AdminReview,
  type StaffRole,
  adminAppListResponseSchema,
  adminAppQuerySchema,
  adminAppSchema,
  adminReviewListResponseSchema,
  adminReviewQuerySchema,
  adminReviewSchema,
  appStatusChangeRequestSchema,
  auditSearchQuerySchema,
  consolePaths,
  createQuotaOverrideRequestSchema,
  quotaOverrideListResponseSchema,
  quotaOverrideRecordSchema,
  reviewDecisionRequestSchema,
} from "@repo/platform-contracts/console"
import { createCursorCodec } from "@repo/platform-contracts/cursor"
import {
  PlatformError,
  jsonBody,
  pathParams,
  queryParams,
} from "@repo/platform-server"
import { z } from "zod"
import { requireStaff } from "../access"
import {
  type ConsoleApp,
  type ConsoleContext,
  audit,
  deps,
  logger,
  nowIso,
  requireStepUp,
} from "../context"
import { type ReviewOutcome, reviewDecisionEmail } from "../email/templates"
import { respond, toApp, toQuotaOverride, toReview } from "../mappers"
import { approvalOutcome, environmentReviewState } from "../review-policy"
import type { AdminAppRecord, AdminReviewRecord } from "../store/console-store"
import { auditSearch } from "./audit-search"

/** Staff writes: the role plus a fresh passkey step-up. */
async function staffAction(c: ConsoleContext, minimum: StaffRole) {
  const staff = await requireStaff(c, minimum)
  requireStepUp(c)
  return staff
}

const offsetCursor = createCursorCodec(
  z.object({ offset: z.number().int().nonnegative().max(1_000_000) }),
)

function decodeOffset(cursor: string | undefined): number {
  if (cursor === undefined) return 0
  const decoded = offsetCursor.decode(cursor)
  if (decoded === null) {
    throw new PlatformError("invalid_request", { message: "Invalid cursor." })
  }
  return decoded.offset
}

function toAdminReview(record: AdminReviewRecord): AdminReview {
  return {
    ...toReview(record.review),
    organization: {
      id: record.organization.id,
      name: record.organization.name,
    },
    app: {
      id: record.app.id,
      name: record.app.name,
      websiteUrl: record.app.websiteUrl,
      status: record.app.status,
    },
    environment: {
      id: record.environment.id,
      kind: record.environment.kind,
      clientId: record.environment.clientId,
      approvedScopes: record.environment.approvedScopes,
    },
    submitterEmail: record.submitterEmail,
  }
}

async function toAdminApps(c: ConsoleContext, records: AdminAppRecord[]) {
  const environments = await deps(c).store.listEnvironmentsForApps(
    records.map((record) => record.app.id),
  )
  return records.map((record) => ({
    ...toApp(record.app, environments),
    organization: {
      id: record.organization.id,
      name: record.organization.name,
    },
  }))
}

const decisionOutcome = {
  approve: "approved",
  "request-changes": "changes-requested",
  reject: "rejected",
} as const satisfies Record<
  "approve" | "request-changes" | "reject",
  ReviewOutcome
>

const decisionAction = {
  approve: "review-approved",
  "request-changes": "review-changes-requested",
  reject: "review-rejected",
} as const

export default function registerAdminRoutes(app: ConsoleApp): void {
  app.get("/api/admin/reviews", async (c) => {
    await requireStaff(c, "reviewer")
    const query = queryParams(c, adminReviewQuerySchema)
    const offset = decodeOffset(query.cursor)
    const page = await deps(c).store.listAdminReviews({
      state: query.state,
      offset,
      limit: query.limit,
    })
    return respond(c, adminReviewListResponseSchema, {
      data: page.items.map(toAdminReview),
      nextCursor: page.hasMore
        ? offsetCursor.encode({ offset: offset + query.limit })
        : null,
    })
  })

  app.get("/api/admin/reviews/:reviewId", async (c) => {
    await requireStaff(c, "reviewer")
    const { reviewId } = pathParams(c, consolePaths.reviewId)
    const record = await deps(c).store.getAdminReview(reviewId)
    if (record === null) throw new PlatformError("not_found")
    return respond(c, adminReviewSchema, toAdminReview(record))
  })

  app.post("/api/admin/reviews/:reviewId/decision", async (c) => {
    const staff = await staffAction(c, "reviewer")
    const { reviewId } = pathParams(c, consolePaths.reviewId)
    const body = await jsonBody(c, reviewDecisionRequestSchema)
    const { store, email, config } = deps(c)
    const record = await store.getAdminReview(reviewId)
    if (record === null) throw new PlatformError("not_found")
    if (record.review.state !== "open") {
      throw new PlatformError("conflict", { message: "Review is closed." })
    }
    const { environment, review } = record
    const note =
      body.note === undefined || body.note.length === 0 ? null : body.note
    const at = nowIso(c)
    let metadata: Record<string, unknown> = { decision: body.decision }
    if (body.decision === "approve") {
      const approve = body.approvedScopes ?? review.requestedScopes
      const outside = approve.filter(
        (scope) => !review.requestedScopes.includes(scope),
      )
      if (outside.length > 0) {
        throw new PlatformError("invalid_request", {
          issues: [
            {
              path: "approvedScopes",
              message: `Not requested: ${outside.join(", ")}`,
            },
          ],
        })
      }
      const outcome = approvalOutcome({ environment, approve })
      await store.updateEnvironment(environment.id, {
        approvedScopes: outcome.approvedScopes,
        scopeVersion: outcome.scopeVersion,
        reviewState: environmentReviewState(
          outcome.approvedScopes,
          "development",
        ),
      })
      metadata = {
        ...metadata,
        approvedScopes: outcome.approvedScopes,
        added: outcome.added,
        scopeVersion: outcome.scopeVersion,
      }
    } else {
      await store.updateEnvironment(environment.id, {
        reviewState: environmentReviewState(
          environment.approvedScopes,
          body.decision === "reject" ? "rejected" : "changes-requested",
        ),
      })
    }
    await store.updateReview(reviewId, {
      state: decisionOutcome[body.decision],
      reviewerId: staff.account.id,
      reviewerNote: note,
      decidedAt: at,
    })
    await audit(c, {
      actorType: "staff",
      action: decisionAction[body.decision],
      organizationId: record.organization.id,
      appId: record.app.id,
      environmentId: environment.id,
      targetType: "review",
      targetId: reviewId,
      metadata: { ...metadata, staffRole: staff.staffRole },
    })
    if (record.submitterEmail !== null) {
      try {
        await email.send({
          to: record.submitterEmail,
          ...reviewDecisionEmail({
            appName: record.app.name,
            environmentKind: environment.kind,
            outcome: decisionOutcome[body.decision],
            note,
            link: `${config.consoleOrigin}/apps/${record.app.id}`,
          }),
        })
      } catch (error) {
        logger(c).error({
          message: "Review decision email failed",
          reviewId,
          error,
        })
      }
    }
    const updated = await store.getAdminReview(reviewId)
    if (updated === null) throw new PlatformError("not_found")
    return respond(c, adminReviewSchema, toAdminReview(updated))
  })

  app.get("/api/admin/apps", async (c) => {
    await requireStaff(c, "reviewer")
    const query = queryParams(c, adminAppQuerySchema)
    const offset = decodeOffset(query.cursor)
    const page = await deps(c).store.listAdminApps({
      ...(query.query === undefined ? {} : { query: query.query }),
      ...(query.status === undefined ? {} : { status: query.status }),
      offset,
      limit: query.limit,
    })
    return respond(c, adminAppListResponseSchema, {
      data: await toAdminApps(c, page.items),
      nextCursor: page.hasMore
        ? offsetCursor.encode({ offset: offset + query.limit })
        : null,
    })
  })

  app.post("/api/admin/apps/:appId/status", async (c) => {
    const staff = await staffAction(c, "operator")
    const { appId } = pathParams(c, consolePaths.appId)
    const body = await jsonBody(c, appStatusChangeRequestSchema)
    const { store } = deps(c)
    const current = await store.getApp(appId)
    if (current === null) throw new PlatformError("not_found")
    const organization = await store.getOrganization(current.organizationId)
    if (organization === null) throw new PlatformError("not_found")
    // Suspension revokes nothing; the API and Matchbox ID refuse suspended
    // apps while the status holds.
    const updated =
      current.status === body.status
        ? current
        : await store.updateApp(appId, { status: body.status })
    await audit(c, {
      actorType: "staff",
      action: "app-status-changed",
      organizationId: current.organizationId,
      appId,
      targetType: "app",
      targetId: appId,
      metadata: {
        from: current.status,
        to: body.status,
        reason: body.reason,
        staffRole: staff.staffRole,
      },
    })
    const [response] = await toAdminApps(c, [{ app: updated, organization }])
    if (response === undefined) throw new PlatformError("not_found")
    return respond(c, adminAppSchema, response)
  })

  app.get(
    "/api/admin/environments/:environmentId/quota-overrides",
    async (c) => {
      await requireStaff(c, "reviewer")
      const { environmentId } = pathParams(c, consolePaths.environmentId)
      const { store } = deps(c)
      if ((await store.getEnvironment(environmentId)) === null) {
        throw new PlatformError("not_found")
      }
      const overrides = await store.listQuotaOverrides(environmentId)
      return respond(c, quotaOverrideListResponseSchema, {
        data: overrides.map(toQuotaOverride),
      })
    },
  )

  app.post(
    "/api/admin/environments/:environmentId/quota-overrides",
    async (c) => {
      const staff = await staffAction(c, "operator")
      const { environmentId } = pathParams(c, consolePaths.environmentId)
      const body = await jsonBody(c, createQuotaOverrideRequestSchema)
      const { store, now } = deps(c)
      const environment = await store.getEnvironment(environmentId)
      if (environment === null) throw new PlatformError("not_found")
      if (
        body.expiresAt !== null &&
        Date.parse(body.expiresAt) <= now().getTime()
      ) {
        throw new PlatformError("invalid_request", {
          issues: [{ path: "expiresAt", message: "Must be in the future" }],
        })
      }
      if (body.perMinute > body.perDay) {
        throw new PlatformError("invalid_request", {
          issues: [
            { path: "perMinute", message: "Cannot exceed the daily limit" },
          ],
        })
      }
      const appRecord = await store.getApp(environment.appId)
      const override = await store.createQuotaOverride({
        environmentId,
        endpointClass: body.endpointClass,
        perMinute: body.perMinute,
        perDay: body.perDay,
        reason: body.reason,
        createdBy: staff.account.id,
        expiresAt:
          body.expiresAt === null
            ? null
            : new Date(body.expiresAt).toISOString(),
      })
      await audit(c, {
        actorType: "staff",
        action: "quota-override-created",
        organizationId: appRecord?.organizationId ?? null,
        appId: environment.appId,
        environmentId,
        targetType: "quota-override",
        targetId: override.id,
        metadata: {
          endpointClass: override.endpointClass,
          perMinute: override.perMinute,
          perDay: override.perDay,
          reason: override.reason,
          expiresAt: override.expiresAt,
        },
      })
      return respond(
        c,
        quotaOverrideRecordSchema,
        toQuotaOverride(override),
        201,
      )
    },
  )

  app.delete("/api/admin/quota-overrides/:quotaOverrideId", async (c) => {
    await staffAction(c, "operator")
    const { quotaOverrideId } = pathParams(c, consolePaths.quotaOverrideId)
    const { store, now } = deps(c)
    const override = await store.getQuotaOverride(quotaOverrideId)
    if (override === null) throw new PlatformError("not_found")
    const at = now()
    if (
      override.expiresAt === null ||
      Date.parse(override.expiresAt) > at.getTime()
    ) {
      await store.expireQuotaOverride(quotaOverrideId, at.toISOString())
      const environment = await store.getEnvironment(override.environmentId)
      const appRecord =
        environment === null ? null : await store.getApp(environment.appId)
      await audit(c, {
        actorType: "staff",
        action: "quota-override-removed",
        organizationId: appRecord?.organizationId ?? null,
        appId: environment?.appId ?? null,
        environmentId: override.environmentId,
        targetType: "quota-override",
        targetId: quotaOverrideId,
      })
    }
    return respond(c, okResponseSchema, { ok: true })
  })

  app.get("/api/admin/audit", async (c) => {
    await requireStaff(c, "reviewer")
    return auditSearch(c, queryParams(c, auditSearchQuerySchema))
  })
}
