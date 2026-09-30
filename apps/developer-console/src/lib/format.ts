/** Display formatting. Missing values render as an em dash. */

export const dash = "—"

const dateTime = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

const dateOnly = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
})

const integer = new Intl.NumberFormat("en")

const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
})

export function formatDateTime(value: string | null): string {
  if (value === null) return dash
  return dateTime.format(new Date(value))
}

export function formatDate(value: string | null): string {
  if (value === null) return dash
  // Date-only strings are calendar dates, not UTC midnight.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value)
  return dateOnly.format(date)
}

export function formatInteger(value: number | null): string {
  return value === null ? dash : integer.format(value)
}

export function formatCompact(value: number | null): string {
  return value === null ? dash : compact.format(value)
}

export function formatPercent(value: number | null): string {
  if (value === null) return dash
  const percent = value * 100
  return `${percent < 10 ? percent.toFixed(2) : percent.toFixed(1)}%`
}

export function formatLatency(value: number | null): string {
  if (value === null) return dash
  return value >= 1000
    ? `${(value / 1000).toFixed(2)} s`
    : `${Math.round(value)} ms`
}

const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
]

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

export function formatRelative(value: string | null, now = Date.now()): string {
  if (value === null) return dash
  const seconds = (Date.parse(value) - now) / 1000
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return relative.format(Math.round(seconds / size), unit)
    }
  }
  return "just now"
}

const acronyms: Record<string, string> = {
  api: "API",
  oauth: "OAuth",
  id: "ID",
}

/** "api-key-created" -> "API key created" */
export function humanize(value: string): string {
  const words = value.split(/[-_]/).map((word) => acronyms[word] ?? word)
  const text = words.join(" ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}
