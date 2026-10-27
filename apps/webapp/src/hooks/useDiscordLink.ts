import { useQuery } from "@tanstack/react-query"

// Whether a wallet has a Discord link, served by the discord-link edge
// function's `action=profile` lookup. The link table is service-role only, so
// the webapp reads it through the function rather than supabase-js directly.
// The lookup is unauthenticated and never names the Discord account.
export type DiscordLinkStatus = { linked: boolean }

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
      return { linked: data.linked === true }
    },
  })
}
