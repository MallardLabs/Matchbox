import { z } from "zod"
import { type EnvironmentKind, environmentKindSchema } from "./network"

/**
 * Credential formats. Random material is generated server-side by
 * `@repo/platform-server`; these helpers only format, parse and validate.
 *
 * - API key:       mbx_{pk|sk}_{test|live}_<prefix: 12 base62>_<secret: 43 base64url>
 * - Client id:     mbx_{test|live}_<24 base62>
 * - Client secret: mbx_cs_<prefix: 12 base62>_<secret: 43 base64url>
 *
 * `prefix` is the unique DB lookup value; the stored hash is
 * HMAC-SHA256(pepper, full credential string) as hex.
 */

export const base62Alphabet =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

export const credentialPrefixLength = 12
/** 32 random bytes, unpadded base64url. */
export const credentialSecretLength = 43
export const clientIdRandomLength = 24

export const apiKeyKindSchema = z.enum(["publishable", "secret"])

export type ApiKeyKind = z.infer<typeof apiKeyKindSchema>

const apiKeyKindTag = {
  publishable: "pk",
  secret: "sk",
} as const satisfies Record<ApiKeyKind, string>

export const credentialPrefixSchema = z
  .string()
  .regex(/^[0-9A-Za-z]{12}$/, "Expected 12 base62 characters")

export const credentialSecretSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "Expected 43 base64url characters")

const apiKeyPattern =
  /^mbx_(pk|sk)_(test|live)_([0-9A-Za-z]{12})_([A-Za-z0-9_-]{43})$/
const clientIdPattern = /^mbx_(test|live)_([0-9A-Za-z]{24})$/
const clientSecretPattern = /^mbx_cs_([0-9A-Za-z]{12})_([A-Za-z0-9_-]{43})$/

export type ParsedApiKey = {
  kind: ApiKeyKind
  environmentKind: EnvironmentKind
  prefix: string
  secret: string
}

export type ParsedClientId = {
  environmentKind: EnvironmentKind
}

export type ParsedClientSecret = {
  prefix: string
  secret: string
}

export function formatApiKey(key: ParsedApiKey): string {
  const prefix = credentialPrefixSchema.parse(key.prefix)
  const secret = credentialSecretSchema.parse(key.secret)
  return `mbx_${apiKeyKindTag[key.kind]}_${key.environmentKind}_${prefix}_${secret}`
}

export function parseApiKey(value: string): ParsedApiKey | null {
  const match = apiKeyPattern.exec(value)
  if (match === null) return null
  const [, tag, environment, prefix, secret] = match
  const environmentKind = environmentKindSchema.safeParse(environment)
  if (
    !environmentKind.success ||
    prefix === undefined ||
    secret === undefined
  ) {
    return null
  }
  return {
    kind: tag === "pk" ? "publishable" : "secret",
    environmentKind: environmentKind.data,
    prefix,
    secret,
  }
}

/** Non-secret identifier shown in the console, e.g. `mbx_pk_test_AbC…`. */
export function apiKeyDisplayPrefix(key: {
  kind: ApiKeyKind
  environmentKind: EnvironmentKind
  prefix: string
}): string {
  return `mbx_${apiKeyKindTag[key.kind]}_${key.environmentKind}_${key.prefix}`
}

/** Extracts the bearer credential from an `Authorization` header value. */
export function bearerToken(authorization: string | null): string | null {
  if (authorization === null) return null
  const match = /^Bearer[ ]+(\S+)[ ]*$/i.exec(authorization)
  return match?.[1] ?? null
}

export const apiKeySchema = z
  .string()
  .regex(apiKeyPattern, "Expected an mbx_pk_/mbx_sk_ API key")

export function formatClientId(
  environmentKind: EnvironmentKind,
  random: string,
): string {
  if (!/^[0-9A-Za-z]{24}$/.test(random)) {
    throw new Error("Client id random part must be 24 base62 characters")
  }
  return `mbx_${environmentKind}_${random}`
}

export function parseClientId(value: string): ParsedClientId | null {
  const match = clientIdPattern.exec(value)
  if (match === null) return null
  const environmentKind = environmentKindSchema.safeParse(match[1])
  return environmentKind.success
    ? { environmentKind: environmentKind.data }
    : null
}

export const clientIdSchema = z
  .string()
  .regex(clientIdPattern, "Expected an mbx_test_/mbx_live_ client id")

export function formatClientSecret(secret: ParsedClientSecret): string {
  const prefix = credentialPrefixSchema.parse(secret.prefix)
  const value = credentialSecretSchema.parse(secret.secret)
  return `mbx_cs_${prefix}_${value}`
}

export function parseClientSecret(value: string): ParsedClientSecret | null {
  const match = clientSecretPattern.exec(value)
  if (match === null) return null
  const [, prefix, secret] = match
  if (prefix === undefined || secret === undefined) return null
  return { prefix, secret }
}

export function clientSecretDisplayPrefix(prefix: string): string {
  return `mbx_cs_${prefix}`
}

export const clientSecretSchema = z
  .string()
  .regex(clientSecretPattern, "Expected an mbx_cs_ client secret")

/** Pairwise OIDC subject: `mbx_` + 32 base64url characters. */
export const pairwiseSubjectSchema = z
  .string()
  .regex(/^mbx_[A-Za-z0-9_-]{32}$/, "Expected an mbx_ pairwise subject")
