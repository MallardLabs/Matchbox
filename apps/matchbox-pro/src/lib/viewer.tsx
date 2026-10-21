import {
  type ReactElement,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import { type Address, getAddress, isAddress } from "viem"
import { useAccount } from "wagmi"
import { useNetwork } from "./network"

// Whose positions the app shows. A watched address is read-only: every write
// path must check `canSign`, which is only true for the connected wallet on
// the app's network.
export type Viewer =
  | { mode: "disconnected"; address: undefined; canSign: false }
  | {
      mode: "connected"
      address: Address
      canSign: boolean
      wrongNetwork: boolean
    }
  | {
      mode: "watching"
      address: Address
      canSign: false
      connectedAddress: Address | undefined
    }

type ViewerContextValue = {
  viewer: Viewer
  watch: (address: string) => boolean
  stopWatching: () => void
}

const WATCH_STORAGE_KEY = "matchbox-pro:watch"
const WATCH_PARAM = "watch"

const ViewerContext = createContext<ViewerContextValue | null>(null)

function parseAddress(value: string | null | undefined): Address | undefined {
  if (!value || !isAddress(value, { strict: false })) return undefined
  return getAddress(value)
}

function readInitialWatch(): Address | undefined {
  try {
    const fromUrl = parseAddress(
      new URLSearchParams(window.location.search).get(WATCH_PARAM),
    )
    if (fromUrl) return fromUrl
    return parseAddress(window.sessionStorage.getItem(WATCH_STORAGE_KEY))
  } catch {
    return undefined
  }
}

function persistWatch(address: Address | undefined): void {
  try {
    if (address) window.sessionStorage.setItem(WATCH_STORAGE_KEY, address)
    else window.sessionStorage.removeItem(WATCH_STORAGE_KEY)
  } catch {
    // Watching still works for this page view.
  }
}

export function ViewerProvider({
  children,
}: {
  children: ReactNode
}): ReactElement {
  const { address: connected, isConnected } = useAccount()
  const { isWrongNetwork } = useNetwork()
  const [watched, setWatched] = useState<Address | undefined>(readInitialWatch)

  const watch = useCallback((value: string) => {
    const address = parseAddress(value.trim())
    if (!address) return false
    setWatched(address)
    persistWatch(address)
    return true
  }, [])

  const stopWatching = useCallback(() => {
    setWatched(undefined)
    persistWatch(undefined)
  }, [])

  const viewer = useMemo<Viewer>(() => {
    if (watched && watched !== connected) {
      return {
        mode: "watching",
        address: watched,
        canSign: false,
        connectedAddress: isConnected ? connected : undefined,
      }
    }
    if (isConnected && connected) {
      return {
        mode: "connected",
        address: connected,
        canSign: !isWrongNetwork,
        wrongNetwork: isWrongNetwork,
      }
    }
    return { mode: "disconnected", address: undefined, canSign: false }
  }, [connected, isConnected, isWrongNetwork, watched])

  const value = useMemo(
    () => ({ viewer, watch, stopWatching }),
    [viewer, watch, stopWatching],
  )

  return (
    <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>
  )
}

export function useViewer(): ViewerContextValue {
  const value = useContext(ViewerContext)
  if (!value) throw new Error("useViewer must be used inside <ViewerProvider>")
  return value
}
