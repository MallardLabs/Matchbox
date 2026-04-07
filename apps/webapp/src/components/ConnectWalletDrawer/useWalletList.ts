import { defaultWallets, mezoMainnet } from "@/config/wagmi"
import { useNetwork } from "@/contexts/NetworkContext"
import { CHAIN_ID, type SupportedChainId } from "@repo/shared/contracts"
import { useCallback, useEffect, useState } from "react"
import type { Connector } from "wagmi"
import { useAccount, useConnect, useSwitchChain } from "wagmi"
import { WALLET_ICON_DATA_URLS } from "./walletIconUrls"

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

const INJECTED_WALLET_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'/%3E%3C/svg%3E"

type RainbowKitConnectorFields = Connector & {
  isWalletConnectModalConnector?: boolean
  rkDetails?: { isWalletConnectModalConnector?: boolean }
}

/** RainbowKit adds a second WC connector with Web3Modal (`showQrModal`); it may live on `rkDetails`. */
function isWalletConnectModalConnector(connector: Connector): boolean {
  const c = connector as RainbowKitConnectorFields
  return (
    c.isWalletConnectModalConnector === true ||
    c.rkDetails?.isWalletConnectModalConnector === true
  )
}

// EIP-6963 `rdns` ids — used to dedupe RainbowKit vs injected connectors
const EIP6963_WALLET_IDS = new Set([
  "io.rabby",
  "com.taho",
  "io.metamask",
  "com.coinbase.wallet",
  "io.zerion.wallet",
  "com.bitget.web3",
  "com.trustwallet.app",
  "com.okex.wallet",
])

const NETWORK_STORAGE_KEY = "mezo-network"

function isSupportedMezoChainId(chainId: number): chainId is SupportedChainId {
  return chainId === CHAIN_ID.mainnet || chainId === CHAIN_ID.testnet
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

export function useWalletList(onConnected?: () => void) {
  const { connectors, connect, isPending } = useConnect()
  const { switchChainAsync } = useSwitchChain()
  const { chainId: selectedChainId } = useNetwork()
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

  // Prefer bundled SVG data URLs (sync, no network) over async RainbowKit iconUrl
  function resolveIcon(
    connectorId: string,
    connectorName: string,
    connectorIcon?: string,
  ): string | undefined {
    if (connectorId === "metaMask" || connectorId === "io.metamask") {
      return WALLET_ICON_DATA_URLS.metaMask
    }
    if (connectorId === "coinbase" || connectorId === "com.coinbase.wallet") {
      return WALLET_ICON_DATA_URLS.coinbase
    }
    if (connectorId === "walletConnect") {
      return WALLET_ICON_DATA_URLS.walletConnect
    }
    if (connectorId === "io.rabby" || connectorId === "rabby") {
      return WALLET_ICON_DATA_URLS.rabby
    }
    if (connectorId === "com.taho" || connectorId === "taho") {
      return WALLET_ICON_DATA_URLS.taho
    }

    const nameLower = connectorName.toLowerCase()
    if (nameLower.includes("rabby")) return WALLET_ICON_DATA_URLS.rabby
    if (nameLower.includes("taho")) return WALLET_ICON_DATA_URLS.taho
    if (nameLower.includes("metamask")) return WALLET_ICON_DATA_URLS.metaMask
    if (nameLower.includes("coinbase")) return WALLET_ICON_DATA_URLS.coinbase

    if (connectorId === "injected") return INJECTED_WALLET_ICON

    if (connectorIcon) return connectorIcon

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

    // RainbowKit registers two WalletConnect connectors: one opens Web3Modal (this one),
    // one is for QR; we only list the QR entry and connect via the modal connector in handleConnect.
    if (
      connector.id === "walletConnect" &&
      isWalletConnectModalConnector(connector)
    ) {
      continue
    }

    // Skip generic injected connector with "Injected" name (keep "Browser Wallet" ones)
    if (connector.id === "injected" && connector.name === "Injected") continue

    // Skip RainbowKit duplicate when the same wallet was already reported via EIP-6963
    const nameLower = connector.name.toLowerCase()
    if (
      !EIP6963_WALLET_IDS.has(connector.id) &&
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
      const connector =
        connectorId === "walletConnect"
          ? (connectors.find(
              (c) =>
                c.id === "walletConnect" && isWalletConnectModalConnector(c),
            ) ?? connectors.find((c) => c.id === connectorId))
          : connectors.find((c) => c.id === connectorId)
      if (!connector) return

      setError(null)
      setPendingConnectorId(connectorId)
      if (walletEntry) {
        setConnectingWallet(walletEntry)
      }

      // For OrangeKit BTC connectors, we must specify the Mezo chain ID explicitly.
      // EVM wallets should align with the app-selected chain.
      const isBtcConnector = connector.type === "orangekit"
      const targetChainId = isBtcConnector ? mezoMainnet.id : selectedChainId

      connect(
        { connector, chainId: targetChainId },
        {
          onSuccess: async (data) => {
            if (isBtcConnector) {
              return
            }

            const connectedChainId = data.chainId
            if (
              !isSupportedMezoChainId(connectedChainId) ||
              !isSupportedMezoChainId(selectedChainId)
            ) {
              return
            }

            if (connectedChainId === selectedChainId) {
              console.info("[Network] Wallet connected on selected chain", {
                selectedChainId,
              })
              return
            }

            console.warn(
              "[Network] Chain mismatch after connect; auto-switching",
              {
                connectedChainId,
                targetChainId: selectedChainId,
              },
            )

            if (!switchChainAsync) {
              writeSavedNetwork(connectedChainId)
              console.warn(
                "[Network] Auto-switch unavailable; persisted connected chain",
                { connectedChainId },
              )
              return
            }

            try {
              await switchChainAsync({ chainId: selectedChainId })
              writeSavedNetwork(selectedChainId)
              console.info("[Network] Auto-switch after connect succeeded", {
                targetChainId: selectedChainId,
              })
            } catch (error) {
              writeSavedNetwork(connectedChainId)
              console.warn(
                "[Network] Auto-switch after connect failed; falling back to connected chain",
                {
                  connectedChainId,
                  targetChainId: selectedChainId,
                  error,
                },
              )
            }
          },
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
    [connectors, connect, selectedChainId, switchChainAsync],
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
