import { supabase } from "@/config/supabase"
import type { EthereumWallet } from "@supabase/auth-js"
import type { EIP1193Provider } from "viem"
import { useAccount } from "wagmi"

function isEip1193Provider(value: unknown): value is EIP1193Provider {
  return (
    typeof value === "object" &&
    value !== null &&
    "request" in value &&
    typeof value.request === "function"
  )
}

export function useWalletIdentity() {
  const account = useAccount()

  async function signIn(): Promise<void> {
    if (!account.connector || !account.address)
      throw new Error("Connect a wallet first")
    const provider: unknown = await account.connector.getProvider()
    if (!isEip1193Provider(provider)) {
      throw new Error("This wallet does not support secure message signing")
    }
    const wallet: EthereumWallet = {
      address: account.address,
      request: (args) => provider.request(args as never),
      on: (event, listener) => provider.on(event as never, listener as never),
      removeListener: (event, listener) =>
        provider.removeListener(event as never, listener as never),
    }
    const { error } = await supabase.auth.signInWithWeb3({
      chain: "ethereum",
      wallet,
      statement:
        "Sign in to Matchbox ID. This is gasless and cannot submit a transaction.",
      options: {
        url: `${window.location.origin}/`,
        signInWithEthereum: {
          expirationTime: new Date(Date.now() + 10 * 60_000),
        },
      },
    })
    if (error) throw error
  }

  async function accessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }

  return { ...account, signIn, accessToken }
}
