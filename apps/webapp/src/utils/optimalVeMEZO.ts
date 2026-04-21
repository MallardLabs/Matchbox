import { Rational } from "@thesis-co/cent"

export type OptimalVeMEZO = {
  optimalVeMEZO: bigint
  optimalAdditionalVeMEZO: bigint
}

/**
 * Calculate the veMEZO voting weight on a gauge that reaches maximum (5x) boost.
 * Formula (same basis as the Boost calculator):
 *   targetVeMEZO = (unboosted NFT veBTC * veMEZO totalVotingPower) / veBTC totalVotingPower
 *   additionalVeMEZO = max(targetVeMEZO - currentGaugeVeMEZOWeight, 0)
 */
export function calculateOptimalVeMEZO(
  gaugeVeBTCWeight: bigint | undefined,
  currentGaugeVeMEZOWeight: bigint,
  veBTCTokenSupply: bigint | undefined,
  veMEZOTokenSupply: bigint | undefined,
): OptimalVeMEZO | undefined {
  if (
    !veMEZOTokenSupply ||
    veMEZOTokenSupply === 0n ||
    !veBTCTokenSupply ||
    veBTCTokenSupply === 0n ||
    !gaugeVeBTCWeight ||
    gaugeVeBTCWeight === 0n
  ) {
    return undefined
  }

  try {
    const scale = 10n ** 18n
    const veBTCWeight = Rational(gaugeVeBTCWeight, scale)
    const veMEZOTotal = Rational(veMEZOTokenSupply, scale)
    const veBTCTotal = Rational(veBTCTokenSupply, scale)

    const result = veBTCWeight.multiply(veMEZOTotal).divide(veBTCTotal)
    const simplified = result.simplify()
    const optimalTarget = (simplified.p * scale) / simplified.q
    const optimalAdditionalVeMEZO =
      optimalTarget > currentGaugeVeMEZOWeight
        ? optimalTarget - currentGaugeVeMEZOWeight
        : 0n

    return {
      optimalVeMEZO: optimalTarget,
      optimalAdditionalVeMEZO,
    }
  } catch (error) {
    console.error("calculateOptimalVeMEZO error:", {
      gaugeVeBTCWeight: gaugeVeBTCWeight.toString(),
      currentGaugeVeMEZOWeight: currentGaugeVeMEZOWeight.toString(),
      veMEZOTokenSupply: veMEZOTokenSupply.toString(),
      veBTCTokenSupply: veBTCTokenSupply.toString(),
      error,
    })
    return undefined
  }
}

/** `totalWeight / optimal` — only meaningful when weight is at or above optimal. */
export function weightToOptimalRatio(weight: bigint, optimal: bigint): number {
  if (optimal <= 0n) return 1
  return Number((weight * 10000n) / optimal) / 10000
}

/** Red overlay width 0% at 1× optimal → 100% at 2×; stays full past 2×. */
export function oversubscribedRedWidthPercent(ratio: number): number {
  if (ratio <= 1) return 0
  return Math.min(100, (ratio - 1) * 100)
}

/** Text color: green at 1×, red at 2× and beyond. */
export function oversubscribedStressColor(ratio: number): string {
  if (ratio <= 1) return "var(--positive)"
  if (ratio >= 2) return "var(--negative)"
  const t = ratio - 1
  return `color-mix(in oklab, var(--positive) ${(1 - t) * 100}%, var(--negative) ${t * 100}%)`
}
