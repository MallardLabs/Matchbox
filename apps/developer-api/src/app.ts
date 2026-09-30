import { type Logger, logger as rootLogger } from "@repo/logger"
import { issuesFromZodError } from "@repo/platform-contracts/errors"
import {
  type GaugeProfile,
  type GaugeProfileDetail,
  type GaugeProfileList,
  type HealthResponse,
  gaugeProfileCursorCodec,
  parseGaugeProfileListQuery,
  sourceMetaFor,
  vebtcGaugeProfileParamsSchema,
} from "@repo/platform-contracts/gauge-profiles"
import {
  type NetworkSlug,
  describeNetwork,
  networkForEnvironmentKind,
  networkSlugSchema,
} from "@repo/platform-contracts/network"
import openApiDocument from "@repo/platform-contracts/openapi.json"
import {
  PlatformError,
  type RateLimitClient,
  errorHandler,
  notFoundHandler,
  requestId,
  securityHeaders,
} from "@repo/platform-server"
import { Hono } from "hono"
import { z } from "zod"
import type { RequestAuth } from "./auth"
import type { ApiContext, ApiEnv } from "./context"
import { found, publicCacheControl, respondJson } from "./http"
import { authenticate, createAuthState } from "./middleware/authenticate"
import { cors } from "./middleware/cors"
import {
  createOverrideCache,
  defaultPublishableQuotaShare,
  rateLimit,
} from "./middleware/rate-limit"
import { type RequestLogSink, requestLog } from "./middleware/request-log"
import type { ApiStore } from "./store/api-store"

export type AppDeps = {
  store: ApiStore
  rateLimits: RateLimitClient
  /** Analytics Engine dataset (`REQUEST_LOG`); null disables request logs. */
  analytics: RequestLogSink | null
  now: () => Date
  flags: { gaugeProfileApi: boolean }
  config: {
    apiKeyPepper: string
    version: string
    environment: string
    /** Publishable keys' share of the environment quota; default 0.5. */
    publishableQuotaShare?: number
  }
  logger?: Logger
}

const gaugeAddressParamSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((value) => value.toLowerCase())

/** Runs work after the response (`ctx.waitUntil`), or detached in tests. */
function runInBackground(c: ApiContext, task: Promise<unknown>): void {
  try {
    c.executionCtx.waitUntil(task)
  } catch {
    // No ExecutionContext (e.g. `app.request()` in tests): the promise is
    // already running and handles its own errors.
  }
}

function requireAuth(c: ApiContext): RequestAuth {
  const auth = c.get("auth")
  if (auth === undefined) throw new PlatformError("internal_error")
  return auth
}

/** 403 unless the key's environment reads `network`. */
function allowedNetwork(auth: RequestAuth, network: string): NetworkSlug {
  const allowed = networkForEnvironmentKind(auth.environmentKind)
  const parsed = networkSlugSchema.safeParse(network)
  if (!parsed.success || parsed.data !== allowed) {
    throw new PlatformError("network_not_allowed", {
      message: `This key reads the ${allowed} network only.`,
    })
  }
  return parsed.data
}

function detail(profile: GaugeProfile): GaugeProfileDetail {
  return { data: profile, meta: sourceMetaFor([profile]) }
}

export function createApp(deps: AppDeps) {
  const log = deps.logger ?? rootLogger
  const nowMs = () => deps.now().getTime()
  const app = new Hono<ApiEnv>()

  app.use(requestLog({ sink: deps.analytics, now: deps.now, logger: log }))
  app.use(requestId({ logger: log }))
  app.use(securityHeaders())
  app.use(cors())
  app.onError(errorHandler())
  app.notFound(notFoundHandler)

  app.get("/v1/health", (c) => {
    c.set("routeTemplate", "/v1/health")
    c.set("cors", { kind: "public" })
    const body: HealthResponse = {
      status: "ok",
      version: deps.config.version,
      flags: { gaugeProfileApi: deps.flags.gaugeProfileApi },
    }
    return c.json(body, 200, { "Cache-Control": "no-store" })
  })

  app.get("/openapi.json", (c) => {
    c.set("routeTemplate", "/openapi.json")
    c.set("cors", { kind: "public" })
    return respondJson(c, openApiDocument, publicCacheControl)
  })

  app.use("/v1/*", async function gaugeProfileApiFlag(_c, next) {
    if (!deps.flags.gaugeProfileApi) {
      throw new PlatformError("service_disabled")
    }
    await next()
  })
  app.use(
    "/v1/*",
    authenticate({
      store: deps.store,
      rateLimits: deps.rateLimits,
      pepper: deps.config.apiKeyPepper,
      now: deps.now,
      logger: log,
      state: createAuthState(nowMs),
      background: runInBackground,
    }),
  )
  app.use(
    "/v1/*",
    rateLimit({
      store: deps.store,
      rateLimits: deps.rateLimits,
      now: deps.now,
      logger: log,
      overrides: createOverrideCache(nowMs),
      publishableQuotaShare:
        deps.config.publishableQuotaShare ?? defaultPublishableQuotaShare,
    }),
  )

  app.get("/v1/networks", (c) => {
    c.set("routeTemplate", "/v1/networks")
    const auth = requireAuth(c)
    return respondJson(c, {
      data: [describeNetwork(networkForEnvironmentKind(auth.environmentKind))],
    })
  })

  app.get("/v1/gauge-profiles", async (c) => {
    c.set("routeTemplate", "/v1/gauge-profiles")
    const auth = requireAuth(c)
    const parsed = parseGaugeProfileListQuery(new URL(c.req.url).searchParams)
    if (!parsed.ok) {
      throw new PlatformError("invalid_request", {
        ...(parsed.error === "invalid-cursor"
          ? { message: "Invalid cursor." }
          : { issues: issuesFromZodError(parsed.error) }),
      })
    }
    const { query, cursor } = parsed
    const network = allowedNetwork(auth, query.network)
    const page = await deps.store.listGaugeProfiles({
      network,
      profileType: query.profileType ?? null,
      tag: query.tag ?? null,
      updatedSince: query.updatedSince ?? null,
      addresses: query.address ?? null,
      limit: query.limit,
      cursor,
    })
    const body: GaugeProfileList = {
      data: page.profiles,
      nextCursor:
        page.nextCursor === null
          ? null
          : gaugeProfileCursorCodec.encode(page.nextCursor),
      meta: sourceMetaFor(page.profiles),
    }
    return respondJson(c, body)
  })

  app.get("/v1/gauge-profiles/:network/:gaugeAddress", async (c) => {
    c.set("routeTemplate", "/v1/gauge-profiles/{network}/{gaugeAddress}")
    const auth = requireAuth(c)
    const network = allowedNetwork(auth, c.req.param("network"))
    const address = gaugeAddressParamSchema.safeParse(
      c.req.param("gaugeAddress"),
    )
    if (!address.success) throw new PlatformError("not_found")
    const profile = found(
      await deps.store.getGaugeProfile(network, address.data),
    )
    return respondJson(c, detail(profile))
  })

  app.get("/v1/vebtc/:network/:tokenId/gauge-profile", async (c) => {
    c.set("routeTemplate", "/v1/vebtc/{network}/{tokenId}/gauge-profile")
    const auth = requireAuth(c)
    const network = allowedNetwork(auth, c.req.param("network"))
    const params = vebtcGaugeProfileParamsSchema.safeParse({
      network,
      tokenId: c.req.param("tokenId"),
    })
    if (!params.success) throw new PlatformError("not_found")
    const profile = found(
      await deps.store.getGaugeProfileByVebtc(network, params.data.tokenId),
    )
    return respondJson(c, detail(profile))
  })

  return app
}

export type ApiApp = ReturnType<typeof createApp>
