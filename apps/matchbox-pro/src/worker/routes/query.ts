import { z } from "zod"
import {
  type StuartStatus,
  proposalRefreshRequestSchema,
  stuartRequestSchema,
  supportReportSubmitSchema,
} from "../../features/query/contract"
import { sdkMessageCreator } from "../query/claude"
import { createLiveProviders } from "../query/context"
import { proposalSecret } from "../query/crypto"
import {
  type StuartConfig,
  claudeAvailable,
  readStuartConfig,
} from "../query/env"
import {
  StuartHttpError,
  assertSameOrigin,
  clientIp,
  readJsonBody,
  stuartError,
  stuartJson,
} from "../query/http"
import { MCP_PROTOCOL_VERSION, handleMcpRequest } from "../query/mcp"
import { type StuartRuntime, runStuartQuery } from "../query/orchestrator"
import {
  MCP_LIMIT,
  QUERY_LIMIT,
  REFRESH_LIMIT,
  type RateLimitPolicy,
  SUPPORT_LIMIT,
  checkRateLimit,
} from "../query/rateLimit"
import { refreshProposal } from "../query/refresh"
import { submitSupportReport } from "../query/supportReport"
import type { ApiContext, ApiRoute, WorkerEnv } from "../router"

// Stuart / Query runtime: answers, proposals, pre-sign refresh and support
// reports. The POST routes are same-origin only and never send ACAO.

const QUERY_BODY_LIMIT = 16 * 1024
const REFRESH_BODY_LIMIT = 128 * 1024
const SUPPORT_BODY_LIMIT = 32 * 1024
const MCP_BODY_LIMIT = 16 * 1024

function log(event: Record<string, unknown>): void {
  console.log(JSON.stringify(event))
}

function runtimeFor(env: WorkerEnv, config: StuartConfig): StuartRuntime {
  return {
    providers: createLiveProviders({
      ...(env.BASE_RPC_URL ? { baseRpcUrl: env.BASE_RPC_URL } : {}),
      supabaseUrl: config.supabaseUrl,
      supabaseAnonKey: config.supabaseAnonKey,
      nowSeconds: () => BigInt(Math.floor(Date.now() / 1000)),
    }),
    secret: proposalSecret(config.proposalSecret),
    now: () => new Date(),
    claude:
      claudeAvailable(config) && config.anthropicApiKey
        ? {
            create: sdkMessageCreator(config.anthropicApiKey),
            model: config.model,
          }
        : null,
    log,
  }
}

async function limit(
  policy: RateLimitPolicy,
  binding: StuartConfig["limiters"]["query"],
  keys: string[],
): Promise<void> {
  const wait = await checkRateLimit({
    binding,
    policy,
    keys,
    nowMs: Date.now(),
  })
  if (wait !== null) {
    throw new StuartHttpError(
      429,
      "rate_limited",
      "Too many requests. Try again shortly.",
      wait,
    )
  }
}

function guarded(
  name: string,
  handler: (context: ApiContext, config: StuartConfig) => Promise<Response>,
): (context: ApiContext) => Promise<Response> {
  return async function handle(context) {
    try {
      const config = readStuartConfig(context.env)
      assertSameOrigin(context.request, config.allowedOrigins)
      return await handler(context, config)
    } catch (error) {
      if (error instanceof StuartHttpError) return stuartError(error)
      if (error instanceof z.ZodError) {
        return stuartError(
          new StuartHttpError(
            400,
            "invalid_request",
            "Request does not match the contract.",
          ),
        )
      }
      log({
        message: "stuart.route_error",
        route: name,
        error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      })
      return stuartError(
        new StuartHttpError(
          500,
          "internal",
          "Stuart is unavailable right now.",
        ),
      )
    }
  }
}

export const queryRoutes: ApiRoute[] = [
  {
    method: "GET",
    path: "/api/query/status",
    handler: async ({ env }) => {
      const config = readStuartConfig(env)
      const live = claudeAvailable(config)
      const status: StuartStatus = {
        stuart: live ? "claude" : "deterministic",
        model: live ? config.model : null,
        supportReports:
          config.supabaseUrl !== null && config.supabaseServiceRoleKey !== null,
      }
      return stuartJson(status)
    },
  },
  {
    method: "POST",
    path: "/api/query",
    sameOrigin: true,
    handler: guarded("query", async ({ request, env }, config) => {
      const ip = clientIp(request)
      await limit(QUERY_LIMIT, config.limiters.query, [`ip:${ip}`])
      const body = stuartRequestSchema.parse(
        await readJsonBody(request, QUERY_BODY_LIMIT),
      )
      await limit(QUERY_LIMIT, config.limiters.query, [
        `session:${body.sessionId}`,
      ])
      return stuartJson(await runStuartQuery(body, runtimeFor(env, config)))
    }),
  },
  {
    method: "POST",
    path: "/api/proposal/refresh",
    sameOrigin: true,
    handler: guarded("refresh", async ({ request, env }, config) => {
      const ip = clientIp(request)
      await limit(REFRESH_LIMIT, config.limiters.refresh, [`ip:${ip}`])
      const body = proposalRefreshRequestSchema.parse(
        await readJsonBody(request, REFRESH_BODY_LIMIT),
      )
      return stuartJson(await refreshProposal(body, runtimeFor(env, config)))
    }),
  },
  {
    method: "POST",
    path: "/api/support-report",
    sameOrigin: true,
    handler: guarded("support", async ({ request }, config) => {
      const ip = clientIp(request)
      await limit(SUPPORT_LIMIT, config.limiters.support, [`ip:${ip}`])
      const body = supportReportSubmitSchema.parse(
        await readJsonBody(request, SUPPORT_BODY_LIMIT),
      )
      const result = await submitSupportReport({
        body,
        secret: proposalSecret(config.proposalSecret),
        ip,
        now: new Date(),
        sink: {
          supabaseUrl: config.supabaseUrl,
          serviceRoleKey: config.supabaseServiceRoleKey,
        },
      })
      log({ message: "stuart.support_report", ref: result.ref })
      return stuartJson(result, 201)
    }),
  },
  {
    // External agents: off unless MCP_ENABLED="true". Not same-origin, so
    // the strict per-IP limiter is the guard. Deterministic tools only.
    method: "POST",
    path: "/api/mcp",
    handler: async ({ request, env }) => {
      const config = readStuartConfig(env)
      if (!config.mcpEnabled) {
        return stuartError(
          new StuartHttpError(404, "invalid_request", "Not found"),
        )
      }
      try {
        await limit(MCP_LIMIT, config.limiters.mcp, [`ip:${clientIp(request)}`])
        const body = await readJsonBody(request, MCP_BODY_LIMIT)
        const result = await handleMcpRequest({
          body,
          headers: request.headers,
          runtime: { ...runtimeFor(env, config), claude: null },
        })
        return new Response(JSON.stringify(result.body), {
          status: result.status,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
            "access-control-allow-origin": "*",
            "mcp-protocol-version": MCP_PROTOCOL_VERSION,
          },
        })
      } catch (error) {
        if (error instanceof StuartHttpError) return stuartError(error)
        log({
          message: "stuart.mcp_error",
          error:
            error instanceof Error ? error.message.slice(0, 200) : "unknown",
        })
        return stuartError(
          new StuartHttpError(500, "internal", "MCP is unavailable right now."),
        )
      }
    },
  },
]
