import { CHAIN_ID, type SupportedChainId } from "@repo/shared/contracts"
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import { useSwitchChain } from "wagmi"

type NetworkContextType = {
  chainId: SupportedChainId
  isMainnet: boolean
  switchNetwork: () => void
  networkName: string
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined)

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [chainId, setChainId] = useState<SupportedChainId>(CHAIN_ID.testnet)
  const { switchChain } = useSwitchChain()

  useEffect(() => {
    const saved = localStorage.getItem("mezo-network")
    if (saved === "mainnet") {
      setChainId(CHAIN_ID.mainnet)
    }
  }, [])

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
