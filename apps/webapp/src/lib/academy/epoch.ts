export const WEEK = 604_800

/**
 * Mezo gauge epochs end at Thursday 00:00 UTC. Unix epoch (1970-01-01) was a
 * Thursday, so `floor(ts / WEEK) * WEEK` already gives the Thursday-aligned
 * epoch start.
 */
export function snapToThursdayUTC(
  ts: number,
  dir: "down" | "up" = "down",
): number {
  if (!Number.isFinite(ts) || ts <= 0) return 0
  const down = Math.floor(ts / WEEK) * WEEK
  if (dir === "down") return down
  return down === ts ? ts : down + WEEK
}

export function enumerateEpochs(fromTs: number, toTs: number): number[] {
  const start = snapToThursdayUTC(fromTs, "down")
  const end = snapToThursdayUTC(toTs, "down")
  if (end < start) return []
  const out: number[] = []
  for (let t = start; t < end; t += WEEK) out.push(t)
  return out
}

export function epochStartFor(ts: number): number {
  return snapToThursdayUTC(ts, "down")
}
