import { readFileSync } from "node:fs"
import { beforeAll, describe, expect, it } from "vitest"
import {
  BITCOIN_WALLET_SPECS,
  type BitcoinWalletKind,
  lazyBitcoinWallet,
} from "./bitcoinWallets"
import { mezoMainnet, mezoTestnet } from "./mezoChains"

// The lazy stand-ins must look exactly like OrangeKit's wallets until the real
// connector loads. These compare them with the installed package, so an
// OrangeKit upgrade that changes ids, names, icons, methods or chains fails
// here instead of silently diverging.

const CONFIG = { rpcUrl: "https://rpc-internal.mezo.org", chainId: 31612 }
const KINDS: BitcoinWalletKind[] = ["unisat", "okx", "xverse"]
const PNG_DATA_URI = "data:image/png;base64,"

function connectorParams() {
  return {
    chains: [mezoMainnet],
    emitter: { uid: "test", emit() {}, on() {}, off() {}, once() {} },
    storage: null,
    transports: {},
  }
}

/** Calls a CreateConnectorFn the way wagmi does and returns its object. */
function instantiate(create: unknown): Record<string, unknown> {
  if (typeof create !== "function") throw new Error("not a connector fn")
  const connector: unknown = Reflect.apply(create, undefined, [
    connectorParams(),
  ])
  if (typeof connector !== "object" || connector === null) {
    throw new Error("connector fn returned no object")
  }
  return Object.fromEntries(Object.entries(connector))
}

function realFactory(
  module: typeof import("@mezo-org/passport/dist/src/wallet/index.js"),
  kind: BitcoinWalletKind,
) {
  if (kind === "unisat") return module.getUnisatWallet
  if (kind === "okx") return module.getOKXWallet
  return module.getXverseWallet
}

let passport: typeof import("@mezo-org/passport/dist/src/wallet/index.js")
let passportChains: typeof import("@mezo-org/passport/dist/src/constants.js")

beforeAll(async () => {
  // OrangeKit reads `window` for injected wallets; none are installed here.
  Reflect.set(globalThis, "window", globalThis)
  passport = await import("@mezo-org/passport/dist/src/wallet/index.js")
  passportChains = await import("@mezo-org/passport/dist/src/constants.js")
}, 60_000)

describe("lazy OrangeKit Bitcoin wallets", () => {
  it("copies the package's Mezo chains exactly", () => {
    expect(mezoMainnet).toEqual(passportChains.mezoMainnet)
    expect(mezoTestnet).toEqual(passportChains.mezoTestnet)
  })

  it.each(KINDS)("%s matches OrangeKit's wallet and connector", (kind) => {
    const real = realFactory(passport, kind)(CONFIG)()
    const lazy = lazyBitcoinWallet(kind, CONFIG)()
    const { createConnector: realCreate, ...realMeta } = real
    const { createConnector: lazyCreate, ...lazyMeta } = lazy
    expect(lazyMeta).toEqual(realMeta)

    const details = { walletDetails: { rkDetails: realMeta } }
    const realConnector = instantiate(
      Reflect.apply(realCreate, undefined, [details]),
    )
    const lazyConnector = instantiate(
      Reflect.apply(lazyCreate, undefined, [details]),
    )
    for (const key of ["id", "name", "type"]) {
      expect(lazyConnector[key]).toBe(realConnector[key])
    }
    // The icon ships as a file (a URL here); its bytes must be OrangeKit's.
    expect(lazyConnector.icon).toBe(BITCOIN_WALLET_SPECS[kind].connector.icon)
    const realIcon = String(realConnector.icon)
    expect(realIcon.startsWith(PNG_DATA_URI)).toBe(true)
    expect(
      readFileSync(new URL(`./icons/${kind}.png`, import.meta.url)).equals(
        Buffer.from(realIcon.slice(PNG_DATA_URI.length), "base64"),
      ),
    ).toBe(true)

    // Every capability OrangeKit offers is forwarded.
    const methods = (connector: Record<string, unknown>) =>
      Object.keys(connector)
        .filter((key) => typeof connector[key] === "function")
        .sort()
    expect(methods(lazyConnector)).toEqual(
      expect.arrayContaining(methods(realConnector)),
    )
  })

  it("answers for an absent wallet without loading OrangeKit", async () => {
    const lazy = lazyBitcoinWallet("unisat", CONFIG)()
    const connector = instantiate(
      Reflect.apply(lazy.createConnector, undefined, [{}]),
    )
    const isAuthorized = connector.isAuthorized
    const getProvider = connector.getProvider
    const getBitcoinProvider = connector.getBitcoinProvider
    if (
      typeof isAuthorized !== "function" ||
      typeof getProvider !== "function" ||
      typeof getBitcoinProvider !== "function"
    ) {
      throw new Error("missing connector methods")
    }
    await expect(Reflect.apply(isAuthorized, connector, [])).resolves.toBe(
      false,
    )
    await expect(Reflect.apply(getProvider, connector, [])).rejects.toThrow(
      "Unisat wallet is not installed",
    )
    expect(Reflect.apply(getBitcoinProvider, connector, [])).toBeUndefined()
  })
})
