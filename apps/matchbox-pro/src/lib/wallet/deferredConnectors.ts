import type { WalletList } from "@rainbow-me/rainbowkit"
import type { CreateConnectorFn } from "wagmi"

// wagmi wakes every connector on load: `setup()` at config creation and
// `getProvider()` in reconnect. For SDK-backed wallets (WalletConnect,
// Coinbase, MetaMask SDK) that downloads and starts their SDK for every
// visitor. These connectors stay asleep unless they are the one used last
// here (wagmi's `recentConnectorId`) or someone picks them in the dialog;
// injected wallets are cheap and behave exactly as before.

type CreateWalletFn = WalletList[number]["wallets"][number]
type Connector = ReturnType<CreateConnectorFn>

const EAGER_TYPES = new Set(["injected", "orangekit"])

export function deferUntilUsed(create: CreateConnectorFn): CreateConnectorFn {
  return (config) => {
    const connector: Connector = create(config)
    if (EAGER_TYPES.has(connector.type)) return connector

    let awake = false
    let setUp = false
    const isAwake = async (): Promise<boolean> => {
      if (awake) return true
      try {
        const recent = await config.storage?.getItem("recentConnectorId")
        awake = recent === connector.id
      } catch {
        awake = false
      }
      return awake
    }
    const originalConnect = connector.connect
    // Picked in the dialog (not reconnect): wake it and finish the setup
    // wagmi skipped at load.
    const connect: typeof originalConnect = async function (
      this: unknown,
      parameters,
    ) {
      if (!parameters?.isReconnecting) awake = true
      if (awake && !setUp) {
        setUp = true
        await connector.setup?.call(this)
      }
      return Reflect.apply(originalConnect, this, [parameters])
    }

    // wagmi spreads this object and calls the methods on its own copy, so
    // `this` is wagmi's connector and the SDK code keeps working through it.
    return {
      ...connector,
      async setup() {
        if (setUp || !(await isAwake())) return
        setUp = true
        await connector.setup?.call(this)
      },
      async getProvider(parameters) {
        if (!(await isAwake())) {
          throw new Error(`${connector.name} has not been used here`)
        }
        return connector.getProvider.call(this, parameters)
      },
      async isAuthorized() {
        if (!(await isAwake())) return false
        return connector.isAuthorized.call(this)
      },
      connect,
    }
  }
}

/** A RainbowKit wallet whose connector only wakes when used (see above). */
export function deferredWallet(createWallet: CreateWalletFn): CreateWalletFn {
  return (parameters) => {
    const wallet = createWallet(parameters)
    return {
      ...wallet,
      createConnector: (details) =>
        deferUntilUsed(wallet.createConnector(details)),
    }
  }
}
