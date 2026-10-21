import type { AllocationSnapshot } from "./optimize"

// Doc 05: material = any target moves by at least one percentage point, or
// projected epoch USD moves by at least 1%.
const MATERIAL_SHARE_BPS = 100
const MATERIAL_PROJECTED_BPS = 100n

export type AllocationDiffRow = {
  id: string
  wasBps: number
  nowBps: number
  deltaMicroUsd: bigint
}

export function diffAllocations(
  was: AllocationSnapshot,
  now: AllocationSnapshot,
): AllocationDiffRow[] {
  const rows = new Map<string, AllocationDiffRow>()
  for (const entry of was.entries) {
    rows.set(entry.id.toLowerCase(), {
      id: entry.id,
      wasBps: entry.bps,
      nowBps: 0,
      deltaMicroUsd: -entry.projectedMicroUsd,
    })
  }
  for (const entry of now.entries) {
    const key = entry.id.toLowerCase()
    const row = rows.get(key)
    rows.set(key, {
      id: row?.id ?? entry.id,
      wasBps: row?.wasBps ?? 0,
      nowBps: entry.bps,
      deltaMicroUsd: (row?.deltaMicroUsd ?? 0n) + entry.projectedMicroUsd,
    })
  }
  return [...rows.values()].sort(
    (a, b) => Math.max(b.wasBps, b.nowBps) - Math.max(a.wasBps, a.nowBps),
  )
}

export function isMaterialChange(
  was: AllocationSnapshot,
  now: AllocationSnapshot,
): boolean {
  if (
    diffAllocations(was, now).some(
      (row) => Math.abs(row.nowBps - row.wasBps) >= MATERIAL_SHARE_BPS,
    )
  ) {
    return true
  }
  const delta = now.projectedMicroUsd - was.projectedMicroUsd
  const magnitude = delta < 0n ? -delta : delta
  if (was.projectedMicroUsd <= 0n) return magnitude > 0n
  return magnitude * 10_000n >= MATERIAL_PROJECTED_BPS * was.projectedMicroUsd
}

/** Signed percent change in basis points, e.g. -270n for -2.7%. */
export function projectedChangeBps(
  was: AllocationSnapshot,
  now: AllocationSnapshot,
): bigint | null {
  if (was.projectedMicroUsd <= 0n) return null
  return (
    ((now.projectedMicroUsd - was.projectedMicroUsd) * 10_000n) /
    was.projectedMicroUsd
  )
}
