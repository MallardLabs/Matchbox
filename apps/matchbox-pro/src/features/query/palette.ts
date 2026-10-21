// Palette model (frames 12 / 12b): deterministic hits for pages, gauges,
// locks and actions, plus "Ask Stuart" rows. Navigation never waits on Stuart.

export const PALETTE_GROUPS = [
  "Go to",
  "Gauges",
  "Locks",
  "Actions",
  "Ask Stuart",
] as const

export type PaletteGroup = (typeof PALETTE_GROUPS)[number]

export type PaletteIcon =
  | "overview"
  | "vote"
  | "rewards"
  | "activity"
  | "gauge"
  | "lock"
  | "optimize"
  | "ballot"
  | "claim"
  | "connect"
  | "stuart"

export type PaletteItem = {
  id: string
  group: PaletteGroup
  label: string
  detail?: string | undefined
  icon: PaletteIcon
  /** Navigate here on select. */
  to?: string | undefined
  /** Ask Stuart this on select. */
  question?: string | undefined
  action?: "connect" | undefined
  disabled?: boolean | undefined
  /** Extra words that should match (aliases, ids). */
  keywords?: string | undefined
}

const IDLE_LIMITS: Partial<Record<PaletteGroup, number>> = {
  Gauges: 3,
  Locks: 3,
  "Ask Stuart": 2,
}

const QUERY_LIMITS: Partial<Record<PaletteGroup, number>> = {
  Gauges: 6,
  Locks: 4,
  "Ask Stuart": 3,
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}#/ ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Natural-language questions go to Stuart first. */
export function isStuartQuestion(query: string): boolean {
  const q = query.trim()
  const words = q.split(/\s+/).filter((word) => /\w/.test(word))
  return q.endsWith("?") || words.length >= 3
}

function matches(item: PaletteItem, query: string, question: boolean): boolean {
  const q = normalize(query)
  if (q.length === 0) return true
  const haystack = normalize(
    `${item.label} ${item.detail ?? ""} ${item.keywords ?? ""}`,
  )
  if (haystack.includes(q)) return true
  if (q.split(" ").every((word) => haystack.includes(word))) return true
  // A question names pages and gauges; offer them alongside the answer.
  const label = normalize(item.label)
  return question && label.length >= 3 && q.includes(label)
}

/** "why is stackbridge apy down" → "Why is stackbridge apy down?" */
export function questionText(query: string): string {
  const trimmed = query.trim().replace(/\s+/g, " ")
  if (trimmed.length === 0) return ""
  const first = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  return isStuartQuestion(first) && !/[?.!]$/.test(first) ? `${first}?` : first
}

export type StuartRowsInput = {
  query: string
  suggestions: readonly string[]
}

/** "Ask Stuart" rows: the typed question (or the suggestion it matches) first. */
export function stuartRows({
  query,
  suggestions,
}: StuartRowsInput): PaletteItem[] {
  const q = normalize(query)
  const toItem = (text: string, index: number): PaletteItem => ({
    id: `ask-${index}-${normalize(text).replace(/ /g, "-")}`,
    group: "Ask Stuart",
    label: text,
    detail: "Ask",
    icon: "stuart",
    question: text,
  })
  if (q.length === 0) {
    return suggestions.slice(0, IDLE_LIMITS["Ask Stuart"]).map(toItem)
  }
  const exact = suggestions.find((text) => normalize(text) === q)
  const related = suggestions.filter((text) => {
    if (text === exact) return false
    const words = q.split(" ").filter((word) => word.length >= 4)
    const target = normalize(text)
    return words.some((word) => target.includes(word))
  })
  const typed = exact ?? questionText(query)
  const rest =
    related.length > 0
      ? related
      : suggestions.filter((text) => text !== exact).slice(0, 1)
  return [typed, ...rest].slice(0, QUERY_LIMITS["Ask Stuart"]).map(toItem)
}

/** Filters, caps per group, and orders rows by group. */
export function rankPalette(
  query: string,
  catalog: readonly PaletteItem[],
  askRows: readonly PaletteItem[],
): PaletteItem[] {
  const idle = query.trim().length === 0
  const question = !idle && isStuartQuestion(query)
  const limits = idle ? IDLE_LIMITS : QUERY_LIMITS
  const hits = catalog.filter((item) => matches(item, query, question))
  return PALETTE_GROUPS.flatMap((group) => {
    if (group === "Ask Stuart") return [...askRows]
    const rows = hits.filter((item) => item.group === group)
    const limit = limits[group]
    return limit === undefined ? rows : rows.slice(0, limit)
  })
}

/**
 * Row the keyboard lands on: a question lands on its Stuart row (frame 12b),
 * a lookup on the first hit.
 */
export function defaultActiveIndex(
  rows: readonly PaletteItem[],
  query: string,
): number {
  const question = query.trim().length > 0 && isStuartQuestion(query)
  if (question) {
    const ask = rows.findIndex(
      (row) => row.group === "Ask Stuart" && !row.disabled,
    )
    if (ask >= 0) return ask
  }
  const index = rows.findIndex((row) => !row.disabled)
  return index < 0 ? 0 : index
}

export function stepActive(
  rows: readonly PaletteItem[],
  current: number,
  direction: 1 | -1,
): number {
  if (rows.length === 0) return 0
  for (let step = 1; step <= rows.length; step += 1) {
    const next = (current + direction * step + rows.length * 2) % rows.length
    if (!rows[next]?.disabled) return next
  }
  return current
}
