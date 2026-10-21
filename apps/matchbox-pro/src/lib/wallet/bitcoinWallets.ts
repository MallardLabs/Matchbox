import type * as Passport from "@mezo-org/passport/dist/src/wallet/index.js"
import type { Wallet, WalletDetailsParams } from "@rainbow-me/rainbowkit"
import { type CreateConnectorFn, createConnector } from "wagmi"
// OrangeKit's own connector icons, as files: the bundle carries a URL and the
// image loads when the connect dialog shows it.
import OKX_ICON from "./icons/okx.png"
import UNISAT_ICON from "./icons/unisat.png"
import XVERSE_ICON from "./icons/xverse.png"

// OrangeKit's Bitcoin wallet connectors (Unisat, OKX, Xverse via a Mezo
// smart account) bring ethers, Safe and bitcoinjs: about half the app's
// startup JavaScript. These stand-ins carry the same connector id, name and
// icon image and load the real connector the first time it is needed: at startup
// when the wallet's extension is present (as before), otherwise on connect.
// Everything else is forwarded to the real connector unchanged.

type PassportWallets = typeof Passport

export type BitcoinWalletConfig = Parameters<
  PassportWallets["getUnisatWallet"]
>[0]

type Spec = {
  /** RainbowKit wallet metadata, as OrangeKit declares it. */
  wallet: Omit<Wallet, "createConnector" | "installed">
  connector: { id: string; name: string; icon: string }
  /** The injected Bitcoin provider OrangeKit looks for. */
  injected: () => unknown
  factory: (module: PassportWallets) => PassportWallets["getUnisatWallet"]
}

const ORANGE_ICON_URL = "https://www.svgrepo.com/show/74027/orange.svg"

function windowValue(...path: string[]): unknown {
  let value: unknown = typeof window === "undefined" ? undefined : window
  for (const key of path) {
    if (value === null || typeof value !== "object") return undefined
    value = Reflect.get(value, key)
  }
  return value
}

export const BITCOIN_WALLET_SPECS = {
  unisat: {
    wallet: {
      id: "orangekit-unisat",
      name: "OrangeKit Unisat",
      iconUrl: ORANGE_ICON_URL,
      iconAccent: "#1E1E1E",
      iconBackground: "#1E1E1E",
      downloadUrls: {
        desktop:
          "https://chromewebstore.google.com/detail/unisat-wallet/ppbibelpcjmhbdihakflkdcoccbgbkpo",
      },
    },
    connector: { id: "orangekit-unisat", name: "Unisat", icon: UNISAT_ICON },
    injected: () => windowValue("unisat"),
    factory: (module) => module.getUnisatWallet,
  },
  okx: {
    wallet: {
      id: "orangekit-okx",
      name: "OrangeKit OKX",
      iconUrl: ORANGE_ICON_URL,
      iconAccent: "#1E1E1E",
      iconBackground: "#1E1E1E",
      downloadUrls: {
        desktop:
          "https://chromewebstore.google.com/detail/okx-wallet/mcohilncbfahbmgdjkbpemcciiolgcge",
      },
    },
    connector: { id: "orangekit-okx", name: "OKX", icon: OKX_ICON },
    injected: () => windowValue("okxwallet", "bitcoin"),
    factory: (module) => module.getOKXWallet,
  },
  xverse: {
    wallet: {
      id: "orangekit-xverse",
      name: "OrangeKit Xverse",
      iconUrl: ORANGE_ICON_URL,
      iconAccent: "#1E1E1E",
      iconBackground: "#1E1E1E",
      downloadUrls: { desktop: "https://www.xverse.app/download" },
    },
    connector: { id: "orangekit-xverse", name: "Xverse", icon: XVERSE_ICON },
    injected: () => windowValue("XverseProviders", "BitcoinProvider"),
    factory: (module) => module.getXverseWallet,
  },
} satisfies Record<string, Spec>

export type BitcoinWalletKind = keyof typeof BITCOIN_WALLET_SPECS

type RealConnector = ReturnType<CreateConnectorFn>

function extra(connector: RealConnector | undefined, key: string): unknown {
  return connector ? Reflect.get(connector, key) : undefined
}

function lazyConnector(
  spec: Spec,
  loadReal: () => Promise<CreateConnectorFn>,
): CreateConnectorFn {
  return createConnector((config) => {
    let loading: Promise<RealConnector> | undefined
    let real: RealConnector | undefined
    const installed = (): boolean => Boolean(spec.injected())
    const load = (): Promise<RealConnector> => {
      loading ??= loadReal().then(async (create) => {
        const connector = create(config)
        await connector.setup?.()
        real = connector
        return connector
      })
      return loading
    }
    // Methods are called on the real connector so its `this` stays its own.
    const call = async (key: string, ...args: unknown[]): Promise<unknown> => {
      const connector = await load()
      const method: unknown = Reflect.get(connector, key)
      if (typeof method !== "function") {
        throw new Error(`${spec.connector.name} connector has no ${key}`)
      }
      return Reflect.apply(method, connector, args)
    }

    return {
      id: spec.connector.id,
      name: spec.connector.name,
      type: "orangekit",
      icon: spec.connector.icon,
      async setup() {
        if (installed()) await load()
      },
      async connect(parameters) {
        return (await load()).connect(parameters)
      },
      async disconnect() {
        // Never loaded means never connected.
        if (real) await real.disconnect()
      },
      async getAccounts() {
        return (await load()).getAccounts()
      },
      async getChainId() {
        return (await load()).getChainId()
      },
      async getProvider(parameters) {
        // Reconnect asks every connector; an absent wallet has nothing to
        // offer, and OrangeKit would refuse it in isAuthorized anyway.
        if (!real && !installed()) {
          throw new Error(`${spec.connector.name} wallet is not installed`)
        }
        return (await load()).getProvider(parameters)
      },
      async isAuthorized() {
        if (!real && !installed()) return false
        return (await load()).isAuthorized()
      },
      async getClient(parameters) {
        const connector = await load()
        if (!connector.getClient) {
          throw new Error(`${spec.connector.name} connector has no client`)
        }
        return connector.getClient(parameters)
      },
      async switchChain(parameters) {
        const connector = await load()
        if (!connector.switchChain) {
          throw new Error(`${spec.connector.name} cannot switch chains`)
        }
        return connector.switchChain(parameters)
      },
      getBitcoinAddress: () => call("getBitcoinAddress"),
      getBitcoinProvider: () => {
        const method = extra(real, "getBitcoinProvider")
        return typeof method === "function" && real
          ? Reflect.apply(method, real, [])
          : undefined
      },
      onAccountsChanged(accounts) {
        real?.onAccountsChanged(accounts)
      },
      onChainChanged(chainId) {
        real?.onChainChanged(chainId)
      },
      onConnect(connectInfo) {
        real?.onConnect?.(connectInfo)
      },
      onDisconnect(error) {
        real?.onDisconnect(error)
      },
      onMessage(message) {
        real?.onMessage?.(message)
      },
    }
  })
}

const loadPassportWallets = (): Promise<PassportWallets> =>
  import("@mezo-org/passport/dist/src/wallet/index.js")

/**
 * RainbowKit wallet for an OrangeKit Bitcoin wallet whose connector code is
 * loaded on demand. Drop-in for `getUnisatWallet(config)` and friends.
 */
export function lazyBitcoinWallet(
  kind: BitcoinWalletKind,
  config: BitcoinWalletConfig,
): () => Wallet {
  const spec: Spec = BITCOIN_WALLET_SPECS[kind]
  return () => ({
    ...spec.wallet,
    installed: Boolean(spec.injected()),
    createConnector: (details: WalletDetailsParams) =>
      lazyConnector(spec, async () => {
        const module = await loadPassportWallets()
        return spec.factory(module)(config)().createConnector(details)
      }),
  })
}
