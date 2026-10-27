import { describe, expect, it } from "vitest"
import type { Connector } from "wagmi"
import { BITCOIN_WALLET_SPECS } from "./bitcoinWallets"
import { type WalletEnvironment, connectError, groupWallets } from "./wallets"

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

// RainbowKit runs every wallet that pairs remotely over one wagmi
// WalletConnect connector: its id and name are WalletConnect's, and
// rkDetails says which wallet it stands for.
function overWalletConnect(
  uid: string,
  rkDetails: Record<string, unknown>,
): Connector {
  return connector({
    uid,
    id: "walletConnect",
    name: "WalletConnect",
    type: "walletConnect",
    rkDetails,
  })
}

const announcedRabby = connector({
  uid: "6963-rabby",
  name: "Rabby Wallet",
  icon: "data:rabby",
})
const announcedMetaMask = connector({
  uid: "6963-metamask",
  id: "io.metamask",
  name: "MetaMask",
  icon: "data:metamask-6963",
})
const rkRabby = connector({
  uid: "rk-rabby",
  name: "Rabby Wallet",
  rkDetails: { id: "rabby", name: "Rabby Wallet", installed: true },
})
const rkMetaMask = overWalletConnect("rk-metamask", {
  id: "metaMask",
  name: "MetaMask",
  iconUrl: "data:metamask",
  downloadUrls: { chrome: "https://metamask.example/chrome" },
  qrCode: { getUri: (uri: string) => `https://metamask.example/wc?${uri}` },
})
const rkTrust = overWalletConnect("rk-trust", {
  id: "trust",
  name: "Trust Wallet",
  downloadUrls: { mobile: "https://trust.example" },
  qrCode: { getUri: (uri: string) => uri },
  mobile: { getUri: (uri: string) => `trust://wc?${uri}` },
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
const walletConnect = overWalletConnect("rk-wc", {
  id: "walletConnect",
  name: "WalletConnect",
  iconUrl: "data:walletconnect",
})
const walletConnectModal = overWalletConnect("rk-wc-modal", {
  id: "walletConnect",
  name: "WalletConnect",
  isWalletConnectModalConnector: true,
})

const environment: WalletEnvironment = {
  injectedProvider: true,
  walletConnect: false,
  bitcoinInstalled: new Set(["orangekit-okx"]),
}

const withWalletConnect: WalletEnvironment = {
  ...environment,
  walletConnect: true,
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

function summary(
  list: { name: string; installed: boolean; walletConnect: boolean }[],
): string[] {
  return list.map(
    (wallet) =>
      `${wallet.name}${wallet.installed ? "" : " (get)"}${wallet.walletConnect ? " (qr)" : ""}`,
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
      BITCOIN_WALLET_SPECS.unisat.wallet.downloadUrls.desktop,
      "https://metamask.example/chrome",
      "https://taho.example",
    ])
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

describe("groupWallets with a WalletConnect project id", () => {
  it("pairs RainbowKit's WalletConnect wallets by QR instead of linking downloads", () => {
    const { more } = groupWallets(all, withWalletConnect)
    expect(summary(more)).toEqual([
      "MetaMask (qr)",
      "Coinbase Wallet",
      "Unisat (get)",
      "Taho (get)",
    ])
    expect(more[0]?.icon).toBe("data:metamask")
    expect(more[0]?.downloadUrl).toBeUndefined()
  })

  it("lists WalletConnect itself once, without the WalletConnect modal", () => {
    const { detected, more } = groupWallets(
      [walletConnectModal, rkTrust, walletConnect],
      withWalletConnect,
    )
    expect(detected).toEqual([])
    expect(summary(more)).toEqual(["Trust Wallet (qr)", "WalletConnect (qr)"])
    expect(more.map((wallet) => wallet.id)).toEqual(["rk-trust", "rk-wc"])
  })

  it("keeps each wallet's own QR and app links for the pairing URI", () => {
    const { more } = groupWallets(
      [rkMetaMask, rkTrust, walletConnect],
      withWalletConnect,
    )
    const [metaMask, trust, generic] = more
    expect(metaMask?.qrUri?.("wc:1")).toBe("https://metamask.example/wc?wc:1")
    expect(metaMask?.appUri).toBeUndefined()
    expect(trust?.qrUri?.("wc:1")).toBe("wc:1")
    expect(trust?.appUri?.("wc:1")).toBe("trust://wc?wc:1")
    expect(generic?.qrUri).toBeUndefined()
    expect(generic?.appUri).toBeUndefined()
  })

  it("leaves pairing links off wallets that don't pair over WalletConnect", () => {
    const { more } = groupWallets([rkMetaMask, coinbase], environment)
    expect(more.every((wallet) => wallet.qrUri === undefined)).toBe(true)
  })

  it("prefers the installed extension over the same wallet's QR pairing", () => {
    const { detected, more } = groupWallets(
      [rkMetaMask, announcedMetaMask],
      withWalletConnect,
    )
    expect(summary(detected)).toEqual(["MetaMask"])
    expect(detected[0]?.connector).toBe(announcedMetaMask)
    expect(more).toEqual([])
  })

  it("still links downloads for wallets RainbowKit reports missing", () => {
    const { more } = groupWallets([rkTaho, passportUnisat], withWalletConnect)
    expect(summary(more)).toEqual(["Unisat (get)", "Taho (get)"])
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
