import type { WalletContext } from "@/lib/query/contracts"
import {
  type WatchedWallet,
  createWatchedWallet,
  parseStoredWalletState,
  serializeWalletState,
  upsertWatchedWallet,
  walletStorageKey,
} from "@/lib/wallet/selection"
import { useEffect, useState } from "react"
import { useAccount, useDisconnect } from "wagmi"

export const noWalletContext: WalletContext = {
  address: "0x0000000000000000000000000000000000000000",
  label: "No wallet selected",
  mode: "inspecting",
  network: "Mezo Mainnet",
}

export type WalletSelection = WalletContext & {
  mode: "connected" | "watching"
}

export function useWalletSelection() {
  const account = useAccount()
  const { disconnect } = useDisconnect()
  const [watchedWallets, setWatchedWallets] = useState<WatchedWallet[]>([])
  const [activeWallet, setActiveWallet] = useState<WalletSelection | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = parseStoredWalletState(
      window.localStorage.getItem(walletStorageKey),
    )
    setWatchedWallets(stored.watchedWallets)
    if (stored.activeWatchedAddress) {
      const watched = stored.watchedWallets.find(
        (item) =>
          item.address.toLowerCase() ===
          stored.activeWatchedAddress?.toLowerCase(),
      )
      if (watched) {
        setActiveWallet({
          ...watched,
          mode: "watching",
          network: "Mezo Mainnet",
        })
      }
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    if (account.isConnected && account.address) {
      const connectedAddress = account.address
      setActiveWallet((current) =>
        current?.mode === "watching"
          ? current
          : {
              address: connectedAddress,
              label: account.connector?.name ?? "Connected wallet",
              mode: "connected",
              network: "Mezo Mainnet",
            },
      )
      return
    }
    setActiveWallet((current) =>
      current?.mode === "connected" ? null : current,
    )
  }, [account.address, account.connector?.name, account.isConnected, hydrated])

  useEffect(() => {
    if (!hydrated) return
    window.localStorage.setItem(
      walletStorageKey,
      serializeWalletState({
        watchedWallets,
        activeWatchedAddress:
          activeWallet?.mode === "watching" ? activeWallet.address : null,
      }),
    )
  }, [activeWallet, hydrated, watchedWallets])

  function addWatchedWallet(input: {
    address: string
    label?: string
  }): WalletSelection {
    const watched = createWatchedWallet(input)
    setWatchedWallets((current) => upsertWatchedWallet(current, watched))
    const selection: WalletSelection = {
      ...watched,
      mode: "watching",
      network: "Mezo Mainnet",
    }
    setActiveWallet(selection)
    return selection
  }

  function selectWatchedWallet(wallet: WatchedWallet): void {
    setActiveWallet({
      ...wallet,
      mode: "watching",
      network: "Mezo Mainnet",
    })
  }

  function selectConnectedWallet(): void {
    if (!account.address || !account.isConnected) return
    setActiveWallet({
      address: account.address,
      label: account.connector?.name ?? "Connected wallet",
      mode: "connected",
      network: "Mezo Mainnet",
    })
  }

  function disconnectWallet(): void {
    disconnect()
    setActiveWallet((current) =>
      current?.mode === "connected" ? null : current,
    )
  }

  return {
    account,
    activeWallet,
    addWatchedWallet,
    disconnectWallet,
    hydrated,
    selectConnectedWallet,
    selectWatchedWallet,
    watchedWallets,
  }
}
