import { getTokenUsdPrice } from "@repo/shared"
import { useMemo } from "react"
import type { Address } from "viem"
import { formatUnits } from "viem"
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

/**
 * Hook to get USD prices for multiple tokens
 *
 * Uses the token registry to determine pricing type:
 * - Stablecoins: $1.00
 * - BTC-pegged: BTC price from oracle
 * - MEZO: MEZO price from oracle/fallback
 * - Unknown: null (no price available)
 */
export function useTokenPrices(
  tokens: { address: Address; symbol: string }[],
): {
  prices: Map<string, number | null>
  isLoading: boolean
} {
  const { price: btcPrice, isLoading: isLoadingBtc } = useBtcPrice()
  const { price: mezoPrice, isLoading: isLoadingMezo } = useMezoPrice()

  const prices = useMemo(() => {
    const priceMap = new Map<string, number | null>()

    for (const token of tokens) {
      const price = getTokenUsdPrice(
        token.address,
        token.symbol,
        btcPrice,
        mezoPrice,
      )
      priceMap.set(token.address.toLowerCase(), price)
    }

    return priceMap
  }, [tokens, btcPrice, mezoPrice])

  return {
    prices,
    isLoading: isLoadingBtc || isLoadingMezo,
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

  const price = useMemo(() => {
    if (!address) return null
    return getTokenUsdPrice(address, symbol, btcPrice, mezoPrice)
  }, [address, symbol, btcPrice, mezoPrice])

  return {
    price,
    isLoading: isLoadingBtc || isLoadingMezo,
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

  const result = useMemo(() => {
    let total = 0
    const values: TokenValueResult[] = tokens.map((token) => {
      const priceUsd = getTokenUsdPrice(
        token.address,
        token.symbol,
        btcPrice,
        mezoPrice,
      )
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
  }, [tokens, btcPrice, mezoPrice])

  return {
    ...result,
    isLoading: isLoadingBtc || isLoadingMezo,
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
