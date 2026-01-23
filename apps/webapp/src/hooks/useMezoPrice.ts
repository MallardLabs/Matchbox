import {
  CHAIN_ID,
  MEZO_FALLBACK_PRICE,
  MEZO_PYTH_PRICE_FEED_ID,
  PYTH_MAX_PRICE_AGE,
  PYTH_ORACLE_ABI,
  type PythPrice,
  USE_PYTH_ORACLE,
  getPythOracleAddress,
  pythPriceToNumber,
} from "@repo/shared"
import { useReadContract } from "wagmi"

export type MezoPriceResult = {
  price: number | null
  isLoading: boolean
  isError: boolean
  source: "pyth" | "fallback"
}

export function useMezoPrice(): MezoPriceResult {
  const chainId = CHAIN_ID.testnet
  const pythAddress = getPythOracleAddress(chainId)

  const {
    data: pythPriceData,
    isLoading: isPythLoading,
    isError: isPythError,
  } = useReadContract({
    address: pythAddress,
    abi: PYTH_ORACLE_ABI,
    functionName: "getPriceNoOlderThan",
    args: [MEZO_PYTH_PRICE_FEED_ID, PYTH_MAX_PRICE_AGE],
    query: {
      enabled: USE_PYTH_ORACLE,
      retry: false,
    },
  })

  if (!USE_PYTH_ORACLE) {
    return {
      price: MEZO_FALLBACK_PRICE,
      isLoading: false,
      isError: false,
      source: "fallback",
    }
  }

  if (isPythLoading) {
    return {
      price: null,
      isLoading: true,
      isError: false,
      source: "pyth",
    }
  }

  if (isPythError || !pythPriceData) {
    return {
      price: null,
      isLoading: false,
      isError: true,
      source: "pyth",
    }
  }

  const pythPrice = pythPriceData as PythPrice
  const priceUsd = pythPriceToNumber(pythPrice)

  return {
    price: priceUsd,
    isLoading: false,
    isError: false,
    source: "pyth",
  }
}
