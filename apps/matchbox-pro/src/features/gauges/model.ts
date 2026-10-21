import type { GaugeEpochRow } from "@/features/history/useHistory"
import { epochNumberFor } from "@/lib/epoch"
import {
  decimalToScaledBigInt,
  formatApyBasisPoints,
  formatMicroUsd,
  tokenUsdMicroValue,
} from "@/lib/money"
import { calculateAnnualizedReturnBasisPoints } from "@/lib/rewardOptimizer"
import { referencePriceUsd } from "@/lib/tokenUsd"
import type { GaugeRewardToken } from "@/lib/topology"

function groupThousands(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/**
 * Native token amount to `significant` digits, rounded down so a balance is
 * never overstated. The whole part is always shown in full.
 */
export function formatNative(
  amount: bigint,
  decimals: number,
  significant = 6,
): string {
  if (amount <= 0n) return "0"
  const base = 10n ** BigInt(decimals)
  const whole = amount / base
  const fraction = amount % base
  let fractionDigits: number
  if (whole > 0n) {
    fractionDigits = Math.max(0, significant - whole.toString().length)
  } else {
    const leadingZeros = decimals - fraction.toString().length
    fractionDigits = leadingZeros + significant
  }
  fractionDigits = Math.min(fractionDigits, decimals)
  const shown = (fraction * 10n ** BigInt(fractionDigits)) / base
  const fractionText =
    fractionDigits > 0
      ? shown.toString().padStart(fractionDigits, "0").replace(/0+$/, "")
      : ""
  if (whole === 0n && fractionText === "") return "0"
  return fractionText
    ? `${groupThousands(whole)}.${fractionText}`
    : groupThousands(whole)
}

export type IncentiveRow = {
  tokenAddress: string
  symbol: string
  decimals: number
  amount: bigint
  /** Null when the token has no reference price. Never shown as $0. */
  usdMicro: bigint | null
}

export type EpochIncentives = {
  rows: IncentiveRow[]
  /** Sum of the priced rows; null when nothing is priced. */
  totalUsdMicro: bigint | null
  unpricedCount: number
}

export function epochIncentives(
  tokens: readonly GaugeRewardToken[],
  prices: { btcPriceUsd: string | null; mezoPriceUsd: string | null },
): EpochIncentives {
  const rows: IncentiveRow[] = []
  for (const token of tokens) {
    let amount: bigint
    try {
      amount = BigInt(token.epochAmount)
    } catch {
      continue
    }
    if (amount <= 0n) continue
    const price = referencePriceUsd({
      tokenAddress: token.tokenAddress,
      symbol: token.symbol,
      ...prices,
    })
    rows.push({
      tokenAddress: token.tokenAddress,
      symbol: token.symbol,
      decimals: token.decimals,
      amount,
      usdMicro: price
        ? tokenUsdMicroValue(amount, token.decimals, price)
        : null,
    })
  }
  const priced = rows.flatMap((row) =>
    row.usdMicro === null ? [] : [row.usdMicro],
  )
  return {
    rows,
    totalUsdMicro:
      priced.length > 0
        ? priced.reduce((total, value) => total + value, 0n)
        : rows.length === 0
          ? 0n
          : null,
    unpricedCount: rows.length - priced.length,
  }
}

/** Gauge APY in basis points: this epoch's incentives over the votes on it. */
export function gaugeApyBps(input: {
  incentivesUsdMicro: bigint | null
  veMezo: bigint
  mezoPriceUsd: string | null
}): bigint | null {
  if (!input.incentivesUsdMicro || !input.mezoPriceUsd) return null
  return calculateAnnualizedReturnBasisPoints({
    epochRewardMicroUsd: input.incentivesUsdMicro,
    votingPowers: [input.veMezo],
    assetPriceMicroUsd: decimalToScaledBigInt(input.mezoPriceUsd, 6),
  })
}

/** Share of the optimal veMEZO already voted, 0–1. */
export function optimalFraction(
  veMezo: bigint,
  optimal: bigint | undefined,
): number {
  if (!optimal || optimal <= 0n) return 0
  if (veMezo >= optimal) return 1
  return Number((veMezo * 10_000n) / optimal) / 10_000
}

export type AmountCheck =
  | { kind: "empty" }
  | { kind: "invalid"; message: string }
  | { kind: "insufficient"; atomic: bigint; message: string }
  | { kind: "ok"; atomic: bigint }

export function checkAmount(
  value: string,
  token: { decimals: number; symbol: string },
  balance: bigint | undefined,
): AmountCheck {
  const trimmed = value.trim().replaceAll(",", "")
  if (!trimmed) return { kind: "empty" }
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === ".") {
    return { kind: "invalid", message: "Invalid amount" }
  }
  const [whole = "", fraction = ""] = trimmed.split(".")
  if (fraction.length > token.decimals) {
    return { kind: "invalid", message: `Max ${token.decimals} decimals` }
  }
  const atomic =
    BigInt(whole || "0") * 10n ** BigInt(token.decimals) +
    BigInt(fraction.padEnd(token.decimals, "0") || "0")
  if (atomic <= 0n) return { kind: "invalid", message: "Enter an amount" }
  if (balance !== undefined && atomic > balance) {
    return {
      kind: "insufficient",
      atomic,
      message: `Insufficient ${token.symbol} balance`,
    }
  }
  return { kind: "ok", atomic }
}

/** Plain digits for the amount input (no grouping), trailing zeros dropped. */
export function amountInputValue(amount: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals)
  const whole = amount / base
  const fraction = (amount % base)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "")
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

/** USD total; "Unpriced" when nothing is priced, "+" when some lines aren't. */
export function usdLabel(value: bigint | null, unpricedCount = 0): string {
  if (value === null) return "Unpriced"
  return unpricedCount > 0 ? `${formatMicroUsd(value)}+` : formatMicroUsd(value)
}

/** Boost from a 1e18-scaled wad, to one decimal, capped display at 5×. */
export function formatBoostWad(wad: bigint): string {
  const tenths = (wad + 5n * 10n ** 16n) / 10n ** 17n
  if (tenths >= 50n) return "5×"
  return `${tenths / 10n}.${tenths % 10n}×`
}

const PRELAUNCH_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

/**
 * The app-wide epoch name, as Overview and Rewards show it: the protocol
 * number ("6"), or for epochs before launch their UTC start date ("Aug 27").
 */
export function epochRowLabel(epochStart: number | undefined): string {
  if (
    epochStart === undefined ||
    !Number.isFinite(epochStart) ||
    epochStart <= 0
  )
    return "Current"
  const number = epochNumberFor(BigInt(epochStart))
  return number === null
    ? PRELAUNCH_DATE.format(new Date(epochStart * 1000))
    : String(number)
}

export type EpochTableRow = {
  key: string
  label: string
  /** The live epoch, still moving. */
  current: boolean
  veMezo: string
  boost: string
  incentives: string
  apy: string
  apyKnown: boolean
}

function historyRow(row: GaugeEpochRow): EpochTableRow {
  // Sealed epochs are priced at earn; the current one at today's price.
  const unpriced = row.incentives.filter(
    (token) =>
      token.amount > 0n &&
      (row.status === "current" ? token.usdNowMicro : token.usdAtEarnMicro) ===
        null,
  ).length
  return {
    key: String(row.epochStart),
    label: epochRowLabel(row.epochStart),
    current: row.status === "current",
    veMezo: formatNative(row.veMezo, 18),
    boost: row.boostWad === null ? "—" : formatBoostWad(row.boostWad),
    incentives: usdLabel(row.incentivesUsdMicro, unpriced),
    apy: formatApyBasisPoints(row.apyBps),
    apyKnown: row.apyBps !== null,
  }
}

/**
 * Recent epochs, newest first. Sealed rows come from history; the current
 * epoch uses the page's live figures so it matches the stats above it.
 */
export function recentEpochRows(
  history: readonly GaugeEpochRow[] | undefined,
  live: EpochTableRow | undefined,
): EpochTableRow[] {
  const sealed = (history ?? [])
    .filter((row) => row.status === "sealed")
    .map(historyRow)
  const current =
    live ??
    (history ?? []).filter((row) => row.status === "current").map(historyRow)[0]
  return current ? [current, ...sealed] : sealed
}
