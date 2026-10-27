import { describe, expect, it } from "vitest"
import type { Connector } from "wagmi"
import {
  type WalletEnvironment,
  connectError,
  groupWallets,
  walletName,
} from "./wallets"

function connector(fields: {
  uid: string
  id?: string
  name: string
  type?: string
  icon?: string
  rkDetails?: Record<string, unknown>
}): Connector {
  return { type: "injected", id: fields.uid, ...fields } as unknown as Connector
}

const announcedRabby = connector({
  uid: "6963-rabby",
  name: "Rabby Wallet",
  icon: "data:rabby",
})
const rkRabby = connector({
  uid: "rk-rabby",
  name: "Rabby Wallet",
  rkDetails: { id: "rabby", name: "Rabby Wallet", installed: true },
})
const rkMetaMask = connector({
  uid: "rk-metamask",
  name: "WalletConnect",
  type: "walletConnect",
  rkDetails: {
    id: "metaMask",
    name: "MetaMask",
    iconUrl: "data:metamask",
    downloadUrls: { chrome: "https://metamask.example/chrome" },
  },
})
const rkTaho = connector({
  uid: "rk-taho",
  name: "Taho",
  rkDetails: {
    id: "taho",
    name: "Taho",
    installed: false,
    downloadUrls: { browserExtension: "https://taho.example" },
  },
})
const passportOkx = connector({
  uid: "passport-okx",
  id: "orangekit-okx",
  name: "OKX",
  type: "orangekit",
  icon: "data:okx",
})
const passportUnisat = connector({
  uid: "passport-unisat",
  id: "orangekit-unisat",
  name: "Unisat",
  type: "orangekit",
  icon: "data:unisat",
})
const coinbase = connector({
  uid: "rk-coinbase",
  name: "Coinbase Wallet",
  type: "coinbaseWallet",
  rkDetails: { id: "coinbase", name: "Coinbase Wallet", installed: true },
})
const genericInjected = connector({
  uid: "rk-injected",
  name: "Browser Wallet",
  rkDetails: { id: "injected", name: "Browser Wallet" },
})
const walletConnectModal = connector({
  uid: "rk-wc-modal",
  name: "WalletConnect",
  type: "walletConnect",
  rkDetails: {
    id: "walletConnect",
    name: "WalletConnect",
    isWalletConnectModalConnector: true,
  },
})

const environment: WalletEnvironment = {
  injectedProvider: true,
  walletConnect: false,
  bitcoinInstalled: new Set(["orangekit-okx"]),
}

const all = [
  announcedRabby,
  rkRabby,
  rkMetaMask,
  rkTaho,
  passportOkx,
  passportUnisat,
  coinbase,
  genericInjected,
  walletConnectModal,
]

function summary(list: { name: string; installed: boolean }[]): string[] {
  return list.map(
    (wallet) => `${wallet.name}${wallet.installed ? "" : " (get)"}`,
  )
}

describe("groupWallets", () => {
  it("lists announced wallets and installed Bitcoin wallets as detected", () => {
    const { detected } = groupWallets(all, environment)
    expect(summary(detected)).toEqual(["Rabby Wallet", "OKX"])
    expect(detected.map((wallet) => wallet.icon)).toEqual([
      "data:rabby",
      "data:okx",
    ])
    expect(detected[1]?.bitcoin).toBe(true)
  })

  it("links downloads for missing wallets and WalletConnect-only ones", () => {
    const { more } = groupWallets(all, environment)
    expect(summary(more)).toEqual([
      "Coinbase Wallet",
      "Unisat (get)",
      "MetaMask (get)",
      "Taho (get)",
    ])
    expect(more.map((wallet) => wallet.downloadUrl)).toEqual([
      undefined,
      "https://chromewebstore.google.com/detail/unisat-wallet/ppbibelpcjmhbdihakflkdcoccbgbkpo",
      "https://metamask.example/chrome",
      "https://taho.example",
    ])
  })

  it("connects over WalletConnect once a project ID is configured", () => {
    const { more } = groupWallets([rkMetaMask], {
      ...environment,
      walletConnect: true,
    })
    expect(summary(more)).toEqual(["MetaMask"])
  })

  it("offers the generic browser wallet only when nothing announced itself", () => {
    expect(
      summary(groupWallets([genericInjected], environment).detected),
    ).toEqual(["Browser wallet"])
    expect(
      groupWallets([genericInjected], {
        ...environment,
        injectedProvider: false,
      }).detected,
    ).toEqual([])
  })
})

describe("walletName", () => {
  it("prefers the RainbowKit wallet name over its connector's", () => {
    expect(walletName(rkMetaMask)).toBe("MetaMask")
    expect(walletName(passportUnisat)).toBe("Unisat")
  })
})

describe("connectError", () => {
  it("names the common failures", () => {
    expect(connectError(new Error("User rejected the request."))).toBe(
      "Declined in wallet",
    )
    expect(connectError({ shortMessage: "Request already pending" })).toBe(
      "Request already open in wallet",
    )
    expect(connectError(new Error("boom"))).toBe("Connection failed")
  })
})
