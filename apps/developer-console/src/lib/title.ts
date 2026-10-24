import { useEffect } from "react"

const suffix = "Matchbox Developer"

/** Sets `document.title` for the current route. */
export function useTitle(title: string | null): void {
  useEffect(() => {
    document.title = title === null ? suffix : `${title} · ${suffix}`
  }, [title])
}
