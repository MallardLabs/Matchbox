import { useCallback, useState } from "react"
import { z } from "zod"
import type { KindFilter } from "./activityModel"

// Activity filters in the URL (`/activity?scope=protocol&kind=votes`).
// Parsing is tolerant: an unknown or malformed value falls back to its
// default instead of failing the route, and defaults stay out of the URL.

export type ActivityScope = "wallet" | "protocol"
export type ActivityRange = "epoch" | "last-8" | "all"
export type ActivityPageSize = 25 | 50 | 100

export type ActivitySearch = {
  scope?: ActivityScope | undefined
  kind?: KindFilter | undefined
  range?: ActivityRange | undefined
  size?: ActivityPageSize | undefined
}

export const ACTIVITY_DEFAULTS = {
  kind: "all",
  range: "last-8",
  size: 50,
} as const satisfies Required<Omit<ActivitySearch, "scope">>

export const PAGE_SIZES: readonly ActivityPageSize[] = [25, 50, 100]

const searchSchema = z.object({
  scope: z.enum(["wallet", "protocol"]).optional().catch(undefined),
  kind: z
    .enum(["all", "votes", "claims", "locks", "incentives", "profiles"])
    .optional()
    .catch(undefined),
  range: z.enum(["epoch", "last-8", "all"]).optional().catch(undefined),
  size: z.coerce
    .number()
    .pipe(z.union([z.literal(25), z.literal(50), z.literal(100)]))
    .optional()
    .catch(undefined),
})

/** Drops absent and default values so the URL only carries choices. */
export function compactActivitySearch(search: ActivitySearch): ActivitySearch {
  const next: ActivitySearch = {}
  if (search.scope) next.scope = search.scope
  if (search.kind && search.kind !== ACTIVITY_DEFAULTS.kind) {
    next.kind = search.kind
  }
  if (search.range && search.range !== ACTIVITY_DEFAULTS.range) {
    next.range = search.range
  }
  if (search.size && search.size !== ACTIVITY_DEFAULTS.size) {
    next.size = search.size
  }
  return next
}

export function parseActivitySearch(
  search: Record<string, unknown>,
): ActivitySearch {
  const parsed = searchSchema.safeParse(search)
  return parsed.success ? compactActivitySearch(parsed.data) : {}
}

/**
 * The page's filter state: from the URL when the route passes it in, else
 * local (the tx permalink keeps its own state).
 */
export function useActivitySearch(
  search: ActivitySearch | undefined,
  onChange: ((next: ActivitySearch) => void) | undefined,
): [ActivitySearch, (patch: ActivitySearch) => void] {
  const [local, setLocal] = useState<ActivitySearch>({})
  const current = search ?? local
  const update = useCallback(
    (patch: ActivitySearch) => {
      const next = compactActivitySearch({ ...current, ...patch })
      if (onChange) onChange(next)
      else setLocal(next)
    },
    [current, onChange],
  )
  return [current, update]
}
