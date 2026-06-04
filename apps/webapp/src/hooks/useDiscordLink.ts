import { useQuery } from "@tanstack/react-query"

// Discord link status for a wallet, served by the discord-link edge function's
// `action=profile` lookup. The link table is service-role only, so the webapp
// reads it through the function rather than supabase-js directly.
export type DiscordLinkStatus =
  | { linked: false }
  | {
      linked: true
      discordUsername: string | null
      discordGlobalName: string | null
      avatarUrl: string
    }

const FUNCTIONS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/discord-link`
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

export function useDiscordLink(address?: string) {
  return useQuery<DiscordLinkStatus>({
    queryKey: ["discord-link", address?.toLowerCase()],
    enabled: !!address,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const url = `${FUNCTIONS_URL}?action=profile&address=${address}`
      const res = await fetch(url, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      })
      const data = await res.json()
      if (!data?.success) throw new Error("Discord link lookup failed")
      if (!data.linked) return { linked: false }
      return {
        linked: true,
        discordUsername: data.discordUsername ?? null,
        discordGlobalName: data.discordGlobalName ?? null,
        avatarUrl: data.avatarUrl,
      }
    },
  })
}
