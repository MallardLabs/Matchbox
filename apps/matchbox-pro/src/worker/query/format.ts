import type { TokenAmount } from "../../features/query/contract"
import { formatMicroUsd, formatTokenAmountDigits } from "../../lib/money"

// Every user-visible number Stuart prints comes through these helpers, so a
// fact's `display` string is byte-identical wherever it appears.

const MINUS = "−"

function groupThousands(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/** Micro-USD bigint → contract `usd6` string ("-2.100000"). */
export function usd6(micro: bigint): string {
  const negative = micro < 0n
  const absolute = negative ? -micro : micro
  const whole = absolute / 1_000_000n
  const fraction = (absolute % 1_000_000n).toString().padStart(6, "0")
  return `${negative ? "-" : ""}${whole}.${fraction}`
}

/** Contract `usd6` string → micro-USD bigint. */
export function microFromUsd6(value: string): bigint {
  const negative = value.startsWith("-")
  const [whole = "0", fraction = ""] = value.replace(/^-/, "").split(".")
  const micro = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"))
  return negative ? -micro : micro
}

export function displayUsd(micro: bigint | null): string {
  if (micro === null) return "Unpriced"
  if (micro < 0n) return `${MINUS}${formatMicroUsd(-micro)}`
  return formatMicroUsd(micro)
}

export function displaySignedUsd(micro: bigint): string {
  if (micro < 0n) return `${MINUS}${formatMicroUsd(-micro)}`
  return `+${formatMicroUsd(micro)}`
}

export function tokenAmount(
  raw: bigint,
  decimals: number,
  symbol: string,
): TokenAmount {
  return {
    raw: (raw < 0n ? 0n : raw).toString(),
    decimals,
    symbol: symbol.slice(0, 16) || "TOKEN",
  }
}

export function displayToken(amount: TokenAmount, fractionDigits = 2): string {
  return `${formatTokenAmountDigits(
    BigInt(amount.raw),
    amount.decimals,
    fractionDigits,
  )} ${amount.symbol}`
}

/** Allocation basis points → "42%", "42.5%", "33.33%". */
export function displayBps(bps: number): string {
  const sign = bps < 0 ? MINUS : ""
  const absolute = Math.abs(bps)
  const whole = Math.trunc(absolute / 100)
  const fraction = (absolute % 100)
    .toString()
    .padStart(2, "0")
    .replace(/0+$/, "")
  return `${sign}${groupThousands(BigInt(whole))}${fraction ? `.${fraction}` : ""}%`
}

/** Ratio basis points with fixed two decimals → "294.77%". */
export function displayRatioBps(bps: number): string {
  const whole = Math.trunc(bps / 100)
  const fraction = (bps % 100).toString().padStart(2, "0")
  return `${groupThousands(BigInt(whole))}.${fraction}%`
}

export function displayBlock(block: bigint): string {
  return groupThousands(block)
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

// Untrusted profile text is clipped before it reaches answer text so a long
// name can't crowd out the numbers.
export function clipName(name: string, max = 32): string {
  const clean = name.replace(/\s+/g, " ").trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

export function listWithAnd(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ""
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`
}
