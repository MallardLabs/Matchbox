import { formatTokenAmountDigits } from "@/lib/money"
import type { GaugeProfile } from "@/lib/supabase"

export type OverviewState =
  | "disconnected"
  | "loading"
  | "error"
  | "empty"
  | "ready"

export type LockKind = "veMEZO" | "veBTC"

export type OverviewLock = {
  kind: LockKind
  id: string
  amount: bigint
  votingPower: bigint
  unboostedVotingPower?: bigint | undefined
  end: bigint
  isPermanent: boolean
  expired: boolean
}

const DAY_SECONDS = 86_400

export function resolveOverviewState({
  isConnected,
  isLoading,
  hasError,
  hasLocks,
}: {
  isConnected: boolean
  isLoading: boolean
  hasError: boolean
  hasLocks: boolean
}): OverviewState {
  if (!isConnected) return "disconnected"
  if (isLoading) return "loading"
  if (hasError) return "error"
  return hasLocks ? "ready" : "empty"
}

export function lockToken(kind: LockKind): "BTC" | "MEZO" {
  return kind === "veBTC" ? "BTC" : "MEZO"
}

export function formatLockAmount(lock: Pick<OverviewLock, "kind" | "amount">) {
  return `${formatTokenAmountDigits(lock.amount, 18, lock.kind === "veBTC" ? 4 : 2)} ${lockToken(lock.kind)}`
}

export function formatVotingPower(
  lock: Pick<OverviewLock, "kind" | "votingPower">,
): string {
  return `${formatTokenAmountDigits(lock.votingPower, 18, lock.kind === "veBTC" ? 4 : 2)} ${lock.kind}`
}

/** "4 days", "2mo 27d" — the Pen's compact lock countdown. */
export function formatLockRemaining(end: bigint, nowSeconds: number): string {
  const days = Math.max(1, Math.ceil((Number(end) - nowSeconds) / DAY_SECONDS))
  if (days < 60) return days === 1 ? "1 day" : `${days} days`
  return `${Math.floor(days / 30)}mo ${days % 30}d`
}

export function lockStatusLabel(
  lock: Pick<OverviewLock, "end" | "isPermanent" | "expired">,
  nowSeconds: number,
): string {
  if (lock.expired) return "Expired"
  if (lock.isPermanent) return "Auto max-locked"
  return `Unlocks in ${formatLockRemaining(lock.end, nowSeconds)}`
}

/** Merged lock keeps the longer of the two lock ends; permanence wins. */
export function mergedLock(source: OverviewLock, keep: OverviewLock) {
  return {
    ...keep,
    amount: source.amount + keep.amount,
    isPermanent: source.isPermanent || keep.isPermanent,
    end: source.end > keep.end ? source.end : keep.end,
  }
}

function groupThousands(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/** Whole units to "48", "12.4k", "2.41M". */
export function formatCompactNumber(whole: bigint): string {
  if (whole < 1_000n) return whole.toString()
  if (whole < 1_000_000n) {
    const tenths = (whole * 10n + 500n) / 1_000n
    const fraction = tenths % 10n
    return `${tenths / 10n}${fraction === 0n ? "" : `.${fraction}`}k`
  }
  const hundredths = (whole * 100n + 500_000n) / 1_000_000n
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}M`
}

export function microToWholeUsd(micro: bigint): bigint {
  return (micro + 500_000n) / 1_000_000n
}

export function formatCompactUsd(micro: bigint): string {
  return `$${formatCompactNumber(microToWholeUsd(micro))}`
}

export function formatWholeUsd(micro: bigint): string {
  return `$${groupThousands(microToWholeUsd(micro))}`
}

/** Smallest 1/2/5 × 10ⁿ ceiling at or above `max` (whole dollars). */
export function niceCeiling(max: bigint): bigint {
  if (max <= 0n) return 0n
  let magnitude = 1n
  while (magnitude * 10n <= max) magnitude *= 10n
  for (const step of [1n, 2n, 5n, 10n]) {
    if (step * magnitude >= max) return step * magnitude
  }
  return 10n * magnitude
}

/** Trim trailing zeros from a token amount: BTC keeps up to 6 decimals, others 2. */
export function formatRewardAmount(
  amount: bigint,
  decimals: number,
  symbol: string,
): string {
  const digits = /btc/i.test(symbol) ? 6 : 2
  const formatted = formatTokenAmountDigits(amount, decimals, digits)
  return formatted.includes(".") ? formatted.replace(/\.?0+$/, "") : formatted
}

export function gaugeDisplayName(
  profiles: GaugeProfile[] | undefined,
  address: string,
): string {
  const name = profiles
    ?.find(
      (profile) =>
        profile.gauge_address.toLowerCase() === address.toLowerCase(),
    )
    ?.display_name?.trim()
  return name ? name : `${address.slice(0, 6)}…${address.slice(-4)}`
}
