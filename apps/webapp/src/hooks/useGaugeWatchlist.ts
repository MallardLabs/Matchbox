import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "matchbox-gauge-watchlist"
const WATCHLIST_EVENT = "matchbox-gauge-watchlist-change"

function normalizeGaugeAddress(address: string): string {
  return address.toLowerCase()
}

function readWatchlist(): Set<string> {
  if (typeof window === "undefined") return new Set()

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return new Set()

    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return new Set()

    return new Set(
      parsed
        .filter((value): value is string => typeof value === "string")
        .map(normalizeGaugeAddress),
    )
  } catch {
    return new Set()
  }
}

function writeWatchlist(watchlist: Set<string>): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...watchlist]))
  window.dispatchEvent(new Event(WATCHLIST_EVENT))
}

export function useGaugeWatchlist(): {
  watchedGaugeAddresses: ReadonlySet<string>
  isWatching: (address: string) => boolean
  toggleWatching: (address: string) => void
} {
  const [watchedGaugeAddresses, setWatchedGaugeAddresses] = useState<
    Set<string>
  >(new Set())

  useEffect(() => {
    const refresh = () => setWatchedGaugeAddresses(readWatchlist())

    refresh()
    window.addEventListener("storage", refresh)
    window.addEventListener(WATCHLIST_EVENT, refresh)

    return () => {
      window.removeEventListener("storage", refresh)
      window.removeEventListener(WATCHLIST_EVENT, refresh)
    }
  }, [])

  const isWatching = useCallback(
    (address: string) =>
      watchedGaugeAddresses.has(normalizeGaugeAddress(address)),
    [watchedGaugeAddresses],
  )

  const toggleWatching = useCallback((address: string) => {
    const normalizedAddress = normalizeGaugeAddress(address)
    const next = readWatchlist()

    if (next.has(normalizedAddress)) {
      next.delete(normalizedAddress)
    } else {
      next.add(normalizedAddress)
    }

    writeWatchlist(next)
  }, [])

  return { watchedGaugeAddresses, isWatching, toggleWatching }
}
