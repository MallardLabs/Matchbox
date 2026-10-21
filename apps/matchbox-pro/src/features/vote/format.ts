import { formatMicroUsd, formatTokenAmountDigits } from "@/lib/money"
import type { NativeAmount } from "./projection"

function groupThousands(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/** "$86.40"; a projection under half a cent reads "<$0.01", not "$0.00". */
export function formatUsd(microUsd: bigint): string {
  if (microUsd > 0n && microUsd < 5_000n) return "<$0.01"
  return formatMicroUsd(microUsd)
}

/** "$18,204" for card totals; cents only below $1,000. */
export function formatUsdHeadline(microUsd: bigint): string {
  if (microUsd < 1_000_000_000n) return formatUsd(microUsd)
  return `$${groupThousands((microUsd + 500_000n) / 1_000_000n)}`
}

/** "~$12,104" pill value; cents only below $100. */
export function formatUsdApprox(microUsd: bigint): string {
  // Priced dust reads as "<$0.01", never as a misleading $0.00.
  if (microUsd > 0n && microUsd < 5_000n) return "<$0.01"
  if (microUsd < 100_000_000n) return `~${formatMicroUsd(microUsd)}`
  return `~$${groupThousands((microUsd + 500_000n) / 1_000_000n)}`
}

/** "$18.2K" / "$228" for tight mobile rows; truncates so it never overstates. */
export function formatUsdCompact(microUsd: bigint): string {
  const dollars = microUsd / 1_000_000n
  const scaled = (unit: bigint, suffix: string): string => {
    const tenths = (dollars * 10n) / unit
    const fraction = tenths % 10n
    return `$${tenths / 10n}${fraction === 0n ? "" : `.${fraction}`}${suffix}`
  }
  if (dollars >= 1_000_000n) return scaled(1_000_000n, "M")
  if (dollars >= 1_000n) return scaled(1_000n, "K")
  if (dollars >= 1n) return `$${dollars}`
  return microUsd > 0n ? "<$1" : "$0"
}

/** Six significant digits at most, two decimals for amounts above 1. */
export function formatNativeAmount(amount: NativeAmount): string {
  const base = 10n ** BigInt(amount.decimals)
  if (amount.amount >= base)
    return `${formatTokenAmountDigits(amount.amount, amount.decimals, 2)} ${amount.symbol}`
  const digits = Math.min(amount.decimals, 6)
  return `${formatTokenAmountDigits(amount.amount, amount.decimals, digits)} ${amount.symbol}`
}

export function formatNativeList(amounts: readonly NativeAmount[]): string {
  if (amounts.length === 0) return "—"
  return amounts.map(formatNativeAmount).join(" · ")
}

/** Signed USD delta, "+$0.40" / "−$2.10". */
export function formatUsdDelta(microUsd: bigint): string {
  if (microUsd === 0n) return "$0.00"
  return microUsd > 0n
    ? `+${formatMicroUsd(microUsd)}`
    : `−${formatMicroUsd(-microUsd)}`
}

/** Signed basis points as a percent with one decimal, "−2.7%". */
export function formatSignedBps(bps: bigint): string {
  const sign = bps < 0n ? "−" : "+"
  const magnitude = bps < 0n ? -bps : bps
  const tenths = (magnitude + 5n) / 10n
  return `${sign}${tenths / 10n}.${tenths % 10n}%`
}

/** APY to one decimal, "14.8%"; "∞" for a funded target nobody votes on yet. */
export function formatApy(bps: bigint | null): string {
  if (bps === null) return "—"
  if (bps < 0n) return "∞"
  const tenths = (bps + 5n) / 10n
  return `${groupThousands(tenths / 10n)}.${tenths % 10n}%`
}

/** Escrow power with a floor so dust never reads as zero. */
export function formatPower(
  amount: bigint,
  fractionDigits: number,
  decimals = 18,
): string {
  const unit = 10n ** BigInt(decimals - fractionDigits)
  if (amount > 0n && amount < unit)
    return `<0.${"0".repeat(fractionDigits - 1)}1`
  return formatTokenAmountDigits(amount, decimals, fractionDigits)
}
