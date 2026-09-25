const WAD = 10n ** 18n
const MAX_BOOST_WAD = 5n * WAD

function boostMultiplierWad(inputs: {
  unboostedNftVp: bigint
  gaugeVeMezoWeight: bigint
  veBtcSystemTotal: bigint
  veMezoSystemTotal: bigint
}): bigint {
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
  const raw = WAD + numerator / denominator
  return raw > MAX_BOOST_WAD ? MAX_BOOST_WAD : raw
}

export function boostMultiplierNumber(inputs: {
  unboostedNftVp: bigint
  gaugeVeMezoWeight: bigint
  veBtcSystemTotal: bigint
  veMezoSystemTotal: bigint
}): number {
  return Number(boostMultiplierWad(inputs)) / 1e18
}
