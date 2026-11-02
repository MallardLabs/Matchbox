import { useNetwork } from "@/contexts/NetworkContext"
import {
  assertWalletChain,
  getChainLabel,
  isWrongWalletNetwork,
} from "@/utils/walletNetwork"
import { useCallback } from "react"
import { useAccount, useConfig, useSwitchChain } from "wagmi"
import { getAccount } from "wagmi/actions"

export type WalletNetworkGate = {
  isWrongNetwork: boolean
  walletNetworkName: string | undefined
  isSwitching: boolean
  switchError: Error | null
  switchWalletNetwork: () => void
  assertWalletNetwork: () => Promise<void>
}

/**
 * The wrong-network gate shared by every write path: is the connected wallet
 * on the network the UI shows? `isWrongNetwork` drives the global banner and
 * gated buttons. `assertWalletNetwork` asks the connector for its chain right
 * before a signing request, because React state and the cached wallet client
 * can lag a switch made inside the wallet.
 */
export default function useWalletNetworkGate(): WalletNetworkGate {
  const { chainId } = useNetwork()
  const config = useConfig()
  const { chainId: walletChainId, isConnected } = useAccount()
  const { switchChain, isPending, error } = useSwitchChain()

  const switchWalletNetwork = useCallback(() => {
    switchChain({ chainId })
  }, [chainId, switchChain])

  const assertWalletNetwork = useCallback(async () => {
    const { connector } = getAccount(config)
    assertWalletChain(await connector?.getChainId(), chainId)
  }, [chainId, config])

  return {
    isWrongNetwork: isConnected && isWrongWalletNetwork(walletChainId, chainId),
    walletNetworkName:
      walletChainId === undefined ? undefined : getChainLabel(walletChainId),
    isSwitching: isPending,
    switchError: error,
    switchWalletNetwork,
    assertWalletNetwork,
  }
}
