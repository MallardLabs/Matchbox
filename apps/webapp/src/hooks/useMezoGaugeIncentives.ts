import { getContractConfig } from "@/config/contracts"
import { toJsonRpcAccount } from "@/config/mezoRpcWrite"
import { QUERY_PROFILES } from "@/config/queryProfiles"
import { useNetwork } from "@/contexts/NetworkContext"
import type { Address, Hex } from "viem"
import { encodeFunctionData } from "viem"
import {
  useAccount,
  useReadContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi"

export function useMezoGaugeTokenAllowlisted(token: Address | undefined): {
  isAllowlisted: boolean | undefined
  isLoading: boolean
} {
  const { chainId, isNetworkReady } = useNetwork()
  const contracts = getContractConfig(chainId)
  const result = useReadContract({
    ...contracts.thirdPartyVoter,
    functionName: "isWhitelistedToken",
    args: token ? [token] : undefined,
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: isNetworkReady && !!token,
    },
  })
  return {
    isAllowlisted: result.data as boolean | undefined,
    isLoading: result.isLoading,
  }
}

export function useAddMezoGaugeIncentive(): {
  addIncentive: (gauge: Address, token: Address, amount: bigint) => void
  hash: Hex | undefined
  isPending: boolean
  isConfirming: boolean
  isSuccess: boolean
  error: Error | null
  reset: () => void
} {
  const { chainId } = useNetwork()
  const { address } = useAccount()
  const contracts = getContractConfig(chainId)
  const send = useSendTransaction()
  const receipt = useWaitForTransactionReceipt({ hash: send.data })
  return {
    addIncentive: (gauge, token, amount) => {
      if (!address) return
      send.sendTransaction({
        account: toJsonRpcAccount(address),
        chainId,
        to: contracts.thirdPartyVoter.address,
        data: encodeFunctionData({
          abi: contracts.thirdPartyVoter.abi,
          functionName: "addBribes",
          args: [gauge, [token], [amount]],
        }),
      })
    },
    hash: send.data,
    isPending: send.isPending,
    isConfirming: receipt.isLoading,
    isSuccess: receipt.isSuccess,
    error: send.error,
    reset: send.reset,
  }
}
