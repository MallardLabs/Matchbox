import { useQuery } from "@tanstack/react-query"

// One defined Academy season (window only; no Discord role needed here).
export type AcademySeason = {
  semesterId: string
  label: string
  fromTs: number
  toTs: number
  isCurrent: boolean
}

const FUNCTIONS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/discord-link`
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
const STORAGE_KEY = "mezo-academy-semesters-v1"
const STORAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000

// Cached so the season switcher + default selection are available synchronously
// on repeat visits (avoids a wrong-season flash before the list loads).
function readStored(): AcademySeason[] | undefined {
  if (typeof window === "undefined") return undefined
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as {
      savedAt: number
      seasons: AcademySeason[]
    }
    if (!parsed.savedAt || Date.now() - parsed.savedAt > STORAGE_MAX_AGE_MS) {
      return undefined
    }
    return parsed.seasons
  } catch {
    return undefined
  }
}

function writeStored(seasons: AcademySeason[]) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ savedAt: Date.now(), seasons }),
    )
  } catch {
    // Ignore quota/private-mode failures.
  }
}

// All defined Academy seasons, ordered by start. Returns [] on failure so the
// page can fall back to its rolling window.
export function useAcademySemesters() {
  return useQuery<AcademySeason[]>({
    queryKey: ["academy-semesters"],
    staleTime: 30 * 60 * 1000,
    initialData: readStored,
    queryFn: async () => {
      try {
        const res = await fetch(`${FUNCTIONS_URL}?action=semesters`, {
          headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        })
        const data = await res.json()
        const seasons: AcademySeason[] =
          data?.success && Array.isArray(data.semesters) ? data.semesters : []
        writeStored(seasons)
        return seasons
      } catch {
        return []
      }
    },
  })
}
