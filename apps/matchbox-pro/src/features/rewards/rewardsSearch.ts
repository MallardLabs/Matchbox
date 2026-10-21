import { z } from "zod"
import type { PeriodId } from "./ledgerModel"

// The ledger period in the URL (`/rewards?period=lifetime`). Tolerant: an
// unknown value falls back to the default, which stays out of the URL.

export type RewardsSearch = {
  period?: PeriodId | undefined
}

export const DEFAULT_PERIOD: PeriodId = "last-8"

const searchSchema = z.object({
  period: z.enum(["epoch", "last-8", "lifetime"]).optional().catch(undefined),
})

export function compactRewardsSearch(search: RewardsSearch): RewardsSearch {
  return search.period && search.period !== DEFAULT_PERIOD
    ? { period: search.period }
    : {}
}

export function parseRewardsSearch(
  search: Record<string, unknown>,
): RewardsSearch {
  const parsed = searchSchema.safeParse(search)
  return parsed.success ? compactRewardsSearch(parsed.data) : {}
}
