import {
  consolePaths,
  environmentKindFilterSchema,
} from "@repo/platform-contracts/console"
import { platformHealthResponseSchema } from "@repo/platform-contracts/platform-health"
import {
  type EnvironmentQuotaStatus,
  type QuotaOverride,
  environmentQuotaListResponseSchema,
  environmentQuotaStatusSchema,
} from "@repo/platform-contracts/rate-limits"
import {
  PlatformError,
  pathParams,
  queryParams,
  readEnvironmentQuota,
} from "@repo/platform-server"
import { z } from "zod"
import { environmentAccess, organizationAccess } from "../access"
import { type ConsoleApp, type ConsoleContext, deps, logger } from "../context"
import { respond } from "../mappers"
import type { AppRecord, EnvironmentRecord } from "../store/console-store"

const orgQuotaQuerySchema = z.object({
  environmentKind: environmentKindFilterSchema.default("both"),
})

/** 00:00 UTC of `now`'s day. */
export function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
}

/** 429s since 00:00 UTC per environment; null when analytics is down. */
async function rateLimitedToday(
  c: ConsoleContext,
  environmentIds: string[],
): Promise<Map<string, number> | null> {
  const { analytics, now } = deps(c)
  const at = now()
  try {
    return await analytics.rateLimited({
      environmentIds,
      from: startOfUtcDay(at),
      to: new Date(at.getTime() + 60_000),
    })
  } catch (error) {
    logger(c).warn({ message: "Rate-limited counts unavailable", error })
    return null
  }
}

async function quotaStatus(
  c: ConsoleContext,
  environment: EnvironmentRecord,
  app: AppRecord,
  limited: Map<string, number> | null,
): Promise<EnvironmentQuotaStatus> {
  const { store, apiLimiter, now } = deps(c)
  const overrides: QuotaOverride[] = (
    await store.listQuotaOverrides(environment.id)
  ).map((row) => ({
    endpointClass: row.endpointClass,
    perMinute: row.perMinute,
    perDay: row.perDay,
    expiresAt: row.expiresAt,
  }))
  return readEnvironmentQuota({
    limiter: apiLimiter,
    environmentId: environment.id,
    environmentKind: environment.kind,
    appStatus: app.status,
    overrides,
    rateLimitedToday:
      limited === null ? null : (limited.get(environment.id) ?? 0),
    now: now(),
    logger: logger(c),
  })
}

export default function registerQuotaRoutes(app: ConsoleApp): void {
  /** C04e "Quota · Live": the environment's buckets right now. */
  app.get("/api/environments/:environmentId/quota", async (c) => {
    const { environmentId } = pathParams(c, consolePaths.environmentId)
    const access = await environmentAccess(c, environmentId, "developer")
    const limited = await rateLimitedToday(c, [environmentId])
    return respond(
      c,
      environmentQuotaStatusSchema,
      await quotaStatus(c, access.environment, access.app, limited),
    )
  })

  /** C02 "Quota · today": every environment of the organization. */
  app.get("/api/orgs/:orgId/quotas", async (c) => {
    const { orgId } = pathParams(c, consolePaths.orgId)
    await organizationAccess(c, orgId, "developer")
    const query = queryParams(c, orgQuotaQuerySchema)
    const { store } = deps(c)
    const apps = (await store.listApps(orgId)).filter(
      (item) => item.status !== "retired",
    )
    const appsById = new Map(apps.map((item) => [item.id, item]))
    const environments = (
      await store.listEnvironmentsForApps(apps.map((item) => item.id))
    ).filter(
      (environment) =>
        query.environmentKind === "both" ||
        environment.kind === query.environmentKind,
    )
    const limited =
      environments.length === 0
        ? new Map<string, number>()
        : await rateLimitedToday(
            c,
            environments.map((environment) => environment.id),
          )
    const data = await Promise.all(
      environments.flatMap((environment) => {
        const owner = appsById.get(environment.appId)
        return owner === undefined
          ? []
          : [quotaStatus(c, environment, owner, limited)]
      }),
    )
    return respond(c, environmentQuotaListResponseSchema, { data })
  })

  /**
   * C02 status strip and the sign-in footer: API + ID health and chain
   * sync. Public: it carries only coarse status, no organization data.
   */
  app.get("/api/platform/health", async (c) => {
    const { health, now } = deps(c)
    let body: z.input<typeof platformHealthResponseSchema>
    try {
      body = await health.read(now())
    } catch (error) {
      throw new PlatformError("service_disabled", {
        message: "Platform health is temporarily unavailable.",
        cause: error,
      })
    }
    return respond(c, platformHealthResponseSchema, body)
  })
}
