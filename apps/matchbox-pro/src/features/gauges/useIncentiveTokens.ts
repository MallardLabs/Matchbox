import { getContractConfig } from "@/lib/contracts"
import { useNetwork } from "@/lib/network"
import { ERC20_ABI } from "@repo/shared/contracts"
import { CHAIN_ID, type SupportedChainId } from "@repo/shared/contracts"
import type { TokenKind } from "@repo/ui/token-mark"
import { useCallback, useMemo } from "react"
import { type Address, getAddress } from "viem"
import { useReadContracts } from "wagmi"

export type IncentiveToken = {
  symbol: string
  kind: TokenKind
  address: Address
}

// MEZO and BTC share an address on both networks; mUSD differs.
const MEZO = getAddress("0x7B7c000000000000000000000000000000000001")
const BTC = getAddress("0x7b7C000000000000000000000000000000000000")
const MUSD: Record<SupportedChainId, Address> = {
  [CHAIN_ID.mainnet]: getAddress("0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186"),
  [CHAIN_ID.testnet]: getAddress("0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503"),
}

// BTC also pays gas; MAX leaves this much behind (~30× a deposit's gas).
export const BTC_GAS_RESERVE = 10n ** 13n

export function incentiveTokens(chainId: SupportedChainId): IncentiveToken[] {
  return [
    { symbol: "MEZO", kind: "mezo", address: MEZO },
    { symbol: "BTC", kind: "btc", address: BTC },
    { symbol: "mUSD", kind: "musd", address: MUSD[chainId] },
  ]
}

export function maxDeposit(token: IncentiveToken, balance: bigint): bigint {
  if (token.address !== BTC) return balance
  return balance > BTC_GAS_RESERVE ? balance - BTC_GAS_RESERVE : 0n
}

export type IncentiveTokenState = IncentiveToken & {
  /** Undefined while the allowlist read is pending. */
  allowlisted: boolean | undefined
  decimals: number | undefined
  balance: bigint | undefined
  allowance: bigint | undefined
}

function asBigint(value: unknown): bigint | undefined {
  return typeof value === "bigint" ? value : undefined
}

/** Allowlist, decimals, and the signer's balance and allowance per token. */
export function useIncentiveTokens(owner: Address | undefined) {
  const { chainId } = useNetwork()
  const contracts = getContractConfig(chainId)
  const tokens = useMemo(() => incentiveTokens(chainId), [chainId])

  const meta = useReadContracts({
    contracts: tokens.flatMap((token) => [
      {
        ...contracts.boostVoter,
        functionName: "isWhitelistedToken" as const,
        args: [token.address] as const,
      },
      {
        address: token.address,
        abi: ERC20_ABI,
        chainId,
        functionName: "decimals" as const,
      },
    ]),
    query: { staleTime: 300_000 },
  })

  const wallet = useReadContracts({
    contracts: owner
      ? tokens.flatMap((token) => [
          {
            address: token.address,
            abi: ERC20_ABI,
            chainId,
            functionName: "balanceOf" as const,
            args: [owner] as const,
          },
          {
            address: token.address,
            abi: ERC20_ABI,
            chainId,
            functionName: "allowance" as const,
            args: [owner, contracts.boostVoter.address] as const,
          },
        ])
      : [],
    query: { enabled: Boolean(owner) },
  })

  const states = useMemo<IncentiveTokenState[]>(
    () =>
      tokens.map((token, index) => {
        const allowlisted = meta.data?.[index * 2]?.result
        const decimals = meta.data?.[index * 2 + 1]?.result
        return {
          ...token,
          allowlisted:
            typeof allowlisted === "boolean" ? allowlisted : undefined,
          decimals: typeof decimals === "number" ? decimals : undefined,
          balance: asBigint(wallet.data?.[index * 2]?.result),
          allowance: asBigint(wallet.data?.[index * 2 + 1]?.result),
        }
      }),
    [meta.data, tokens, wallet.data],
  )

  const { refetch: refetchWallet } = wallet
  /** Re-reads the wallet so an approval decision never uses a stale allowance. */
  const freshAllowance = useCallback(
    async (token: Address): Promise<bigint | undefined> => {
      const index = tokens.findIndex((item) => item.address === token)
      if (index < 0) return undefined
      const result = await refetchWallet()
      return asBigint(result.data?.[index * 2 + 1]?.result)
    },
    [refetchWallet, tokens],
  )

  return {
    tokens: states,
    isLoading: meta.isLoading,
    isError: meta.isError,
    walletLoading: Boolean(owner) && wallet.isLoading,
    refetchWallet,
    freshAllowance,
  }
}
