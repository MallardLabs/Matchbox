import { describe, expect, it } from "vitest"
import { deferUntilUsed } from "./deferredConnectors"
import { mezoMainnet } from "./mezoChains"

type Calls = string[]

/** A stand-in SDK connector that records which methods ran, and on what. */
function fakeConnectorFn(type: string, calls: Calls) {
  return () => ({
    id: "walletConnect",
    name: "WalletConnect",
    type,
    async setup(this: { name?: string }) {
      calls.push(`setup:${this.name}`)
    },
    async getProvider() {
      calls.push("getProvider")
      return { sdk: true }
    },
    async isAuthorized() {
      calls.push("isAuthorized")
      return true
    },
    async connect(this: { name?: string }) {
      calls.push(`connect:${this.name}`)
      return { accounts: [], chainId: 1 }
    },
    async disconnect() {},
    async getAccounts() {
      return []
    },
    async getChainId() {
      return 1
    },
    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {},
  })
}

function params(recent: string | null) {
  return {
    chains: [mezoMainnet] as const,
    emitter: { uid: "t", emit() {}, on() {}, off() {}, once() {} },
    storage: {
      key: "wagmi",
      async getItem(key: string) {
        return key === "recentConnectorId" ? recent : null
      },
      async setItem() {},
      async removeItem() {},
    },
    transports: {},
  }
}

/** Builds the connector the way wagmi does: call the fn, spread, add fields. */
function build(type: string, recent: string | null, calls: Calls) {
  const create = deferUntilUsed(fakeConnectorFn(type, calls))
  const made: unknown = Reflect.apply(create, undefined, [params(recent)])
  if (typeof made !== "object" || made === null) throw new Error("no object")
  return { ...Object.fromEntries(Object.entries(made)), uid: "u1" }
}

async function invoke(
  connector: Record<string, unknown>,
  key: string,
  ...args: unknown[]
): Promise<unknown> {
  const method = connector[key]
  if (typeof method !== "function") throw new Error(`missing ${key}`)
  return Reflect.apply(method, connector, args)
}

describe("deferUntilUsed", () => {
  it("keeps an unused SDK connector asleep through load and reconnect", async () => {
    const calls: Calls = []
    const connector = build("walletConnect", "io.metamask", calls)
    await invoke(connector, "setup")
    await expect(invoke(connector, "getProvider")).rejects.toThrow(
      "WalletConnect has not been used here",
    )
    expect(await invoke(connector, "isAuthorized")).toBe(false)
    expect(calls).toEqual([])
  })

  it("wakes the connector used last, as before", async () => {
    const calls: Calls = []
    const connector = build("walletConnect", "walletConnect", calls)
    await invoke(connector, "setup")
    expect(await invoke(connector, "getProvider")).toEqual({ sdk: true })
    expect(await invoke(connector, "isAuthorized")).toBe(true)
    await invoke(connector, "connect", { isReconnecting: true })
    expect(calls).toEqual([
      "setup:WalletConnect",
      "getProvider",
      "isAuthorized",
      "connect:WalletConnect",
    ])
  })

  it("wakes on a dialog connect, running the skipped setup first", async () => {
    const calls: Calls = []
    const connector = build("walletConnect", null, calls)
    await invoke(connector, "setup")
    await invoke(connector, "connect")
    expect(await invoke(connector, "getProvider")).toEqual({ sdk: true })
    expect(calls).toEqual([
      "setup:WalletConnect",
      "connect:WalletConnect",
      "getProvider",
    ])
  })

  it("leaves injected connectors untouched", async () => {
    const calls: Calls = []
    const connector = build("injected", null, calls)
    await invoke(connector, "setup")
    await invoke(connector, "getProvider")
    expect(calls).toEqual(["setup:WalletConnect", "getProvider"])
  })
})
