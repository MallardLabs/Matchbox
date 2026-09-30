import { z } from "zod"
import {
  addressInputSchema,
  addressSchema,
  decimalStringSchema,
  isoDateTimeSchema,
} from "./common"
import { createCursorCodec } from "./cursor"
import { networkSchema, networkSlugSchema } from "./network"

export const gaugeProfileTypeSchema = z.enum(["boost-gauge", "validator-gauge"])

export type GaugeProfileType = z.infer<typeof gaugeProfileTypeSchema>

export const gaugeProfileChainStateSchema = z.object({
  isAlive: z.boolean().nullable(),
  nftOwner: addressSchema.nullable(),
  beneficiary: addressSchema.nullable(),
  poolAddress: addressSchema.nullable(),
  checkedAt: isoDateTimeSchema.nullable(),
  blockNumber: decimalStringSchema.nullable(),
})

export type GaugeProfileChainState = z.infer<
  typeof gaugeProfileChainStateSchema
>

export const emptyGaugeProfileChainState: GaugeProfileChainState = {
  isAlive: null,
  nftOwner: null,
  beneficiary: null,
  poolAddress: null,
  checkedAt: null,
  blockNumber: null,
}

const gaugeProfileFields = {
  network: networkSlugSchema,
  gaugeAddress: addressSchema,
  displayName: z.string().nullable(),
  description: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  socialLinks: z.record(z.string(), z.string()),
  tags: z.array(z.string()),
  incentiveStrategy: z.string().nullable(),
  votingStrategy: z.string().nullable(),
  isFeatured: z.boolean(),
  chain: gaugeProfileChainStateSchema,
  updatedAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
}

export const boostGaugeProfileSchema = z.object({
  profileType: z.literal("boost-gauge"),
  vebtcTokenId: decimalStringSchema.nullable(),
  ...gaugeProfileFields,
})

export type BoostGaugeProfile = z.infer<typeof boostGaugeProfileSchema>

export const validatorGaugeProfileSchema = z.object({
  profileType: z.literal("validator-gauge"),
  operatorAddress: addressSchema,
  ...gaugeProfileFields,
})

export type ValidatorGaugeProfile = z.infer<typeof validatorGaugeProfileSchema>

export const gaugeProfileSchema = z.discriminatedUnion("profileType", [
  boostGaugeProfileSchema,
  validatorGaugeProfileSchema,
])

export type GaugeProfile = z.infer<typeof gaugeProfileSchema>

export const sourceMetaSchema = z.object({
  source: z.literal("matchbox-profiles"),
  /** Latest `updatedAt` among returned profiles; null for an empty page. */
  profileUpdatedAt: isoDateTimeSchema.nullable(),
  /** Oldest chain check among returned profiles. */
  chainCheckedAt: isoDateTimeSchema.nullable(),
  /** Lowest reconciled block among returned profiles. */
  chainBlock: decimalStringSchema.nullable(),
})

export type SourceMeta = z.infer<typeof sourceMetaSchema>

export const gaugeProfileListSchema = z.object({
  data: z.array(gaugeProfileSchema),
  nextCursor: z.string().nullable(),
  meta: sourceMetaSchema,
})

export type GaugeProfileList = z.infer<typeof gaugeProfileListSchema>

export const gaugeProfileDetailSchema = z.object({
  data: gaugeProfileSchema,
  meta: sourceMetaSchema,
})

export type GaugeProfileDetail = z.infer<typeof gaugeProfileDetailSchema>

export const networkListSchema = z.object({
  data: z.array(networkSchema),
})

export type NetworkList = z.infer<typeof networkListSchema>

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
  flags: z.object({
    gaugeProfileApi: z.boolean(),
  }),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>

/** Builds `meta` from the profiles on a page. */
export function sourceMetaFor(profiles: readonly GaugeProfile[]): SourceMeta {
  let profileUpdatedAt: string | null = null
  let chainCheckedAt: string | null = null
  let chainBlock: bigint | null = null
  for (const profile of profiles) {
    if (
      profileUpdatedAt === null ||
      Date.parse(profile.updatedAt) > Date.parse(profileUpdatedAt)
    ) {
      profileUpdatedAt = profile.updatedAt
    }
    const checkedAt = profile.chain.checkedAt
    if (
      checkedAt !== null &&
      (chainCheckedAt === null ||
        Date.parse(checkedAt) < Date.parse(chainCheckedAt))
    ) {
      chainCheckedAt = checkedAt
    }
    const block = profile.chain.blockNumber
    if (block !== null && (chainBlock === null || BigInt(block) < chainBlock)) {
      chainBlock = BigInt(block)
    }
  }
  return {
    source: "matchbox-profiles",
    profileUpdatedAt,
    chainCheckedAt,
    chainBlock: chainBlock === null ? null : chainBlock.toString(),
  }
}

// ---------------------------------------------------------------------------
// Request parameters
// ---------------------------------------------------------------------------

export const gaugeProfileListDefaultLimit = 50
export const gaugeProfileListMaxLimit = 100
export const gaugeProfileListMaxAddresses = 50

/** Keyset cursor over `(updated_at DESC, gauge_address ASC)`. */
export const gaugeProfileCursorSchema = z.object({
  v: z.literal(1),
  updatedAt: isoDateTimeSchema,
  gaugeAddress: addressSchema,
})

export type GaugeProfileCursor = z.infer<typeof gaugeProfileCursorSchema>

export const gaugeProfileCursorCodec = createCursorCodec(
  gaugeProfileCursorSchema,
)

/**
 * `tag` filter: a lower-case slug. Anything else (commas, braces, quotes)
 * would change the meaning of the PostgREST array filter it feeds.
 */
export const gaugeProfileTagFilterSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "Expected a lower-case tag slug")

// Profile tags are free text ("DeFi Yield"); the `tag` filter matches their
// slug ("defi-yield"). Mirrors the `tag_slugs` column of the
// mbx_api_gauge_profiles view.
export function tagSlug(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export const gaugeProfileListQuerySchema = z.object({
  network: networkSlugSchema,
  profileType: gaugeProfileTypeSchema.optional(),
  tag: z.string().trim().pipe(gaugeProfileTagFilterSchema).optional(),

  updatedSince: isoDateTimeSchema.optional(),
  address: z
    .array(addressInputSchema)
    .min(1)
    .max(gaugeProfileListMaxAddresses)
    .optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(gaugeProfileListMaxLimit)
    .default(gaugeProfileListDefaultLimit),
  cursor: z.string().min(1).max(1024).optional(),
})

export type GaugeProfileListQuery = z.output<typeof gaugeProfileListQuerySchema>

export type GaugeProfileListQueryResult =
  | {
      ok: true
      query: GaugeProfileListQuery
      cursor: GaugeProfileCursor | null
    }
  | { ok: false; error: z.ZodError | "invalid-cursor" }

/**
 * Parses list query parameters from a URL. `address` is repeatable
 * (`?address=0x…&address=0x…`); a comma-separated value is also accepted.
 */
export function parseGaugeProfileListQuery(
  searchParams: URLSearchParams,
): GaugeProfileListQueryResult {
  const addresses = searchParams
    .getAll("address")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
  const raw: Record<string, unknown> = {}
  for (const key of [
    "network",
    "profileType",
    "tag",
    "updatedSince",
    "limit",
    "cursor",
  ]) {
    const value = searchParams.get(key)
    if (value !== null) raw[key] = value
  }
  if (addresses.length > 0) raw.address = addresses
  const parsed = gaugeProfileListQuerySchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error }
  if (parsed.data.cursor === undefined) {
    return { ok: true, query: parsed.data, cursor: null }
  }
  const cursor = gaugeProfileCursorCodec.decode(parsed.data.cursor)
  if (cursor === null) return { ok: false, error: "invalid-cursor" }
  return { ok: true, query: parsed.data, cursor }
}

export const gaugeProfileDetailParamsSchema = z.object({
  network: networkSlugSchema,
  gaugeAddress: addressInputSchema,
})

export const vebtcGaugeProfileParamsSchema = z.object({
  network: networkSlugSchema,
  tokenId: decimalStringSchema.max(78),
})
