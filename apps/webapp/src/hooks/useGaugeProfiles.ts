import { type GaugeProfile, supabase } from "@/config/supabase"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Address } from "viem"

// Global cache for gauge profiles to avoid refetching
const profilesCache = new Map<string, GaugeProfile>()
let lastFetchTime = 0
const CACHE_TTL = 30000 // 30 seconds

export function useGaugeProfiles(gaugeAddresses: Address[]) {
  const [profiles, setProfiles] = useState<Map<string, GaugeProfile>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const fetchingRef = useRef(false)

  // Create a stable key for the addresses array to prevent unnecessary refetches
  const addressesKey = useMemo(
    () => gaugeAddresses.map((a) => a.toLowerCase()).sort().join(","),
    [gaugeAddresses],
  )

  const fetchProfiles = useCallback(async () => {
    if (gaugeAddresses.length === 0) {
      setProfiles(new Map())
      setIsLoading(false)
      return
    }

    // Check cache first
    const now = Date.now()
    const allCached = gaugeAddresses.every((a) =>
      profilesCache.has(a.toLowerCase()),
    )
    const cacheValid = now - lastFetchTime < CACHE_TTL

    if (allCached && cacheValid) {
      const cachedMap = new Map<string, GaugeProfile>()
      for (const addr of gaugeAddresses) {
        const cached = profilesCache.get(addr.toLowerCase())
        if (cached) {
          cachedMap.set(addr.toLowerCase(), cached)
        }
      }
      setProfiles(cachedMap)
      setIsLoading(false)
      return
    }

    // Prevent concurrent fetches
    if (fetchingRef.current) {
      return
    }
    fetchingRef.current = true
    setIsLoading(true)

    const { data, error } = await supabase
      .from("gauge_profiles")
      .select("*")
      .in(
        "gauge_address",
        gaugeAddresses.map((a) => a.toLowerCase()),
      )

    fetchingRef.current = false

    if (error) {
      console.error("Error fetching gauge profiles:", error)
      setIsLoading(false)
      return
    }

    const profileMap = new Map<string, GaugeProfile>()
    for (const profile of (data as unknown as GaugeProfile[]) ?? []) {
      profileMap.set(profile.gauge_address.toLowerCase(), profile)
      // Update global cache
      profilesCache.set(profile.gauge_address.toLowerCase(), profile)
    }
    lastFetchTime = Date.now()
    setProfiles(profileMap)
    setIsLoading(false)
  }, [addressesKey, gaugeAddresses])

  useEffect(() => {
    fetchProfiles()
  }, [fetchProfiles])

  return {
    profiles,
    isLoading,
    refetch: fetchProfiles,
  }
}

export function useGaugeProfile(gaugeAddress: Address | undefined) {
  const [profile, setProfile] = useState<GaugeProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchProfile = useCallback(async () => {
    if (!gaugeAddress) {
      setProfile(null)
      setIsLoading(false)
      return
    }

    // Check cache first
    const cached = profilesCache.get(gaugeAddress.toLowerCase())
    if (cached && Date.now() - lastFetchTime < CACHE_TTL) {
      setProfile(cached)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    const { data, error } = await supabase
      .from("gauge_profiles")
      .select("*")
      .eq("gauge_address", gaugeAddress.toLowerCase())
      .maybeSingle()

    if (error) {
      console.error("Error fetching gauge profile:", error)
      setIsLoading(false)
      return
    }

    const profileData = data as unknown as GaugeProfile | null
    if (profileData) {
      profilesCache.set(gaugeAddress.toLowerCase(), profileData)
    }
    setProfile(profileData)
    setIsLoading(false)
  }, [gaugeAddress])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  return {
    profile,
    isLoading,
    refetch: fetchProfile,
  }
}

// Pre-fetch all profiles for faster page loads
export function useAllGaugeProfiles() {
  const [profiles, setProfiles] = useState<Map<string, GaugeProfile>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const fetchedRef = useRef(false)

  useEffect(() => {
    // Only fetch once
    if (fetchedRef.current) {
      // Return cached data
      setProfiles(new Map(profilesCache))
      setIsLoading(false)
      return
    }

    const fetchAll = async () => {
      const { data, error } = await supabase
        .from("gauge_profiles")
        .select("*")

      if (error) {
        console.error("Error fetching all gauge profiles:", error)
        setIsLoading(false)
        return
      }

      const profileMap = new Map<string, GaugeProfile>()
      for (const profile of (data as unknown as GaugeProfile[]) ?? []) {
        profileMap.set(profile.gauge_address.toLowerCase(), profile)
        profilesCache.set(profile.gauge_address.toLowerCase(), profile)
      }
      lastFetchTime = Date.now()
      fetchedRef.current = true
      setProfiles(profileMap)
      setIsLoading(false)
    }

    fetchAll()
  }, [])

  return {
    profiles,
    isLoading,
  }
}

type UpsertGaugeProfileParams = {
  gaugeAddress: Address
  veBTCTokenId: bigint
  ownerAddress: Address
  profilePictureUrl?: string | null
  description?: string | null
  displayName?: string | null
}

export function useUpsertGaugeProfile() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const upsertProfile = useCallback(
    async ({
      gaugeAddress,
      veBTCTokenId,
      ownerAddress,
      profilePictureUrl,
      description,
      displayName,
    }: UpsertGaugeProfileParams) => {
      setIsLoading(true)
      setError(null)

      const { data, error: upsertError } = await supabase
        .from("gauge_profiles")
        .upsert(
          {
            gauge_address: gaugeAddress.toLowerCase(),
            vebtc_token_id: veBTCTokenId.toString(),
            owner_address: ownerAddress.toLowerCase(),
            profile_picture_url: profilePictureUrl,
            description,
            display_name: displayName,
          },
          {
            onConflict: "gauge_address",
          },
        )
        .select()
        .single()

      if (upsertError) {
        console.error("Error upserting gauge profile:", upsertError)
        setError(new Error(upsertError.message))
        setIsLoading(false)
        return null
      }

      setIsLoading(false)
      return data as unknown as GaugeProfile
    },
    [],
  )

  return {
    upsertProfile,
    isLoading,
    error,
  }
}

export function useUploadProfilePicture() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const uploadPicture = useCallback(
    async (gaugeAddress: Address, file: File) => {
      setIsLoading(true)
      setError(null)

      const fileExt = file.name.split(".").pop()
      const fileName = `${gaugeAddress.toLowerCase()}.${fileExt}`
      const filePath = `${fileName}`

      const { error: uploadError } = await supabase.storage
        .from("gauge-avatars")
        .upload(filePath, file, {
          upsert: true,
        })

      if (uploadError) {
        console.error("Error uploading profile picture:", uploadError)
        setError(new Error(uploadError.message))
        setIsLoading(false)
        return null
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("gauge-avatars").getPublicUrl(filePath)

      setIsLoading(false)
      return publicUrl
    },
    [],
  )

  return {
    uploadPicture,
    isLoading,
    error,
  }
}

