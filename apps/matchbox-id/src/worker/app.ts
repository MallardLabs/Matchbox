import {
  errorHandler,
  errorResponse,
  notFoundHandler,
  requestId,
  requireSameOrigin,
  securityHeaders,
} from "@repo/platform-server"
import { Hono } from "hono"
import type { AppDeps } from "./deps"
import { createQuotaOverrideLookup } from "./rate-limit"
import accountRoutes from "./routes/account"
import authorizeRoutes from "./routes/authorize"
import consentRoutes from "./routes/consent"
import discoveryRoutes from "./routes/discovery"
import revokeRoutes from "./routes/revoke"
import siweRoutes from "./routes/siwe"
import tokenRoutes from "./routes/token"
import userinfoRoutes from "./routes/userinfo"

/**
 * Matchbox ID Worker routes (`/.well-known/*`, `/oauth/*`, `/api/*`). The
 * SPA itself is served by the ASSETS binding; see `index.ts`.
 */

/** Public OAuth endpoints browsers may call cross-origin (no cookies). */
const corsPaths = new Set([
  "/.well-known/openid-configuration",
  "/oauth/jwks",
  "/oauth/token",
  "/oauth/userinfo",
  "/oauth/revoke",
])

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "600",
} as const

function baseApp(deps: Pick<AppDeps, "logger">): Hono {
  const app = new Hono()
  app.use(
    "*",
    requestId(deps.logger === undefined ? {} : { logger: deps.logger }),
  )
  app.use("*", securityHeaders())
  app.onError(errorHandler())
  app.notFound(notFoundHandler)
  return app
}

/** Kill switch off: every Worker route answers 503 `service_disabled`. */
export function createDisabledApp(deps: Pick<AppDeps, "logger"> = {}): Hono {
  const app = baseApp(deps)
  app.all("*", (c) => errorResponse(c, "service_disabled"))
  return app
}

export function createApp(deps: AppDeps): Hono {
  if (!deps.flags.matchboxId) return createDisabledApp(deps)
  const app = baseApp(deps)

  app.use("*", async function cors(c, next) {
    if (!corsPaths.has(c.req.path)) return next()
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204, { ...corsHeaders })
    }
    await next()
    for (const [name, value] of Object.entries(corsHeaders)) {
      c.res.headers.set(name, value)
    }
  })
  app.use("/api/*", requireSameOrigin())

  const quotaOverrides = createQuotaOverrideLookup(deps)
  app.route("/", discoveryRoutes(deps))
  app.route("/", authorizeRoutes(deps, quotaOverrides))
  app.route("/", tokenRoutes(deps, quotaOverrides))
  app.route("/", userinfoRoutes(deps, quotaOverrides))

  app.route("/", revokeRoutes(deps))
  app.route("/", siweRoutes(deps))
  app.route("/", accountRoutes(deps))
  app.route("/", consentRoutes(deps))
  return app
}
