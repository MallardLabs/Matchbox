const WAD = 10n ** 18n
const MAX_BOOST_WAD = 5n * WAD

export type BoostCalculatorInputs = {
  /** Unboosted veBTC voting power of this NFT (gauge’s veBTC position). */
  unboostedNftVp: bigint
  /** Total veMEZO vote weight on this gauge (`weights(gauge)`). */
  gaugeVeMezoWeight: bigint
  /** System veBTC total from escrow `supply()`. */
  veBtcSystemTotal: bigint
  /** System veMEZO total from escrow `supply()`. */
  veMezoSystemTotal: bigint
}

/**
 * Same closed form as `BoostCalculator` / whitepaper §3.6:
 * multiplier = min(5, 1 + 4 * (V_total / v) * (w_gauge / W_total))
 * with V_total = veBTC `supply()`, v = NFT unboosted VP,
 * w_gauge = gauge veMEZO weight, W_total = veMEZO `supply()`.
 * Returns 1e18-scaled multiplier (wei).
 */
export function boostMultiplierWadFromCalculatorInputs(
  inputs: BoostCalculatorInputs,
): bigint {
  const {
    unboostedNftVp,
    gaugeVeMezoWeight,
    veBtcSystemTotal,
    veMezoSystemTotal,
  } = inputs

  if (
    unboostedNftVp === 0n ||
    gaugeVeMezoWeight === 0n ||
    veBtcSystemTotal === 0n ||
    veMezoSystemTotal === 0n
  ) {
    return WAD
  }

  const numerator = 4n * veBtcSystemTotal * gaugeVeMezoWeight * WAD
  const denominator = unboostedNftVp * veMezoSystemTotal
  const boostAboveOneWad = numerator / denominator
  const raw = WAD + boostAboveOneWad
  return raw > MAX_BOOST_WAD ? MAX_BOOST_WAD : raw
}

export function boostMultiplierNumberFromCalculatorInputs(
  inputs: BoostCalculatorInputs,
): number {
  return Number(boostMultiplierWadFromCalculatorInputs(inputs)) / 1e18
}

/** Float path for `BoostCalculator` UI (same formula as `boostMultiplierWadFromCalculatorInputs`). */
export function boostMultiplierFloatFromCalculatorInputs(
  unboostedNft: number,
  gaugeOrUserMezo: number,
  veBtcSupplyTotal: number,
  veMezoSupplyTotal: number,
): number {
  if (
    unboostedNft <= 0 ||
    gaugeOrUserMezo <= 0 ||
    veBtcSupplyTotal <= 0 ||
    veMezoSupplyTotal <= 0
  ) {
    return 1
  }
  const boostCalc =
    4 *
    (veBtcSupplyTotal / unboostedNft) *
    (gaugeOrUserMezo / veMezoSupplyTotal)
  const v = 1 + boostCalc
  return Math.min(5, Math.max(1, v))
}
