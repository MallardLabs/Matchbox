import {
  type GaugeProfile,
  type GaugeProfileChainState,
  emptyGaugeProfileChainState,
  gaugeProfileChainStateSchema,
  gaugeProfileSchema,
  gaugeProfileTypeSchema,
} from "@repo/platform-contracts/gauge-profiles"
import { networkSlugSchema } from "@repo/platform-contracts/network"
import { z } from "zod"

/**
 * snake_case rows from `mbx_api_gauge_profiles` / `mbx_api_gauge_chain_state`
 * → the public `GaugeProfile` contract. Loose on input (nullable JSONB,
 * nullable flags), strict on output (validated with `gaugeProfileSchema`).
 */

export const profileViewColumns = [
  "network",
  "profile_type",
  "gauge_address",
  "vebtc_token_id",
  "operator_address",
  "display_name",
  "description",
  "avatar_url",
  "website_url",
  "social_links",
  "tags",
  "incentive_strategy",
  "voting_strategy",
  "is_featured",
  "created_at",
  "updated_at",
].join(", ")

export const chainStateColumns = [
  "network",
  "gauge_address",
  "is_alive",
  "vebtc_token_id",
  "nft_owner",
  "beneficiary",
  "pool_address",
  "checked_at",
  "block_number::text",
].join(", ")

const nullableText = z.string().nullable().catch(null)

function socialLinksFrom(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {}
  }
  const links: Record<string, string> = {}
  for (const [name, link] of Object.entries(value)) {
    if (typeof link === "string" && link.trim().length > 0) links[name] = link
  }
  return links
}

function isoTimestamp(value: string): string {
  // PostgREST returns `+00:00` offsets with microseconds; keep them verbatim so
  // keyset cursors compare exactly, but normalise a bare `YYYY-MM-DD HH:MM`.
  return value.includes("T") ? value : value.replace(" ", "T")
}

export const profileViewRowSchema = z.object({
  network: networkSlugSchema,
  profile_type: gaugeProfileTypeSchema,
  gauge_address: z.string().transform((value) => value.toLowerCase()),
  vebtc_token_id: nullableText,
  operator_address: nullableText.transform(
    (value) => value?.toLowerCase() ?? null,
  ),
  display_name: nullableText,
  description: nullableText,
  avatar_url: nullableText,
  website_url: nullableText,
  social_links: z.unknown().transform(socialLinksFrom),
  tags: z
    .array(z.string())
    .nullable()
    .catch(null)
    .transform((tags) => tags ?? []),
  incentive_strategy: nullableText,
  voting_strategy: nullableText,
  is_featured: z
    .boolean()
    .nullable()
    .catch(null)
    .transform((value) => value ?? false),
  created_at: z.string().transform(isoTimestamp),
  updated_at: z.string().transform(isoTimestamp),
})

export type ProfileViewRow = z.output<typeof profileViewRowSchema>

export const chainStateRowSchema = z.object({
  network: networkSlugSchema,
  gauge_address: z.string().transform((value) => value.toLowerCase()),
  is_alive: z.boolean().nullable(),
  vebtc_token_id: z.string().nullable(),
  nft_owner: z.string().nullable(),
  beneficiary: z.string().nullable(),
  pool_address: z.string().nullable(),
  checked_at: z.string().transform(isoTimestamp),
  block_number: z
    .union([z.string(), z.number().int().nonnegative()])
    .nullable()
    .transform((value) => (value === null ? null : String(value))),
})

export type ChainStateViewRow = z.output<typeof chainStateRowSchema>

export function chainStateFromRow(
  row: ChainStateViewRow | undefined,
): GaugeProfileChainState {
  if (row === undefined) return emptyGaugeProfileChainState
  const parsed = gaugeProfileChainStateSchema.safeParse({
    isAlive: row.is_alive,
    nftOwner: row.nft_owner,
    beneficiary: row.beneficiary,
    poolAddress: row.pool_address,
    checkedAt: row.checked_at,
    blockNumber: row.block_number,
  })
  return parsed.success ? parsed.data : emptyGaugeProfileChainState
}

export type ProfileMapResult =
  | { ok: true; profile: GaugeProfile }
  | { ok: false; reason: string }

export function profileFromRow(
  row: ProfileViewRow,
  chain: GaugeProfileChainState,
): ProfileMapResult {
  const shared = {
    network: row.network,
    gaugeAddress: row.gauge_address,
    displayName: row.display_name,
    description: row.description,
    avatarUrl: row.avatar_url,
    websiteUrl: row.website_url,
    socialLinks: row.social_links,
    tags: row.tags,
    incentiveStrategy: row.incentive_strategy,
    votingStrategy: row.voting_strategy,
    isFeatured: row.is_featured,
    chain,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  }
  const candidate =
    row.profile_type === "boost-gauge"
      ? {
          profileType: row.profile_type,
          vebtcTokenId: row.vebtc_token_id,
          ...shared,
        }
      : {
          profileType: row.profile_type,
          operatorAddress: row.operator_address,
          ...shared,
        }
  const parsed = gaugeProfileSchema.safeParse(candidate)
  if (parsed.success) return { ok: true, profile: parsed.data }
  return {
    ok: false,
    reason: parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; "),
  }
}
