import { getAddress, isAddress } from "viem"
import { z } from "zod"
import {
  DENSITIES,
  type Density,
  SORT_KEYS,
  STATUS_FILTERS,
  type SortKey,
  type StatusFilter,
  VOTE_TYPES,
  type VoteType,
} from "./model"

// Every field is optional and falls back on bad input, so stale or hand-typed
// links never break the page.
const flag = z
  .union([z.literal(1), z.literal("1"), z.literal(true), z.literal("true")])
  .transform((): true => true)

const voteSearchSchema = z.object({
  type: z.enum(VOTE_TYPES).optional().catch(undefined),
  optimize: flag.optional().catch(undefined),
  q: z
    .union([z.string(), z.number().transform(String)])
    .transform((value) => value.trim().slice(0, 80))
    .optional()
    .catch(undefined),
  status: z.enum(STATUS_FILTERS).optional().catch(undefined),
  boost: flag.optional().catch(undefined),
  sort: z.enum(SORT_KEYS).optional().catch(undefined),
  density: z.enum(DENSITIES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(999).optional().catch(undefined),
  /** Gauge detail's "Add to ballot": put this target on the ballot once. */
  add: z
    .string()
    .refine((value) => isAddress(value, { strict: false }))
    .transform((value) => getAddress(value))
    .optional()
    .catch(undefined),
})

export type VoteSearch = {
  type?: VoteType | undefined
  optimize?: true | undefined
  q?: string | undefined
  status?: StatusFilter | undefined
  boost?: true | undefined
  sort?: SortKey | undefined
  density?: Density | undefined
  page?: number | undefined
  add?: string | undefined
}

/** One-shot params that are acted on and then dropped from the URL. */
export const ACTION_PARAMS = ["optimize", "add"] as const

export type VoteView = {
  type: VoteType
  query: string
  status: StatusFilter
  needsBoost: boolean
  sort: SortKey
  density: Density
  /** Zero-based. */
  page: number
}

export const DEFAULT_VIEW: VoteView = {
  type: "vemezo",
  query: "",
  status: "active",
  needsBoost: false,
  sort: "apy",
  density: "comfortable",
  page: 0,
}

export function parseVoteSearch(raw: unknown): VoteSearch {
  // Every field already falls back on its own; this guards a non-object.
  const parsed = voteSearchSchema.safeParse(raw)
  return parsed.success ? compactSearch(parsed.data) : {}
}

/** A search saved as JSON (sessionStorage); anything unreadable is `{}`. */
export function parseStoredSearch(raw: string | null): VoteSearch {
  if (!raw) return {}
  const json = z
    .string()
    .transform((text, context) => {
      try {
        const value: unknown = JSON.parse(text)
        return value
      } catch {
        context.addIssue({ code: "custom", message: "not JSON" })
        return z.NEVER
      }
    })
    .safeParse(raw)
  return json.success ? parseVoteSearch(json.data) : {}
}

export function viewFromSearch(search: VoteSearch): VoteView {
  return {
    type: search.type ?? DEFAULT_VIEW.type,
    query: search.q ?? DEFAULT_VIEW.query,
    status: search.status ?? DEFAULT_VIEW.status,
    needsBoost: search.boost === true,
    sort: search.sort ?? DEFAULT_VIEW.sort,
    density: search.density ?? DEFAULT_VIEW.density,
    page: Math.max(0, (search.page ?? 1) - 1),
  }
}

/** Defaults are left out so the canonical URL stays `/vote`. */
export function searchFromView(view: VoteView): VoteSearch {
  return compactSearch({
    type: view.type === DEFAULT_VIEW.type ? undefined : view.type,
    q: view.query.trim() === "" ? undefined : view.query,
    status: view.status === DEFAULT_VIEW.status ? undefined : view.status,
    boost: view.needsBoost ? true : undefined,
    sort: view.sort === DEFAULT_VIEW.sort ? undefined : view.sort,
    density: view.density === DEFAULT_VIEW.density ? undefined : view.density,
    page: view.page > 0 ? view.page + 1 : undefined,
  })
}

function compactSearch(search: VoteSearch): VoteSearch {
  const result: VoteSearch = {}
  if (search.type !== undefined) result.type = search.type
  if (search.optimize !== undefined) result.optimize = search.optimize
  if (search.q !== undefined && search.q !== "") result.q = search.q
  if (search.status !== undefined) result.status = search.status
  if (search.boost !== undefined) result.boost = search.boost
  if (search.sort !== undefined) result.sort = search.sort
  if (search.density !== undefined) result.density = search.density
  if (search.page !== undefined && search.page > 1) result.page = search.page
  if (search.add !== undefined) result.add = search.add
  return result
}
