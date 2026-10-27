import type { Connector } from "wagmi"
import { BITCOIN_WALLET_SPECS } from "./bitcoinWallets"

/** What RainbowKit's connectorsForWallets attaches to each connector. */
type RkDetails = {
  id: string
  name: string
  iconUrl?: string | (() => Promise<string>)
  installed?: boolean
  downloadUrls?: Record<string, string | undefined>
  isWalletConnectModalConnector?: boolean
  /** The wallet's own form of a WalletConnect URI, for its QR code. */
  qrCode?: { getUri?: (uri: string) => string }
  /** A deep link that opens its phone app with a WalletConnect URI. */
  mobile?: { getUri?: (uri: string) => string }
}

/**
 * Mezo Passport's Bitcoin wallets carry no RainbowKit details; their specs
 * (./bitcoinWallets) say how each is detected and where to get it.
 */
const passportWallets = new Map(
  Object.values(BITCOIN_WALLET_SPECS).map((spec) => [spec.connector.id, spec]),
)

export type WalletIconSource = string | (() => Promise<string>)

export type WalletEntry = {
  /** The connector's uid. */
  id: string
  name: string
  /** A Mezo Passport Bitcoin wallet (signs in through a Mezo smart account). */
  bitcoin: boolean
  /** Pairs over WalletConnect: the picker shows the QR code and app links. */
  walletConnect: boolean
  /** What its QR code should hold for a pairing URI, when not the URI. */
  qrUri?: ((uri: string) => string) | undefined
  /** Opens its phone app with a pairing URI. */
  appUri?: ((uri: string) => string) | undefined
  icon?: WalletIconSource | undefined
  /** Detected in this browser, or connectable without an install. */
  installed: boolean
  /** Where to get it when it isn't installed. */
  downloadUrl?: string | undefined
  connector: Connector
}

export type WalletGroups = {
  /** EIP-6963 announcements and installed extensions. */
  detected: WalletEntry[]
  /** SDK and WalletConnect wallets, then download links. */
  more: WalletEntry[]
}

export type WalletEnvironment = {
  /** `window.ethereum` exists. */
  injectedProvider: boolean
  /** A WalletConnect project id is configured (`walletConnectEnabled`). */
  walletConnect: boolean
  /** Connector ids of the Passport Bitcoin wallets installed here. */
  bitcoinInstalled: ReadonlySet<string>
}

/** What this browser has installed, for `groupWallets`. */
export function walletEnvironment(walletConnect: boolean): WalletEnvironment {
  return {
    injectedProvider: "ethereum" in window,
    walletConnect,
    bitcoinInstalled: new Set(
      [...passportWallets.values()]
        .filter((spec) => Boolean(spec.injected()))
        .map((spec) => spec.connector.id),
    ),
  }
}

function rkDetails(connector: Connector): RkDetails | undefined {
  return (connector as Connector & { rkDetails?: RkDetails }).rkDetails
}

function downloadUrl(details: RkDetails): string | undefined {
  const urls = details.downloadUrls
  return (
    urls?.browserExtension ??
    urls?.chrome ??
    urls?.desktop ??
    urls?.mobile ??
    urls?.qrCode
  )
}

const normalize = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]/g, "")

/**
 * Wallets grouped for the picker, deduped by name so a wallet that both
 * announces itself and has a RainbowKit entry shows once. A Bitcoin wallet
 * never dedupes against its Ethereum namesake (OKX has both). RainbowKit
 * runs wallets that aren't installed over a WalletConnect connector; those
 * pair by QR code when a project id is configured and get a download link
 * when not.
 */
export function groupWallets(
  connectors: readonly Connector[],
  environment: WalletEnvironment,
): WalletGroups {
  const detected: WalletEntry[] = []
  const more: WalletEntry[] = []
  const seen = new Set<string>()
  function add(list: WalletEntry[], entry: WalletEntry): void {
    const key = `${normalize(entry.name)}${entry.bitcoin ? ":btc" : ""}`
    if (seen.has(key)) return
    seen.add(key)
    list.push(entry)
  }

  // EIP-6963 announcements first: they're what this browser actually has.
  for (const connector of connectors) {
    if (rkDetails(connector) === undefined && connector.type === "injected") {
      add(detected, {
        id: connector.uid,
        name: connector.name,
        bitcoin: false,
        walletConnect: false,
        icon: connector.icon,
        installed: true,
        connector,
      })
    }
  }
  for (const connector of connectors) {
    const passport = passportWallets.get(connector.id)
    if (passport === undefined) continue
    const installed = environment.bitcoinInstalled.has(connector.id)
    add(installed ? detected : more, {
      id: connector.uid,
      name: connector.name,
      bitcoin: true,
      walletConnect: false,
      icon: connector.icon,
      installed,
      downloadUrl: installed ? undefined : passport.wallet.downloadUrls.desktop,
      connector,
    })
  }
  for (const connector of connectors) {
    const details = rkDetails(connector)
    if (details === undefined || details.isWalletConnectModalConnector) continue
    const overWalletConnect = connector.type === "walletConnect"
    const entry = {
      id: connector.uid,
      name: details.name,
      bitcoin: false,
      icon: connector.icon ?? details.iconUrl,
      connector,
    }
    if (details.id === "injected") {
      // The generic browser wallet, only for extensions without EIP-6963.
      if (detected.length === 0 && environment.injectedProvider) {
        add(detected, {
          ...entry,
          name: "Browser wallet",
          walletConnect: false,
          installed: true,
        })
      }
    } else if (details.installed === true && connector.type === "injected") {
      add(detected, { ...entry, walletConnect: false, installed: true })
    } else if (
      details.installed === false ||
      (overWalletConnect && !environment.walletConnect)
    ) {
      add(more, {
        ...entry,
        walletConnect: false,
        installed: false,
        downloadUrl: downloadUrl(details),
      })
    } else if (overWalletConnect) {
      add(more, {
        ...entry,
        walletConnect: true,
        installed: true,
        qrUri: details.qrCode?.getUri,
        appUri: details.mobile?.getUri,
      })
    } else {
      add(more, { ...entry, walletConnect: false, installed: true })
    }
  }
  // Connectable wallets before download links.
  more.sort((a, b) => Number(b.installed) - Number(a.installed))
  return { detected, more }
}

/** A short reason a connection didn't happen. */
export function connectError(error: unknown): string {
  const detail = error as { shortMessage?: string; message?: string } | null
  const text = String(
    detail?.shortMessage ?? detail?.message ?? error,
  ).toLowerCase()
  if (/reject|denied|cancel/.test(text)) return "Declined in wallet"
  if (/already pending|already processing/.test(text)) {
    return "Request already open in wallet"
  }
  if (/not found|not installed/.test(text)) return "Wallet not found"
  return "Connection failed"
}
