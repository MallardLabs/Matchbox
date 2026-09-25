import { CHAIN_ID, type SupportedChainId } from "@repo/shared/contracts"
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import { useAccount, useChainId, useSwitchChain } from "wagmi"

type NetworkContextValue = {
  chainId: SupportedChainId
  isMainnet: boolean
  isNetworkReady: boolean
  switchNetwork: () => void
  networkName: string
}

const NetworkContext = createContext<NetworkContextValue | undefined>(undefined)
const NETWORK_STORAGE_KEY = "mezo-network"

function isSupportedMezoChainId(chainId: number): chainId is SupportedChainId {
  return chainId === CHAIN_ID.mainnet || chainId === CHAIN_ID.testnet
}

function readSavedNetwork(): SupportedChainId {
  try {
    return window.localStorage.getItem(NETWORK_STORAGE_KEY) === "testnet"
      ? CHAIN_ID.testnet
      : CHAIN_ID.mainnet
  } catch {
    return CHAIN_ID.mainnet
  }
}

function writeSavedNetwork(chainId: SupportedChainId) {
  try {
    window.localStorage.setItem(
      NETWORK_STORAGE_KEY,
      chainId === CHAIN_ID.mainnet ? "mainnet" : "testnet",
    )
  } catch {
    /* The choice still applies for this session. */
  }
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const wagmiChainId = useChainId()
  const { isConnected } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  // Client-only app: read the saved network during the first render so
  // queries start immediately instead of waiting a render for an effect.
  const [chainId, setChainId] = useState(readSavedNetwork)

  const switchNetwork = useCallback(() => {
    const next =
      chainId === CHAIN_ID.mainnet ? CHAIN_ID.testnet : CHAIN_ID.mainnet
    setChainId(next)
    writeSavedNetwork(next)
    if (isConnected && isSupportedMezoChainId(wagmiChainId)) {
      void switchChainAsync({ chainId: next })
    }
  }, [chainId, isConnected, switchChainAsync, wagmiChainId])

  const value = useMemo(
    () => ({
      chainId,
      isMainnet: chainId === CHAIN_ID.mainnet,
      isNetworkReady: true,
      switchNetwork,
      networkName: chainId === CHAIN_ID.mainnet ? "Mainnet" : "Testnet",
    }),
    [chainId, switchNetwork],
  )

  return (
    <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
  )
}

export function useNetwork() {
  const ctx = useContext(NetworkContext)
  if (!ctx) throw new Error("useNetwork must be used inside NetworkProvider")
  return ctx
}
