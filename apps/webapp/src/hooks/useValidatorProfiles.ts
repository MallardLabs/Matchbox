import { QUERY_PROFILES } from "@/config/queryProfiles"
import {
  type SocialLinks,
  type ValidatorProfile,
  supabase,
} from "@/config/supabase"
import { useNetwork } from "@/contexts/NetworkContext"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useState } from "react"
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

export function useValidatorProfile(gaugeAddress: Address | undefined) {
  const { chainId, isNetworkReady } = useNetwork()
  const query = useQuery({
    queryKey: ["validator-profile", chainId, gaugeAddress?.toLowerCase()],
    queryFn: async () => {
      if (!gaugeAddress) return null
      const { data, error } = await supabase
        .from("validator_profiles")
        .select("*")
        .eq("chain_id", chainId)
        .eq("gauge_address", gaugeAddress.toLowerCase())
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data ? validatorProfileSchema.parse(data) : null
    },
    enabled: isNetworkReady && !!gaugeAddress,
    ...QUERY_PROFILES.SHORT_CACHE,
  })
  return {
    profile: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
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
          queryKey: [
            "validator-profile",
            chainId,
            identity.gaugeAddress.toLowerCase(),
          ],
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
