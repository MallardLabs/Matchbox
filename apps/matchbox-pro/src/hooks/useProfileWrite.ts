import { useNetwork } from "@/lib/network"
import type { SocialLinks } from "@/lib/supabase"
import { useCallback, useState } from "react"
import type { Address } from "viem"
import { useSignMessage } from "wagmi"
import { z } from "zod/mini"
import { useGaugeProfiles } from "./useProfiles"

type ProfileFields = {
  displayName: string
  description: string
  websiteUrl: string
  tags: string[]
  socialLinks: SocialLinks
}

const nonceSchema = z.object({ message: z.string().check(z.minLength(1)) })

const SOCIAL_KEYS = [
  "twitter",
  "discord",
  "telegram",
  "github",
  "medium",
  "other",
] as const

function compactSocialLinks(links: SocialLinks): SocialLinks | null {
  const compact: SocialLinks = {}
  for (const key of SOCIAL_KEYS) {
    const value = links[key]?.trim()
    if (value) compact[key] = value
  }
  return Object.keys(compact).length > 0 ? compact : null
}

export function useProfileWrite() {
  const { chainId } = useNetwork()
  const { signMessageAsync } = useSignMessage()
  const { refetch } = useGaugeProfiles()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = useCallback(
    async (input: {
      gaugeAddress: Address
      veBtcTokenId: string
      ownerAddress: Address
      fields: ProfileFields
    }) => {
      const url = import.meta.env.VITE_SUPABASE_URL
      const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
      if (!url || !anon) {
        setError("Supabase is not configured")
        return false
      }
      setBusy(true)
      setError(null)
      try {
        const identity = {
          chainId,
          gaugeAddress: input.gaugeAddress,
          veBtcTokenId: input.veBtcTokenId,
          ownerAddress: input.ownerAddress,
        }
        const post = (body: Record<string, unknown>) =>
          fetch(`${url}/functions/v1/upsert-gauge-profile`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${anon}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ...identity, ...body }),
          })
        const nonceRes = await post({
          action: "nonce",
          operation: "upsert-profile",
        })
        const nonceBody = nonceSchema.safeParse(
          await nonceRes.json().catch(() => null),
        )
        if (!nonceRes.ok || !nonceBody.success) {
          throw new Error("Could not start profile authorization")
        }
        const signature = await signMessageAsync({
          message: nonceBody.data.message,
        })
        const tags = input.fields.tags
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 12)
        const writeRes = await post({
          action: "upsert-profile",
          proof: { message: nonceBody.data.message, signature },
          profile: {
            profilePictureUrl: null,
            description: input.fields.description || null,
            displayName: input.fields.displayName || null,
            websiteUrl: input.fields.websiteUrl || null,
            socialLinks: compactSocialLinks(input.fields.socialLinks),
            incentiveStrategy: null,
            votingStrategy: null,
            tags: tags.length > 0 ? tags : null,
          },
        })
        if (!writeRes.ok) throw new Error("Gauge ownership verification failed")
        await refetch()
        return true
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Save failed")
        return false
      } finally {
        setBusy(false)
      }
    },
    [chainId, refetch, signMessageAsync],
  )

  return { save, busy, error }
}
