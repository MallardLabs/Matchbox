import { ACTIVITY_FIELDS, type ActivityField } from "./rows"

// Row-level comparison between matchbox.activity_events rows and explorer
// rows. The decoder fixture tests compare against rows recorded from
// matchbox-explorer 3.4.0, which was deleted from Goldsky on 2026-10-25, so
// the live parity run is gone. Values compare as canonical strings: BigInt
// and numeric as base-10 text, Bytes and addresses as lowercase hex,
// booleans as "true"/"false", missing as null.

export type CanonicalRow = Partial<Record<ActivityField, string | null>>

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
  // Fields the warehouse filled where the explorer left null (ENRICHMENTS).
  enriched: number
}

// Intended differences: fields the warehouse fills where the explorer left
// null (docs/goldsky-exit.md). Any other value, or a non-null explorer value
// that differs, is still a field difference.
const ENRICHMENTS: ReadonlyArray<{
  field: ActivityField
  actionTypes: ReadonlySet<string>
}> = [
  // The claimed lock, from a claim call sent straight to a voter.
  {
    field: "tokenId",
    actionTypes: new Set(["VOTE_BRIBE_CLAIMED", "VOTE_FEE_CLAIMED"]),
  },
  // The epoch the incentive was deposited for.
  { field: "epochStart", actionTypes: new Set(["INCENTIVE_ADDED"]) },
]

export function isEnrichment(
  actionType: string,
  field: ActivityField,
  explorer: string | null,
): boolean {
  return (
    explorer === null &&
    ENRICHMENTS.some(
      (enrichment) =>
        enrichment.field === field && enrichment.actionTypes.has(actionType),
    )
  )
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
        enriched: 0,
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
      if (theirs === mine) continue
      if (isEnrichment(parity.actionType, field, theirs)) {
        parity.enriched += 1
      } else {
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
