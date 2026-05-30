import type { AcademyParams } from "@/lib/academy/simulate"
import { parseUnits } from "viem"

export const DEFAULT_BUDGET_MEZO = 1_000_000 // S0 Default: 1,000,000 MEZO
export const DEFAULT_REWARD_FLOOR_MEZO = 20

export const DEFAULT_WEIGHT_NEW = 2
export const DEFAULT_WEIGHT_EXT = 1
export const DEFAULT_WEIGHT_BOOST = 0.5 // 0.5x vote boost weight
export const DEFAULT_PARTICIPATION_MULTIPLIER = 2
export const DEFAULT_MEZO_USD = 0.05

export function defaultAcademyParams(): AcademyParams {
  return {
    budgetMezoWad: parseUnits(String(DEFAULT_BUDGET_MEZO), 18),
    weightNew: DEFAULT_WEIGHT_NEW,
    weightExt: DEFAULT_WEIGHT_EXT,
    weightBoost: DEFAULT_WEIGHT_BOOST,
    participationMultiplier: DEFAULT_PARTICIPATION_MULTIPLIER,
    mezoUsd: DEFAULT_MEZO_USD,
    rewardFloorMezoWad: parseUnits(String(DEFAULT_REWARD_FLOOR_MEZO), 18),
  }
}
