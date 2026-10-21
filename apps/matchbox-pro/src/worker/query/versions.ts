// Calculation versions shown in source chips ("Calc v1.0.0"). Bump when the
// math or its inputs change so old answers stay attributable.
export const OPTIMIZER_CALC_VERSION = "1.0.0"
export const LOAN_CALC_VERSION = "1.0.0"
export const ZAP_CALC_VERSION = "1.0.0"
export const CLAIM_CALC_VERSION = "1.0.0"

export function calcChip(version: string): string {
  return `Calc v${version}`
}

// Epoch numbers (Epoch 0 = Thu 3 Sep 2026 00:00 UTC) come from the one
// app-wide definition, so Stuart's answers match the pages.
export { epochNumberFor } from "../../lib/epoch"
