import { QUERY_PROFILES } from "@/config/queryProfiles"
import {
  type GaugeProfile,
  type SocialLinks,
  type ValidatorProfile,
  supabase,
} from "@/config/supabase"
import { useNetwork } from "@/contexts/NetworkContext"
import { useAllGaugeProfiles } from "@/hooks/useGaugeProfiles"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo, useState } from "react"
import type { Address } from "viem"
import { useSignMessage } from "wagmi"
import { z } from "zod"

const socialLinksSchema = z
  .record(z.string())
  .transform((value): SocialLinks => value)
  .nullable()
const validatorProfileSchema = z.object({
  chain_id: z.number(),
  gauge_address: z.string(),
  operator_address: z.string(),
  last_editor_address: z.string(),
  profile_picture_url: z.string().nullable(),
  display_name: z.string().nullable(),
  description: z.string().nullable(),
  website_url: z.string().nullable(),
  social_links: socialLinksSchema,
  incentive_strategy: z.string().nullable(),
  voting_strategy: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
const nonceSchema = z.object({ message: z.string() })
const writeSchema = z.object({ profile: validatorProfileSchema })
const uploadSchema = z.object({ path: z.string(), token: z.string() })

async function invoke(body: unknown): Promise<unknown> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Validator profile service is unavailable")
  const response = await fetch(`${url}/functions/v1/upsert-validator-profile`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  const data: unknown = await response.json()
  if (!response.ok) throw new Error("Validator profile authorization failed")
  return data
}

type ProfileIdentity = {
  gaugeAddress: Address
  operatorAddress: Address
  editorAddress: Address
}

// Validator profiles live in `validator_profiles`, but the readable validator
// names predate that table and were curated in `gauge_profiles` (keyed by gauge
// address). Without this fallback a validator that has never saved a profile in
// the new table renders its raw on-chain moniker instead.
function withLegacyGaugeProfile(
  profile: ValidatorProfile | null,
  legacy: GaugeProfile | undefined,
  chainId: number,
  gaugeAddress: Address | undefined,
): ValidatorProfile | null {
  if (!legacy) return profile

  const base: ValidatorProfile = profile ?? {
    chain_id: chainId,
    gauge_address: gaugeAddress?.toLowerCase() ?? legacy.gauge_address,
    operator_address: "",
    last_editor_address: "",
    profile_picture_url: null,
    display_name: null,
    description: null,
    website_url: null,
    social_links: null,
    incentive_strategy: null,
    voting_strategy: null,
    tags: null,
    created_at: legacy.created_at,
    updated_at: legacy.updated_at,
  }

  return {
    ...base,
    profile_picture_url: base.profile_picture_url ?? legacy.profile_picture_url,
    display_name: base.display_name ?? legacy.display_name,
    description: base.description ?? legacy.description,
    website_url: base.website_url ?? legacy.website_url,
    social_links: base.social_links ?? legacy.social_links,
    incentive_strategy: base.incentive_strategy ?? legacy.incentive_strategy,
    voting_strategy: base.voting_strategy ?? legacy.voting_strategy,
    tags: base.tags ?? legacy.tags,
  }
}

function validatorProfilesQueryKey(chainId: number) {
  return ["validator-profiles", chainId] as const
}

/**
 * Every validator profile for the active chain, keyed by lowercased gauge
 * address and already merged with the legacy `gauge_profiles` rows. One request
 * serves the whole page instead of one per validator card.
 */
export function useAllValidatorProfiles() {
  const { chainId, isNetworkReady } = useNetwork()
  const { profiles: gaugeProfiles, isLoading: isLoadingGaugeProfiles } =
    useAllGaugeProfiles()
  const query = useQuery({
    queryKey: validatorProfilesQueryKey(chainId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("validator_profiles")
        .select("*")
        .eq("chain_id", chainId)
      if (error) throw new Error(error.message)
      return (data ?? []).map((row) => validatorProfileSchema.parse(row))
    },
    enabled: isNetworkReady,
    ...QUERY_PROFILES.SHORT_CACHE,
  })

  const profiles = useMemo(() => {
    const merged = new Map<string, ValidatorProfile>()
    for (const profile of query.data ?? []) {
      const key = profile.gauge_address.toLowerCase()
      merged.set(
        key,
        withLegacyGaugeProfile(
          profile,
          gaugeProfiles.get(key),
          chainId,
          profile.gauge_address as Address,
        ) ?? profile,
      )
    }
    // Gauges with only a legacy profile still need a readable name
    for (const [key, legacy] of gaugeProfiles) {
      if (merged.has(key)) continue
      const fallback = withLegacyGaugeProfile(
        null,
        legacy,
        chainId,
        key as Address,
      )
      if (fallback) merged.set(key, fallback)
    }
    return merged
  }, [query.data, gaugeProfiles, chainId])

  return {
    profiles,
    isLoading: query.isLoading || isLoadingGaugeProfiles,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useValidatorProfile(gaugeAddress: Address | undefined) {
  const { profiles, isLoading, error, refetch } = useAllValidatorProfiles()
  return {
    profile: gaugeAddress
      ? (profiles.get(gaugeAddress.toLowerCase()) ?? null)
      : null,
    isLoading,
    error,
    refetch,
  }
}

export type ValidatorProfileValues = {
  displayName: string | null
  profilePictureUrl: string | null
  description: string | null
  websiteUrl: string | null
  socialLinks: SocialLinks | null
  incentiveStrategy: string | null
  votingStrategy: string | null
  tags: string[] | null
}

export function useUpsertValidatorProfile() {
  const { chainId } = useNetwork()
  const { signMessageAsync } = useSignMessage()
  const queryClient = useQueryClient()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const createProof = useCallback(
    async (
      operation: "upsert-profile" | "upload-avatar",
      identity: ProfileIdentity,
    ) => {
      const nonce = nonceSchema.parse(
        await invoke({ action: "nonce", operation, chainId, ...identity }),
      )
      return {
        message: nonce.message,
        signature: await signMessageAsync({ message: nonce.message }),
      }
    },
    [chainId, signMessageAsync],
  )

  const upsertProfile = useCallback(
    async (identity: ProfileIdentity, profile: ValidatorProfileValues) => {
      setIsLoading(true)
      setError(null)
      try {
        const proof = await createProof("upsert-profile", identity)
        const result = writeSchema.parse(
          await invoke({
            action: "upsert-profile",
            chainId,
            ...identity,
            proof,
            profile,
          }),
        )
        await queryClient.invalidateQueries({
          queryKey: validatorProfilesQueryKey(chainId),
        })
        return result.profile satisfies ValidatorProfile
      } catch (caught) {
        const nextError =
          caught instanceof Error ? caught : new Error("Unable to save profile")
        setError(nextError)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [chainId, createProof, queryClient],
  )

  const uploadAvatar = useCallback(
    async (identity: ProfileIdentity, file: File) => {
      setIsLoading(true)
      setError(null)
      try {
        const extension = file.name.split(".").at(-1)?.toLowerCase()
        if (
          !extension ||
          !["jpg", "jpeg", "png", "gif", "webp"].includes(extension)
        ) {
          throw new Error("Choose a JPG, PNG, GIF, or WebP image")
        }
        const proof = await createProof("upload-avatar", identity)
        const authorization = uploadSchema.parse(
          await invoke({
            action: "upload-avatar",
            chainId,
            ...identity,
            proof,
            extension,
          }),
        )
        const { error: uploadError } = await supabase.storage
          .from("gauge-avatars")
          .uploadToSignedUrl(authorization.path, authorization.token, file, {
            contentType: file.type,
          })
        if (uploadError) throw new Error(uploadError.message)
        return supabase.storage
          .from("gauge-avatars")
          .getPublicUrl(authorization.path).data.publicUrl
      } catch (caught) {
        const nextError =
          caught instanceof Error
            ? caught
            : new Error("Unable to upload avatar")
        setError(nextError)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [chainId, createProof],
  )

  return { upsertProfile, uploadAvatar, isLoading, error }
}
