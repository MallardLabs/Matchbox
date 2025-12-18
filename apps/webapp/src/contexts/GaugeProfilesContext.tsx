import { type GaugeProfile, supabase } from "@/config/supabase"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { Address } from "viem"

type GaugeProfilesContextValue = {
  profiles: Map<string, GaugeProfile>
  isLoading: boolean
  getProfile: (address: Address | undefined) => GaugeProfile | undefined
  refetch: () => Promise<void>
}

const GaugeProfilesContext = createContext<GaugeProfilesContextValue | null>(
  null,
)

// Cache TTL of 5 minutes - profiles don't change frequently
const CACHE_TTL = 5 * 60 * 1000

// Module-level singleton to prevent multiple fetches across provider remounts
let globalProfiles: Map<string, GaugeProfile> = new Map()
let globalLastFetch = 0
let globalFetchPromise: Promise<void> | null = null

export function GaugeProfilesProvider({
  children,
}: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<Map<string, GaugeProfile>>(
    () => globalProfiles,
  )
  const [isLoading, setIsLoading] = useState(globalProfiles.size === 0)
  const mountedRef = useRef(true)

  const fetchProfiles = useCallback(async (force = false) => {
    const now = Date.now()

    // Return cached data if still valid and not forcing refresh
    if (
      !force &&
      globalProfiles.size > 0 &&
      now - globalLastFetch < CACHE_TTL
    ) {
      if (mountedRef.current) {
        setProfiles(new Map(globalProfiles))
        setIsLoading(false)
      }
      return
    }

    // If there's already a fetch in progress, wait for it
    if (globalFetchPromise) {
      await globalFetchPromise
      if (mountedRef.current) {
        setProfiles(new Map(globalProfiles))
        setIsLoading(false)
      }
      return
    }

    // Start a new fetch
    setIsLoading(true)

    globalFetchPromise = (async () => {
      try {
        const { data, error } = await supabase
          .from("gauge_profiles")
          .select("*")

        if (error) {
          console.error("Error fetching gauge profiles:", error)
          return
        }

        const profileMap = new Map<string, GaugeProfile>()
        for (const profile of (data as unknown as GaugeProfile[]) ?? []) {
          profileMap.set(profile.gauge_address.toLowerCase(), profile)
        }

        globalProfiles = profileMap
        globalLastFetch = Date.now()

        if (mountedRef.current) {
          setProfiles(new Map(profileMap))
        }
      } finally {
        globalFetchPromise = null
        if (mountedRef.current) {
          setIsLoading(false)
        }
      }
    })()

    await globalFetchPromise
  }, [])

  useEffect(() => {
    mountedRef.current = true
    fetchProfiles()

    return () => {
      mountedRef.current = false
    }
  }, [fetchProfiles])

  const getProfile = useCallback(
    (address: Address | undefined): GaugeProfile | undefined => {
      if (!address) return undefined
      return profiles.get(address.toLowerCase())
    },
    [profiles],
  )

  const refetch = useCallback(async () => {
    await fetchProfiles(true)
  }, [fetchProfiles])

  const value = useMemo(
    () => ({
      profiles,
      isLoading,
      getProfile,
      refetch,
    }),
    [profiles, isLoading, getProfile, refetch],
  )

  return (
    <GaugeProfilesContext.Provider value={value}>
      {children}
    </GaugeProfilesContext.Provider>
  )
}

export function useGaugeProfilesContext() {
  const context = useContext(GaugeProfilesContext)
  if (!context) {
    throw new Error(
      "useGaugeProfilesContext must be used within GaugeProfilesProvider",
    )
  }
  return context
}

// Convenience hook for getting a single profile
export function useGaugeProfileFromContext(gaugeAddress: Address | undefined) {
  const { getProfile, isLoading } = useGaugeProfilesContext()
  const profile = useMemo(
    () => getProfile(gaugeAddress),
    [getProfile, gaugeAddress],
  )
  return { profile, isLoading }
}

// Convenience hook for getting all profiles (map)
export function useAllGaugeProfilesFromContext() {
  const { profiles, isLoading, refetch } = useGaugeProfilesContext()
  return { profiles, isLoading, refetch }
}
