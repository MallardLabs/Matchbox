import { z } from "zod"
import { ACTIVITY_FIELDS, type ActivityField } from "./rows"

// Row-level comparison between matchbox.activity_events and the frozen
// matchbox-explorer subgraph. Used by scripts/parity.ts and the decoder
// fixture tests. Values compare as canonical strings: BigInt and numeric as
// base-10 text, Bytes and addresses as lowercase hex, booleans as
// "true"/"false", missing as null.

export const EXPLORER_340_URL =
  "https://api.goldsky.com/api/public/project_cmoiy2fc3z9sl01rk465n7poh/subgraphs/matchbox-explorer/3.4.0/gn"

export type CanonicalRow = Partial<Record<ActivityField, string | null>>

const scalar = z.union([z.string(), z.boolean(), z.number()]).nullable()

const explorerRowSchema = z.record(z.string(), scalar.optional())

const explorerPageSchema = z.object({
  data: z
    .object({ activityEvents: z.array(explorerRowSchema) })
    .nullable()
    .optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
})

export function canonicalValue(
  value: string | boolean | number | bigint | null | undefined,
): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === "boolean") return value ? "true" : "false"
  return String(value)
}

export function canonicalRow(
  source: Record<string, string | boolean | number | bigint | null | undefined>,
): CanonicalRow {
  const row: CanonicalRow = {}
  for (const [field] of ACTIVITY_FIELDS) {
    row[field] = canonicalValue(source[field])
  }
  return row
}

const SELECTION = ACTIVITY_FIELDS.map(([field]) => field).join(" ")

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function postQuery(
  endpoint: string,
  query: string,
  attempt = 0,
): Promise<z.infer<typeof explorerPageSchema>> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    })
    if (response.status === 429 || response.status >= 500) {
      throw new Error(`Explorer responded ${response.status}`)
    }
    const page = explorerPageSchema.parse(await response.json())
    if (page.errors?.length) {
      throw new Error(page.errors.map((error) => error.message).join("; "))
    }
    return page
  } catch (error) {
    if (attempt >= 5) throw error
    await sleep(1_000 * 2 ** attempt)
    return postQuery(endpoint, query, attempt + 1)
  }
}

// Every explorer row at or below `throughBlock`, paginated by id. Paced at
// about 4 requests a second.
export async function fetchExplorerRows(
  throughBlock: bigint,
  options: { endpoint?: string; where?: string } = {},
): Promise<CanonicalRow[]> {
  const endpoint = options.endpoint ?? EXPLORER_340_URL
  const extraWhere = options.where ? `, ${options.where}` : ""
  const rows: CanonicalRow[] = []
  let lastId = ""
  for (;;) {
    const query = `{ activityEvents(first: 1000, orderBy: id, orderDirection: asc,
      where: { id_gt: "${lastId}", blockNumber_lte: "${throughBlock}"${extraWhere} }) { ${SELECTION} } }`
    const page = await postQuery(endpoint, query)
    const batch = page.data?.activityEvents ?? []
    for (const raw of batch) rows.push(canonicalRow(raw))
    const last = rows[rows.length - 1]
    const id = last?.id
    if (batch.length < 1000 || id === undefined || id === null) break
    lastId = id
    await sleep(250)
  }
  return rows
}

export type FieldDiff = {
  id: string
  field: ActivityField
  explorer: string | null
  warehouse: string | null
}

export type ActionParity = {
  actionType: string
  explorer: number
  warehouse: number
  missingIds: string[]
  extraIds: string[]
  fieldDiffs: FieldDiff[]
}

export function compareRows(
  explorerRows: CanonicalRow[],
  warehouseRows: CanonicalRow[],
): ActionParity[] {
  const byType = new Map<string, ActionParity>()
  function entry(actionType: string): ActionParity {
    let parity = byType.get(actionType)
    if (parity === undefined) {
      parity = {
        actionType,
        explorer: 0,
        warehouse: 0,
        missingIds: [],
        extraIds: [],
        fieldDiffs: [],
      }
      byType.set(actionType, parity)
    }
    return parity
  }

  const warehouseById = new Map<string, CanonicalRow>()
  for (const row of warehouseRows) {
    if (row.id === undefined || row.id === null) continue
    warehouseById.set(row.id, row)
    entry(row.actionType ?? "?").warehouse += 1
  }
  const seen = new Set<string>()
  for (const row of explorerRows) {
    if (row.id === undefined || row.id === null) continue
    seen.add(row.id)
    const parity = entry(row.actionType ?? "?")
    parity.explorer += 1
    const ours = warehouseById.get(row.id)
    if (ours === undefined) {
      parity.missingIds.push(row.id)
      continue
    }
    for (const [field] of ACTIVITY_FIELDS) {
      const theirs = row[field] ?? null
      const mine = ours[field] ?? null
      if (theirs !== mine) {
        parity.fieldDiffs.push({
          id: row.id,
          field,
          explorer: theirs,
          warehouse: mine,
        })
      }
    }
  }
  for (const row of warehouseRows) {
    if (row.id !== undefined && row.id !== null && !seen.has(row.id)) {
      entry(row.actionType ?? "?").extraIds.push(row.id)
    }
  }
  return [...byType.values()].sort((a, b) =>
    a.actionType.localeCompare(b.actionType),
  )
}
