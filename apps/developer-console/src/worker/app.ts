import {
  errorHandler,
  errorResponse,
  notFoundHandler,
  requestId,
  requireFlag,
  requireSameOrigin,
  securityHeaders,
} from "@repo/platform-server"
import { Hono } from "hono"
import { loadSession } from "./auth/session"
import type { ConsoleDeps, ConsoleEnv } from "./context"
import registerAdminRoutes from "./routes/admin"
import registerAppRoutes from "./routes/apps"
import registerAuthRoutes from "./routes/auth"
import registerCredentialRoutes from "./routes/credentials"
import registerEnvironmentRoutes from "./routes/environments"
import registerMeRoutes from "./routes/me"
import registerOrganizationRoutes from "./routes/organizations"
import registerUsageRoutes from "./routes/usage"
import { StoreConflictError } from "./store/console-store"

/**
 * The console `/api/*` Hono app. Pure: every dependency comes in through
 * `deps`, so tests drive it with `app.request()` and the memory store.
 */
export default function createApp(deps: ConsoleDeps): Hono<ConsoleEnv> {
  const app = new Hono<ConsoleEnv>()
  const handleError = errorHandler()

  app.onError(function onError(error, c) {
    if (error instanceof StoreConflictError) {
      return errorResponse(c, "conflict")
    }
    return handleError(error, c)
  })
  app.notFound(notFoundHandler)

  app.use("*", requestId())
  app.use("*", securityHeaders())
  app.use("*", async function provideDeps(c, next) {
    c.set("deps", deps)
    c.set("auth", null)
    await next()
  })
  app.use(
    "/api/*",
    requireFlag(() => deps.flags.consoleEnabled),
  )
  app.use(
    "/api/*",
    requireSameOrigin({ allowedOrigins: [deps.config.consoleOrigin] }),
  )
  app.use("/api/*", loadSession())

  registerAuthRoutes(app)
  registerMeRoutes(app)
  registerOrganizationRoutes(app)
  registerAppRoutes(app)
  registerEnvironmentRoutes(app)
  registerCredentialRoutes(app)
  registerUsageRoutes(app)
  registerAdminRoutes(app)

  return app
}
