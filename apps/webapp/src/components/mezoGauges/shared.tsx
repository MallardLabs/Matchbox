export const GAUGE_COLORS = [
  "#F7931A",
  "#4C9AFF",
  "#7C5CFC",
  "#2ECC9A",
  "#E35D5D",
  "#8C8C8C",
] as const

export function gaugeColor(index: number): string {
  return GAUGE_COLORS[index % GAUGE_COLORS.length] ?? "#8C8C8C"
}

export function formatCompactUsd(usd: string | null | undefined): string {
  if (usd === null || usd === undefined) return "—"
  const value = Number(usd)
  if (!Number.isFinite(value)) return "—"
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatCompactNumber(value: bigint, decimals = 18): string {
  const divisor = 10n ** BigInt(decimals)
  const num = Number(value) / Number(divisor)
  if (!Number.isFinite(num)) return "—"
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(num)
}

/** Signed delta line: "+1.23%" / "−0.40%" / "0.00%". */
export function Delta({
  diffBps,
  label,
}: {
  diffBps: bigint | null
  label: string
}): JSX.Element {
  if (diffBps === null) {
    return (
      <span className="text-2xs text-[var(--content-tertiary)]">
        {label}: —
      </span>
    )
  }
  const sign = diffBps > 0n ? "+" : diffBps < 0n ? "−" : ""
  const abs = diffBps < 0n ? -diffBps : diffBps
  const whole = abs / 100n
  const frac = (abs % 100n).toString().padStart(2, "0")
  const color =
    diffBps === 0n
      ? "text-[var(--content-tertiary)]"
      : diffBps > 0n
        ? "text-[var(--positive)]"
        : "text-[var(--negative)]"
  return (
    <span className={`text-2xs ${color}`}>
      {label}: {sign}
      {whole}.{frac}%
    </span>
  )
}

export function CountDelta({
  diff,
  label,
}: {
  diff: number | null
  label: string
}): JSX.Element {
  if (diff === null) {
    return (
      <span className="text-2xs text-[var(--content-tertiary)]">
        {label}: —
      </span>
    )
  }
  const color =
    diff === 0
      ? "text-[var(--content-tertiary)]"
      : diff > 0
        ? "text-[var(--positive)]"
        : "text-[var(--negative)]"
  return (
    <span className={`text-2xs ${color}`}>
      {label}: {diff > 0 ? "+" : "−"}
      {Math.abs(diff)}
    </span>
  )
}

export function SectionError({
  message,
}: {
  message: string
}): JSX.Element {
  return (
    <p className="text-sm text-[var(--negative)]" role="alert">
      {message}
    </p>
  )
}
