import { useSyncExternalStore } from "react"
import { z } from "zod"

const STORAGE_KEY = "matchbox-gauge-watchlist"
const WATCHLIST_EVENT = "matchbox-gauge-watchlist-change"
const watchlistSchema = z.array(z.string())

let snapshot: { raw: string | null; set: ReadonlySet<string> } = {
  raw: null,
  set: new Set(),
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function parse(raw: string | null): ReadonlySet<string> {
  if (!raw) return new Set()
  try {
    const parsed = watchlistSchema.safeParse(JSON.parse(raw))
    return new Set(
      parsed.success ? parsed.data.map((value) => value.toLowerCase()) : [],
    )
  } catch {
    return new Set()
  }
}

function getSnapshot(): ReadonlySet<string> {
  const raw = readRaw()
  if (raw !== snapshot.raw) snapshot = { raw, set: parse(raw) }
  return snapshot.set
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange)
  window.addEventListener(WATCHLIST_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(WATCHLIST_EVENT, onChange)
  }
}

function toggleWatching(address: string): void {
  const next = new Set(getSnapshot())
  const key = address.toLowerCase()
  if (next.has(key)) next.delete(key)
  else next.add(key)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
  } catch {
    return
  }
  window.dispatchEvent(new Event(WATCHLIST_EVENT))
}

export function useGaugeWatchlist(): {
  watchedGaugeAddresses: ReadonlySet<string>
  isWatching: (address: string) => boolean
  toggleWatching: (address: string) => void
} {
  const watchedGaugeAddresses = useSyncExternalStore(subscribe, getSnapshot)
  return {
    watchedGaugeAddresses,
    isWatching: (address) => watchedGaugeAddresses.has(address.toLowerCase()),
    toggleWatching,
  }
}
