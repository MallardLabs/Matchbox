import { formatTokenAmountDigits } from "@/lib/money"
import type { TokenAmount } from "./contract"

// Wire values from the Stuart runtime are decimal strings and integer bps;
// these helpers format them without ever passing money through a JS number.

const MINUS = "−"

function groupThousands(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/** "-12.345678" (usd6) → micro-USD bigint. */
export function usd6ToMicro(value: string): bigint {
  const negative = value.startsWith("-")
  const [whole = "0", fraction = ""] = value.replace(/^-/, "").split(".")
  const micro =
    BigInt(whole) * 1_000_000n +
    BigInt(fraction.slice(0, 6).padEnd(6, "0") || "0")
  return negative ? -micro : micro
}

/** Micro-USD bigint → usd6 wire string. */
export function microToUsd6(micro: bigint): string {
  const negative = micro < 0n
  const absolute = negative ? -micro : micro
  const whole = absolute / 1_000_000n
  const fraction = (absolute % 1_000_000n).toString().padStart(6, "0")
  return `${negative ? "-" : ""}${whole}.${fraction}`
}

/** Rounds half away from zero to the given number of decimals. */
function roundMicro(micro: bigint, fractionDigits: number): bigint {
  const step = 10n ** BigInt(6 - fractionDigits)
  const half = step / 2n
  return micro >= 0n ? (micro + half) / step : -((-micro + half) / step)
}

function usdDigits(micro: bigint, fractionDigits: number): string {
  const rounded = roundMicro(micro < 0n ? -micro : micro, fractionDigits)
  if (fractionDigits === 0) return groupThousands(rounded)
  const scale = 10n ** BigInt(fractionDigits)
  const whole = rounded / scale
  const fraction = (rounded % scale).toString().padStart(fractionDigits, "0")
  return `${groupThousands(whole)}.${fraction}`
}

/** "$86.40"; `cents: false` gives "$59,200". Null stays an em dash, never $0. */
export function formatUsd(
  value: string | null,
  { cents = true }: { cents?: boolean } = {},
): string {
  if (value === null) return "—"
  const micro = usd6ToMicro(value)
  const digits = usdDigits(micro, cents ? 2 : 0)
  return micro < 0n ? `${MINUS}$${digits}` : `$${digits}`
}

/** "+$0.40" / "−$2.10" for deltas; zero has no sign. */
export function formatSignedUsd(value: string): string {
  const micro = usd6ToMicro(value)
  const digits = usdDigits(micro, 2)
  if (roundMicro(micro, 2) === 0n) return `$${digits}`
  return micro < 0n ? `${MINUS}$${digits}` : `+$${digits}`
}

export function usdSign(value: string): "pos" | "neg" | "zero" {
  const cents = roundMicro(usd6ToMicro(value), 2)
  if (cents === 0n) return "zero"
  return cents < 0n ? "neg" : "pos"
}

/** 4200 → "42%", 4250 → "42.5%", 21200 → "212%". */
export function formatBps(bps: number): string {
  const negative = bps < 0
  const absolute = Math.abs(Math.trunc(bps))
  const whole = Math.floor(absolute / 100)
  const fraction = (absolute % 100)
    .toString()
    .padStart(2, "0")
    .replace(/0+$/, "")
  const text = fraction.length > 0 ? `${whole}.${fraction}%` : `${whole}%`
  return negative ? `${MINUS}${text}` : text
}

/** Fixed two decimals for small rates: 50 → "0.50%", 5 → "0.05%". */
export function formatBpsFixed(bps: number): string {
  const absolute = Math.abs(Math.trunc(bps))
  const text = `${Math.floor(absolute / 100)}.${(absolute % 100)
    .toString()
    .padStart(2, "0")}%`
  return bps < 0 ? `${MINUS}${text}` : text
}

/** −270 → "−2.7%", 150 → "+1.5%". */
export function formatSignedBps(bps: number): string {
  if (bps === 0) return "0%"
  return bps > 0 ? `+${formatBps(bps)}` : formatBps(bps)
}

/** BTC keeps four decimals ("2.4000 BTC"); everything else two. */
export function tokenDigits(symbol: string): number {
  return symbol.toUpperCase().includes("BTC") ? 4 : 2
}

export function formatTokenNumber(
  amount: TokenAmount,
  digits?: number,
): string {
  return formatTokenAmountDigits(
    BigInt(amount.raw),
    amount.decimals,
    digits ?? tokenDigits(amount.symbol),
  )
}

/** "1,024.80 MEZO". */
export function formatToken(
  amount: TokenAmount | null,
  digits?: number,
): string {
  if (!amount) return "—"
  return `${formatTokenNumber(amount, digits)} ${amount.symbol}`
}

/** "4128440" → "4,128,440". */
export function formatBlock(block: string): string {
  return /^\d+$/.test(block) ? groupThousands(BigInt(block)) : block
}

export function formatCount(value: number): string {
  return groupThousands(BigInt(Math.max(0, Math.trunc(value))))
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/** ISO datetime → "Aug 06" (UTC, so every viewer sees the same date). */
export function formatShortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  const day = date.getUTCDate().toString().padStart(2, "0")
  return `${MONTHS[date.getUTCMonth()] ?? ""} ${day}`
}

/** Whole seconds until `iso`, floored at zero. */
export function secondsUntil(iso: string, now: number): number {
  const target = new Date(iso).getTime()
  if (Number.isNaN(target)) return 0
  return Math.max(0, Math.floor((target - now) / 1000))
}

/** 47 → "47s", 125 → "2m 05s". */
export function formatCountdown(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds >= 3_600) return `${Math.floor(seconds / 3_600)}h+`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${(seconds % 60).toString().padStart(2, "0")}s`
}

/** Percent text ("0.5", "1", "0.75") → bps, two decimals at most. */
export function percentTextToBps(text: string): number | null {
  const trimmed = text.trim().replace(/%$/, "").trim()
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(trimmed)
  if (!match) return null
  const whole = Number.parseInt(match[1] ?? "0", 10)
  const fraction = Number.parseInt((match[2] ?? "").padEnd(2, "0") || "0", 10)
  const bps = whole * 100 + fraction
  return bps <= 10_000 ? bps : null
}

/** Boost as a 1e18 fixed-point multiplier → "4.2×" (rounded to a tenth). */
export function formatBoostWad(wad: string | null): string {
  if (wad === null || !/^\d+$/.test(wad)) return "—"
  const tenths = (BigInt(wad) * 10n + 5n * 10n ** 17n) / 10n ** 18n
  return `${tenths / 10n}.${tenths % 10n}×`
}
