import { useQuery } from "@tanstack/react-query"

// The semester window the /academy leaderboard should display, resolved by the
// discord-link edge function's `current-semester` action (the discord_semesters
// table is service-role only, so it's read through the function). `null` means
// "no semester defined / unavailable" — the leaderboard falls back to its rolling
// last-8-epoch window in that case.
export type AcademySemester = {
  semesterId: string
  label: string
  fromTs: number
  toTs: number
  isCurrent: boolean
} | null

const FUNCTIONS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/discord-link`
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
const STORAGE_KEY = "mezo-academy-semester-v1"
const STORAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000

// Cache the resolved window so the leaderboard hook can read it synchronously for
// its initialData (avoids a rolling→semester flash on repeat visits).
function readStored(): AcademySemester | undefined {
  if (typeof window === "undefined") return undefined
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as {
      savedAt: number
      semester: AcademySemester
    }
    if (!parsed.savedAt || Date.now() - parsed.savedAt > STORAGE_MAX_AGE_MS) {
      return undefined
    }
    return parsed.semester
  } catch {
    return undefined
  }
}

function writeStored(semester: AcademySemester) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ savedAt: Date.now(), semester }),
    )
  } catch {
    // Ignore quota/private-mode failures.
  }
}

export function useAcademySemester() {
  return useQuery<AcademySemester>({
    queryKey: ["academy-semester"],
    staleTime: 30 * 60 * 1000,
    initialData: readStored,
    // Never throw: a failure here means "no semester", which the leaderboard
    // treats as the rolling-window fallback.
    queryFn: async () => {
      try {
        const res = await fetch(`${FUNCTIONS_URL}?action=current-semester`, {
          headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        })
        const data = await res.json()
        const semester: AcademySemester = data?.success
          ? (data.semester ?? null)
          : null
        writeStored(semester)
        return semester
      } catch {
        return null
      }
    },
  })
}
