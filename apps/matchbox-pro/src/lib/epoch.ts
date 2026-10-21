const WEEK_SECONDS = 604_800n

/**
 * Epoch 0 starts Thu 3 Sep 2026 00:00 UTC, the launch-cohort numbering Matchbox
 * Classic shows (apps/webapp `epochIndexFor`).
 */
export const LAUNCH_EPOCH_START = 1_788_393_600n

/** Display number for the epoch starting at `epochStart`; none before launch. */
export function epochNumberFor(epochStart: bigint | undefined): number | null {
  if (epochStart === undefined || epochStart < LAUNCH_EPOCH_START) return null
  return Number((epochStart - LAUNCH_EPOCH_START) / WEEK_SECONDS)
}

export function epochLabel(epochStart: bigint | undefined): string {
  const number = epochNumberFor(epochStart)
  return number === null ? "Epoch" : `Epoch ${number}`
}
