import { QUERY_PROFILES } from "@/config/queryProfiles"
import { MEZO_FALLBACK_PRICE } from "@repo/shared"
import { useQuery } from "@tanstack/react-query"

export type MezoPriceResult = {
  price: number | null
  isLoading: boolean
  isError: boolean
  source: "aerodrome-cl" | "fallback"
}

type MezoPriceResponse = {
  price: number
  source: "aerodrome-cl" | "fallback"
  reason?: string
  timestamp: number
}

async function fetchMezoPrice(
  signal: AbortSignal,
): Promise<MezoPriceResponse> {
  const response = await fetch("/api/pricing/mezo", {
    method: "GET",
    signal,
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch MEZO price (${response.status})`)
  }

  return (await response.json()) as MezoPriceResponse
}

export function useMezoPrice(): MezoPriceResult {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["mezo-price"],
    queryFn: ({ signal }) => fetchMezoPrice(signal),
    ...QUERY_PROFILES.SHORT_CACHE,
  })

  if (isLoading) {
    // Return fallback while loading so APY calculations don't stall
    return {
      price: MEZO_FALLBACK_PRICE,
      isLoading: true,
      isError: false,
      source: "fallback",
    }
  }

  if (isError || !data) {
    return {
      price: MEZO_FALLBACK_PRICE,
      isLoading: false,
      isError: true,
      source: "fallback",
    }
  }

  return {
    price: data.price,
    isLoading: false,
    isError: false,
    source: data.source,
  }
}
