import { useMemo, useSyncExternalStore } from "react"

export const DESKTOP_QUERY = "(min-width: 1280px)"
export const TABLET_UP_QUERY = "(min-width: 768px)"

function subscribeMedia(query: string) {
  return (onChange: () => void) => {
    const media = window.matchMedia(query)
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useMemo(() => subscribeMedia(query), [query])
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}
