import type { AppStatus, ReviewState } from "@repo/platform-contracts/console"
import type { ApiKeyKind } from "@repo/platform-contracts/credentials"
import type {
  GaugeProfile,
  GaugeProfileCursor,
  GaugeProfileType,
} from "@repo/platform-contracts/gauge-profiles"
import type {
  EnvironmentKind,
  NetworkSlug,
} from "@repo/platform-contracts/network"
import type { QuotaOverride } from "@repo/platform-contracts/rate-limits"

/**
 * Storage boundary for the Gauge Profile API. Routes depend only on this
 * type; `supabase-store.ts` is production, `memory-store.ts` backs tests and
 * `PLATFORM_STORE=memory` local development.
 */

export type ApiKeyRecord = {
  key: {
    id: string
    kind: ApiKeyKind
    prefix: string
    /** HMAC-SHA256(API_KEY_PEPPER, full key) as hex. */
    secretHash: string
    allowedCidrs: string[]
    expiresAt: string | null
    revokedAt: string | null
  }
  environment: {
    id: string
    kind: EnvironmentKind
    network: NetworkSlug
    reviewState: ReviewState
    approvedScopes: string[]
  }
  app: {
    id: string
    status: AppStatus
  }
  /** Registered browser origins (exact, canonical `URL.origin` strings). */
  origins: string[]
}

export type GaugeProfileListRequest = {
  network: NetworkSlug
  profileType: GaugeProfileType | null
  tag: string | null
  updatedSince: string | null
  /** Lower-case gauge addresses; null = no address filter. */
  addresses: string[] | null
  limit: number
  cursor: GaugeProfileCursor | null
}

export type GaugeProfilePage = {
  profiles: GaugeProfile[]
  /** Position after the last row read (even if that row failed to map). */
  nextCursor: GaugeProfileCursor | null
}

/** One row of `mbx_api_gauge_chain_state`. */
export type ChainStateRow = {
  network: NetworkSlug
  gaugeAddress: string
  isAlive: boolean | null
  vebtcTokenId: string | null
  nftOwner: string | null
  beneficiary: string | null
  poolAddress: string | null
  checkedAt: string
  /** Decimal string. */
  blockNumber: string | null
}

export type ReconciliationTarget = {
  network: NetworkSlug
  profileType: GaugeProfileType
  gaugeAddress: string
  vebtcTokenId: string | null
  operatorAddress: string | null
}

export type ApiStore = {
  /** Key + environment + app status + origins, or null for an unknown prefix. */
  findApiKeyByPrefix(prefix: string): Promise<ApiKeyRecord | null>
  listGaugeProfiles(request: GaugeProfileListRequest): Promise<GaugeProfilePage>
  getGaugeProfile(
    network: NetworkSlug,
    gaugeAddress: string,
  ): Promise<GaugeProfile | null>
  /** Boost gauge for a veBTC token, via reconciled chain state then profile. */
  getGaugeProfileByVebtc(
    network: NetworkSlug,
    tokenId: string,
  ): Promise<GaugeProfile | null>
  /** Overrides for an environment, newest first (expired ones included). */
  listQuotaOverrides(environmentId: string): Promise<QuotaOverride[]>
  touchKeyLastUsed(keyId: string, at: Date): Promise<void>
  upsertChainState(rows: readonly ChainStateRow[]): Promise<void>
  listProfilesForReconciliation(): Promise<ReconciliationTarget[]>
}

/** Keyset ordering: `updated_at DESC, gauge_address ASC`. */
export function compareProfileOrder(
  left: { updatedAt: string; gaugeAddress: string },
  right: { updatedAt: string; gaugeAddress: string },
): number {
  const byTime = Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  if (byTime !== 0) return byTime
  if (left.gaugeAddress < right.gaugeAddress) return -1
  if (left.gaugeAddress > right.gaugeAddress) return 1
  return 0
}

/** True when `profile` sorts strictly after the cursor position. */
export function isAfterCursor(
  profile: { updatedAt: string; gaugeAddress: string },
  cursor: GaugeProfileCursor,
): boolean {
  return compareProfileOrder(profile, cursor) > 0
}
