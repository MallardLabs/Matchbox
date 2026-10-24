import {
  type UpdateAppRequest,
  appListResponseSchema,
  appSchema,
  auditSearchQuerySchema,
  consolePaths,
  createAppRequestSchema,
  environmentSchema,
  updateAppRequestSchema,
} from "@repo/platform-contracts/console"
import {
  type EnvironmentKind,
  networkForEnvironmentKind,
} from "@repo/platform-contracts/network"
import {
  PlatformError,
  generateClientId,
  jsonBody,
  pathParams,
  queryParams,
} from "@repo/platform-server"
import { appAccess, assertAppWritable, organizationAccess } from "../access"
import {
  type ConsoleApp,
  type ConsoleContext,
  audit,
  deps,
  requireStepUp,
} from "../context"
import { loadEnvironment, respond, toApp } from "../mappers"
import { slugify, uniqueSlug } from "../slugs"
import {
  type AppProfilePatch,
  type AppRecord,
  type EnvironmentRecord,
  StoreConflictError,
} from "../store/console-store"
import { auditSearch } from "./audit-search"

/** Creates an environment with a fresh client id (retries a collision). */
export async function createEnvironment(
  c: ConsoleContext,
  app: AppRecord,
  kind: EnvironmentKind,
): Promise<EnvironmentRecord> {
  const { store } = deps(c)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const environment = await store.createEnvironment({
        appId: app.id,
        kind,
        network: networkForEnvironmentKind(kind),
        clientId: generateClientId(kind),
        clientType: "confidential",
      })
      await audit(c, {
        action: "environment-created",
        organizationId: app.organizationId,
        appId: app.id,
        environmentId: environment.id,
        targetType: "environment",
        targetId: environment.id,
        metadata: { kind, clientId: environment.clientId },
      })
      return environment
    } catch (error) {
      if (!(error instanceof StoreConflictError)) throw error
      const existing = await store.getEnvironmentByKind(app.id, kind)
      if (existing !== null) return existing
    }
  }
  throw new Error("Could not allocate a client id")
}

async function appResponse(c: ConsoleContext, app: AppRecord) {
  const environments = await deps(c).store.listEnvironmentsForApps([app.id])
  return toApp(app, environments)
}

function profilePatch(body: UpdateAppRequest): AppProfilePatch {
  const patch: AppProfilePatch = {}
  if (body.name !== undefined) patch.name = body.name
  if (body.slug !== undefined) patch.slug = body.slug
  if (body.description !== undefined) {
    patch.description =
      body.description === null || body.description.length === 0
        ? null
        : body.description
  }
  if (body.logoUrl !== undefined) patch.logoUrl = body.logoUrl
  if (body.websiteUrl !== undefined) patch.websiteUrl = body.websiteUrl
  if (body.privacyUrl !== undefined) patch.privacyUrl = body.privacyUrl
  if (body.termsUrl !== undefined) patch.termsUrl = body.termsUrl
  if (body.supportEmail !== undefined) patch.supportEmail = body.supportEmail
  return patch
}

export default function registerAppRoutes(app: ConsoleApp): void {
  app.get("/api/orgs/:orgId/apps", async (c) => {
    const { orgId } = pathParams(c, consolePaths.orgId)
    await organizationAccess(c, orgId, "developer")
    const { store } = deps(c)
    const apps = await store.listApps(orgId)
    const environments = await store.listEnvironmentsForApps(
      apps.map((candidate) => candidate.id),
    )
    return respond(c, appListResponseSchema, {
      data: apps.map((candidate) => toApp(candidate, environments)),
    })
  })

  app.post("/api/orgs/:orgId/apps", async (c) => {
    const { orgId } = pathParams(c, consolePaths.orgId)
    await organizationAccess(c, orgId, "admin")
    const body = await jsonBody(c, createAppRequestSchema)
    const { store } = deps(c)
    let slug: string
    if (body.slug !== undefined) {
      if ((await store.findAppBySlug(orgId, body.slug)) !== null) {
        throw new PlatformError("conflict", { message: "Slug already in use." })
      }
      slug = body.slug
    } else {
      slug = await uniqueSlug(
        slugify(body.name, "app"),
        async (candidate) =>
          (await store.findAppBySlug(orgId, candidate)) !== null,
      )
    }
    const created = await store.createApp({
      organizationId: orgId,
      name: body.name,
      slug,
      description:
        body.description === undefined ||
        body.description === null ||
        body.description.length === 0
          ? null
          : body.description,
      logoUrl: body.logoUrl ?? null,
      websiteUrl: body.websiteUrl ?? null,
      privacyUrl: body.privacyUrl ?? null,
      termsUrl: body.termsUrl ?? null,
      supportEmail: body.supportEmail ?? null,
    })
    await audit(c, {
      action: "app-created",
      organizationId: orgId,
      appId: created.id,
      targetType: "app",
      targetId: created.id,
      metadata: { name: created.name, slug: created.slug },
    })
    // Test is always created; live too (review gates its use), so both
    // tabs exist from the start.
    await createEnvironment(c, created, "test")
    await createEnvironment(c, created, "live")
    return respond(c, appSchema, await appResponse(c, created), 201)
  })

  app.get("/api/apps/:appId", async (c) => {
    const { appId } = pathParams(c, consolePaths.appId)
    const access = await appAccess(c, appId, "developer")
    return respond(c, appSchema, await appResponse(c, access.app))
  })

  app.patch("/api/apps/:appId", async (c) => {
    const { appId } = pathParams(c, consolePaths.appId)
    const access = await appAccess(c, appId, "admin")
    assertAppWritable(access.app)
    const body = await jsonBody(c, updateAppRequestSchema)
    const { store } = deps(c)
    if (body.slug !== undefined && body.slug !== access.app.slug) {
      if (
        (await store.findAppBySlug(access.app.organizationId, body.slug)) !==
        null
      ) {
        throw new PlatformError("conflict", { message: "Slug already in use." })
      }
    }
    const patch = profilePatch(body)
    const updated = await store.updateApp(appId, patch)
    await audit(c, {
      action: "app-updated",
      organizationId: updated.organizationId,
      appId,
      targetType: "app",
      targetId: appId,
      metadata: { fields: Object.keys(patch) },
    })
    return respond(c, appSchema, await appResponse(c, updated))
  })

  app.post("/api/apps/:appId/retire", async (c) => {
    const { appId } = pathParams(c, consolePaths.appId)
    const access = await appAccess(c, appId, "admin")
    assertAppWritable(access.app)
    requireStepUp(c)
    const updated = await deps(c).store.updateApp(appId, { status: "retired" })
    await audit(c, {
      action: "app-retired",
      organizationId: updated.organizationId,
      appId,
      targetType: "app",
      targetId: appId,
      metadata: { previousStatus: access.app.status },
    })
    return respond(c, appSchema, await appResponse(c, updated))
  })

  app.get("/api/apps/:appId/environments/:kind", async (c) => {
    const { appId, kind } = pathParams(c, consolePaths.appEnvironment)
    await appAccess(c, appId, "developer")
    const environment = await deps(c).store.getEnvironmentByKind(appId, kind)
    if (environment === null) throw new PlatformError("not_found")
    return respond(c, environmentSchema, await loadEnvironment(c, environment))
  })

  /** Creates the environment when missing (idempotent). */
  app.post("/api/apps/:appId/environments/:kind", async (c) => {
    const { appId, kind } = pathParams(c, consolePaths.appEnvironment)
    const access = await appAccess(c, appId, "admin")
    assertAppWritable(access.app)
    const existing = await deps(c).store.getEnvironmentByKind(appId, kind)
    const environment =
      existing ?? (await createEnvironment(c, access.app, kind))
    return respond(
      c,
      environmentSchema,
      await loadEnvironment(c, environment),
      existing === null ? 201 : 200,
    )
  })

  app.get("/api/apps/:appId/audit", async (c) => {
    const { appId } = pathParams(c, consolePaths.appId)
    const access = await appAccess(c, appId, "admin")
    const query = queryParams(c, auditSearchQuerySchema)
    return auditSearch(c, {
      ...query,
      organizationId: access.app.organizationId,
      appId,
    })
  })
}
