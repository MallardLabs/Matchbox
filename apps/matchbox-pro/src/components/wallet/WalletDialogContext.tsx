import { type ReactNode, createContext, useContext, useMemo } from "react"

type WalletDialogContextValue = {
  openConnect: () => void
}

const WalletDialogContext = createContext<WalletDialogContextValue | null>(null)

export function WalletDialogProvider({
  children,
  onOpenConnect,
}: {
  children: ReactNode
  onOpenConnect: () => void
}) {
  const value = useMemo(() => ({ openConnect: onOpenConnect }), [onOpenConnect])
  return (
    <WalletDialogContext.Provider value={value}>
      {children}
    </WalletDialogContext.Provider>
  )
}

export function useWalletDialog(): WalletDialogContextValue {
  const context = useContext(WalletDialogContext)
  if (!context) {
    throw new Error("useWalletDialog must be used inside WalletDialogProvider")
  }
  return context
}
