// Calculation versions shown in source chips ("Calc v1.0.0"). Bump when the
// math or its inputs change so old answers stay attributable.
export const OPTIMIZER_CALC_VERSION = "1.0.0"
export const LOAN_CALC_VERSION = "1.0.0"
export const ZAP_CALC_VERSION = "1.0.0"
export const CLAIM_CALC_VERSION = "1.0.0"

export function calcChip(version: string): string {
  return `Calc v${version}`
}

/**
 * Epoch 0 starts Thu 3 Sep 2026 00:00 UTC, the numbering Matchbox Classic and
 * the Pro overview show (features/overview/epoch.ts).
 */
const LAUNCH_EPOCH_START = 1_788_393_600n

export function epochNumberFor(epochStart: bigint): number | null {
  if (epochStart < LAUNCH_EPOCH_START) return null
  return Number((epochStart - LAUNCH_EPOCH_START) / 604_800n)
}
