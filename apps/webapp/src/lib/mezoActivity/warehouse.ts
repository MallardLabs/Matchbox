import {
  ACTIVITY_EVENT_FIELDS,
  activityEventRowSchema,
  mapActivityEventRow,
} from "@/lib/mezoActivity/activityEvent"
import type { SourceOptions } from "@/lib/mezoActivity/dataSources"
import { sortActivityDesc } from "@/lib/mezoActivity/normalize"
import {
  type IndexedThrough,
  PROJECTION_CHECKPOINT_QUERY,
  WAREHOUSE_NETWORK,
  type WarehouseQuery,
  parseIndexedThrough,
  queryWarehouseBatch,
  sqlParams,
} from "@/lib/warehouse"
import type { MezoActivityItem } from "@/types/mezoActivity"

const BOOLEAN_FIELDS: ReadonlySet<string> = new Set([
  "prevIsPermanent",
  "postIsPermanent",
  "mergeDestPrevIsPermanent",
])

function columnFor(field: string): string {
  return `"${field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}"`
}

// Fields the warehouse fills where the explorer left null, by action type
// (docs/goldsky-exit.md, "Enrichments"). Classic reads them as null, as it did
// from the explorer: claim drawers label a tokenId as a veMEZO lock, but pool
// and validator claims are veBTC locks.
const ENRICHED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  tokenId: ["VOTE_BRIBE_CLAIMED", "VOTE_FEE_CLAIMED"],
  epochStart: ["INCENTIVE_ADDED"],
}

function selectFor(field: string): string {
  const column = columnFor(field)
  if (BOOLEAN_FIELDS.has(field)) return `${column} AS "${field}"`
  const enrichedFor = ENRICHED_FIELDS[field]
  if (enrichedFor) {
    const types = enrichedFor.map((type) => `'${type}'`).join(", ")
    return `CASE WHEN "action_type" IN (${types}) THEN NULL ELSE ${column}::text END AS "${field}"`
  }
  return `${column}::text AS "${field}"`
}

// matchbox.activity_events columns are the snake_case explorer fields. Cast
// everything but booleans to text so rows match the explorer's strings.
const ACTIVITY_SELECT = ACTIVITY_EVENT_FIELDS.map(selectFor).join(", ")

/**
 * The explorer activity query in SQL. Actor scope matches the actor or the
 * recipient, like the explorer's two merged queries. Order is total
 * (timestamp, block, log index, id) so offset paging is stable. Only rows
 * the explorer would have produced (explorer_parity) are read: the
 * warehouse-only ones (voter bribe claims, voter rows before block
 * 7,739,500) serve Matchbox Pro.
 */
export function buildActivityQuery(options: SourceOptions): WarehouseQuery {
  const { params, add } = sqlParams()
  const where = [
    `"network" = ${add(WAREHOUSE_NETWORK)}`,
    `"explorer_parity"`,
    `"timestamp" >= ${add(String(Math.trunc(options.fromTimestamp)))}`,
    `"timestamp" <= ${add(String(Math.trunc(options.toTimestamp)))}`,
  ]
  if (options.actionTypes && options.actionTypes.length > 0) {
    where.push(`"action_type" = ANY(${add(options.actionTypes)}::text[])`)
  }
  if (options.actor) {
    const actor = add(options.actor.toLowerCase())
    where.push(`("actor" = ${actor} OR "recipient" = ${actor})`)
  }
  if (options.recipient) {
    where.push(`"recipient" = ${add(options.recipient.toLowerCase())}`)
  }
  if (options.gauge) {
    where.push(`"gauge" = ${add(options.gauge.toLowerCase())}`)
  }
  if (options.source) {
    where.push(`"source" = ${add(options.source)}`)
  }
  const direction = options.orderDirection === "asc" ? "ASC" : "DESC"
  const limit = Math.max(Math.trunc(options.limit), 0)
  const offset = Math.max(Math.trunc(options.page), 0) * limit
  const text = `SELECT ${ACTIVITY_SELECT}
    FROM matchbox.activity_events
    WHERE ${where.join(" AND ")}
    ORDER BY "timestamp" ${direction}, "block_number" ${direction},
      "log_index" ${direction}, "id" COLLATE "C" ${direction}
    LIMIT ${add(limit + 1)} OFFSET ${add(offset)}`
  return { text, params }
}

export function mapWarehouseRows(
  rows: Record<string, unknown>[],
): MezoActivityItem[] {
  const items: MezoActivityItem[] = []
  for (const row of rows) {
    const item = mapActivityEventRow(
      activityEventRowSchema.parse(row),
      "rpcLogs",
    )
    if (item) items.push(item)
  }
  return items
}

export type WarehouseActivityResult = {
  data: MezoActivityItem[]
  hasMore: boolean
  indexedThrough: IndexedThrough | undefined
}

export async function fetchWarehouseActivity(
  options: SourceOptions,
): Promise<WarehouseActivityResult> {
  const query = buildActivityQuery(options)
  const [rows = [], checkpoint = []] = await queryWarehouseBatch([
    query,
    PROJECTION_CHECKPOINT_QUERY,
  ])
  const limit = Math.max(Math.trunc(options.limit), 0)
  const page = mapWarehouseRows(rows.slice(0, limit))
  // Same in-page order as the explorer path; SQL order already decides which
  // rows are on the page.
  const sorted = sortActivityDesc(page)
  return {
    data: options.orderDirection === "asc" ? sorted.reverse() : sorted,
    hasMore: rows.length > limit,
    indexedThrough: parseIndexedThrough(checkpoint),
  }
}
