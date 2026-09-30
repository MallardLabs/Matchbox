import type { AppStatus, ReviewState } from "@repo/platform-contracts/console"
import {
  type ApiKeyKind,
  parseApiKey,
} from "@repo/platform-contracts/credentials"
import {
  type GaugeProfile,
  tagSlug,
} from "@repo/platform-contracts/gauge-profiles"
import type {
  EnvironmentKind,
  NetworkSlug,
} from "@repo/platform-contracts/network"
import type { QuotaOverride } from "@repo/platform-contracts/rate-limits"
import { hmacHex } from "@repo/platform-server"
import {
  type ApiKeyRecord,
  type ApiStore,
  type ChainStateRow,
  compareProfileOrder,
  isAfterCursor,
} from "./api-store"
import { defaultMemorySeed } from "./memory-seed"

export type MemoryApp = { id: string; status: AppStatus }

export type MemoryEnvironment = {
  id: string
  appId: string
  kind: EnvironmentKind
  network: NetworkSlug
  reviewState: ReviewState
  approvedScopes: string[]
  origins: string[]
}

export type MemoryApiKey = {
  id: string
  environmentId: string
  kind: ApiKeyKind
  /** Full plaintext key; hashed with the pepper when the store is created. */
  value: string
  allowedCidrs: string[]
  expiresAt: string | null
  revokedAt: string | null
}

export type MemoryStoreSeed = {
  apps: MemoryApp[]
  environments: MemoryEnvironment[]
  apiKeys: MemoryApiKey[]
  profiles: GaugeProfile[]
  /** `(network, gaugeAddress)` → tokenId, as the reconciliation cron writes. */
  vebtcTokens: { network: NetworkSlug; tokenId: string; gaugeAddress: string }[]
  quotaOverrides: (QuotaOverride & { environmentId: string })[]
}

export type MemoryApiStore = ApiStore & {
  /** `last_used_at` writes, for assertions. */
  readonly lastUsed: Map<string, Date>
  /** Rows written by the reconciliation cron, for assertions. */
  readonly chainStates: Map<string, ChainStateRow>
}

type StoredKey = { record: ApiKeyRecord }

/**
 * In-memory `ApiStore` for tests and `PLATFORM_STORE=memory` local dev.
 * Keys are HMAC'd with `pepper` exactly like the console does, so the auth
 * path is exercised end to end.
 */
export async function createMemoryApiStore(options: {
  pepper: string
  seed?: MemoryStoreSeed
}): Promise<MemoryApiStore> {
  const seed = options.seed ?? defaultMemorySeed
  const apps = new Map(seed.apps.map((app) => [app.id, app]))
  const environments = new Map(
    seed.environments.map((environment) => [environment.id, environment]),
  )
  const keysByPrefix = new Map<string, StoredKey>()
  for (const key of seed.apiKeys) {
    const parsed = parseApiKey(key.value)
    const environment = environments.get(key.environmentId)
    const app =
      environment === undefined ? undefined : apps.get(environment.appId)
    if (parsed === null || environment === undefined || app === undefined) {
      throw new Error(`Invalid memory seed for API key ${key.id}`)
    }
    keysByPrefix.set(parsed.prefix, {
      record: {
        key: {
          id: key.id,
          kind: key.kind,
          prefix: parsed.prefix,
          secretHash: await hmacHex(options.pepper, key.value),
          allowedCidrs: [...key.allowedCidrs],
          expiresAt: key.expiresAt,
          revokedAt: key.revokedAt,
        },
        environment: {
          id: environment.id,
          kind: environment.kind,
          network: environment.network,
          reviewState: environment.reviewState,
          approvedScopes: [...environment.approvedScopes],
        },
        app: { id: app.id, status: app.status },
        origins: [...environment.origins],
      },
    })
  }
  const profiles = [...seed.profiles].sort(compareProfileOrder)
  const lastUsed = new Map<string, Date>()
  const chainStates = new Map<string, ChainStateRow>()

  function findProfile(
    network: NetworkSlug,
    gaugeAddress: string,
  ): GaugeProfile | null {
    const address = gaugeAddress.toLowerCase()
    return (
      profiles.find(
        (profile) =>
          profile.network === network && profile.gaugeAddress === address,
      ) ?? null
    )
  }

  return {
    lastUsed,
    chainStates,

    async findApiKeyByPrefix(prefix) {
      const stored = keysByPrefix.get(prefix)
      return stored === undefined ? null : structuredClone(stored.record)
    },

    async listGaugeProfiles(request) {
      const addresses =
        request.addresses === null ? null : new Set(request.addresses)
      const matching = profiles.filter(
        (profile) =>
          profile.network === request.network &&
          (request.profileType === null ||
            profile.profileType === request.profileType) &&
          (request.tag === null ||
            profile.tags.some((tag) => tagSlug(tag) === request.tag)) &&
          (request.updatedSince === null ||
            Date.parse(profile.updatedAt) >=
              Date.parse(request.updatedSince)) &&
          (addresses === null || addresses.has(profile.gaugeAddress)) &&
          (request.cursor === null || isAfterCursor(profile, request.cursor)),
      )
      const page = matching.slice(0, request.limit)
      const last = page.at(-1)
      return {
        profiles: structuredClone(page),
        nextCursor:
          matching.length > request.limit && last !== undefined
            ? {
                v: 1,
                updatedAt: last.updatedAt,
                gaugeAddress: last.gaugeAddress,
              }
            : null,
      }
    },

    async getGaugeProfile(network, gaugeAddress) {
      const profile = findProfile(network, gaugeAddress)
      return profile === null ? null : structuredClone(profile)
    },

    async getGaugeProfileByVebtc(network, tokenId) {
      const mapped = seed.vebtcTokens.find(
        (entry) => entry.network === network && entry.tokenId === tokenId,
      )
      const profile =
        mapped === undefined
          ? (profiles.find(
              (candidate) =>
                candidate.network === network &&
                candidate.profileType === "boost-gauge" &&
                candidate.vebtcTokenId === tokenId,
            ) ?? null)
          : findProfile(network, mapped.gaugeAddress)
      if (profile === null || profile.profileType !== "boost-gauge") {
        return null
      }
      return structuredClone(profile)
    },

    async listQuotaOverrides(environmentId) {
      return seed.quotaOverrides
        .filter((override) => override.environmentId === environmentId)
        .map((override) => ({
          endpointClass: override.endpointClass,
          perMinute: override.perMinute,
          perDay: override.perDay,
          expiresAt: override.expiresAt,
        }))
    },

    async touchKeyLastUsed(keyId, at) {
      lastUsed.set(keyId, at)
    },

    async upsertChainState(rows) {
      for (const row of rows) {
        chainStates.set(`${row.network}:${row.gaugeAddress}`, { ...row })
      }
    },

    async listProfilesForReconciliation() {
      return profiles.map((profile) => ({
        network: profile.network,
        profileType: profile.profileType,
        gaugeAddress: profile.gaugeAddress,
        vebtcTokenId:
          profile.profileType === "boost-gauge" ? profile.vebtcTokenId : null,
        operatorAddress:
          profile.profileType === "validator-gauge"
            ? profile.operatorAddress
            : null,
      }))
    },
  }
}
