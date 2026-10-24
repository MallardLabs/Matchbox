import { parseJson } from "@repo/platform-contracts/encoding"
import {
  type SigningJwk,
  signingJwksSchema,
} from "@repo/platform-contracts/oidc"
import {
  type PlatformFlags,
  type RateLimiterNamespace,
  flags,
} from "@repo/platform-server"
import { z } from "zod"

/** Worker bindings and vars (see wrangler.jsonc and .dev.vars.example). */
export type WorkerEnv = {
  ASSETS: Fetcher
  RATE_LIMITER: RateLimiterNamespace
  ENVIRONMENT?: string
  MATCHBOX_ID_ENABLED?: string
  DISCORD_CLAIMS_ENABLED?: string
  ISSUER?: string
  PLATFORM_STORE?: string
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  SESSION_PEPPER?: string
  CLIENT_SECRET_PEPPER?: string
  OIDC_SIGNING_KEYS?: string
  MEZO_MAINNET_RPC_URL?: string
  MEZO_TESTNET_RPC_URL?: string
}

export const deploymentEnvironmentSchema = z.enum([
  "development",
  "preview",
  "production",
])

export type DeploymentEnvironment = z.infer<typeof deploymentEnvironmentSchema>

const pepperSchema = z.string().min(16, "Must be at least 16 characters")

const signingKeysSchema = z
  .string()
  .transform((value, context): SigningJwk[] => {
    const json = parseJson(value)
    const parsed = json.ok ? signingJwksSchema.safeParse(json.value) : null
    if (parsed === null || !parsed.success) {
      context.addIssue({
        code: "custom",
        message: "Expected a JSON array of private ES256 JWKs with kid",
      })
      return z.NEVER
    }
    return parsed.data
  })

const baseEnvSchema = z.object({
  ENVIRONMENT: deploymentEnvironmentSchema,
  ISSUER: z.url(),
  SESSION_PEPPER: pepperSchema,
  CLIENT_SECRET_PEPPER: pepperSchema,
  OIDC_SIGNING_KEYS: signingKeysSchema,
  MEZO_MAINNET_RPC_URL: z.url().default("https://rpc-internal.mezo.org"),
  MEZO_TESTNET_RPC_URL: z.url().default("https://rpc.test.mezo.org"),
})

const workerConfigSchema = z
  .discriminatedUnion("PLATFORM_STORE", [
    baseEnvSchema.extend({ PLATFORM_STORE: z.literal("memory") }),
    baseEnvSchema.extend({
      PLATFORM_STORE: z.literal("supabase"),
      SUPABASE_URL: z.url(),
      SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    }),
  ])
  .refine(
    (config) =>
      config.PLATFORM_STORE !== "memory" || config.ENVIRONMENT !== "production",
    { message: "PLATFORM_STORE=memory is refused in production" },
  )

export type WorkerConfig = z.output<typeof workerConfigSchema>

export type ConfigResult =
  | { ok: true; config: WorkerConfig }
  | { ok: false; issues: string[] }

function blankToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.trim().length === 0 ? undefined : value
}

/** Validates the env for an enabled Worker; secrets are never echoed. */
export function parseWorkerConfig(env: WorkerEnv): ConfigResult {
  const parsed = workerConfigSchema.safeParse({
    ENVIRONMENT: blankToUndefined(env.ENVIRONMENT) ?? "production",
    ISSUER: blankToUndefined(env.ISSUER),
    PLATFORM_STORE: blankToUndefined(env.PLATFORM_STORE) ?? "supabase",
    SUPABASE_URL: blankToUndefined(env.SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: blankToUndefined(env.SUPABASE_SERVICE_ROLE_KEY),
    SESSION_PEPPER: blankToUndefined(env.SESSION_PEPPER),
    CLIENT_SECRET_PEPPER: blankToUndefined(env.CLIENT_SECRET_PEPPER),
    OIDC_SIGNING_KEYS: blankToUndefined(env.OIDC_SIGNING_KEYS),
    MEZO_MAINNET_RPC_URL: blankToUndefined(env.MEZO_MAINNET_RPC_URL),
    MEZO_TESTNET_RPC_URL: blankToUndefined(env.MEZO_TESTNET_RPC_URL),
  })
  if (parsed.success) return { ok: true, config: parsed.data }
  return {
    ok: false,
    issues: parsed.error.issues.map(
      (issue) => `${issue.path.join(".") || "env"}: ${issue.message}`,
    ),
  }
}

export type IdFlags = Pick<PlatformFlags, "matchboxId" | "discordClaims">

export function idFlags(env: WorkerEnv): IdFlags {
  const all = flags(env)
  return { matchboxId: all.matchboxId, discordClaims: all.discordClaims }
}
