import { createRemoteJWKSet, errors, jwtVerify } from "jose"
import { z } from "zod"

/**
 * Sign in with Google: the SPA renders the Google Identity Services button
 * and posts the ID token (JWT) it receives. The Worker verifies the token's
 * signature against Google's JWKS, its issuer, audience (our client id),
 * expiry, and then the nonce it issued (see `google-nonce.ts`).
 */

export const googleIssuers = [
  "https://accounts.google.com",
  "accounts.google.com",
]

const googleJwksUrl = new URL("https://www.googleapis.com/oauth2/v3/certs")

/** ID tokens older than this are refused even if unexpired. */
export const googleTokenMaxAgeSeconds = 10 * 60

export type GoogleIdentity = {
  /** Stable Google account id. */
  sub: string
  email: string
  emailVerified: boolean
  /** Google Workspace domain (`hd`); null for consumer accounts. */
  hostedDomain: string | null
  name: string | null
  /** Profile picture URL (https only). */
  picture: string | null
  nonce: string | null
}

export type GoogleTokenVerifier = {
  /** Null when the token is invalid, expired or not for this client. */
  verify(credential: string): Promise<GoogleIdentity | null>
}

const claimsSchema = z.object({
  sub: z.string().min(1).max(255),
  email: z.string().min(3).max(254),
  email_verified: z.union([z.boolean(), z.enum(["true", "false"])]),
  hd: z.string().min(1).max(253).optional(),
  name: z.string().optional(),
  picture: z.string().optional(),
  nonce: z.string().optional(),
})

/** Keeps only https picture URLs of a sane length. */
export function avatarUrlFrom(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim()
  return trimmed.startsWith("https://") && trimmed.length <= 2048
    ? trimmed
    : null
}

/** Maps verified JWT claims to an identity; null when claims are missing. */
export function identityFromClaims(claims: unknown): GoogleIdentity | null {
  const parsed = claimsSchema.safeParse(claims)
  if (!parsed.success) return null
  const value = parsed.data
  return {
    sub: value.sub,
    email: value.email.trim().toLowerCase(),
    emailVerified:
      value.email_verified === true || value.email_verified === "true",
    hostedDomain: value.hd?.toLowerCase() ?? null,
    name: value.name?.trim() || null,
    picture: avatarUrlFrom(value.picture),
    nonce: value.nonce ?? null,
  }
}

/** One JWKS cache per isolate; jose refreshes it on unknown `kid`s. */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

export function createGoogleTokenVerifier(
  clientId: string,
): GoogleTokenVerifier {
  return {
    async verify(credential) {
      jwks ??= createRemoteJWKSet(googleJwksUrl)
      try {
        const { payload } = await jwtVerify(credential, jwks, {
          issuer: googleIssuers,
          audience: clientId,
          algorithms: ["RS256"],
          maxTokenAge: googleTokenMaxAgeSeconds,
          clockTolerance: 30,
        })
        return identityFromClaims(payload)
      } catch (error) {
        if (error instanceof errors.JOSEError) return null
        throw error
      }
    },
  }
}

/** Parses `STAFF_EMAIL_DOMAINS` ("a.com, b.org") into lowercase domains. */
export function parseStaffDomains(value: string | null): string[] {
  if (value === null) return []
  return value
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => domain.length > 0)
}

/**
 * Staff by domain: a verified email on a Google Workspace domain (`hd`) that
 * is listed. `hd` is only set for accounts the Workspace manages, so a
 * consumer Google account registered with a listed address does not count.
 */
export function isStaffIdentity(
  identity: GoogleIdentity,
  staffDomains: readonly string[],
): boolean {
  const domain = identity.hostedDomain
  return (
    identity.emailVerified &&
    domain !== null &&
    staffDomains.includes(domain) &&
    identity.email.endsWith(`@${domain}`)
  )
}
