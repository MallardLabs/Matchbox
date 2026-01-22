import type {
  GaugeHistory,
  GaugeProfile,
  ProfileTransfer,
  SocialLinks,
} from "@/config/supabase"
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

// Constants for epoch calculation
const EPOCH_DURATION = 7 * 24 * 60 * 60 // 7 days in seconds

function getEpochStart(timestamp: number): number {
  return Math.floor(timestamp / EPOCH_DURATION) * EPOCH_DURATION
}

/**
 * Check if an owner can transfer a profile this epoch.
 * Returns the current epoch info and whether a transfer is available.
 */
export function useCanTransferProfile(ownerAddress: Address | undefined) {
  const [canTransfer, setCanTransfer] = useState(true)
  const [lastTransfer, setLastTransfer] = useState<ProfileTransfer | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [epochStart, setEpochStart] = useState<number>(0)
  const [nextEpoch, setNextEpoch] = useState<number>(0)

  const checkTransferAvailability = useCallback(async () => {
    if (!ownerAddress) {
      setCanTransfer(false)
      setLastTransfer(null)
      return
    }

    setIsLoading(true)

    const now = Math.floor(Date.now() / 1000)
    const currentEpoch = getEpochStart(now)
    setEpochStart(currentEpoch)
    setNextEpoch(currentEpoch + EPOCH_DURATION)

    const { data, error } = await supabase
      .from("profile_transfers")
      .select("*")
      .eq("owner_address", ownerAddress.toLowerCase())
      .eq("epoch_start", currentEpoch)
      .single()

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found
      console.error("Error checking transfer availability:", error)
    }

    if (data) {
      setCanTransfer(false)
      setLastTransfer(data as unknown as ProfileTransfer)
    } else {
      setCanTransfer(true)
      setLastTransfer(null)
    }

    setIsLoading(false)
  }, [ownerAddress])

  useEffect(() => {
    checkTransferAvailability()
  }, [checkTransferAvailability])

  return {
    canTransfer,
    lastTransfer,
    epochStart,
    nextEpoch,
    isLoading,
    refetch: checkTransferAvailability,
  }
}

export type TransferGaugeProfileParams = {
  fromGaugeAddress: Address
  toGaugeAddress: Address
  ownerAddress: Address
  toVeBTCTokenId: bigint
}

export type TransferResult = {
  success: boolean
  message?: string
  error?: string
  from_gauge?: string
  to_gauge?: string
  epoch_start?: number
  transferred_at?: string
  next_epoch?: number
}

/**
 * Hook to transfer a gauge profile from one gauge to another.
 * Can only be done once per epoch per owner.
 */
export function useTransferGaugeProfile() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const { refetch } = useAllGaugeProfilesFromContext()

  const transferProfile = useCallback(
    async ({
      fromGaugeAddress,
      toGaugeAddress,
      ownerAddress,
      toVeBTCTokenId,
    }: TransferGaugeProfileParams): Promise<TransferResult> => {
      setIsLoading(true)
      setError(null)

      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        if (!supabaseUrl) {
          throw new Error("Supabase URL not configured")
        }

        const response = await fetch(
          `${supabaseUrl}/functions/v1/transfer-gauge-profile`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              fromGaugeAddress: fromGaugeAddress.toLowerCase(),
              toGaugeAddress: toGaugeAddress.toLowerCase(),
              ownerAddress: ownerAddress.toLowerCase(),
              toVeBTCTokenId: toVeBTCTokenId.toString(),
            }),
          },
        )

        const result: TransferResult = await response.json()

        if (!response.ok || !result.success) {
          const errorMessage = result.error || "Transfer failed"
          setError(new Error(errorMessage))
          setIsLoading(false)
          return result
        }

        // Refetch all profiles to update the cache
        await refetch()

        setIsLoading(false)
        return result
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error occurred"
        setError(new Error(errorMessage))
        setIsLoading(false)
        return { success: false, error: errorMessage }
      }
    },
    [refetch],
  )

  return {
    transferProfile,
    isLoading,
    error,
  }
}

/**
 * Get transfer history for an owner.
 */
export function useTransferHistory(ownerAddress: Address | undefined) {
  const [transfers, setTransfers] = useState<ProfileTransfer[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchHistory = useCallback(async () => {
    if (!ownerAddress) {
      setTransfers([])
      return
    }

    setIsLoading(true)

    const { data, error } = await supabase
      .from("profile_transfers")
      .select("*")
      .eq("owner_address", ownerAddress.toLowerCase())
      .order("transferred_at", { ascending: false })
      .limit(10)

    if (error) {
      console.error("Error fetching transfer history:", error)
      setTransfers([])
    } else {
      setTransfers((data as unknown as ProfileTransfer[]) ?? [])
    }

    setIsLoading(false)
  }, [ownerAddress])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  return {
    transfers,
    isLoading,
    refetch: fetchHistory,
  }
}
