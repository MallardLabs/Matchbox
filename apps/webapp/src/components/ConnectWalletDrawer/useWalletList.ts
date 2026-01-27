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

export function useWalletList(onConnected?: () => void) {
  const { connectors, connect, isPending } = useConnect()
  const { isConnected } = useAccount()
  const [pendingConnectorId, setPendingConnectorId] = useState<string | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)

  // Auto-close on successful connection
  useEffect(() => {
    if (isConnected && pendingConnectorId) {
      setPendingConnectorId(null)
      onConnected?.()
    }
  }, [isConnected, pendingConnectorId, onConnected])

  // Resolve icon from defaultWallets if connector lacks one
  function resolveIcon(
    connectorId: string,
    connectorIcon?: string,
  ): string | undefined {
    if (connectorIcon) return connectorIcon

    // WalletConnect official logo
    if (connectorId === "walletConnect") {
      return "https://avatars.githubusercontent.com/u/37784886?s=200&v=4"
    }

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

  // Debug: log all available connectors
  useEffect(() => {
    console.log(
      "[Wallet Debug] Available connectors:",
      connectors.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
      })),
    )
    console.log(
      "[Wallet Debug] window.unisat:",
      typeof window !== "undefined"
        ? !!(window as unknown as Record<string, unknown>).unisat
        : "SSR",
    )
    console.log(
      "[Wallet Debug] window.XverseProviders:",
      typeof window !== "undefined"
        ? !!(window as unknown as Record<string, unknown>).XverseProviders
        : "SSR",
    )
  }, [connectors])

  // Build grouped wallet list, deduplicating by connector id
  const btcWallets: WalletEntry[] = []
  const evmWallets: WalletEntry[] = []
  const seenIds = new Set<string>()

  for (const connector of connectors) {
    // Deduplicate connectors (e.g. duplicate WalletConnect entries)
    if (seenIds.has(connector.id)) continue
    seenIds.add(connector.id)

    // Skip generic injected connector (EIP-6963 wallets cover specific ones)
    if (connector.id === "injected" && connector.name === "Injected") continue

    const entry: WalletEntry = {
      id: connector.id,
      name: connector.name,
      icon: resolveIcon(connector.id, connector.icon),
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

  // Sort EVM wallets: WalletConnect at the end
  evmWallets.sort((a, b) => {
    if (a.id === "walletConnect") return 1
    if (b.id === "walletConnect") return -1
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
    (connectorId: string) => {
      const connector = connectors.find((c) => c.id === connectorId)
      if (!connector) return

      setError(null)
      setPendingConnectorId(connectorId)

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
            setError(err.message)
          },
        },
      )
    },
    [connectors, connect],
  )

  return {
    groups,
    connect: handleConnect,
    isPending,
    pendingConnectorId,
    error,
  }
}
