import type { GaugeHistory, GaugeProfile, SocialLinks } from "@/config/supabase"
import { supabase } from "@/config/supabase"
import {
  useAllGaugeProfilesFromContext,
  useGaugeProfileFromContext,
} from "@/contexts/GaugeProfilesContext"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { Address } from "viem"

/**
 * Get profiles for a list of gauge addresses.
 * Uses the centralized GaugeProfilesContext for efficient data fetching.
 */
export function useGaugeProfiles(gaugeAddresses: Address[]) {
  const {
    profiles: allProfiles,
    isLoading,
    refetch,
  } = useAllGaugeProfilesFromContext()

  const profiles = useMemo(() => {
    const result = new Map<string, GaugeProfile>()
    for (const addr of gaugeAddresses) {
      const profile = allProfiles.get(addr.toLowerCase())
      if (profile) {
        result.set(addr.toLowerCase(), profile)
      }
    }
    return result
  }, [allProfiles, gaugeAddresses])

  return {
    profiles,
    isLoading,
    refetch,
  }
}

/**
 * Get a single gauge profile by address.
 * Uses the centralized GaugeProfilesContext for efficient data fetching.
 */
export function useGaugeProfile(gaugeAddress: Address | undefined) {
  const { profile, isLoading } = useGaugeProfileFromContext(gaugeAddress)
  const { refetch } = useAllGaugeProfilesFromContext()

  return {
    profile: profile ?? null,
    isLoading,
    refetch,
  }
}

/**
 * Get all gauge profiles.
 * Uses the centralized GaugeProfilesContext for efficient data fetching.
 */
export function useAllGaugeProfiles() {
  const { profiles, isLoading, refetch } = useAllGaugeProfilesFromContext()
  return { profiles, isLoading, refetch }
}

export type UpsertGaugeProfileParams = {
  gaugeAddress: Address
  veBTCTokenId: bigint
  ownerAddress: Address
  profilePictureUrl?: string | null
  description?: string | null
  displayName?: string | null
  websiteUrl?: string | null
  socialLinks?: SocialLinks | null
  incentiveStrategy?: string | null
  votingStrategy?: string | null
  tags?: string[] | null
}

export function useUpsertGaugeProfile() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const { refetch } = useAllGaugeProfilesFromContext()

  const upsertProfile = useCallback(
    async ({
      gaugeAddress,
      veBTCTokenId,
      ownerAddress,
      profilePictureUrl,
      description,
      displayName,
      websiteUrl,
      socialLinks,
      incentiveStrategy,
      votingStrategy,
      tags,
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
            website_url: websiteUrl,
            social_links: socialLinks,
            incentive_strategy: incentiveStrategy,
            voting_strategy: votingStrategy,
            tags,
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

      // Refetch all profiles to update the cache
      await refetch()

      setIsLoading(false)
      return data as unknown as GaugeProfile
    },
    [refetch],
  )

  return {
    upsertProfile,
    isLoading,
    error,
  }
}

/**
 * Fetch historical data for a gauge.
 * Returns up to the last N epochs of data for charts and trends.
 */
export function useGaugeHistory(
  gaugeAddress: Address | undefined,
  epochCount = 12,
) {
  const [history, setHistory] = useState<GaugeHistory[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchHistory = useCallback(async () => {
    if (!gaugeAddress) {
      setHistory([])
      return
    }

    setIsLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from("gauge_history")
      .select("*")
      .eq("gauge_address", gaugeAddress.toLowerCase())
      .order("epoch_start", { ascending: false })
      .limit(epochCount)

    if (fetchError) {
      console.error("Error fetching gauge history:", fetchError)
      setError(new Error(fetchError.message))
      setHistory([])
    } else {
      // Reverse to show oldest first for charts
      setHistory((data as unknown as GaugeHistory[])?.reverse() ?? [])
    }

    setIsLoading(false)
  }, [gaugeAddress, epochCount])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  return {
    history,
    isLoading,
    error,
    refetch: fetchHistory,
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
