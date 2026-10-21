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
  /** Developer mode: flips the app between Mezo mainnet and testnet. */
  switchNetwork: () => void
  networkName: string
  walletChainId: number | undefined
  /** Connected wallet sits on a different chain than the app. */
  isWrongNetwork: boolean
  isSwitching: boolean
  switchWalletToApp: () => Promise<void>
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

// Names for chains a wallet is commonly left on, for the wrong-network banner.
const KNOWN_CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  56: "BNB Chain",
  137: "Polygon",
  8453: "Base",
  42161: "Arbitrum",
  [CHAIN_ID.mainnet]: "Mezo",
  [CHAIN_ID.testnet]: "Mezo testnet",
}

export function chainName(chainId: number | undefined): string {
  if (chainId === undefined) return "another network"
  return KNOWN_CHAIN_NAMES[chainId] ?? `chain ${chainId}`
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const wagmiChainId = useChainId()
  const { isConnected, chainId: walletChainId } = useAccount()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
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

  const isWrongNetwork =
    isConnected && walletChainId !== undefined && walletChainId !== chainId

  const switchWalletToApp = useCallback(async () => {
    try {
      await switchChainAsync({ chainId })
    } catch {
      // The wallet declined or can't add the chain; the banner stays up.
    }
  }, [chainId, switchChainAsync])

  const value = useMemo(
    () => ({
      chainId,
      isMainnet: chainId === CHAIN_ID.mainnet,
      isNetworkReady: true,
      switchNetwork,
      networkName: chainId === CHAIN_ID.mainnet ? "Mainnet" : "Testnet",
      walletChainId,
      isWrongNetwork,
      isSwitching,
      switchWalletToApp,
    }),
    [
      chainId,
      switchNetwork,
      walletChainId,
      isWrongNetwork,
      isSwitching,
      switchWalletToApp,
    ],
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
