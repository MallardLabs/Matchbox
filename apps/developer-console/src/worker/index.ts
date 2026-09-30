import { logger } from "@repo/logger"
import { buildErrorBody } from "@repo/platform-contracts/errors"
import {
  createDurableRateLimitClient,
  createSupabaseAdmin,
  generateRequestId,
} from "@repo/platform-server"
import type { Hono } from "hono"
import createApp from "./app"
import type { ConsoleEnv } from "./context"
import { createBindingEmailSender, createLogEmailSender } from "./email/sender"
import parseConfig, { type ConsoleConfig, type WorkerBindings } from "./env"
import { withDocumentHeaders } from "./security"
import type { ConsoleStore } from "./store/console-store"
import createMemoryStore, {
  type MemoryConsoleStore,
} from "./store/memory-store"
import seedDemoData, { demoAccountEmail } from "./store/seed"
import createSupabaseStore from "./store/supabase-store"
import {
  AnalyticsUnavailableError,
  type UsageAnalytics,
  createAnalyticsEngineClient,
  createAnalyticsEngineUsage,
  createSyntheticUsage,
} from "./usage/analytics"

export { RateLimiter } from "@repo/platform-server/rate-limiter"

const unavailableAnalytics: UsageAnalytics = {
  async usage() {
    throw new AnalyticsUnavailableError(
      "CF_ACCOUNT_ID/CF_ANALYTICS_TOKEN unset",
    )
  },
  async requests() {
    throw new AnalyticsUnavailableError(
      "CF_ACCOUNT_ID/CF_ANALYTICS_TOKEN unset",
    )
  },
  async request() {
    throw new AnalyticsUnavailableError(
      "CF_ACCOUNT_ID/CF_ANALYTICS_TOKEN unset",
    )
  },
}

/** One memory store per isolate so demo data survives across requests. */
let memoryStore: Promise<MemoryConsoleStore> | null = null

function demoStore(config: ConsoleConfig): Promise<MemoryConsoleStore> {
  memoryStore ??= (async () => {
    const store = createMemoryStore()
    await seedDemoData(store, {
      apiKeyPepper: config.peppers.apiKey,
      clientSecretPepper: config.peppers.clientSecret,
      now: new Date(),
    })
    return store
  })()
  return memoryStore
}

type Built = { env: WorkerBindings; app: Hono<ConsoleEnv> }

let built: Built | null = null

async function buildApp(
  env: WorkerBindings,
  config: ConsoleConfig,
): Promise<Hono<ConsoleEnv>> {
  if (built !== null && built.env === env) return built.app
  const store: ConsoleStore =
    config.store.kind === "memory"
      ? await demoStore(config)
      : createSupabaseStore(
          createSupabaseAdmin({
            SUPABASE_URL: config.store.url,
            SUPABASE_SERVICE_ROLE_KEY: config.store.serviceRoleKey,
          }),
        )
  const analytics =
    config.analytics !== null
      ? createAnalyticsEngineUsage(
          createAnalyticsEngineClient(config.analytics),
        )
      : config.store.kind === "memory"
        ? createSyntheticUsage()
        : unavailableAnalytics
  if (env.EMAIL === undefined && config.production) {
    logger.error({ message: "EMAIL binding missing in production" })
  }
  const app = createApp({
    store,
    rateLimits: createDurableRateLimitClient(env.RATE_LIMITER),
    email:
      env.EMAIL !== undefined
        ? createBindingEmailSender(env.EMAIL)
        : createLogEmailSender(logger),
    analytics,
    webauthn: config.webauthn,
    now: () => new Date(),
    flags: {
      consoleEnabled: config.consoleEnabled,
      devSignIn: config.devSignIn,
    },
    config: {
      production: config.production,
      consoleOrigin: config.consoleOrigin,
      sessionPepper: config.peppers.session,
      apiKeyPepper: config.peppers.apiKey,
      clientSecretPepper: config.peppers.clientSecret,
      devAccountEmail: demoAccountEmail,
    },
  })
  built = { env, app }
  return app
}

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/")
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (!isApiPath(url.pathname)) {
      return withDocumentHeaders(await env.ASSETS.fetch(request), {
        development: env.ENVIRONMENT === "development",
      })
    }
    const parsed = parseConfig(env)
    if (!parsed.ok) {
      logger.error({
        message: "Invalid console configuration",
        issues: parsed.issues,
      })
      const requestId = generateRequestId()
      return Response.json(
        buildErrorBody({ code: "internal_error", requestId }),
        {
          status: 500,
          headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
        },
      )
    }
    const app = await buildApp(env, parsed.config)
    return app.fetch(request, env, ctx)
  },
} satisfies ExportedHandler<WorkerBindings>
