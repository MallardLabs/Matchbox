import { QUERY_PROFILES } from "@/lib/queryProfiles"
import { useQuery } from "@tanstack/react-query"
import { z } from "zod/mini"

// zod/mini keeps the full zod runtime out of the entry chunk (the ticker is on every page).
const priceSchema = z.object({ price: z.nullable(z.string()) })

async function fetchPrice(
  asset: "btc" | "mezo",
  signal: AbortSignal,
): Promise<string | null> {
  const response = await fetch(`/api/pricing/${asset}`, { signal })
  if (!response.ok) {
    throw new Error(`${asset.toUpperCase()} price failed (${response.status})`)
  }
  return priceSchema.parse(await response.json()).price
}

export function useBtcPrice() {
  return useQuery({
    queryKey: ["btc-price"],
    queryFn: ({ signal }) => fetchPrice("btc", signal),
    ...QUERY_PROFILES.SHORT_CACHE,
  })
}

export function useMezoPrice() {
  return useQuery({
    queryKey: ["mezo-price"],
    queryFn: ({ signal }) => fetchPrice("mezo", signal),
    ...QUERY_PROFILES.SHORT_CACHE,
  })
}
