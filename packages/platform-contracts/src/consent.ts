import type { z } from "zod"
import { releasableClaimSchema } from "./oidc"
import {
  type OidcScope,
  claimsForScopes,
  normalizeScopes,
  scopeRequirement,
} from "./scopes"

/**
 * Optional-scope consent rules shared by Matchbox ID (decision, grant
 * storage, token claims) and the developer console (consent preview).
 *
 * A grant records two disjoint sets: `scopes` (granted; tokens, ID token and
 * userinfo release claims for these only) and `declinedScopes` (optional
 * scopes the user switched off). Unavailable optional scopes (for example
 * Discord not linked) are skipped: neither granted nor declined, so the
 * user is offered them again once they become available. An unavailable or
 * declined required scope fails the decision.
 */

export type ConsentDecisionFailure =
  | "required-scope-declined"
  | "required-scope-unavailable"

export type ConsentDecisionResult =
  | {
      ok: true
      granted: OidcScope[]
      /** Switched off by the user; store on the grant. */
      declined: OidcScope[]
      /** Optional scopes that could not be granted now; not stored. */
      skipped: OidcScope[]
    }
  | { ok: false; reason: ConsentDecisionFailure; scopes: OidcScope[] }

/** Splits a consent decision into granted, declined and skipped scopes. */
export function resolveConsentDecision(input: {
  /** Scopes of the authorization request. */
  requested: readonly OidcScope[]
  /** The environment's optional subset. */
  optionalScopes: readonly OidcScope[]
  /** Requested scopes that cannot be granted right now. */
  unavailable: readonly OidcScope[]
  /** Scopes the user switched off (ignored when not requested). */
  declined: readonly OidcScope[]
}): ConsentDecisionResult {
  const requested = normalizeScopes(input.requested)
  const unavailable = new Set(input.unavailable)
  const declined = new Set(input.declined)
  const isOptional = (scope: OidcScope) =>
    scopeRequirement(scope, input.optionalScopes) === "optional"

  const requiredUnavailable = requested.filter(
    (scope) => unavailable.has(scope) && !isOptional(scope),
  )
  if (requiredUnavailable.length > 0) {
    return {
      ok: false,
      reason: "required-scope-unavailable",
      scopes: requiredUnavailable,
    }
  }
  const requiredDeclined = requested.filter(
    (scope) => declined.has(scope) && !isOptional(scope),
  )
  if (requiredDeclined.length > 0) {
    return {
      ok: false,
      reason: "required-scope-declined",
      scopes: requiredDeclined,
    }
  }
  return {
    ok: true,
    granted: requested.filter(
      (scope) => !declined.has(scope) && !unavailable.has(scope),
    ),
    declined: requested.filter(
      (scope) => declined.has(scope) && !unavailable.has(scope),
    ),
    skipped: requested.filter((scope) => unavailable.has(scope)),
  }
}

export type GrantScopeSets = {
  scopes: OidcScope[]
  declinedScopes: OidcScope[]
}

/**
 * Grant scopes after a decision: scopes outside this request keep their
 * previous state; scopes in it take the new decision (so switching an
 * optional scope off removes it from an existing grant). Pass `granted`
 * and `declined` from `resolveConsentDecision`; skipped scopes keep
 * whatever the grant had.
 */
export function mergeGrantScopes(input: {
  existing: {
    scopes: readonly OidcScope[]
    declinedScopes: readonly OidcScope[]
  } | null
  requested: readonly OidcScope[]
  granted: readonly OidcScope[]
  declined: readonly OidcScope[]
}): GrantScopeSets {
  const decided = new Set([...input.granted, ...input.declined])
  const requested = new Set(
    input.requested.filter((scope) => decided.has(scope)),
  )
  const keep = (scopes: readonly OidcScope[] | undefined) =>
    (scopes ?? []).filter((scope) => !requested.has(scope))
  const scopes = normalizeScopes([
    ...keep(input.existing?.scopes),
    ...input.granted,
  ])
  const granted = new Set(scopes)
  return {
    scopes,
    declinedScopes: normalizeScopes(
      [...keep(input.existing?.declinedScopes), ...input.declined].filter(
        (scope) => !granted.has(scope),
      ),
    ),
  }
}

/**
 * True when consent can be skipped: same scope version, every required
 * requested scope granted, and every optional one granted, declined or
 * currently unavailable (a user without Discord is not asked on every
 * sign-in, and sees the scope as new once it becomes available).
 * `prompt=consent` always shows the screen regardless.
 */
export function grantCoversRequest(input: {
  grant: {
    scopes: readonly OidcScope[]
    declinedScopes: readonly OidcScope[]
    scopeVersion: number
  }
  scopeVersion: number
  requested: readonly OidcScope[]
  optionalScopes: readonly OidcScope[]
  /** Requested scopes that cannot be granted right now. */
  unavailable?: readonly OidcScope[]
}): boolean {
  if (input.grant.scopeVersion !== input.scopeVersion) return false
  const granted = new Set(input.grant.scopes)
  const declined = new Set(input.grant.declinedScopes)
  const unavailable = new Set(input.unavailable ?? [])
  return input.requested.every((scope) =>
    scopeRequirement(scope, input.optionalScopes) === "optional"
      ? granted.has(scope) || declined.has(scope) || unavailable.has(scope)
      : granted.has(scope),
  )
}

export type ReleasableClaim = z.infer<typeof releasableClaimSchema>

/**
 * Drops every claim the granted scopes do not release. Apply it to the
 * userinfo body and the ID token's released claims as the last step, so a
 * declined scope can never leak through a stale code or refresh token.
 */
export function pickGrantedClaims<
  Claims extends { [Claim in ReleasableClaim]?: unknown },
>(claims: Claims, grantedScopes: readonly OidcScope[]): Claims {
  const released = new Set<string>(claimsForScopes(grantedScopes))
  const picked: Claims = { ...claims }
  for (const claim of releasableClaimSchema.options) {
    if (!released.has(claim)) Reflect.deleteProperty(picked, claim)
  }
  return picked
}
