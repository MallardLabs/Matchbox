import {
  type OidcScope,
  normalizeScopes,
  oidcScopeSchema,
  scopeRequirement,
} from "@repo/platform-contracts/scopes"

/**
 * Optional scopes (decision and coverage rules live in
 * `@repo/platform-contracts/consent`). An environment marks some of its OIDC scopes optional
 * (`optionalScopes`, set in the developer console); every other requested
 * scope is required, and `openid` always is. At consent the user can switch
 * optional scopes off and still sign in: the grant records them as declined
 * and tokens, the ID token and userinfo release nothing for them.
 *
 * A grant keeps two disjoint sets: `scopes` (granted) and `declinedScopes`
 * (switched off by the user). An optional scope that is unavailable right
 * now (Discord not linked) is in neither, so it shows up as new once it can
 * be granted, without asking again on every sign-in until then.
 */

/**
 * The `scope` parameter as OIDC scopes. Unknown values are ignored (OIDC
 * Core §3.1.2.1); the caller still requires `openid`.
 */
export function parseRequestedScopes(value: string): OidcScope[] {
  const scopes: OidcScope[] = []
  for (const token of value.split(" ")) {
    const parsed = oidcScopeSchema.safeParse(token)
    if (parsed.success) scopes.push(parsed.data)
  }
  return normalizeScopes(scopes)
}

export function isOptionalScope(
  scope: OidcScope,
  optionalScopes: readonly OidcScope[],
): boolean {
  return scopeRequirement(scope, optionalScopes) === "optional"
}

export function requiredScopesOf(
  requested: readonly OidcScope[],
  optionalScopes: readonly OidcScope[],
): OidcScope[] {
  return normalizeScopes(
    requested.filter((scope) => !isOptionalScope(scope, optionalScopes)),
  )
}

/** Requested scopes an existing grant releases now (silent approval). */
export function grantedForRequest(input: {
  grant: { scopes: readonly OidcScope[] }
  requested: readonly OidcScope[]
  unavailable: readonly OidcScope[]
}): OidcScope[] {
  const granted = new Set(input.grant.scopes)
  const unavailable = new Set(input.unavailable)
  return normalizeScopes(
    input.requested.filter(
      (scope) => granted.has(scope) && !unavailable.has(scope),
    ),
  )
}
