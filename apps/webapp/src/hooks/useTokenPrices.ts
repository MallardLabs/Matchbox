import { QUERY_PROFILES } from "@/config/queryProfiles"
import { getTokenPriceType, getTokenUsdPrice } from "@repo/shared"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import type { Address } from "viem"
import { formatUnits, getAddress } from "viem"
import { z } from "zod"
import { useBtcPrice } from "./useBtcPrice"
import { useMezoPrice } from "./useMezoPrice"

/**
 * Token with price information
 */
export type TokenWithPrice = {
  address: Address
  symbol: string
  decimals: number
  priceUsd: number | null
}

/**
 * Result of computing a token's USD value
 */
export type TokenValueResult = {
  amount: bigint
  decimals: number
  symbol: string
  address: Address
  priceUsd: number | null
  valueUsd: number | null
}

const tokenPricesResponseSchema = z.object({
  prices: z.array(
    z.object({
      address: z.string(),
      price: z.number().nullable(),
      source: z.enum(["geckoterminal", "unavailable"]),
      reserveUsd: z.number().nullable().optional(),
      volume24hUsd: z.number().nullable().optional(),
    }),
  ),
  timestamp: z.number(),
})

const TOKEN_PRICES_API_PATH = "/api/pricing/tokens"
const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
const tokenPricesEndpoint = appBaseUrl
  ? `${appBaseUrl}${TOKEN_PRICES_API_PATH}`
  : TOKEN_PRICES_API_PATH

function normalizeAddresses(addresses: readonly string[]): Address[] {
  const seen = new Set<string>()
  const normalized: Address[] = []

  for (const rawAddress of addresses) {
    try {
      const address = getAddress(rawAddress)
      const key = address.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      normalized.push(address)
    } catch {
      // Ignore malformed custom token addresses; the caller will see no price.
    }
  }

  return normalized
}

function getDexPricedAddresses(
  tokens: { address: string; symbol?: string }[],
): Address[] {
  return normalizeAddresses(
    tokens
      .filter(
        (token) => getTokenPriceType(token.address, token.symbol) === "unknown",
      )
      .map((token) => token.address),
  )
}

async function fetchDexTokenPrices(
  addresses: Address[],
  signal: AbortSignal,
): Promise<z.infer<typeof tokenPricesResponseSchema>> {
  if (addresses.length === 0) {
    return { prices: [], timestamp: Date.now() }
  }

  const params = new URLSearchParams({
    network: "mezo",
    addresses: addresses.join(","),
  })
  const response = await fetch(`${tokenPricesEndpoint}?${params.toString()}`, {
    method: "GET",
    signal,
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch token prices (${response.status})`)
  }

  const unknownJson: unknown = await response.json()
  return tokenPricesResponseSchema.parse(unknownJson)
}

export function useDexTokenPrices(addresses: readonly string[]): {
  prices: Map<string, number | null>
  isLoading: boolean
} {
  const normalizedAddresses = useMemo(
    () => normalizeAddresses(addresses),
    [addresses],
  )
  const queryAddressesKey = useMemo(
    () =>
      normalizedAddresses
        .map((address) => address.toLowerCase())
        .sort()
        .join(","),
    [normalizedAddresses],
  )

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["dex-token-prices", tokenPricesEndpoint, queryAddressesKey],
    queryFn: ({ signal }) => fetchDexTokenPrices(normalizedAddresses, signal),
    enabled: normalizedAddresses.length > 0,
    ...QUERY_PROFILES.SHORT_CACHE,
  })

  const prices = useMemo(() => {
    const priceMap = new Map<string, number | null>()
    for (const address of normalizedAddresses) {
      priceMap.set(address.toLowerCase(), null)
    }

    for (const price of data?.prices ?? []) {
      priceMap.set(price.address.toLowerCase(), price.price)
    }

    return priceMap
  }, [normalizedAddresses, data])

  return {
    prices,
    isLoading: normalizedAddresses.length > 0 && (isLoading || isFetching),
  }
}

/**
 * Hook to get USD prices for multiple tokens
 *
 * Uses the token registry to determine pricing type:
 * - Stablecoins: $1.00
 * - BTC-pegged: BTC price from oracle
 * - MEZO: MEZO price from the shared Aerodrome feed
 * - Unknown: Mezo DEX price from GeckoTerminal when available
 */
export function useTokenPrices(
  tokens: { address: Address; symbol: string }[],
): {
  prices: Map<string, number | null>
  isLoading: boolean
} {
  const { price: btcPrice, isLoading: isLoadingBtc } = useBtcPrice()
  const { price: mezoPrice, isLoading: isLoadingMezo } = useMezoPrice()
  const dexAddresses = useMemo(() => getDexPricedAddresses(tokens), [tokens])
  const { prices: dexPrices, isLoading: isLoadingDex } =
    useDexTokenPrices(dexAddresses)

  const prices = useMemo(() => {
    const priceMap = new Map<string, number | null>()

    for (const token of tokens) {
      const staticPrice = getTokenUsdPrice(
        token.address,
        token.symbol,
        btcPrice,
        mezoPrice,
      )
      const price =
        staticPrice ?? dexPrices.get(token.address.toLowerCase()) ?? null
      priceMap.set(token.address.toLowerCase(), price)
    }

    return priceMap
  }, [tokens, btcPrice, mezoPrice, dexPrices])

  return {
    prices,
    isLoading: isLoadingBtc || isLoadingMezo || isLoadingDex,
  }
}

/**
 * Get the USD price for a single token
 */
export function useTokenPrice(
  address: Address | undefined,
  symbol?: string,
): {
  price: number | null
  isLoading: boolean
} {
  const { price: btcPrice, isLoading: isLoadingBtc } = useBtcPrice()
  const { price: mezoPrice, isLoading: isLoadingMezo } = useMezoPrice()
  const dexAddresses = useMemo(
    () =>
      address && getTokenPriceType(address, symbol) === "unknown"
        ? [address]
        : [],
    [address, symbol],
  )
  const { prices: dexPrices, isLoading: isLoadingDex } =
    useDexTokenPrices(dexAddresses)

  const price = useMemo(() => {
    if (!address) return null
    return (
      getTokenUsdPrice(address, symbol, btcPrice, mezoPrice) ??
      dexPrices.get(address.toLowerCase()) ??
      null
    )
  }, [address, symbol, btcPrice, mezoPrice, dexPrices])

  return {
    price,
    isLoading: isLoadingBtc || isLoadingMezo || isLoadingDex,
  }
}

/**
 * Calculate the USD value of a token amount
 */
export function getTokenValueUsd(
  amount: bigint,
  decimals: number,
  priceUsd: number | null,
): number | null {
  if (priceUsd === null) return null

  const tokenAmount = Number.parseFloat(formatUnits(amount, decimals))
  if (!Number.isFinite(tokenAmount)) return null

  return tokenAmount * priceUsd
}

/**
 * Hook to calculate USD values for token amounts
 *
 * Takes an array of token amounts and returns their USD values
 */
export function useTokenValues(
  tokens: {
    address: Address
    symbol: string
    decimals: number
    amount: bigint
  }[],
): {
  values: TokenValueResult[]
  totalValueUsd: number
  isLoading: boolean
} {
  const { price: btcPrice, isLoading: isLoadingBtc } = useBtcPrice()
  const { price: mezoPrice, isLoading: isLoadingMezo } = useMezoPrice()
  const dexAddresses = useMemo(() => getDexPricedAddresses(tokens), [tokens])
  const { prices: dexPrices, isLoading: isLoadingDex } =
    useDexTokenPrices(dexAddresses)

  const result = useMemo(() => {
    let total = 0
    const values: TokenValueResult[] = tokens.map((token) => {
      const priceUsd =
        getTokenUsdPrice(token.address, token.symbol, btcPrice, mezoPrice) ??
        dexPrices.get(token.address.toLowerCase()) ??
        null
      const valueUsd = getTokenValueUsd(token.amount, token.decimals, priceUsd)

      if (valueUsd !== null) {
        total += valueUsd
      }

      return {
        ...token,
        priceUsd,
        valueUsd,
      }
    })

    return { values, totalValueUsd: total }
  }, [tokens, btcPrice, mezoPrice, dexPrices])

  return {
    ...result,
    isLoading: isLoadingBtc || isLoadingMezo || isLoadingDex,
  }
}

/**
 * Format a USD value for display
 */
export function formatUsdValue(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "~$0.00"
  return `~$${value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`
}
