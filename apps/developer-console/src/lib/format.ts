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

const monthDay = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
})

/** "Oct 18" (local calendar day). */
export function formatMonthDay(value: string | null): string {
  if (value === null) return dash
  return monthDay.format(new Date(value))
}

const clock = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
})

/** "Oct 19 · 14:22" (local time). */
export function formatMonthDayTime(value: string | null): string {
  if (value === null) return dash
  const date = new Date(value)
  return `${monthDay.format(date)} · ${clock.format(date)}`
}

/** Compact age: "now", "45s ago", "4m ago", "3h ago", "2d ago". */
export function formatAgo(seconds: number | null): string {
  if (seconds === null) return dash
  if (seconds < 5) return "now"
  if (seconds < 60) return `${Math.floor(seconds)}s ago`
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`
  return `${Math.floor(seconds / 86_400)}d ago`
}

/** "6h 12m", "12m", "45s" for a positive span. */
export function formatSpan(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3_600)
  const minutes = Math.floor((total % 3_600) / 60)
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return `${total}s`
}

/** Share of `total` as a bare percentage ("0.31"); dash without traffic. */
export function formatShare(part: number, total: number): string {
  if (total <= 0) return dash
  const percent = (part / total) * 100
  return percent < 10 ? percent.toFixed(2) : percent.toFixed(1)
}

/** Decimal strings (block numbers) with grouping: "4,128,440". */
export function formatDecimalString(value: string | null): string {
  if (value === null || !/^\d+$/.test(value)) return dash
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/** "https://www.example.com/path" → "example.com"; dash when absent. */
export function formatHost(url: string | null): string {
  if (url === null) return dash
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

/** "Alex Kim" → "Alex K."; single names stay whole. */
export function shortName(name: string | null): string {
  if (name === null || name.trim() === "") return dash
  const [first, ...rest] = name.trim().split(/\s+/)
  const last = rest.at(-1)
  return last === undefined ? (first ?? dash) : `${first} ${last[0]}.`
}
