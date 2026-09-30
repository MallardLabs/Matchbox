import type { RateLimiterNamespace } from "@repo/platform-server"
import { z } from "zod"

/**
 * Worker bindings, validated once per isolate. Secrets come from
 * `wrangler secret put`; vars from `wrangler.jsonc`.
 */

function hasFunctions(value: unknown, names: readonly string[]): boolean {
  if (typeof value !== "object" || value === null) return false
  return names.every((name) => typeof Reflect.get(value, name) === "function")
}

function isRateLimiterNamespace(value: unknown): value is RateLimiterNamespace {
  return hasFunctions(value, ["idFromName", "get"])
}

function isAnalyticsDataset(value: unknown): value is AnalyticsEngineDataset {
  return hasFunctions(value, ["writeDataPoint"])
}

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) =>
    value === undefined || value.length === 0 ? null : value,
  )

/** `PUBLISHABLE_QUOTA_SHARE`: a number in (0, 1]; blank = default. */
const quotaShareSchema = optionalText.transform((value, context) => {
  if (value === null) return null
  const share = Number(value)
  if (!Number.isFinite(share) || share <= 0 || share > 1) {
    context.addIssue({
      code: "custom",
      message: "PUBLISHABLE_QUOTA_SHARE must be a number in (0, 1]",
    })
    return z.NEVER
  }
  return share
})

export const platformStoreSchema = z.enum(["supabase", "memory"])

export type PlatformStore = z.infer<typeof platformStoreSchema>

/** Fixed pepper for memory mode only; production requires a real secret. */
export const memoryModePepper = "matchbox-local-memory-mode-pepper"

export const workerEnvSchema = z
  .object({
    ENVIRONMENT: z.string().trim().min(1).default("production"),
    API_VERSION: z.string().trim().min(1).default("2.0.0"),
    GAUGE_PROFILE_API_ENABLED: z.string().default("false"),
    PLATFORM_STORE: platformStoreSchema.default("supabase"),
    PUBLISHABLE_QUOTA_SHARE: quotaShareSchema,

    SUPABASE_URL: optionalText,
    SUPABASE_SERVICE_ROLE_KEY: optionalText,
    API_KEY_PEPPER: optionalText,
    MEZO_MAINNET_RPC_URL: optionalText.pipe(z.url().nullable()),
    MEZO_TESTNET_RPC_URL: optionalText.pipe(z.url().nullable()),
    RATE_LIMITER: z.custom<RateLimiterNamespace>(isRateLimiterNamespace, {
      message: "RATE_LIMITER Durable Object binding is missing",
    }),
    REQUEST_LOG: z
      .custom<AnalyticsEngineDataset>(isAnalyticsDataset, {
        message: "REQUEST_LOG must be an Analytics Engine dataset",
      })
      .optional(),
  })
  .superRefine((env, context) => {
    if (env.PLATFORM_STORE === "memory") {
      if (env.ENVIRONMENT === "production") {
        context.addIssue({
          code: "custom",
          path: ["PLATFORM_STORE"],
          message:
            "PLATFORM_STORE=memory is refused when ENVIRONMENT=production",
        })
      }
      return
    }
    for (const name of [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "API_KEY_PEPPER",
    ] as const) {
      if (env[name] === null) {
        context.addIssue({
          code: "custom",
          path: [name],
          message: `${name} is required`,
        })
      }
    }
    if (env.API_KEY_PEPPER !== null && env.API_KEY_PEPPER.length < 32) {
      context.addIssue({
        code: "custom",
        path: ["API_KEY_PEPPER"],
        message: "API_KEY_PEPPER must be at least 32 characters",
      })
    }
  })

export type WorkerEnv = z.output<typeof workerEnvSchema>

export type WorkerEnvResult =
  | { ok: true; env: WorkerEnv }
  | { ok: false; problems: string[] }

/** Validates bindings; reports problem paths without leaking values. */
export function parseWorkerEnv(raw: unknown): WorkerEnvResult {
  const parsed = workerEnvSchema.safeParse(raw)
  if (parsed.success) return { ok: true, env: parsed.data }
  return {
    ok: false,
    problems: parsed.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    ),
  }
}
