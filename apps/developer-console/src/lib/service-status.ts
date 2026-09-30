import { useSyncExternalStore } from "react"

/** Set once any console API answers `503 service_disabled` (kill switch). */
let disabled = false
const listeners = new Set<() => void>()

export function markServiceDisabled(): void {
  if (disabled) return
  disabled = true
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function snapshot(): boolean {
  return disabled
}

export function useServiceDisabled(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
