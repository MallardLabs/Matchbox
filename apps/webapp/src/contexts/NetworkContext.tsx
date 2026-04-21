import { CHAIN_ID, type SupportedChainId } from "@repo/shared/contracts"
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import { useAccount, useChainId, useSwitchChain } from "wagmi"

type NetworkContextType = {
  chainId: SupportedChainId
  isMainnet: boolean
  isNetworkReady: boolean
  switchNetwork: () => void
  networkName: string
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined)

const NETWORK_STORAGE_KEY = "mezo-network"

function isSupportedMezoChainId(chainId: number): chainId is SupportedChainId {
  return chainId === CHAIN_ID.mainnet || chainId === CHAIN_ID.testnet
}

function readSavedNetwork(): SupportedChainId {
  if (typeof window === "undefined") {
    return CHAIN_ID.mainnet
  }

  const saved = window.localStorage.getItem(NETWORK_STORAGE_KEY)
  return saved === "testnet" ? CHAIN_ID.testnet : CHAIN_ID.mainnet
}

function writeSavedNetwork(chainId: SupportedChainId) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(
    NETWORK_STORAGE_KEY,
    chainId === CHAIN_ID.mainnet ? "mainnet" : "testnet",
  )
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const wagmiChainId = useChainId()
  const { isConnected } = useAccount()
  const [chainId, setChainId] = useState<SupportedChainId>(() =>
    readSavedNetwork(),
  )
  const [isNetworkReady, setIsNetworkReady] = useState(false)
  const { switchChainAsync } = useSwitchChain()

  useEffect(() => {
    // Saved preference is the source of truth for the UI's selected network.
    // We DO NOT auto-override it with wagmi's chain when the wallet is on a
    // different Mezo chain — that silently defeated the user's explicit switch
    // (e.g. toggling to Testnet while the wallet was still on Mainnet would
    // snap the UI right back to Mainnet pools).
    //
    // Exception: on first mount with no explicit stored preference AND the
    // wallet is already on a supported Mezo chain, we adopt the wallet's chain
    // as the starting preference. Otherwise the saved value wins.
    if (!isNetworkReady) {
      const hasStored =
        typeof window !== "undefined" &&
        window.localStorage.getItem(NETWORK_STORAGE_KEY) !== null
      const savedChainId = readSavedNetwork()

      if (!hasStored && isConnected && isSupportedMezoChainId(wagmiChainId)) {
        if (wagmiChainId !== chainId) {
          setChainId(wagmiChainId)
        }
        writeSavedNetwork(wagmiChainId)
        console.info("[Network] Initialized from connected wallet chain", {
          wagmiChainId,
        })
      } else {
        if (savedChainId !== chainId) {
          setChainId(savedChainId)
        }
        console.info("[Network] Initialized from saved preference", {
          isConnected,
          savedChainId,
        })
      }

      setIsNetworkReady(true)
    }
  }, [wagmiChainId, chainId, isConnected, isNetworkReady])

  const switchNetwork = useCallback(() => {
    if (!isNetworkReady) return

    const newChainId =
      chainId === CHAIN_ID.testnet ? CHAIN_ID.mainnet : CHAIN_ID.testnet
    const previousChainId = chainId

    if (!isConnected) {
      setChainId(newChainId)
      writeSavedNetwork(newChainId)
      console.info("[Network] Switched preference while disconnected", {
        fromChainId: previousChainId,
        toChainId: newChainId,
      })
      return
    }

    // Update the UI's selected network immediately so pool/bribe data refetch
    // right away. The wallet chain switch is fired best-effort; if the user
    // rejects or the wallet hangs, the UI still reflects the chosen network
    // (on-chain reads via wagmi will simply no-op until the wallet catches up
    // or the user connects a wallet on the chosen chain).
    setChainId(newChainId)
    writeSavedNetwork(newChainId)

    if (!switchChainAsync) {
      console.warn("[Network] Wallet switch unavailable; UI updated only", {
        fromChainId: previousChainId,
        toChainId: newChainId,
      })
      return
    }

    console.info("[Network] Attempting wallet chain switch", {
      fromChainId: previousChainId,
      toChainId: newChainId,
    })

    switchChainAsync({ chainId: newChainId })
      .then(() => {
        console.info("[Network] Wallet chain switch successful", {
          fromChainId: previousChainId,
          toChainId: newChainId,
        })
      })
      .catch((error) => {
        console.warn(
          "[Network] Wallet chain switch failed; UI remains on requested chain",
          {
            fromChainId: previousChainId,
            toChainId: newChainId,
            error,
          },
        )
      })
  }, [chainId, isConnected, isNetworkReady, switchChainAsync])

  const isMainnet = chainId === CHAIN_ID.mainnet
  const networkName = isMainnet ? "Mezo Mainnet" : "Mezo Testnet"

  return (
    <NetworkContext.Provider
      value={{
        chainId,
        isMainnet,
        isNetworkReady,
        switchNetwork,
        networkName,
      }}
    >
      {children}
    </NetworkContext.Provider>
  )
}

export function useNetwork() {
  const context = useContext(NetworkContext)
  if (!context) {
    throw new Error("useNetwork must be used within a NetworkProvider")
  }
  return context
}
