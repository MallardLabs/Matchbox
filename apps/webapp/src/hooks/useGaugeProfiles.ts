import { getContractConfig } from "@/config/contracts"
import type {
  GaugeHistory,
  GaugeProfile,
  ProfileTransfer,
  SavedProfile,
  SocialLinks,
} from "@/config/supabase"
import { supabase } from "@/config/supabase"
import {
  useAllGaugeProfilesFromContext,
  useGaugeProfileFromContext,
} from "@/contexts/GaugeProfilesContext"
import { useNetwork } from "@/contexts/NetworkContext"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { Address } from "viem"
import { useReadContract, useSignMessage } from "wagmi"
import { z } from "zod"

const gaugeProfileSchema = z.object({
  gauge_address: z.string(),
  vebtc_token_id: z.string(),
  owner_address: z.string(),
  profile_picture_url: z.string().nullable(),
  description: z.string().nullable(),
  display_name: z.string().nullable(),
  website_url: z.string().nullable(),
  social_links: z
    .object({
      twitter: z.string().optional(),
      discord: z.string().optional(),
      telegram: z.string().optional(),
      github: z.string().optional(),
      medium: z.string().optional(),
      website: z.string().optional(),
    })
    .transform(
      (links): SocialLinks => ({
        ...(links.twitter ? { twitter: links.twitter } : {}),
        ...(links.discord ? { discord: links.discord } : {}),
        ...(links.telegram ? { telegram: links.telegram } : {}),
        ...(links.github ? { github: links.github } : {}),
        ...(links.medium ? { medium: links.medium } : {}),
        ...(links.website ? { website: links.website } : {}),
      }),
    )
    .nullable(),
  incentive_strategy: z.string().nullable(),
  voting_strategy: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  is_featured: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
})

const nonceResponseSchema = z.object({ message: z.string() })
const avatarUploadResponseSchema = z.object({
  path: z.string(),
  token: z.string(),
})
const profileWriteResponseSchema = z.object({ profile: gaugeProfileSchema })

type GaugeWriteOperation = "upsert-profile" | "upload-avatar"

async function invokeGaugeProfileWrite(body: unknown): Promise<unknown> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey)
    throw new Error("Gauge profile service is not configured")
  const response = await fetch(`${url}/functions/v1/upsert-gauge-profile`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  const data: unknown = await response.json()
  if (!response.ok) throw new Error("Gauge ownership verification failed")
  return data
}

async function createGaugeWriteProof(args: {
  operation: GaugeWriteOperation
  gaugeAddress: Address
  veBtcTokenId: bigint
  ownerAddress: Address
  signMessage: (message: string) => Promise<string>
}): Promise<{ message: string; signature: string }> {
  const rawNonce = await invokeGaugeProfileWrite({
    action: "nonce",
    operation: args.operation,
    gaugeAddress: args.gaugeAddress,
    veBtcTokenId: args.veBtcTokenId.toString(),
    ownerAddress: args.ownerAddress,
  })
  const nonce = nonceResponseSchema.parse(rawNonce)
  const signature = await args.signMessage(nonce.message)
  return { message: nonce.message, signature }
}

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
  const { signMessageAsync } = useSignMessage()

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

      try {
        const proof = await createGaugeWriteProof({
          operation: "upsert-profile",
          gaugeAddress,
          veBtcTokenId: veBTCTokenId,
          ownerAddress,
          signMessage: async (message) => signMessageAsync({ message }),
        })
        const rawResult = await invokeGaugeProfileWrite({
          action: "upsert-profile",
          gaugeAddress,
          veBtcTokenId: veBTCTokenId.toString(),
          ownerAddress,
          proof,
          profile: {
            profilePictureUrl: profilePictureUrl ?? null,
            description: description ?? null,
            displayName: displayName ?? null,
            websiteUrl: websiteUrl ?? null,
            socialLinks: socialLinks ?? null,
            incentiveStrategy: incentiveStrategy ?? null,
            votingStrategy: votingStrategy ?? null,
            tags: tags ?? null,
          },
        })
        const result = profileWriteResponseSchema.parse(rawResult)
        await refetch()
        setIsLoading(false)
        return result.profile satisfies GaugeProfile
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to update gauge profile"
        setError(new Error(message))
        setIsLoading(false)
        return null
      }
    },
    [refetch, signMessageAsync],
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
  const { signMessageAsync } = useSignMessage()

  const uploadPicture = useCallback(
    async (
      gaugeAddress: Address,
      veBtcTokenId: bigint,
      ownerAddress: Address,
      file: File,
    ) => {
      setIsLoading(true)
      setError(null)

      try {
        const extension = file.name.split(".").pop()?.toLowerCase()
        if (
          !extension ||
          !["jpg", "jpeg", "png", "gif", "webp"].includes(extension)
        ) {
          throw new Error("Choose a JPG, PNG, GIF, or WebP image")
        }
        const proof = await createGaugeWriteProof({
          operation: "upload-avatar",
          gaugeAddress,
          veBtcTokenId,
          ownerAddress,
          signMessage: async (message) => signMessageAsync({ message }),
        })
        const rawAuthorization = await invokeGaugeProfileWrite({
          action: "upload-avatar",
          gaugeAddress,
          veBtcTokenId: veBtcTokenId.toString(),
          ownerAddress,
          proof,
          extension,
        })
        const authorization = avatarUploadResponseSchema.parse(rawAuthorization)
        const { error: uploadError } = await supabase.storage
          .from("gauge-avatars")
          .uploadToSignedUrl(authorization.path, authorization.token, file, {
            contentType: file.type,
          })
        if (uploadError) throw new Error(uploadError.message)
        const {
          data: { publicUrl },
        } = supabase.storage
          .from("gauge-avatars")
          .getPublicUrl(authorization.path)
        setIsLoading(false)
        return publicUrl
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Avatar upload failed"
        setError(new Error(message))
        setIsLoading(false)
        return null
      }
    },
    [signMessageAsync],
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
 * Check which gauge profiles have already been transferred this epoch.
 * Returns a set of source gauge addresses that were already transferred,
 * plus epoch timing info.
 */
export function useCanTransferProfile(ownerAddress: Address | undefined) {
  const [transferredGauges, setTransferredGauges] = useState<Set<string>>(
    new Set(),
  )
  const [isLoading, setIsLoading] = useState(false)
  const [nextEpoch, setNextEpoch] = useState<number>(0)

  const checkTransferAvailability = useCallback(async () => {
    if (!ownerAddress) {
      setTransferredGauges(new Set())
      return
    }

    setIsLoading(true)

    const now = Math.floor(Date.now() / 1000)
    const currentEpoch = getEpochStart(now)
    setNextEpoch(currentEpoch + EPOCH_DURATION)

    const { data, error } = await supabase
      .from("profile_transfers")
      .select("*")
      .eq("owner_address", ownerAddress.toLowerCase())
      .eq("epoch_start", currentEpoch)

    if (error) {
      console.error("Error checking transfer availability:", error)
    }

    if (data && data.length > 0) {
      const transfers = data as unknown as ProfileTransfer[]
      setTransferredGauges(new Set(transfers.map((t) => t.from_gauge_address)))
    } else {
      setTransferredGauges(new Set())
    }

    setIsLoading(false)
  }, [ownerAddress])

  useEffect(() => {
    checkTransferAvailability()
  }, [checkTransferAvailability])

  return {
    transferredGauges,
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
 * Each gauge profile can only be transferred once per epoch.
 */
export function useTransferGaugeProfile() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const { refetch } = useAllGaugeProfilesFromContext()
  const { chainId } = useNetwork()

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
              chainId,
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
    [chainId, refetch],
  )

  return {
    transferProfile,
    isLoading,
    error,
  }
}

/**
 * Fetch saved profile templates for a wallet address.
 * Returns both manually saved templates and auto-saved expired gauge templates.
 */
export function useSavedProfiles(ownerAddress: Address | undefined) {
  const [profiles, setProfiles] = useState<SavedProfile[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchProfiles = useCallback(async () => {
    if (!ownerAddress) {
      setProfiles([])
      return
    }

    setIsLoading(true)

    const { data, error } = await supabase
      .from("saved_profiles")
      .select("*")
      .eq("owner_address", ownerAddress.toLowerCase())
      .order("updated_at", { ascending: false })

    if (error) {
      console.error("Error fetching saved profiles:", error)
      setProfiles([])
    } else {
      setProfiles((data as unknown as SavedProfile[]) ?? [])
    }

    setIsLoading(false)
  }, [ownerAddress])

  useEffect(() => {
    fetchProfiles()
  }, [fetchProfiles])

  return {
    profiles,
    isLoading,
    refetch: fetchProfiles,
  }
}

export type SaveProfileTemplateParams = {
  ownerAddress: Address
  name: string
  profilePictureUrl?: string | null
  displayName?: string | null
  description?: string | null
  websiteUrl?: string | null
  socialLinks?: SocialLinks | null
  incentiveStrategy?: string | null
  votingStrategy?: string | null
  tags?: string[] | null
  source?: "manual" | "expired_gauge"
  sourceGaugeAddress?: string | null
  sourceVebtcTokenId?: string | null
}

/**
 * Save or update a profile template.
 * Uses upsert on (owner_address, name) unique constraint.
 */
export function useSaveProfileTemplate() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const saveTemplate = useCallback(
    async ({
      ownerAddress,
      name,
      profilePictureUrl,
      displayName,
      description,
      websiteUrl,
      socialLinks,
      incentiveStrategy,
      votingStrategy,
      tags,
      source = "manual",
      sourceGaugeAddress,
      sourceVebtcTokenId,
    }: SaveProfileTemplateParams) => {
      setIsLoading(true)
      setError(null)

      const { data, error: upsertError } = await supabase
        .from("saved_profiles")
        .upsert(
          {
            owner_address: ownerAddress.toLowerCase(),
            name,
            source,
            source_gauge_address: sourceGaugeAddress ?? null,
            source_vebtc_token_id: sourceVebtcTokenId ?? null,
            profile_picture_url: profilePictureUrl ?? null,
            display_name: displayName ?? null,
            description: description ?? null,
            website_url: websiteUrl ?? null,
            social_links: socialLinks ?? null,
            incentive_strategy: incentiveStrategy ?? null,
            voting_strategy: votingStrategy ?? null,
            tags: tags ?? null,
          },
          { onConflict: "owner_address,name" },
        )
        .select()
        .single()

      if (upsertError) {
        console.error("Error saving profile template:", upsertError)
        setError(new Error(upsertError.message))
        setIsLoading(false)
        return null
      }

      setIsLoading(false)
      return data as unknown as SavedProfile
    },
    [],
  )

  return {
    saveTemplate,
    isLoading,
    error,
  }
}

/**
 * Delete a saved profile template by ID.
 */
export function useDeleteProfileTemplate() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const deleteTemplate = useCallback(async (id: number) => {
    setIsLoading(true)
    setError(null)

    const { error: deleteError } = await supabase
      .from("saved_profiles")
      .delete()
      .eq("id", id)

    if (deleteError) {
      console.error("Error deleting profile template:", deleteError)
      setError(new Error(deleteError.message))
    }

    setIsLoading(false)
    return !deleteError
  }, [])

  return {
    deleteTemplate,
    isLoading,
    error,
  }
}

/**
 * Check on-chain ownership of a gauge's veBTC NFT.
 * Returns whether the stored owner matches the current on-chain owner.
 */
export function useGaugeOwnershipCheck(
  veBTCTokenId: string | undefined,
  storedOwner: string | undefined,
) {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)

  const tokenIdBigInt =
    veBTCTokenId !== undefined ? BigInt(veBTCTokenId) : undefined

  const { data, isLoading } = useReadContract({
    ...contracts.veBTC,
    functionName: "ownerOf",
    args: tokenIdBigInt !== undefined ? [tokenIdBigInt] : undefined,
    query: {
      enabled: isNetworkReady && tokenIdBigInt !== undefined,
    },
  })

  const currentOwner = data as Address | undefined
  const isOwnershipValid =
    currentOwner !== undefined && storedOwner !== undefined
      ? currentOwner.toLowerCase() === storedOwner.toLowerCase()
      : undefined

  return {
    currentOwner,
    isOwnershipValid,
    isLoading,
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
