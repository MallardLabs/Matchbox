import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import { MEZO_FALLBACK_PRICE } from "@repo/shared"
import { CHAIN_ID } from "@repo/shared/contracts"
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

// Toggle to enable Aerodrome price on testnet (once a testnet pool exists)
const USE_AERODROME_ON_TESTNET = false

export function useMezoPrice(): MezoPriceResult {
  const { chainId } = useNetwork()
  const isMainnet = chainId === CHAIN_ID.mainnet
  const useAerodrome = isMainnet || USE_AERODROME_ON_TESTNET

  const { data, isLoading, isError } = useQuery({
    queryKey: ["mezo-price"],
    queryFn: ({ signal }) => fetchMezoPrice(signal),
    enabled: useAerodrome,
    ...QUERY_PROFILES.SHORT_CACHE,
  })

  // Testnet: always use fallback
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
