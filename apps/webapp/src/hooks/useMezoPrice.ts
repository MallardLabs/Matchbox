import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import { MEZO_FALLBACK_PRICE } from "@repo/shared"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useQuery } from "@tanstack/react-query"
import { z } from "zod"

export type MezoPriceResult = {
  price: number | null
  isLoading: boolean
  isError: boolean
  source: "aerodrome-cl" | "fallback"
}

const mezoPriceResponseSchema = z.object({
  price: z.number().nullable(),
  source: z.enum(["aerodrome-cl", "fallback"]),
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

// Toggle to enable Aerodrome price on testnet (once a testnet pool exists)
const USE_AERODROME_ON_TESTNET = false

export function useMezoPrice(): MezoPriceResult {
  const { chainId } = useNetwork()
  const isMainnet = chainId === CHAIN_ID.mainnet
  const useAerodrome = isMainnet || USE_AERODROME_ON_TESTNET

  const { data, isLoading, isError } = useQuery({
    queryKey: ["mezo-price", mezoPriceEndpoint],
    queryFn: ({ signal }) => fetchMezoPrice(signal),
    enabled: useAerodrome,
    ...QUERY_PROFILES.SHORT_CACHE,
  })

  if (!useAerodrome) {
    return {
      price: MEZO_FALLBACK_PRICE,
      isLoading: false,
      isError: false,
      source: "fallback",
    }
  }

  if (isLoading) {
    return {
      price: MEZO_FALLBACK_PRICE,
      isLoading: true,
      isError: false,
      source: "fallback",
    }
  }

  if (isError || !data || data.price === null) {
    return {
      price: MEZO_FALLBACK_PRICE,
      isLoading: false,
      isError: isError,
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
