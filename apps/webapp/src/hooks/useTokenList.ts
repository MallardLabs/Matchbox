import { CHAIN_ID, CONTRACTS } from "@repo/shared/contracts"
import { useNetwork } from "@/contexts/NetworkContext"
import { useEffect, useState } from "react"
import type { Address } from "viem"
import { erc20Abi, getAddress } from "viem"
import { useReadContracts } from "wagmi"

export type Token = {
  chainId: number
  address: Address
  name: string
  symbol: string
  decimals: number
  logoURI?: string
}

type TokenList = {
  name: string
  tokens: Token[]
}

const DEFAULT_TOKEN_LIST_URL =
  "https://tokens.coingecko.com/uniswap/all.json" as const

// Default tokens that are always available for selection on Mezo
const DEFAULT_TOKENS: Token[] = [
  {
    chainId: CHAIN_ID.testnet,
    address: CONTRACTS.testnet.mezoToken,
    name: "Mezo",
    symbol: "MEZO",
    decimals: 18,
    logoURI: "/token icons/Mezo.svg",
  },
  {
    chainId: CHAIN_ID.testnet,
    address: getAddress("0x7b7C000000000000000000000000000000000000"),
    name: "Bitcoin",
    symbol: "BTC",
    decimals: 18,
    logoURI: "/token icons/Bitcoin.svg",
  },
]

export function useTokenList(tokenListUrl?: string) {
  const { chainId } = useNetwork()
  const [tokens, setTokens] = useState<Token[]>(DEFAULT_TOKENS)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const fetchTokenList = async () => {
      try {
        setIsLoading(true)
        const url = tokenListUrl || DEFAULT_TOKEN_LIST_URL
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`Failed to fetch token list: ${response.statusText}`)
        }
        const data: TokenList = await response.json()
        const chainTokens = data.tokens.filter(
          (token) => token.chainId === chainId,
        )
        // Combine default tokens with fetched tokens, avoiding duplicates
        const defaultAddresses = new Set(
          DEFAULT_TOKENS.map((t) => t.address.toLowerCase()),
        )
        const filteredChainTokens = chainTokens.filter(
          (token) => !defaultAddresses.has(token.address.toLowerCase()),
        )
        setTokens([...DEFAULT_TOKENS, ...filteredChainTokens])
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error"))
        // Keep default tokens even on error
        setTokens(DEFAULT_TOKENS)
      } finally {
        setIsLoading(false)
      }
    }

    fetchTokenList()
  }, [tokenListUrl])

  return { tokens, isLoading, error }
}

export function useCustomToken(address: Address | undefined) {
  const { chainId } = useNetwork()
  const { data, isLoading } = useReadContracts({
    contracts: address
      ? [
        {
          address,
          abi: erc20Abi,
          functionName: "name",
        },
        {
          address,
          abi: erc20Abi,
          functionName: "symbol",
        },
        {
          address,
          abi: erc20Abi,
          functionName: "decimals",
        },
      ]
      : [],
    query: {
      enabled: !!address,
    },
  })

  if (!address || isLoading || !data) {
    return { token: undefined, isLoading }
  }

  const [nameResult, symbolResult, decimalsResult] = data

  if (
    !nameResult ||
    !symbolResult ||
    !decimalsResult ||
    nameResult.error ||
    symbolResult.error ||
    decimalsResult.error
  ) {
    return { token: undefined, isLoading: false }
  }

  const token: Token = {
    chainId: chainId,
    address,
    name: nameResult.result as string,
    symbol: symbolResult.result as string,
    decimals: decimalsResult.result as number,
  }

  return { token, isLoading }
}
