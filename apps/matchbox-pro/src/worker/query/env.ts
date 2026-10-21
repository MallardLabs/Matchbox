import { z } from "zod"
import type { WorkerEnv } from "../router"

export const DEFAULT_STUART_MODEL = "claude-haiku-5-5"

// Workers Rate Limiting API binding (`ratelimits` in wrangler.jsonc).
export type RateLimitBinding = {
  limit: (options: { key: string }) => Promise<{ success: boolean }>
}

export type StuartConfig = {
  anthropicApiKey: string | null
  model: string
  // Kill switch: STUART_CLAUDE_ENABLED="false" forces deterministic answers.
  claudeEnabled: boolean
  proposalSecret: string | null
  supabaseUrl: string | null
  supabaseServiceRoleKey: string | null
  supabaseAnonKey: string | null
  allowedOrigins: string[]
  mcpEnabled: boolean
  limiters: {
    query: RateLimitBinding | null
    refresh: RateLimitBinding | null
    support: RateLimitBinding | null
  }
}

const optionalText = z
  .string()
  .trim()
  .min(1)
  .optional()
  .catch(undefined)
  .transform((value) => value ?? null)

const envSchema = z.object({
  ANTHROPIC_API_KEY: optionalText,
  ANTHROPIC_MODEL: optionalText,
  STUART_CLAUDE_ENABLED: optionalText,
  PROPOSAL_HMAC_SECRET: optionalText,
  SUPABASE_URL: optionalText,
  VITE_SUPABASE_URL: optionalText,
  SUPABASE_SERVICE_ROLE_KEY: optionalText,
  SUPABASE_ANON_KEY: optionalText,
  VITE_SUPABASE_ANON_KEY: optionalText,
  STUART_ALLOWED_ORIGINS: optionalText,
  MCP_ENABLED: optionalText,
})

const DEFAULT_ALLOWED_ORIGINS = [
  "https://pro.matchbox.markets",
  "http://localhost:3002",
  "http://127.0.0.1:3002",
]

function isRateLimitBinding(value: unknown): value is RateLimitBinding {
  return (
    typeof value === "object" &&
    value !== null &&
    "limit" in value &&
    typeof value.limit === "function"
  )
}

function binding(source: Record<string, unknown>, name: string) {
  const value = source[name]
  return isRateLimitBinding(value) ? value : null
}

export function readStuartConfig(env: WorkerEnv): StuartConfig {
  // The Worker env carries secrets and bindings beyond the shared WorkerEnv
  // type; read them as untyped values and validate.
  const source: Record<string, unknown> = env
  const parsed = envSchema.parse(source)
  return {
    anthropicApiKey: parsed.ANTHROPIC_API_KEY,
    model: parsed.ANTHROPIC_MODEL ?? DEFAULT_STUART_MODEL,
    claudeEnabled: parsed.STUART_CLAUDE_ENABLED !== "false",
    proposalSecret: parsed.PROPOSAL_HMAC_SECRET,
    supabaseUrl: parsed.SUPABASE_URL ?? parsed.VITE_SUPABASE_URL,
    supabaseServiceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
    supabaseAnonKey: parsed.SUPABASE_ANON_KEY ?? parsed.VITE_SUPABASE_ANON_KEY,
    allowedOrigins: [
      ...DEFAULT_ALLOWED_ORIGINS,
      ...(parsed.STUART_ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ],
    mcpEnabled: parsed.MCP_ENABLED === "true",
    limiters: {
      query: binding(source, "STUART_QUERY_LIMITER"),
      refresh: binding(source, "STUART_REFRESH_LIMITER"),
      support: binding(source, "STUART_SUPPORT_LIMITER"),
    },
  }
}

export function claudeAvailable(config: StuartConfig): boolean {
  return config.claudeEnabled && config.anthropicApiKey !== null
}
