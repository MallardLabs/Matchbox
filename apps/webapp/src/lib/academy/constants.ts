import type { AcademyParams } from "@/lib/academy/simulate"
import { parseUnits } from "viem"

export const DEFAULT_BUDGET_MEZO = 1_000_000 // S0 Default: 1,000,000 MEZO
export const DEFAULT_REWARD_FLOOR_MEZO = 20

export const DEFAULT_WEIGHT_NEW = 2
export const DEFAULT_WEIGHT_EXT = 1
export const DEFAULT_WEIGHT_BOOST = 0.5 // 0.5x vote boost weight
export const DEFAULT_PARTICIPATION_MULTIPLIER = 2
export const DEFAULT_MEZO_USD = 0.05

export const ACADEMY_SESSION_FROM_TS = 1_779_926_400 // 2026-05-28 00:00 UTC
export const ACADEMY_BONUS_FROM_TS = 1_783_555_200 // 2026-07-09 00:00 UTC
export const ACADEMY_SESSION_TO_TS = 1_784_764_800 // 2026-07-23 00:00 UTC

export function defaultAcademyParams(): AcademyParams {
  return {
    budgetMezoWad: parseUnits(String(DEFAULT_BUDGET_MEZO), 18),
    weightNew: DEFAULT_WEIGHT_NEW,
    weightExt: DEFAULT_WEIGHT_EXT,
    weightBoost: DEFAULT_WEIGHT_BOOST,
    pointsSegments: [
      {
        id: "academy-epochs-7-8",
        fromTs: ACADEMY_BONUS_FROM_TS,
        toTs: ACADEMY_SESSION_TO_TS,
        weightNew: 6,
        weightExt: 3,
        weightBoost: DEFAULT_WEIGHT_BOOST,
      },
    ],
    participationMultiplier: DEFAULT_PARTICIPATION_MULTIPLIER,
    mezoUsd: DEFAULT_MEZO_USD,
    rewardFloorMezoWad: parseUnits(String(DEFAULT_REWARD_FLOOR_MEZO), 18),
  }
}
