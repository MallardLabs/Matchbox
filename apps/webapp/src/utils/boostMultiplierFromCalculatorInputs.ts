const WAD = 10n ** 18n
const MAX_BOOST_WAD = 5n * WAD

export type BoostCalculatorInputs = {
  /** Unboosted veBTC voting power of this NFT (gauge’s veBTC position). */
  unboostedNftVp: bigint
  /** Total veMEZO vote weight on this gauge (`weights(gauge)`). */
  gaugeVeMezoWeight: bigint
  /** System total unboosted veBTC voting power (`unboostedTotalVotingPower`). */
  unboostedVeBtcTotal: bigint
  /** System total allocated veMEZO weight (`boostVoter.totalWeight`). */
  boostVoterTotalWeight: bigint
}

/**
 * Same closed form as `BoostCalculator` / whitepaper §3.6:
 * multiplier = min(5, 1 + 4 * (V_total / v) * (w_gauge / W_total))
 * with V_total = unboosted veBTC total, v = NFT unboosted VP,
 * w_gauge = gauge veMEZO weight, W_total = boost voter total weight.
 * Returns 1e18-scaled multiplier (wei) to match `getBoost` encoding.
 */
export function boostMultiplierWadFromCalculatorInputs(
  inputs: BoostCalculatorInputs,
): bigint {
  const {
    unboostedNftVp,
    gaugeVeMezoWeight,
    unboostedVeBtcTotal,
    boostVoterTotalWeight,
  } = inputs

  if (
    unboostedNftVp === 0n ||
    gaugeVeMezoWeight === 0n ||
    unboostedVeBtcTotal === 0n ||
    boostVoterTotalWeight === 0n
  ) {
    return WAD
  }

  const numerator = 4n * unboostedVeBtcTotal * gaugeVeMezoWeight * WAD
  const denominator = unboostedNftVp * boostVoterTotalWeight
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
  unboostedBtcTotal: number,
  boostVoterTotalMezo: number,
): number {
  if (
    unboostedNft <= 0 ||
    gaugeOrUserMezo <= 0 ||
    unboostedBtcTotal <= 0 ||
    boostVoterTotalMezo <= 0
  ) {
    return 1
  }
  const boostCalc =
    4 *
    (unboostedBtcTotal / unboostedNft) *
    (gaugeOrUserMezo / boostVoterTotalMezo)
  const v = 1 + boostCalc
  return Math.min(5, Math.max(1, v))
}
