import type { Connector } from "wagmi"

/** What RainbowKit's connectorsForWallets attaches to each connector. */
type RkDetails = {
  id: string
  name: string
  iconUrl?: string | (() => Promise<string>)
  installed?: boolean
  downloadUrls?: Record<string, string | undefined>
  isWalletConnectModalConnector?: boolean
}

type PassportWindow = {
  unisat?: unknown
  okxwallet?: { bitcoin?: unknown }
  XverseProviders?: { BitcoinProvider?: unknown }
}

/**
 * Mezo Passport's Bitcoin wallets, which carry no RainbowKit details: how
 * Passport detects each one and where to get it (both copied from its
 * wallet definitions).
 */
const passportWallets = {
  "orangekit-unisat": {
    detect: (scope: PassportWindow) => scope.unisat !== undefined,
    downloadUrl:
      "https://chromewebstore.google.com/detail/unisat-wallet/ppbibelpcjmhbdihakflkdcoccbgbkpo",
  },
  "orangekit-okx": {
    detect: (scope: PassportWindow) => scope.okxwallet?.bitcoin !== undefined,
    downloadUrl:
      "https://chromewebstore.google.com/detail/okx-wallet/mcohilncbfahbmgdjkbpemcciiolgcge",
  },
  "orangekit-xverse": {
    detect: (scope: PassportWindow) =>
      scope.XverseProviders?.BitcoinProvider !== undefined,
    downloadUrl: "https://www.xverse.app/download",
  },
} as const

function passportWallet(
  connector: Connector,
): (typeof passportWallets)[keyof typeof passportWallets] | undefined {
  return Object.hasOwn(passportWallets, connector.id)
    ? passportWallets[connector.id as keyof typeof passportWallets]
    : undefined
}

export type WalletIconSource = string | (() => Promise<string>)

export type WalletEntry = {
  /** The connector's uid. */
  id: string
  name: string
  /** A Mezo Passport Bitcoin wallet (signs in through a Mezo smart account). */
  bitcoin: boolean
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
  /** SDK wallets, then download links. */
  more: WalletEntry[]
}

export type WalletEnvironment = {
  /** `window.ethereum` exists. */
  injectedProvider: boolean
  /** A WalletConnect project ID is configured. */
  walletConnect: boolean
  /** Connector ids of the Passport Bitcoin wallets installed here. */
  bitcoinInstalled: ReadonlySet<string>
}

/** What this browser has installed, for `groupWallets`. */
export function walletEnvironment(walletConnect: boolean): WalletEnvironment {
  const scope = window as PassportWindow
  return {
    injectedProvider: "ethereum" in window,
    walletConnect,
    bitcoinInstalled: new Set(
      Object.entries(passportWallets)
        .filter(([, wallet]) => wallet.detect(scope))
        .map(([id]) => id),
    ),
  }
}

function rkDetails(connector: Connector): RkDetails | undefined {
  return (connector as Connector & { rkDetails?: RkDetails }).rkDetails
}

/** The wallet's own name (RainbowKit runs some over a WalletConnect connector). */
export function walletName(connector: Connector): string {
  return rkDetails(connector)?.name ?? connector.name
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
 * never dedupes against its Ethereum namesake (OKX has both). Wallets that
 * can only connect over WalletConnect get a download link when no project
 * ID is configured.
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
        icon: connector.icon,
        installed: true,
        connector,
      })
    }
  }
  for (const connector of connectors) {
    const passport = passportWallet(connector)
    if (passport === undefined) continue
    const installed = environment.bitcoinInstalled.has(connector.id)
    add(installed ? detected : more, {
      id: connector.uid,
      name: connector.name,
      bitcoin: true,
      icon: connector.icon,
      installed,
      downloadUrl: installed ? undefined : passport.downloadUrl,
      connector,
    })
  }
  for (const connector of connectors) {
    const details = rkDetails(connector)
    if (details === undefined || details.isWalletConnectModalConnector) continue
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
        add(detected, { ...entry, name: "Browser wallet", installed: true })
      }
    } else if (details.installed === true && connector.type === "injected") {
      add(detected, { ...entry, installed: true })
    } else if (
      details.installed === false ||
      (connector.type === "walletConnect" && !environment.walletConnect)
    ) {
      add(more, {
        ...entry,
        installed: false,
        downloadUrl: downloadUrl(details),
      })
    } else {
      add(more, { ...entry, installed: true })
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
