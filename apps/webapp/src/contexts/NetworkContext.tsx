import { CHAIN_ID, type SupportedChainId } from "@repo/shared/contracts"
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import { useChainId, useSwitchChain } from "wagmi"

type NetworkContextType = {
  chainId: SupportedChainId
  isMainnet: boolean
  switchNetwork: () => void
  networkName: string
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined)

export function NetworkProvider({ children }: { children: ReactNode }) {
  const wagmiChainId = useChainId()
  const [chainId, setChainId] = useState<SupportedChainId>(CHAIN_ID.testnet)
  const [hasInitialized, setHasInitialized] = useState(false)
  const { switchChain } = useSwitchChain()

  // Initial load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("mezo-network")
    if (saved === "mainnet") {
      setChainId(CHAIN_ID.mainnet)
    } else {
      setChainId(CHAIN_ID.testnet)
    }
    setHasInitialized(true)
  }, [])

  // Sync with Wagmi chain changes
  useEffect(() => {
    if (wagmiChainId === CHAIN_ID.mainnet || wagmiChainId === CHAIN_ID.testnet) {
      if (wagmiChainId !== chainId) {
        setChainId(wagmiChainId)
        localStorage.setItem(
          "mezo-network",
          wagmiChainId === CHAIN_ID.mainnet ? "mainnet" : "testnet",
        )
      }
    }
  }, [wagmiChainId, chainId])

  const switchNetwork = useCallback(() => {
    const newChainId =
      chainId === CHAIN_ID.testnet ? CHAIN_ID.mainnet : CHAIN_ID.testnet
    setChainId(newChainId)
    localStorage.setItem(
      "mezo-network",
      newChainId === CHAIN_ID.mainnet ? "mainnet" : "testnet",
    )
    switchChain?.({ chainId: newChainId })
  }, [chainId, switchChain])

  const isMainnet = chainId === CHAIN_ID.mainnet
  const networkName = isMainnet ? "Mezo Mainnet" : "Mezo Testnet"

  return (
    <NetworkContext.Provider
      value={{ chainId, isMainnet, switchNetwork, networkName }}
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

