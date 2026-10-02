import { decimalToScaledBigInt } from "./validatorApy"

const USD_MICRO_DECIMALS = 6

// API USD figures arrive as decimal strings. Scaling them straight to integer
// micro-USD keeps sorting and optimizer math free of floating-point drift.
export function usdStringToMicroUsd(value: string | null | undefined): bigint {
  if (!value) return 0n
  return decimalToScaledBigInt(value, USD_MICRO_DECIMALS)
}

export function sumUsdStringsMicroUsd(
  values: readonly (string | null | undefined)[],
): bigint {
  return values.reduce<bigint>(
    (total, value) => total + usdStringToMicroUsd(value),
    0n,
  )
}

export type PricedRewardToken = {
  valueMicroUsd: bigint | null
}

// The total is only trustworthy when every token has a price; one unpriced
// token makes the whole figure unknown rather than silently low.
export function totalRewardMicroUsd(
  tokens: readonly PricedRewardToken[],
): bigint | null {
  let total = 0n
  for (const token of tokens) {
    if (token.valueMicroUsd === null) return null
    total += token.valueMicroUsd
  }
  return total
}

// The optimizer can still use the priced portion of a pool's rewards, so it
// needs the priced sum and how many tokens had to be left out.
export function pricedRewardMicroUsd(tokens: readonly PricedRewardToken[]): {
  valueMicroUsd: bigint
  unpricedCount: number
} {
  let valueMicroUsd = 0n
  let unpricedCount = 0
  for (const token of tokens) {
    if (token.valueMicroUsd === null) unpricedCount += 1
    else valueMicroUsd += token.valueMicroUsd
  }
  return { valueMicroUsd, unpricedCount }
}

export function addNullableMicroUsd(
  a: bigint | null,
  b: bigint | null,
): bigint | null {
  return a === null || b === null ? null : a + b
}

export type PoolVoteSortMode =
  | "rewards"
  | "apy"
  | "share"
  | "weight"
  | "tvl"
  | "volume"
  | "name"

export type PoolVoteSortEntry = {
  pool: string
  name: string
  weight: bigint
  shareBasisPoints: bigint
  rewardsMicroUsd: bigint | null
  apyBasisPoints: bigint | null
  tvlMicroUsd: bigint
  volumeMicroUsd: bigint
}

function compareBigInt(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// -1n marks rewards against zero weight (unbounded APY), which should rank
// above every finite APY.
function sortableApy(value: bigint | null): bigint {
  if (value === -1n) return 2n ** 255n
  return value ?? -1n
}

export function comparePoolVoteSortEntries(
  a: PoolVoteSortEntry,
  b: PoolVoteSortEntry,
  mode: PoolVoteSortMode,
  direction: "asc" | "desc",
): number {
  let comparison = 0
  if (mode === "name") comparison = a.name.localeCompare(b.name)
  if (mode === "weight") comparison = compareBigInt(a.weight, b.weight)
  if (mode === "share")
    comparison = compareBigInt(a.shareBasisPoints, b.shareBasisPoints)
  if (mode === "rewards")
    comparison = compareBigInt(
      a.rewardsMicroUsd ?? -1n,
      b.rewardsMicroUsd ?? -1n,
    )
  if (mode === "apy")
    comparison = compareBigInt(
      sortableApy(a.apyBasisPoints),
      sortableApy(b.apyBasisPoints),
    )
  if (mode === "tvl") comparison = compareBigInt(a.tvlMicroUsd, b.tvlMicroUsd)
  if (mode === "volume")
    comparison = compareBigInt(a.volumeMicroUsd, b.volumeMicroUsd)

  if (comparison !== 0) return direction === "asc" ? comparison : -comparison
  const nameComparison = a.name.localeCompare(b.name)
  if (nameComparison !== 0) return nameComparison
  return a.pool.toLowerCase().localeCompare(b.pool.toLowerCase())
}

const COMPACT_USD_UNITS = [
  { threshold: 1_000_000_000n, suffix: "B" },
  { threshold: 1_000_000n, suffix: "M" },
  { threshold: 1_000n, suffix: "K" },
] as const

// Headline figures such as TVL and volume read better compact ($1.24M), and
// integer division keeps the rounding deterministic.
export function formatCompactMicroUsd(value: bigint): string {
  const wholeUsd = value / 1_000_000n
  for (const unit of COMPACT_USD_UNITS) {
    if (wholeUsd < unit.threshold) continue
    const hundredths = (value * 100n) / (unit.threshold * 1_000_000n)
    const whole = hundredths / 100n
    const fraction = (hundredths % 100n)
      .toString()
      .padStart(2, "0")
      .replace(/0+$/, "")
    return `$${whole}${fraction ? `.${fraction}` : ""}${unit.suffix}`
  }
  const cents = value / 10_000n
  return `$${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`
}

// The pools API reports LP APRs as basis-point numbers; the ballot works in
// integer basis points.
export function aprNumberToBasisPoints(value: number): bigint {
  return Number.isFinite(value) && value > 0 ? BigInt(Math.round(value)) : 0n
}
