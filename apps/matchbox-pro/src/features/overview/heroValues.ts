import type { LiveValue } from "./earnings"

export type LocksState = "loading" | "error" | "empty" | "ready"

/**
 * Claimable for the hero. A wallet with no locks has nothing to claim, so
 * that reads $0.00 once the lock reads settle; a failed lock read stays
 * unknown rather than zero.
 */
export function claimableValue({
  locksState,
  sources,
}: {
  locksState: LocksState
  sources: { status: "loading" | "ready" | "error"; usdMicro: bigint }
}): LiveValue {
  if (locksState === "loading") return { status: "loading" }
  if (locksState === "error") return { status: "unavailable" }
  if (locksState === "empty") return { status: "none" }
  if (sources.status === "loading") return { status: "loading" }
  if (sources.status === "error") return { status: "unavailable" }
  return { status: "ready", usdMicro: sources.usdMicro }
}

/** Next epoch's projection; only veMEZO votes earn it today. */
export function projectedValue({
  locksState,
  veMezoLocks,
  isLoading,
  failed,
  usdMicro,
}: {
  locksState: LocksState
  veMezoLocks: number
  isLoading: boolean
  failed: boolean
  usdMicro: bigint
}): LiveValue {
  if (locksState === "loading") return { status: "loading" }
  if (locksState === "error") return { status: "unavailable" }
  if (veMezoLocks === 0) return { status: "none" }
  if (isLoading) return { status: "loading" }
  if (failed) return { status: "unavailable" }
  return { status: "ready", usdMicro }
}

/** Hero figure: `none` is a real zero; null while loading (skeleton). */
export function liveUsd(
  value: LiveValue,
  format: (usdMicro: bigint) => string,
): string | null {
  switch (value.status) {
    case "loading":
      return null
    case "unavailable":
      return "Unavailable"
    case "none":
      return format(0n)
    case "ready":
      return format(value.usdMicro)
  }
}
