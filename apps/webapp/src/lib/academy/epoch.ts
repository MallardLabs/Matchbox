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

export function enumerateEpochsForWindow(
  fromTs: number,
  toTs: number,
  opts: { includeOpenEpoch?: boolean } = {},
): number[] {
  const epochs = enumerateEpochs(fromTs, toTs)
  if (!opts.includeOpenEpoch) return epochs

  const openEpoch = snapToThursdayUTC(toTs, "down")
  if (toTs <= fromTs || openEpoch < fromTs || openEpoch === toTs) {
    return epochs
  }
  if (epochs[epochs.length - 1] === openEpoch) return epochs
  return [...epochs, openEpoch]
}

export function epochStartFor(ts: number): number {
  return snapToThursdayUTC(ts, "down")
}

/**
 * Resolve the points window for an API request. `from`/`to` are optional unix
 * seconds (used for fixed per-semester windows); both are snapped to epoch
 * boundaries. When absent, defaults to the rolling last-8-epoch window ending at
 * the most recent epoch boundary.
 */
export function resolveWindow(
  fromParam: string | null,
  toParam: string | null,
  now: number,
): { fromTs: number; toTs: number } {
  const toNum = toParam === null ? Number.NaN : Number(toParam)
  const fromNum = fromParam === null ? Number.NaN : Number(fromParam)
  const toTs = Number.isFinite(toNum)
    ? snapToThursdayUTC(toNum, "down")
    : snapToThursdayUTC(now, "down")
  const fromTs = Number.isFinite(fromNum)
    ? snapToThursdayUTC(fromNum, "down")
    : toTs - 8 * WEEK
  return { fromTs, toTs }
}
