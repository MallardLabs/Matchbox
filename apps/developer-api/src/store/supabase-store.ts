import type { Logger } from "@repo/logger"
import {
  appStatusSchema,
  reviewStateSchema,
} from "@repo/platform-contracts/console"
import { apiKeyKindSchema } from "@repo/platform-contracts/credentials"
import {
  type GaugeProfile,
  type GaugeProfileCursor,
  gaugeProfileTagFilterSchema,
} from "@repo/platform-contracts/gauge-profiles"
import {
  type NetworkSlug,
  environmentKindSchema,
  networkSlugSchema,
} from "@repo/platform-contracts/network"
import {
  type QuotaOverride,
  endpointClassSchema,
} from "@repo/platform-contracts/rate-limits"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import type {
  ApiKeyRecord,
  ApiStore,
  ChainStateRow,
  GaugeProfileListRequest,
  GaugeProfilePage,
  ReconciliationTarget,
} from "./api-store"
import {
  type ChainStateViewRow,
  type ProfileViewRow,
  chainStateColumns,
  chainStateFromRow,
  chainStateRowSchema,
  profileFromRow,
  profileViewColumns,
  profileViewRowSchema,
} from "./profile-rows"

const profileView = "mbx_api_gauge_profiles"
const chainStateTable = "mbx_api_gauge_chain_state"
const upsertChunkSize = 500
const reconciliationPageSize = 1000

/** Thrown for any Supabase failure; the message never reaches clients. */
export class StoreError extends Error {
  constructor(operation: string, cause: unknown) {
    super(`Store operation failed: ${operation}`, { cause })
    this.name = "StoreError"
  }
}

const apiKeyRowSchema = z.object({
  id: z.string(),
  kind: apiKeyKindSchema,
  prefix: z.string(),
  secret_hash: z.string(),
  allowed_cidrs: z
    .array(z.string())
    .nullable()
    .transform((value) => value ?? []),
  expires_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  environment: z.object({
    id: z.string(),
    kind: environmentKindSchema,
    network: networkSlugSchema,
    review_state: reviewStateSchema,
    approved_scopes: z
      .array(z.string())
      .nullable()
      .transform((value) => value ?? []),
    app: z.object({ id: z.string(), status: appStatusSchema }),
    origins: z
      .array(z.object({ origin: z.string() }))
      .nullable()
      .transform((value) => value ?? []),
  }),
})

const quotaOverrideRowSchema = z.object({
  endpoint_class: endpointClassSchema,
  per_minute: z.number().int().positive(),
  per_day: z.number().int().positive(),
  expires_at: z.string().nullable(),
})

const reconciliationRowSchema = z.object({
  network: networkSlugSchema,
  profile_type: z.enum(["boost-gauge", "validator-gauge"]),
  gauge_address: z.string().transform((value) => value.toLowerCase()),
  vebtc_token_id: z.string().nullable(),
  operator_address: z
    .string()
    .nullable()
    .transform((value) => value?.toLowerCase() ?? null),
})

/** Double-quotes a PostgREST filter value (timestamps contain `:` and `.`). */
function quoteFilterValue(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

function parseRows<Schema extends z.ZodType>(
  schema: Schema,
  rows: unknown,
  log: Logger,
  operation: string,
): z.output<Schema>[] {
  const list = z.array(z.unknown()).safeParse(rows)
  if (!list.success) throw new StoreError(operation, list.error)
  const parsed: z.output<Schema>[] = []
  for (const row of list.data) {
    const result = schema.safeParse(row)
    if (result.success) parsed.push(result.data)
    else {
      log.warn({
        message: "Skipping malformed row",
        operation,
        issues: result.error.issues.map((issue) => issue.path.join(".")),
      })
    }
  }
  return parsed
}

export type SupabaseApiStoreOptions = {
  supabase: SupabaseClient
  logger: Logger
}

export function createSupabaseApiStore(
  options: SupabaseApiStoreOptions,
): ApiStore {
  const { supabase, logger: log } = options

  async function loadChainStates(
    network: NetworkSlug,
    addresses: readonly string[],
  ): Promise<Map<string, ChainStateViewRow>> {
    const states = new Map<string, ChainStateViewRow>()
    if (addresses.length === 0) return states
    const { data, error } = await supabase
      .from(chainStateTable)
      .select(chainStateColumns)
      .eq("network", network)
      .in("gauge_address", [...addresses])
    if (error !== null) throw new StoreError("load chain state", error)
    for (const row of parseRows(chainStateRowSchema, data, log, "chain")) {
      states.set(row.gauge_address, row)
    }
    return states
  }

  async function withChainState(
    rows: readonly ProfileViewRow[],
  ): Promise<GaugeProfile[]> {
    const byNetwork = new Map<NetworkSlug, string[]>()
    for (const row of rows) {
      const list = byNetwork.get(row.network) ?? []
      list.push(row.gauge_address)
      byNetwork.set(row.network, list)
    }
    const states = new Map<string, ChainStateViewRow>()
    for (const [network, addresses] of byNetwork) {
      for (const [address, state] of await loadChainStates(
        network,
        addresses,
      )) {
        states.set(`${network}:${address}`, state)
      }
    }
    const profiles: GaugeProfile[] = []
    for (const row of rows) {
      const mapped = profileFromRow(
        row,
        chainStateFromRow(states.get(`${row.network}:${row.gauge_address}`)),
      )
      if (mapped.ok) profiles.push(mapped.profile)
      else {
        log.warn({
          message: "Skipping gauge profile that does not match the contract",
          network: row.network,
          gaugeAddress: row.gauge_address,
          reason: mapped.reason,
        })
      }
    }
    return profiles
  }

  async function findProfileRow(
    network: NetworkSlug,
    column: "gauge_address" | "vebtc_token_id",
    value: string,
    profileType: "boost-gauge" | null,
  ): Promise<ProfileViewRow | null> {
    let query = supabase
      .from(profileView)
      .select(profileViewColumns)
      .eq("network", network)
      .eq(column, value)
    if (profileType !== null) query = query.eq("profile_type", profileType)
    const { data, error } = await query
      .order("updated_at", { ascending: false })
      .limit(1)
    if (error !== null) throw new StoreError("find profile", error)
    return parseRows(profileViewRowSchema, data, log, "profile")[0] ?? null
  }

  return {
    async findApiKeyByPrefix(prefix): Promise<ApiKeyRecord | null> {
      const { data, error } = await supabase
        .from("mbx_dev_api_keys")
        .select(
          "id, kind, prefix, secret_hash, allowed_cidrs, expires_at, revoked_at, environment:mbx_dev_environments!inner(id, kind, network, review_state, approved_scopes, app:mbx_dev_apps!inner(id, status), origins:mbx_dev_origins(origin))",
        )
        .eq("prefix", prefix)
        .maybeSingle()
      if (error !== null) throw new StoreError("find api key", error)
      if (data === null) return null
      const parsed = apiKeyRowSchema.safeParse(data)
      if (!parsed.success) {
        throw new StoreError("parse api key", parsed.error)
      }
      const row = parsed.data
      return {
        key: {
          id: row.id,
          kind: row.kind,
          prefix: row.prefix,
          secretHash: row.secret_hash,
          allowedCidrs: row.allowed_cidrs,
          expiresAt: row.expires_at,
          revokedAt: row.revoked_at,
        },
        environment: {
          id: row.environment.id,
          kind: row.environment.kind,
          network: row.environment.network,
          reviewState: row.environment.review_state,
          approvedScopes: row.environment.approved_scopes,
        },
        app: row.environment.app,
        origins: row.environment.origins.map((entry) => entry.origin),
      }
    },

    async listGaugeProfiles(
      request: GaugeProfileListRequest,
    ): Promise<GaugeProfilePage> {
      let query = supabase
        .from(profileView)
        .select(profileViewColumns)
        .eq("network", request.network)
      if (request.profileType !== null) {
        query = query.eq("profile_type", request.profileType)
      }
      if (request.tag !== null) {
        // Re-checked here: the value lands inside PostgREST's `cs.{…}`
        // syntax, where `,` `}` or `"` would change or break the filter.
        const tag = gaugeProfileTagFilterSchema.safeParse(request.tag)
        if (!tag.success) throw new StoreError("list gauge profiles", tag.error)
        query = query.contains("tag_slugs", [tag.data])
      }

      if (request.updatedSince !== null) {
        query = query.gte("updated_at", request.updatedSince)
      }
      if (request.addresses !== null) {
        query = query.in("gauge_address", request.addresses)
      }
      if (request.cursor !== null) {
        const updatedAt = quoteFilterValue(request.cursor.updatedAt)
        const address = quoteFilterValue(request.cursor.gaugeAddress)
        query = query.or(
          `updated_at.lt.${updatedAt},and(updated_at.eq.${updatedAt},gauge_address.gt.${address})`,
        )
      }
      const { data, error } = await query
        .order("updated_at", { ascending: false })
        .order("gauge_address", { ascending: true })
        .limit(request.limit + 1)
      if (error !== null) throw new StoreError("list gauge profiles", error)
      const rows = parseRows(profileViewRowSchema, data, log, "profiles")
      const hasMore = rows.length > request.limit
      const pageRows = rows.slice(0, request.limit)
      const last = pageRows.at(-1)
      const nextCursor: GaugeProfileCursor | null =
        hasMore && last !== undefined
          ? {
              v: 1,
              updatedAt: last.updated_at,
              gaugeAddress: last.gauge_address,
            }
          : null
      return { profiles: await withChainState(pageRows), nextCursor }
    },

    async getGaugeProfile(network, gaugeAddress) {
      const row = await findProfileRow(
        network,
        "gauge_address",
        gaugeAddress.toLowerCase(),
        null,
      )
      if (row === null) return null
      return (await withChainState([row]))[0] ?? null
    },

    async getGaugeProfileByVebtc(network, tokenId) {
      const { data, error } = await supabase
        .from(chainStateTable)
        .select("gauge_address")
        .eq("network", network)
        .eq("vebtc_token_id", tokenId)
        .order("checked_at", { ascending: false })
        .limit(1)
      if (error !== null) throw new StoreError("find vebtc gauge", error)
      const mapped = parseRows(
        z.object({ gauge_address: z.string() }),
        data,
        log,
        "vebtc",
      )[0]
      const row =
        mapped === undefined
          ? await findProfileRow(
              network,
              "vebtc_token_id",
              tokenId,
              "boost-gauge",
            )
          : await findProfileRow(
              network,
              "gauge_address",
              mapped.gauge_address.toLowerCase(),
              "boost-gauge",
            )
      if (row === null) return null
      return (await withChainState([row]))[0] ?? null
    },

    async listQuotaOverrides(environmentId): Promise<QuotaOverride[]> {
      const { data, error } = await supabase
        .from("mbx_dev_quota_overrides")
        .select("endpoint_class, per_minute, per_day, expires_at")
        .eq("environment_id", environmentId)
        .order("created_at", { ascending: false })
      if (error !== null) throw new StoreError("list quota overrides", error)
      return parseRows(quotaOverrideRowSchema, data, log, "overrides").map(
        (row) => ({
          endpointClass: row.endpoint_class,
          perMinute: row.per_minute,
          perDay: row.per_day,
          expiresAt: row.expires_at,
        }),
      )
    },

    async touchKeyLastUsed(keyId, at) {
      const { error } = await supabase
        .from("mbx_dev_api_keys")
        .update({ last_used_at: at.toISOString() })
        .eq("id", keyId)
      if (error !== null) throw new StoreError("touch api key", error)
    },

    async upsertChainState(rows: readonly ChainStateRow[]) {
      for (let start = 0; start < rows.length; start += upsertChunkSize) {
        const chunk = rows.slice(start, start + upsertChunkSize).map((row) => ({
          network: row.network,
          gauge_address: row.gaugeAddress,
          is_alive: row.isAlive,
          vebtc_token_id: row.vebtcTokenId,
          nft_owner: row.nftOwner,
          beneficiary: row.beneficiary,
          pool_address: row.poolAddress,
          checked_at: row.checkedAt,
          // BIGINT column; a decimal string avoids float precision loss.
          block_number: row.blockNumber,
        }))
        const { error } = await supabase
          .from(chainStateTable)
          .upsert(chunk, { onConflict: "network,gauge_address" })
        if (error !== null) throw new StoreError("upsert chain state", error)
      }
    },

    async listProfilesForReconciliation(): Promise<ReconciliationTarget[]> {
      const targets: ReconciliationTarget[] = []
      for (let from = 0; ; from += reconciliationPageSize) {
        const { data, error } = await supabase
          .from(profileView)
          .select(
            "network, profile_type, gauge_address, vebtc_token_id, operator_address",
          )
          .order("network", { ascending: true })
          .order("gauge_address", { ascending: true })
          .range(from, from + reconciliationPageSize - 1)
        if (error !== null) throw new StoreError("list reconciliation", error)
        const rows = parseRows(reconciliationRowSchema, data, log, "targets")
        for (const row of rows) {
          targets.push({
            network: row.network,
            profileType: row.profile_type,
            gaugeAddress: row.gauge_address,
            vebtcTokenId: row.vebtc_token_id,
            operatorAddress: row.operator_address,
          })
        }
        const fetched = z.array(z.unknown()).safeParse(data)
        if (!fetched.success || fetched.data.length < reconciliationPageSize) {
          break
        }
      }
      return targets
    },
  }
}
