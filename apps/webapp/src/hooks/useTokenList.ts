import { useNetwork } from "@/contexts/NetworkContext"
import { CHAIN_ID, CONTRACTS } from "@repo/shared/contracts"
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

// Default tokens that are always available for selection on Mezo, per network
const DEFAULT_TOKENS: Record<number, Token[]> = {
  [CHAIN_ID.testnet]: [
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
    {
      chainId: CHAIN_ID.testnet,
      address: getAddress("0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503"),
      name: "MUSD",
      symbol: "MUSD",
      decimals: 18,
      logoURI: "/token icons/MUSD.svg",
    },
    {
      chainId: CHAIN_ID.testnet,
      address: getAddress("0x04671C72Aab5AC02A03c1098314b1BB6B560c197"),
      name: "USD Coin",
      // Mezo bridged USDC — symbol must stay mUSDC (leading "m"), not USDC
      symbol: "mUSDC",
      decimals: 6,
      logoURI: "/token icons/mUSDC.svg",
    },
    {
      chainId: CHAIN_ID.testnet,
      address: getAddress("0xeB5a5d39dE4Ea42C2Aa6A57EcA2894376683bB8E"),
      name: "Tether USD",
      // Mezo bridged USDT — symbol must stay mUSDT (leading "m"), not USDT
      symbol: "mUSDT",
      decimals: 6,
      logoURI: "/token icons/mUSDT.svg",
    },
  ],
  [CHAIN_ID.mainnet]: [
    {
      chainId: CHAIN_ID.mainnet,
      address: CONTRACTS.mainnet.mezoToken,
      name: "Mezo",
      symbol: "MEZO",
      decimals: 18,
      logoURI: "/token icons/Mezo.svg",
    },
    {
      chainId: CHAIN_ID.mainnet,
      address: getAddress("0x7b7C000000000000000000000000000000000000"),
      name: "Bitcoin",
      symbol: "BTC",
      decimals: 18,
      logoURI: "/token icons/Bitcoin.svg",
    },
    {
      chainId: CHAIN_ID.mainnet,
      address: getAddress("0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186"),
      name: "MUSD",
      symbol: "MUSD",
      decimals: 18,
      logoURI: "/token icons/MUSD.svg",
    },
    {
      chainId: CHAIN_ID.mainnet,
      address: getAddress("0x04671C72Aab5AC02A03c1098314b1BB6B560c197"),
      name: "USD Coin",
      // Mezo bridged USDC — symbol must stay mUSDC (leading "m"), not USDC
      symbol: "mUSDC",
      decimals: 6,
      logoURI: "/token icons/mUSDC.svg",
    },
    {
      chainId: CHAIN_ID.mainnet,
      address: getAddress("0xeB5a5d39dE4Ea42C2Aa6A57EcA2894376683bB8E"),
      name: "Tether USD",
      // Mezo bridged USDT — symbol must stay mUSDT (leading "m"), not USDT
      symbol: "mUSDT",
      decimals: 6,
      logoURI: "/token icons/mUSDT.svg",
    },
  ],
}

export function useTokenList(tokenListUrl?: string) {
  const { chainId } = useNetwork()
  const defaultTokens = DEFAULT_TOKENS[chainId] ?? []
  const [tokens, setTokens] = useState<Token[]>(defaultTokens)
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
        const networkDefaultTokens = DEFAULT_TOKENS[chainId] ?? []
        const defaultAddresses = new Set(
          networkDefaultTokens.map((t) => t.address.toLowerCase()),
        )
        const filteredChainTokens = chainTokens.filter(
          (token) => !defaultAddresses.has(token.address.toLowerCase()),
        )
        setTokens([...networkDefaultTokens, ...filteredChainTokens])
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error"))
        // Keep default tokens even on error
        setTokens(DEFAULT_TOKENS[chainId] ?? [])
      } finally {
        setIsLoading(false)
      }
    }

    fetchTokenList()
  }, [tokenListUrl, chainId])

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
