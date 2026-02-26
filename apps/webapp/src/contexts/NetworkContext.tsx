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
    return CHAIN_ID.testnet
  }

  const saved = window.localStorage.getItem(NETWORK_STORAGE_KEY)
  return saved === "mainnet" ? CHAIN_ID.mainnet : CHAIN_ID.testnet
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
    const savedChainId = readSavedNetwork()

    if (!isConnected) {
      if (savedChainId !== chainId) {
        setChainId(savedChainId)
      }

      if (!isNetworkReady) {
        console.info("[Network] Initialized from saved preference", {
          isConnected,
          savedChainId,
        })
      }
    } else if (isSupportedMezoChainId(wagmiChainId)) {
      if (wagmiChainId !== chainId) {
        setChainId(wagmiChainId)
      }
      writeSavedNetwork(wagmiChainId)

      if (!isNetworkReady) {
        console.info("[Network] Initialized from connected wallet chain", {
          wagmiChainId,
        })
      }
    } else if (savedChainId !== chainId) {
      setChainId(savedChainId)
    }

    if (!isNetworkReady) {
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

    if (!switchChainAsync) {
      console.warn("[Network] Manual switch unavailable for current wallet", {
        fromChainId: previousChainId,
        toChainId: newChainId,
      })
      return
    }

    console.info("[Network] Attempting manual switch", {
      fromChainId: previousChainId,
      toChainId: newChainId,
    })

    switchChainAsync({ chainId: newChainId })
      .then(() => {
        setChainId(newChainId)
        writeSavedNetwork(newChainId)
        console.info("[Network] Manual switch successful", {
          fromChainId: previousChainId,
          toChainId: newChainId,
        })
      })
      .catch((error) => {
        console.warn("[Network] Manual switch failed", {
          fromChainId: previousChainId,
          toChainId: newChainId,
          error,
        })
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
