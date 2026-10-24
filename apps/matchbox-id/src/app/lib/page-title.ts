import { useEffect } from "react"

export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = title === "" ? "Matchbox ID" : `${title} · Matchbox ID`
  }, [title])
}
