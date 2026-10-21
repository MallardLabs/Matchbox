import { useNetwork } from "@/lib/network"
import { type SocialLinks, supabase } from "@/lib/supabase"
import { describeWriteError } from "@/lib/writeErrors"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useState } from "react"
import type { Address } from "viem"
import { useSignMessage } from "wagmi"
import { z } from "zod/mini"

export type ProfileDraft = {
  displayName: string
  description: string
  websiteUrl: string
  socialLinks: SocialLinks
  tags: string[]
  incentiveStrategy: string
  votingStrategy: string
  /** Kept as is unless a new photo is uploaded. */
  profilePictureUrl: string | null
}

export type ProfileSaveStage = "idle" | "photo" | "profile"

const nonceSchema = z.object({ message: z.string().check(z.minLength(1)) })
const uploadSchema = z.object({
  path: z.string().check(z.minLength(1)),
  token: z.string().check(z.minLength(1)),
})

const SOCIAL_KEYS = [
  "twitter",
  "discord",
  "telegram",
  "github",
  "medium",
  "other",
] as const

function compactLinks(links: SocialLinks): SocialLinks | null {
  const compact: SocialLinks = {}
  for (const key of SOCIAL_KEYS) {
    const value = links[key]?.trim()
    if (value) compact[key] = value
  }
  return Object.keys(compact).length > 0 ? compact : null
}

function orNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

export const AVATAR_TYPES: Record<string, "png" | "jpg" | "webp"> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024

/**
 * Signed profile writes for a veBTC gauge owner (upsert-gauge-profile edge
 * function). Unlike the shared hook it keeps the photo and strategy fields,
 * and can upload a new photo first (one extra signature).
 */
export function useProfileSave() {
  const { chainId } = useNetwork()
  const { signMessageAsync } = useSignMessage()
  const queryClient = useQueryClient()
  const [stage, setStage] = useState<ProfileSaveStage>("idle")
  const [error, setError] = useState<string | null>(null)

  const save = useCallback(
    async (input: {
      gaugeAddress: Address
      veBtcTokenId: string
      ownerAddress: Address
      draft: ProfileDraft
      photo: File | null
    }): Promise<boolean> => {
      const url = import.meta.env.VITE_SUPABASE_URL
      const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
      if (!url || !anon || !supabase) {
        setError("Profiles aren't available here")
        return false
      }
      setError(null)
      const identity = {
        chainId,
        gaugeAddress: input.gaugeAddress,
        veBtcTokenId: input.veBtcTokenId,
        ownerAddress: input.ownerAddress,
      }
      const post = async (body: Record<string, unknown>): Promise<unknown> => {
        const response = await fetch(
          `${url}/functions/v1/upsert-gauge-profile`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${anon}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ...identity, ...body }),
          },
        )
        const json: unknown = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(
            response.status === 403
              ? "This wallet can't edit this gauge's profile"
              : "Profile service failed",
          )
        }
        return json
      }
      const proof = async (operation: "upsert-profile" | "upload-avatar") => {
        const nonce = nonceSchema.safeParse(
          await post({ action: "nonce", operation }),
        )
        if (!nonce.success) throw new Error("Profile service failed")
        const signature = await signMessageAsync({
          message: nonce.data.message,
        })
        return { message: nonce.data.message, signature }
      }

      try {
        let pictureUrl = input.draft.profilePictureUrl
        if (input.photo) {
          setStage("photo")
          const extension = AVATAR_TYPES[input.photo.type]
          if (!extension) throw new Error("Choose a PNG, JPG or WebP image")
          const upload = uploadSchema.safeParse(
            await post({
              action: "upload-avatar",
              proof: await proof("upload-avatar"),
              extension,
            }),
          )
          if (!upload.success) throw new Error("Photo upload failed")
          const bucket = supabase.storage.from("gauge-avatars")
          const { error: uploadError } = await bucket.uploadToSignedUrl(
            upload.data.path,
            upload.data.token,
            input.photo,
            { contentType: input.photo.type },
          )
          if (uploadError) throw new Error("Photo upload failed")
          pictureUrl = bucket.getPublicUrl(upload.data.path).data.publicUrl
        }

        setStage("profile")
        const tags = input.draft.tags
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 12)
        await post({
          action: "upsert-profile",
          proof: await proof("upsert-profile"),
          profile: {
            profilePictureUrl: pictureUrl,
            description: orNull(input.draft.description),
            displayName: orNull(input.draft.displayName),
            websiteUrl: orNull(input.draft.websiteUrl),
            socialLinks: compactLinks(input.draft.socialLinks),
            incentiveStrategy: orNull(input.draft.incentiveStrategy),
            votingStrategy: orNull(input.draft.votingStrategy),
            tags: tags.length > 0 ? tags : null,
          },
        })
        await queryClient.invalidateQueries({ queryKey: ["gauge-profiles"] })
        return true
      } catch (caught) {
        setError(describeWriteError(caught).message)
        return false
      } finally {
        setStage("idle")
      }
    },
    [chainId, queryClient, signMessageAsync],
  )

  return { save, stage, busy: stage !== "idle", error }
}
