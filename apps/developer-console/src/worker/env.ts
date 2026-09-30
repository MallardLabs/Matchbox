import { flags } from "@repo/platform-server"
import type { RateLimiterNamespace } from "@repo/platform-server"
import { z } from "zod"

/** Bindings and vars declared in `wrangler.jsonc` (+ secrets). */
export type WorkerBindings = {
  ASSETS: Fetcher
  RATE_LIMITER: RateLimiterNamespace
  /** Cloudflare Email Service; absent in local dev. */
  EMAIL?: SendEmail
  ENVIRONMENT?: string
  DEVELOPER_CONSOLE_ENABLED?: string
  WEBAUTHN_RP_ID?: string
  WEBAUTHN_RP_NAME?: string
  WEBAUTHN_ORIGIN?: string
  PUBLIC_API_ORIGIN?: string
  ID_ORIGIN?: string
  PLATFORM_STORE?: string
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  API_KEY_PEPPER?: string
  CLIENT_SECRET_PEPPER?: string
  SESSION_PEPPER?: string
  CF_ACCOUNT_ID?: string
  CF_ANALYTICS_TOKEN?: string
}

const pepperSchema = z.string().min(16, "Pepper must be at least 16 chars")

const originSchema = z
  .url({ protocol: /^https?$/ })
  .transform((value) => new URL(value).origin)

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) =>
    value === undefined || value.length === 0 ? null : value,
  )

const varsSchema = z
  .object({
    ENVIRONMENT: z.string().trim().min(1).default("production"),
    WEBAUTHN_RP_ID: z.string().trim().min(1),
    WEBAUTHN_RP_NAME: z.string().trim().min(1).default("Matchbox Developers"),
    WEBAUTHN_ORIGIN: originSchema,
    PUBLIC_API_ORIGIN: originSchema.default("https://api.matchbox.markets"),
    ID_ORIGIN: originSchema.default("https://id.matchbox.markets"),
    PLATFORM_STORE: z.enum(["supabase", "memory"]).default("supabase"),
    SUPABASE_URL: optionalText,
    SUPABASE_SERVICE_ROLE_KEY: optionalText,
    API_KEY_PEPPER: pepperSchema,
    CLIENT_SECRET_PEPPER: pepperSchema,
    SESSION_PEPPER: pepperSchema,
    CF_ACCOUNT_ID: optionalText,
    CF_ANALYTICS_TOKEN: optionalText,
  })
  .superRefine((vars, context) => {
    const production = vars.ENVIRONMENT === "production"
    if (production && vars.PLATFORM_STORE === "memory") {
      context.addIssue({
        code: "custom",
        path: ["PLATFORM_STORE"],
        message: "The memory store is refused in production",
      })
    }
    if (
      vars.PLATFORM_STORE === "supabase" &&
      (vars.SUPABASE_URL === null || vars.SUPABASE_SERVICE_ROLE_KEY === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["SUPABASE_URL"],
        message: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
      })
    }
    if (
      production &&
      new URL(vars.WEBAUTHN_ORIGIN).hostname !== vars.WEBAUTHN_RP_ID &&
      !new URL(vars.WEBAUTHN_ORIGIN).hostname.endsWith(
        `.${vars.WEBAUTHN_RP_ID}`,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["WEBAUTHN_RP_ID"],
        message: "WEBAUTHN_ORIGIN must be on the RP ID",
      })
    }
  })

export type ConsoleConfig = {
  environment: string
  production: boolean
  consoleEnabled: boolean
  store:
    | { kind: "memory" }
    | { kind: "supabase"; url: string; serviceRoleKey: string }
  webauthn: { rpId: string; rpName: string; origin: string }
  /** Origin of this console; used for CSRF checks and email links. */
  consoleOrigin: string
  publicApiOrigin: string
  idOrigin: string
  peppers: { apiKey: string; clientSecret: string; session: string }
  analytics: { accountId: string; token: string } | null
  /** `POST /api/auth/dev-sign-in`: memory store outside production only. */
  devSignIn: boolean
}

export type ConfigResult =
  | { ok: true; config: ConsoleConfig }
  | { ok: false; issues: string[] }

/** Validates Worker vars and secrets; never throws. */
export default function parseConfig(env: WorkerBindings): ConfigResult {
  const parsed = varsSchema.safeParse(env)
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    }
  }
  const vars = parsed.data
  const production = vars.ENVIRONMENT === "production"
  const memory = vars.PLATFORM_STORE === "memory"
  return {
    ok: true,
    config: {
      environment: vars.ENVIRONMENT,
      production,
      consoleEnabled: flags(env).developerConsole,
      store:
        memory ||
        vars.SUPABASE_URL === null ||
        vars.SUPABASE_SERVICE_ROLE_KEY === null
          ? { kind: "memory" }
          : {
              kind: "supabase",
              url: vars.SUPABASE_URL,
              serviceRoleKey: vars.SUPABASE_SERVICE_ROLE_KEY,
            },
      webauthn: {
        rpId: vars.WEBAUTHN_RP_ID,
        rpName: vars.WEBAUTHN_RP_NAME,
        origin: vars.WEBAUTHN_ORIGIN,
      },
      consoleOrigin: vars.WEBAUTHN_ORIGIN,
      publicApiOrigin: vars.PUBLIC_API_ORIGIN,
      idOrigin: vars.ID_ORIGIN,
      peppers: {
        apiKey: vars.API_KEY_PEPPER,
        clientSecret: vars.CLIENT_SECRET_PEPPER,
        session: vars.SESSION_PEPPER,
      },
      analytics:
        vars.CF_ACCOUNT_ID === null || vars.CF_ANALYTICS_TOKEN === null
          ? null
          : { accountId: vars.CF_ACCOUNT_ID, token: vars.CF_ANALYTICS_TOKEN },
      devSignIn: memory && !production,
    },
  }
}
