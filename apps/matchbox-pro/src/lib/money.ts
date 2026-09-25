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
  const priceScaleDecimals = 18
  const priceScaledUsd = decimalToScaledBigInt(priceUsd, priceScaleDecimals)
  return (
    (amount * priceScaledUsd * 10n ** 6n) /
    (10n ** BigInt(decimals) * 10n ** BigInt(priceScaleDecimals))
  )
}

function groupThousands(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

export function formatMicroUsd(value: bigint | null): string {
  if (value === null) return "—"
  const roundedCents = (value + 5_000n) / 10_000n
  const whole = roundedCents / 100n
  const fraction = (roundedCents % 100n).toString().padStart(2, "0")
  return `$${groupThousands(whole)}.${fraction}`
}

export function formatTokenAmount(amount: bigint, decimals: number): string {
  return formatTokenAmountDigits(amount, decimals, 2)
}

export function formatTokenAmountDigits(
  amount: bigint,
  decimals: number,
  fractionDigits: number,
): string {
  const base = 10n ** BigInt(decimals)
  const whole = amount / base
  if (fractionDigits === 0) return groupThousands(whole)
  const fraction = amount % base
  const scale = 10n ** BigInt(fractionDigits)
  const displayed = (fraction * scale) / base
  return `${groupThousands(whole)}.${displayed
    .toString()
    .padStart(fractionDigits, "0")}`
}

export function formatVeAmount(amount: bigint): string {
  return formatTokenAmount(amount, 18)
}

export function formatApyBasisPoints(value: bigint | null): string {
  if (value === null) return "—"
  if (value < 0n) return "∞"
  const whole = value / 100n
  const fraction = (value % 100n).toString().padStart(2, "0")
  return `${whole}.${fraction}%`
}

export function microUsdToDecimalString(value: bigint): string {
  const whole = value / 1_000_000n
  const frac = (value % 1_000_000n).toString().padStart(6, "0")
  return `${whole}.${frac}`
}

export function formatBoost(multiplier: number): string {
  if (multiplier >= 5) return "5×"
  const tenths = Math.round(multiplier * 10)
  return `${(tenths / 10).toFixed(1)}×`
}

export function formatFixedPoint(amount: bigint, decimals: number): string {
  if (amount < 0n) return "0"
  const base = 10n ** BigInt(decimals)
  const whole = amount / base
  const frac = amount % base
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "")
  return fracStr.length === 0 ? whole.toString() : `${whole}.${fracStr}`
}

export function formatTickerUsd(
  price: string | null | undefined,
  fractionDigits: number,
): string {
  if (!price) return "—"
  const scaled = decimalToScaledBigInt(price, fractionDigits)
  const base = 10n ** BigInt(fractionDigits)
  const whole = scaled / base
  const frac = scaled % base
  return `$${groupThousands(whole)}.${frac.toString().padStart(fractionDigits, "0")}`
}

export function priceToMicroUsd(price: string): bigint {
  return decimalToScaledBigInt(price, 6)
}

export function microUsdToTokenAmount(
  microUsd: bigint,
  decimals: number,
  priceUsd: string,
): bigint {
  const priceScaleDecimals = 18
  const priceScaledUsd = decimalToScaledBigInt(priceUsd, priceScaleDecimals)
  if (priceScaledUsd === 0n) return 0n
  return (
    (microUsd * 10n ** BigInt(decimals) * 10n ** BigInt(priceScaleDecimals)) /
    (priceScaledUsd * 10n ** 6n)
  )
}

export function sqrtPriceX96ToPriceString(sqrtPriceX96: bigint): string {
  const q192 = 2n ** 192n
  const scale = 10n ** 18n
  const scaled = (sqrtPriceX96 * sqrtPriceX96 * scale) / q192
  return formatFixedPoint(scaled, 18)
}
