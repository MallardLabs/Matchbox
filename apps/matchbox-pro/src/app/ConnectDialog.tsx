import {
  type ReactElement,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import ConnectDrawer from "./ConnectDrawer"

type ConnectDialogContextValue = { open: () => void }

const ConnectDialogContext = createContext<ConnectDialogContextValue | null>(
  null,
)

export function useConnectDialog(): ConnectDialogContextValue {
  const value = useContext(ConnectDialogContext)
  if (!value) {
    throw new Error(
      "useConnectDialog must be used inside <ConnectDialogProvider>",
    )
  }
  return value
}

export function ConnectDialogProvider({
  children,
}: {
  children: ReactNode
}): ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const open = useCallback(() => setIsOpen(true), [])
  const value = useMemo(() => ({ open }), [open])
  return (
    <ConnectDialogContext.Provider value={value}>
      {children}
      <ConnectDrawer open={isOpen} onOpenChange={setIsOpen} />
    </ConnectDialogContext.Provider>
  )
}
