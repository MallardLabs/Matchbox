import type { BoostGauge } from "@/hooks/useBoostGauges"
import type { VeMEZOLock } from "@/hooks/useLocks"
import type { GaugeProfile } from "@/lib/supabase"

export type SortKey = "apy" | "incentives" | "vebtc" | "vemezo" | "boost"
export type FilterKey = "all" | "active" | "watching"
export type Density = "comfortable" | "compact"

export type IncentivePill = { symbol: string; usd: bigint }

export type VoteGaugeCard = {
  gauge: BoostGauge
  profile: GaugeProfile | undefined
  name: string
  incentives: bigint
  pills: IncentivePill[]
  apy: bigint | null
  tokenId: string | undefined
}

export function voteWeightForPercent(
  selectedPower: bigint,
  percent: number,
): bigint {
  return (selectedPower * BigInt(Math.round(percent))) / 100n
}

export function projectedSliceMicroUsd(
  card: VoteGaugeCard,
  selectedPower: bigint,
  percent: number,
): bigint {
  const voteWeight = voteWeightForPercent(selectedPower, percent)
  if (voteWeight === 0n) return 0n
  return (card.incentives * voteWeight) / (card.gauge.totalWeight + voteWeight)
}

export function compareDesc<T extends bigint | number>(a: T, b: T): number {
  if (a === b) return 0
  return a > b ? -1 : 1
}

export function isLockExpired(lock: VeMEZOLock): boolean {
  if (lock.votingPower === 0n) return true
  return !lock.isPermanent && lock.end * 1000n <= BigInt(Date.now())
}

export function lockStatusLabel(lock: VeMEZOLock): string {
  if (isLockExpired(lock)) return "Expired"
  if (lock.isPermanent) return "Auto max-lock"
  const days = Math.max(
    1,
    Math.ceil((Number(lock.end) - Date.now() / 1000) / 86_400),
  )
  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  const rest = (days % 365) % 30
  if (years > 0) return `Unlocks in ${years}y${months ? ` ${months}mo` : ""}`
  if (months > 0) return `Unlocks in ${months}mo${rest ? ` ${rest}d` : ""}`
  return `Unlocks in ${rest}d`
}

/** "$18.2K" style label for tight mobile rows; truncates, never rounds up. */
export function formatCompactUsd(microUsd: bigint): string {
  const dollars = microUsd / 1_000_000n
  const scaled = (unit: bigint, suffix: string): string => {
    const tenths = (dollars * 10n) / unit
    const fraction = tenths % 10n
    return `$${tenths / 10n}${fraction === 0n ? "" : `.${fraction}`}${suffix}`
  }
  if (dollars >= 1_000_000n) return scaled(1_000_000n, "M")
  if (dollars >= 1_000n) return scaled(1_000n, "K")
  return `$${dollars}`
}
