/**
 * Fixed-point money math for market snapshots. Amounts are bigints in base
 * units or non-negative decimal strings ("123.45"); nothing goes through a
 * float, and every division truncates toward zero.
 */

/** USD values carry six decimals (micro-dollars) before trimming. */
const usdDecimals = 6

/** BoostVoter.getBoost and voting power are 18-decimal fixed point. */
const wadDecimals = 18

const aprDecimals = 2
const boostDecimals = 4
const weeksPerYear = 52n

const decimalPattern = /^([0-9]+)(?:\.([0-9]+))?$/

/** An exact decimal: `units / 10^scale`. */
type Decimal = { units: bigint; scale: number }

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent)
}

function assertDecimals(decimals: number): void {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new RangeError(
      `Expected decimals to be an integer from 0 to 255, got ${decimals}`,
    )
  }
}

function assertNonNegative(value: bigint, name: string): void {
  if (value < 0n) {
    throw new RangeError(`Expected ${name} to be non-negative, got ${value}`)
  }
}

function splitDecimal(value: string): { whole: string; fraction: string } {
  const match = decimalPattern.exec(value)
  if (match === null) {
    throw new RangeError(
      `Expected a non-negative decimal string, got "${value}"`,
    )
  }
  return { whole: match[1] ?? "0", fraction: match[2] ?? "" }
}

/** Parses without losing digits: "1.250" → { units: 1250n, scale: 3 }. */
function parseDecimal(value: string): Decimal {
  const { whole, fraction } = splitDecimal(value)
  return { units: BigInt(`${whole}${fraction}`), scale: fraction.length }
}

/** `amount / 10^decimals` as "1.5": no trailing zeros, "0" for 0. */
export function formatUnits(amount: bigint, decimals: number): string {
  assertDecimals(decimals)
  assertNonNegative(amount, "amount")
  if (decimals === 0) return amount.toString()
  const base = pow10(decimals)
  const whole = amount / base
  const fraction = (amount % base)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "")
  return fraction.length === 0 ? whole.toString() : `${whole}.${fraction}`
}

/**
 * "1.234" with 2 decimals → 123n. Digits past `decimals` are truncated.
 * Throws on anything but a plain non-negative decimal (no sign, exponent,
 * whitespace or bare ".").
 */
export function parseFixed(value: string, decimals: number): bigint {
  assertDecimals(decimals)
  const { whole, fraction } = splitDecimal(value)
  const scaledWhole = BigInt(whole) * pow10(decimals)
  if (decimals === 0) return scaledWhole
  return scaledWhole + BigInt(fraction.slice(0, decimals).padEnd(decimals, "0"))
}

/** amount (token base units) × priceUsd, truncated to 6 decimals, trailing zeros trimmed */
export function tokenUsd(
  amount: bigint,
  decimals: number,
  priceUsd: string,
): string {
  assertDecimals(decimals)
  assertNonNegative(amount, "amount")
  const price = parseDecimal(priceUsd)
  const microUsd =
    (amount * price.units * pow10(usdDecimals)) / pow10(decimals + price.scale)
  return formatUnits(microUsd, usdDecimals)
}

/** Exact decimal sum of non-negative decimal strings; "0" when empty. */
export function sumUsd(values: readonly string[]): string {
  const parsed = values.map(parseDecimal)
  let scale = 0
  for (const value of parsed) scale = Math.max(scale, value.scale)
  let total = 0n
  for (const value of parsed) {
    total += value.units * pow10(scale - value.scale)
  }
  return formatUnits(total, scale)
}

/**
 * Annualized return for voters, in percent, truncated to 2 decimals:
 * totalUsd * 52 / (weight / 1e18 * votingTokenUsd) * 100.
 * null when weight is 0n or votingTokenUsd is zero.
 */
export function aprPercent(input: {
  totalUsd: string
  weight: bigint
  votingTokenUsd: string
}): string | null {
  assertNonNegative(input.weight, "weight")
  const total = parseDecimal(input.totalUsd)
  const price = parseDecimal(input.votingTokenUsd)
  if (input.weight === 0n || price.units === 0n) return null
  // (T / 10^ts) * 52 * 100 / (W / 10^18 * P / 10^ps), scaled by 10^2.
  const numerator =
    total.units *
    weeksPerYear *
    100n *
    pow10(aprDecimals + wadDecimals + price.scale)
  const denominator = pow10(total.scale) * input.weight * price.units
  return formatUnits(numerator / denominator, aprDecimals)
}

/** BoostVoter.getBoost raw value (1e18 = 1x) → "1.2345" (up to 4 decimals, trimmed) */
export function boostMultiplier(raw: bigint): string {
  assertNonNegative(raw, "boost")
  return formatUnits(raw / pow10(wadDecimals - boostDecimals), boostDecimals)
}
