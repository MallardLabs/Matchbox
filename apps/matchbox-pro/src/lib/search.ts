export type SearchHit = {
  id: string
  group: "Go to" | "Gauges" | "Actions"
  label: string
  detail?: string | undefined
  to?: string | undefined
}

export const SEARCH_GROUPS = ["Go to", "Gauges", "Actions"] as const

const IDLE_GAUGE_LIMIT = 3
const QUERY_GAUGE_LIMIT = 8

export function filterSearchHits(
  query: string,
  items: SearchHit[],
): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (q.length === 0) return items
  const question = isStuartQuestion(q)
  return items.filter((item) => {
    const haystack =
      `${item.label} ${item.detail ?? ""} ${item.id}`.toLowerCase()
    // A question can't be answered, but the pages and gauges it names can be.
    return (
      haystack.includes(q) || (question && q.includes(item.label.toLowerCase()))
    )
  })
}

/** Filters the catalog, caps the gauge list, and orders hits by group. */
export function rankSearchHits(query: string, items: SearchHit[]): SearchHit[] {
  const matches = filterSearchHits(query, items)
  const gaugeLimit =
    query.trim().length === 0 ? IDLE_GAUGE_LIMIT : QUERY_GAUGE_LIMIT
  return SEARCH_GROUPS.flatMap((group) => {
    const rows = matches.filter((item) => item.group === group)
    return group === "Gauges" ? rows.slice(0, gaugeLimit) : rows
  })
}

/** Natural-language questions go to Stuart, which is off in Preview. */
export function isStuartQuestion(query: string): boolean {
  const q = query.trim()
  const words = q.split(/\s+/).filter((word) => /\w/.test(word))
  return q.endsWith("?") || words.length >= 3
}

export function activateSearchHit(item: SearchHit): {
  to?: string
  action?: "connect"
} {
  if (item.id === "connect") return { action: "connect" }
  if (item.to) return { to: item.to }
  return {}
}
