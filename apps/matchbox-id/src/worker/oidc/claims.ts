import {
  grantCoversRequest,
  pickGrantedClaims,
} from "@repo/platform-contracts/consent"
import type { ScopeUnavailableReason } from "@repo/platform-contracts/identity"
import {
  type OidcClaim,
  type OidcScope,
  claimLabels,
  claimsForScopes,
  isDiscordScope,
  normalizeScopes,
  oidcScopesOf,
  scopeRequiresReview,
} from "@repo/platform-contracts/scopes"
import type { IdFlags } from "../config"
import type {
  AccountRecord,
  DiscordLinkRecord,
  EnvironmentRecord,
  GrantRecord,
} from "../store/id-store"
import { grantedForRequest, requiredScopesOf } from "./scope-policy"

/**
 * OIDC scopes this environment may request: approved scopes, plus requested
 * scopes that need no review. Discord scopes vanish with the kill switch.
 */
export function environmentOidcScopes(
  environment: EnvironmentRecord,
  flags: IdFlags,
): OidcScope[] {
  const allowed = oidcScopesOf([
    ...environment.approvedScopes,
    ...environment.requestedScopes.filter(
      (scope) => !scopeRequiresReview(scope),
    ),
  ])
  return allowed.filter(
    (scope) => flags.discordClaims || !isDiscordScope(scope),
  )
}

export function discordAvatarUrl(link: DiscordLinkRecord): string | null {
  if (link.avatarHash === null) return null
  return `https://cdn.discordapp.com/avatars/${link.discordUserId}/${link.avatarHash}.png`
}

export type ConsentEvaluation = {
  grant: GrantRecord | null
  /** The active grant answers the request without a consent screen. */
  covered: boolean
  unavailable: Map<OidcScope, ScopeUnavailableReason>
  /** Requested scopes the user cannot switch off. */
  required: OidcScope[]
  /** No required scope is unavailable. */
  approvable: boolean
  /** Requested scopes the active grant releases now (silent approval). */
  granted: OidcScope[]
}

/**
 * Whether `scopes` can be granted now and whether consent can be skipped
 * (see `scope-policy.ts` for required vs optional scopes).
 */
export function evaluateConsent(input: {
  grant: GrantRecord | null
  environment: EnvironmentRecord
  scopes: readonly OidcScope[]
  discordLink: DiscordLinkRecord | null
  flags: IdFlags
}): ConsentEvaluation {
  const allowed = new Set(environmentOidcScopes(input.environment, input.flags))
  const unavailable = new Map<OidcScope, ScopeUnavailableReason>()
  for (const scope of input.scopes) {
    if (isDiscordScope(scope) && !input.flags.discordClaims) {
      unavailable.set(scope, "disabled")
    } else if (!allowed.has(scope)) {
      unavailable.set(scope, "not-approved")
    } else if (isDiscordScope(scope) && input.discordLink === null) {
      unavailable.set(scope, "discord-not-linked")
    }
  }
  const unavailableScopes = [...unavailable.keys()]
  const required = requiredScopesOf(
    input.scopes,
    input.environment.optionalScopes,
  )
  const approvable = required.every((scope) => !unavailable.has(scope))
  const grant = input.grant
  const active = grant !== null && grant.revokedAt === null ? grant : null
  const granted =
    active === null
      ? []
      : grantedForRequest({
          grant: active,
          requested: input.scopes,
          unavailable: unavailableScopes,
        })
  const sameDiscord =
    !granted.some((scope) => isDiscordScope(scope)) ||
    active?.discordUserId === (input.discordLink?.discordUserId ?? null)
  const covered =
    approvable &&
    active !== null &&
    sameDiscord &&
    grantCoversRequest({
      grant: active,
      scopeVersion: input.environment.scopeVersion,
      requested: input.scopes,
      optionalScopes: input.environment.optionalScopes,
      unavailable: unavailableScopes,
    })
  return { grant, covered, unavailable, required, approvable, granted }
}

export function claimsSnapshot(
  scopes: readonly OidcScope[],
): Array<{ claim: string; label: string }> {
  return claimsForScopes(scopes).map((claim) => ({
    claim,
    label: claimLabels[claim],
  }))
}

export type ReleasedClaims = {
  wallet_address?: string
  wallet_network?: EnvironmentRecord["network"]
  discord_id?: string
  discord_username?: string
  discord_display_name?: string | null
  discord_avatar_url?: string | null
}

/**
 * Claim values for the scopes that are still releasable: granted, allowed
 * for the environment, and (for Discord) backed by the same link that was
 * consented to.
 */
export function releasedClaims(input: {
  scopes: readonly OidcScope[]
  account: AccountRecord
  environment: EnvironmentRecord
  grant: GrantRecord
  discordLink: DiscordLinkRecord | null
  flags: IdFlags
}): ReleasedClaims {
  const allowed = new Set(environmentOidcScopes(input.environment, input.flags))
  const granted = new Set(input.grant.scopes)
  const scopes = normalizeScopes(
    input.scopes.filter((scope) => allowed.has(scope) && granted.has(scope)),
  )
  const link =
    input.discordLink !== null &&
    input.discordLink.discordUserId === input.grant.discordUserId
      ? input.discordLink
      : null
  const claims: ReleasedClaims = {}
  for (const scope of scopes) {
    if (scope === "wallet") {
      claims.wallet_address = input.account.walletAddress
      claims.wallet_network = input.environment.network
    } else if (scope === "discord:id" && link !== null) {
      claims.discord_id = link.discordUserId
    } else if (scope === "discord:profile" && link !== null) {
      if (link.username !== null) claims.discord_username = link.username
      claims.discord_display_name = link.globalName
      claims.discord_avatar_url = discordAvatarUrl(link)
    }
  }
  // Last line of defence: nothing a declined scope would release.
  return pickGrantedClaims(claims, scopes)
}

/** Consent-screen preview of the signed-in user's own value for a claim. */
export function claimPreviewValue(input: {
  claim: OidcClaim
  account: AccountRecord
  environment: EnvironmentRecord
  discordLink: DiscordLinkRecord | null
}): string | null {
  const link = input.discordLink
  switch (input.claim) {
    case "sub":
      return null
    case "wallet_address":
      return input.account.walletAddress
    case "wallet_network":
      return input.environment.network
    case "discord_id":
      return link?.discordUserId ?? null
    case "discord_username":
      return link?.username ?? null
    case "discord_display_name":
      return link?.globalName ?? null
    case "discord_avatar_url":
      return link === null ? null : discordAvatarUrl(link)
  }
}
