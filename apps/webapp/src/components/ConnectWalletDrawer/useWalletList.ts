import { defaultWallets, mezoMainnet } from "@/config/wagmi"
import { useCallback, useEffect, useState } from "react"
import { useAccount, useConnect } from "wagmi"

type WalletEntry = {
  id: string
  name: string
  icon: string | undefined
  isInstalled: boolean
  downloadUrl: string | undefined
}

type WalletGroup = {
  label: string
  wallets: WalletEntry[]
}

// Known wallet icons for wallets that may not provide their own
const WALLET_ICONS: Record<string, string> = {
  "io.rabby": "https://rabby.io/assets/images/logo.svg",
  rabby: "https://rabby.io/assets/images/logo.svg",
  "com.taho": "https://taho.xyz/taho-logo.svg",
  taho: "https://taho.xyz/taho-logo.svg",
  injected:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'/%3E%3C/svg%3E",
  walletConnect: "https://avatars.githubusercontent.com/u/37784886?s=200&v=4",
}

// Wallets to skip if detected via EIP-6963 (to avoid duplicates)
const EIP6963_WALLET_IDS = new Set([
  "io.rabby",
  "com.taho",
  "io.metamask",
  "com.coinbase.wallet",
])

export function useWalletList(onConnected?: () => void) {
  const { connectors, connect, isPending } = useConnect()
  const { isConnected } = useAccount()
  const [pendingConnectorId, setPendingConnectorId] = useState<string | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [connectingWallet, setConnectingWallet] = useState<WalletEntry | null>(
    null,
  )

  // Auto-close on successful connection
  useEffect(() => {
    if (isConnected && pendingConnectorId) {
      setPendingConnectorId(null)
      setConnectingWallet(null)
      onConnected?.()
    }
  }, [isConnected, pendingConnectorId, onConnected])

  // Resolve icon from known icons or defaultWallets
  function resolveIcon(
    connectorId: string,
    connectorName: string,
    connectorIcon?: string,
  ): string | undefined {
    if (connectorIcon) return connectorIcon

    // Check known wallet icons
    if (WALLET_ICONS[connectorId]) {
      return WALLET_ICONS[connectorId]
    }

    // Check by lowercase name
    const nameLower = connectorName.toLowerCase()
    if (nameLower.includes("rabby")) return WALLET_ICONS["io.rabby"]
    if (nameLower.includes("taho")) return WALLET_ICONS["com.taho"]

    for (const group of defaultWallets) {
      for (const walletFn of group.wallets) {
        const wallet = walletFn as unknown as { id?: string; iconUrl?: string }
        if (wallet.id === connectorId && typeof wallet.iconUrl === "string") {
          return wallet.iconUrl
        }
      }
    }
    return undefined
  }

  // Build grouped wallet list, deduplicating by connector id AND name
  const btcWallets: WalletEntry[] = []
  const evmWallets: WalletEntry[] = []
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()

  // First pass: collect EIP-6963 detected wallets (they have priority)
  const eip6963DetectedNames = new Set<string>()
  for (const connector of connectors) {
    if (EIP6963_WALLET_IDS.has(connector.id)) {
      eip6963DetectedNames.add(connector.name.toLowerCase())
    }
  }

  for (const connector of connectors) {
    // Deduplicate connectors by ID
    if (seenIds.has(connector.id)) continue

    // Skip generic injected connector with "Injected" name (keep "Browser Wallet" ones)
    if (connector.id === "injected" && connector.name === "Injected") continue

    // Skip RainbowKit-added wallets if EIP-6963 version is detected
    const nameLower = connector.name.toLowerCase()
    if (
      !EIP6963_WALLET_IDS.has(connector.id) &&
      (nameLower === "rabby wallet" || nameLower === "taho") &&
      eip6963DetectedNames.has(nameLower)
    ) {
      continue
    }

    // Deduplicate by name (case-insensitive)
    if (seenNames.has(nameLower)) continue

    seenIds.add(connector.id)
    seenNames.add(nameLower)

    // Rename "Browser Wallet" to "Injected Wallet"
    let displayName = connector.name
    if (connector.name === "Browser Wallet") {
      displayName = "Injected Wallet"
    }

    const entry: WalletEntry = {
      id: connector.id,
      name: displayName,
      icon: resolveIcon(connector.id, connector.name, connector.icon),
      isInstalled: true,
      downloadUrl: undefined,
    }

    // OrangeKit BTC connectors have type "orangekit"
    if (connector.type === "orangekit") {
      btcWallets.push(entry)
    } else {
      evmWallets.push(entry)
    }
  }

  // Sort EVM wallets: WalletConnect at the end, Injected Wallet just above it
  evmWallets.sort((a, b) => {
    const aIsWalletConnect = a.id === "walletConnect"
    const bIsWalletConnect = b.id === "walletConnect"
    const aIsInjected = a.name === "Injected Wallet"
    const bIsInjected = b.name === "Injected Wallet"

    if (aIsWalletConnect) return 1
    if (bIsWalletConnect) return -1
    if (aIsInjected) return 1
    if (bIsInjected) return -1
    return 0
  })

  const groups: WalletGroup[] = []
  if (evmWallets.length > 0) {
    groups.push({ label: "EVM", wallets: evmWallets })
  }
  if (btcWallets.length > 0) {
    groups.push({ label: "BTC", wallets: btcWallets })
  }

  const handleConnect = useCallback(
    (connectorId: string, walletEntry?: WalletEntry) => {
      const connector = connectors.find((c) => c.id === connectorId)
      if (!connector) return

      setError(null)
      setPendingConnectorId(connectorId)
      if (walletEntry) {
        setConnectingWallet(walletEntry)
      }

      // For OrangeKit BTC connectors, we must specify the Mezo chain ID explicitly
      const isBtcConnector = connector.type === "orangekit"

      connect(
        { connector, chainId: isBtcConnector ? mezoMainnet.id : undefined },
        {
          onError: (err) => {
            console.error(
              "[Wallet Connection Error]",
              connector.id,
              connector.type,
              err,
            )
            setPendingConnectorId(null)
            setConnectingWallet(null)
            setError(err.message)
          },
        },
      )
    },
    [connectors, connect],
  )

  const cancelConnect = useCallback(() => {
    setPendingConnectorId(null)
    setConnectingWallet(null)
    setError(null)
  }, [])

  return {
    groups,
    connect: handleConnect,
    isPending,
    pendingConnectorId,
    connectingWallet,
    cancelConnect,
    error,
  }
}
