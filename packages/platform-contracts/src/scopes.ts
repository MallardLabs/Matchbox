import { z } from "zod"

export const apiKeyScopeSchema = z.enum(["gauge-profiles:read"])

export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>

export const oidcScopeSchema = z.enum([
  "openid",
  "wallet",
  "discord:id",
  "discord:profile",
])

export type OidcScope = z.infer<typeof oidcScopeSchema>

/** Every scope an environment can request (API keys + Matchbox ID). */
export const platformScopeSchema = z.enum([
  ...apiKeyScopeSchema.options,
  ...oidcScopeSchema.options,
])

export type PlatformScope = z.infer<typeof platformScopeSchema>

export const oidcClaimSchema = z.enum([
  "sub",
  "wallet_address",
  "wallet_network",
  "discord_id",
  "discord_username",
  "discord_display_name",
  "discord_avatar_url",
])

export type OidcClaim = z.infer<typeof oidcClaimSchema>

export type ScopeDefinition = {
  scope: PlatformScope
  kind: "api-key" | "oidc"
  label: string
  consentDescription: string
  claims: readonly OidcClaim[]
  requiresReview: boolean
}

export const scopeDefinitions = {
  "gauge-profiles:read": {
    scope: "gauge-profiles:read",
    kind: "api-key",
    label: "Gauge profiles",
    consentDescription: "Read public gauge profiles",
    claims: [],
    requiresReview: false,
  },
  openid: {
    scope: "openid",
    kind: "oidc",
    label: "Sign-in ID",
    consentDescription: "A unique ID for this app",
    claims: ["sub"],
    requiresReview: false,
  },
  wallet: {
    scope: "wallet",
    kind: "oidc",
    label: "Wallet",
    consentDescription: "Wallet address and network",
    claims: ["wallet_address", "wallet_network"],
    requiresReview: false,
  },
  "discord:id": {
    scope: "discord:id",
    kind: "oidc",
    label: "Discord ID",
    consentDescription: "Linked Discord user ID",
    claims: ["discord_id"],
    requiresReview: true,
  },
  "discord:profile": {
    scope: "discord:profile",
    kind: "oidc",
    label: "Discord profile",
    consentDescription: "Discord username, display name and avatar",
    claims: ["discord_username", "discord_display_name", "discord_avatar_url"],
    requiresReview: true,
  },
} as const satisfies {
  [Scope in PlatformScope]: ScopeDefinition & { scope: Scope }
}

export const claimLabels = {
  sub: "Sign-in ID",
  wallet_address: "Wallet address",
  wallet_network: "Wallet network",
  discord_id: "Discord ID",
  discord_username: "Discord username",
  discord_display_name: "Discord display name",
  discord_avatar_url: "Discord avatar",
} as const satisfies Record<OidcClaim, string>

export function isDiscordScope(scope: PlatformScope): boolean {
  return scope.startsWith("discord:")
}

export function scopeRequiresReview(scope: PlatformScope): boolean {
  return scopeDefinitions[scope].requiresReview
}

/** OIDC scopes advertised and accepted given the Discord kill switch. */
export function enabledOidcScopes(options: {
  discordClaimsEnabled: boolean
}): OidcScope[] {
  return oidcScopeSchema.options.filter(
    (scope) => options.discordClaimsEnabled || !isDiscordScope(scope),
  )
}

/** Unique claims released by a set of scopes, in declaration order. */
export function claimsForScopes(scopes: readonly PlatformScope[]): OidcClaim[] {
  const granted = new Set<OidcClaim>()
  for (const scope of scopes) {
    for (const claim of scopeDefinitions[scope].claims) granted.add(claim)
  }
  return oidcClaimSchema.options.filter((claim) => granted.has(claim))
}

/** De-duplicates and orders scopes by their canonical declaration order. */
export function normalizeScopes<Scope extends PlatformScope>(
  scopes: readonly Scope[],
): Scope[] {
  const order: readonly PlatformScope[] = platformScopeSchema.options
  return [...new Set(scopes)].sort(
    (left, right) => order.indexOf(left) - order.indexOf(right),
  )
}

export type ScopeStringParseResult =
  | { ok: true; scopes: OidcScope[] }
  | { ok: false; unknownScopes: string[] }

/** Parses an OAuth space-delimited `scope` parameter into OIDC scopes. */
export function parseOidcScopeString(value: string): ScopeStringParseResult {
  const tokens = value.split(" ").filter((token) => token.length > 0)
  const scopes: OidcScope[] = []
  const unknownScopes: string[] = []
  for (const token of tokens) {
    const parsed = oidcScopeSchema.safeParse(token)
    if (parsed.success) scopes.push(parsed.data)
    else unknownScopes.push(token)
  }
  if (unknownScopes.length > 0) return { ok: false, unknownScopes }
  return { ok: true, scopes: normalizeScopes(scopes) }
}

export function formatScopeString(scopes: readonly PlatformScope[]): string {
  return normalizeScopes(scopes).join(" ")
}

export type ScopeDiff<Scope extends PlatformScope = PlatformScope> = {
  added: Scope[]
  removed: Scope[]
  unchanged: Scope[]
}

export function diffScopes<Scope extends PlatformScope>(
  previous: readonly Scope[],
  next: readonly Scope[],
): ScopeDiff<Scope> {
  const before = new Set<Scope>(previous)
  const after = new Set<Scope>(next)
  return {
    added: normalizeScopes([...after].filter((scope) => !before.has(scope))),
    removed: normalizeScopes([...before].filter((scope) => !after.has(scope))),
    unchanged: normalizeScopes([...after].filter((scope) => before.has(scope))),
  }
}

/** True when every requested scope is already covered by `granted`. */
export function scopesCovered(
  granted: readonly PlatformScope[],
  requested: readonly PlatformScope[],
): boolean {
  const available = new Set(granted)
  return requested.every((scope) => available.has(scope))
}

export function apiKeyScopesOf(
  scopes: readonly PlatformScope[],
): ApiKeyScope[] {
  const apiScopes: ApiKeyScope[] = []
  for (const scope of scopes) {
    const parsed = apiKeyScopeSchema.safeParse(scope)
    if (parsed.success) apiScopes.push(parsed.data)
  }
  return normalizeScopes(apiScopes)
}

export function oidcScopesOf(scopes: readonly PlatformScope[]): OidcScope[] {
  const oidcScopes: OidcScope[] = []
  for (const scope of scopes) {
    const parsed = oidcScopeSchema.safeParse(scope)
    if (parsed.success) oidcScopes.push(parsed.data)
  }
  return normalizeScopes(oidcScopes)
}
