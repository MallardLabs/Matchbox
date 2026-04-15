import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useQuery } from "@tanstack/react-query"
import { z } from "zod"

export type MezoPriceResult = {
  price: number | null
  isLoading: boolean
  isError: boolean
  source: "aerodrome-cl" | "unavailable"
}

const mezoPriceResponseSchema = z.object({
  price: z.number().nullable(),
  source: z.enum(["aerodrome-cl", "unavailable"]),
  reason: z.string().optional(),
  timestamp: z.number(),
  liquidity: z.string().optional(),
})

const MEZO_PRICE_API_PATH = "/api/pricing/mezo"
const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
const mezoPriceEndpoint = appBaseUrl
  ? `${appBaseUrl}${MEZO_PRICE_API_PATH}`
  : MEZO_PRICE_API_PATH

async function fetchMezoPrice(
  signal: AbortSignal,
): Promise<z.infer<typeof mezoPriceResponseSchema>> {
  const response = await fetch(mezoPriceEndpoint, {
    method: "GET",
    signal,
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch MEZO price (${response.status})`)
  }

  const unknownJson: unknown = await response.json()
  return mezoPriceResponseSchema.parse(unknownJson)
}

export function useMezoPrice(): MezoPriceResult {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["mezo-price", mezoPriceEndpoint],
    queryFn: ({ signal }) => fetchMezoPrice(signal),
    ...QUERY_PROFILES.SHORT_CACHE,
  })

  if (isLoading) {
    return {
      price: null,
      isLoading: true,
      isError: false,
      source: "unavailable",
    }
  }

  if (isError || !data || data.price === null) {
    return {
      price: null,
      isLoading: false,
      isError: true,
      source: "unavailable",
    }
  }

  return {
    price: data.price,
    isLoading: false,
    isError: false,
    source: data.source,
  }
}
