function expandExponent(value: string): string {
  if (!/[eE]/.test(value)) return value
  const [coefficient = "0", exponentText = "0"] = value.toLowerCase().split("e")
  const exponent = Number.parseInt(exponentText, 10)
  const [whole = "0", fraction = ""] = coefficient.split(".")
  const digits = `${whole.replace(/^[-+]/, "")}${fraction}`
  const decimalIndex = whole.replace(/^[-+]/, "").length + exponent
  if (decimalIndex <= 0) return `0.${"0".repeat(-decimalIndex)}${digits}`
  if (decimalIndex >= digits.length)
    return `${digits}${"0".repeat(decimalIndex - digits.length)}`
  return `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`
}

export function decimalToScaledBigInt(
  value: string,
  scaleDecimals: number,
): bigint {
  const expanded = expandExponent(value.trim())
  if (!/^\d+(\.\d+)?$/.test(expanded)) return 0n
  const [whole = "0", fraction = ""] = expanded.split(".")
  return (
    BigInt(whole) * 10n ** BigInt(scaleDecimals) +
    BigInt(fraction.slice(0, scaleDecimals).padEnd(scaleDecimals, "0") || "0")
  )
}

export function tokenUsdMicroValue(
  amount: bigint,
  decimals: number,
  priceUsd: string,
): bigint {
  const priceMicroUsd = decimalToScaledBigInt(priceUsd, 6)
  return (amount * priceMicroUsd) / 10n ** BigInt(decimals)
}

export function calculateValidatorApyBasisPoints(
  incentivesMicroUsd: bigint,
  veBtcWeightWei: bigint,
  btcPriceUsd: string,
): bigint | null {
  if (incentivesMicroUsd <= 0n) return null
  const btcPriceMicroUsd = decimalToScaledBigInt(btcPriceUsd, 6)
  if (btcPriceMicroUsd <= 0n) return null
  const principalMicroUsd = (veBtcWeightWei * btcPriceMicroUsd) / 10n ** 18n
  if (principalMicroUsd === 0n) return -1n
  return (incentivesMicroUsd * 52n * 10_000n) / principalMicroUsd
}

export function formatValidatorApy(value: bigint | null): string {
  if (value === null) return "—"
  if (value === -1n) return "∞"
  const whole = value / 100n
  const fraction = (value % 100n).toString().padStart(2, "0")
  if (whole >= 10_000n) return `${whole / 1_000n}k%`
  return `${whole}.${fraction}%`
}

function groupThousands(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

export function formatMicroUsd(value: bigint | null): string {
  if (value === null) return "Price unavailable"
  const roundedCents = (value + 5_000n) / 10_000n
  const whole = roundedCents / 100n
  const fraction = (roundedCents % 100n).toString().padStart(2, "0")
  return `~$${groupThousands(whole)}.${fraction}`
}
