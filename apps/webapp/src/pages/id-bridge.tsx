import { useEffect } from "react"
import type { EIP1193Provider } from "viem"
import { useAccount } from "wagmi"

const ID_ORIGIN = new URL(
  process.env.NEXT_PUBLIC_ID_URL ?? "https://id.matchbox.markets",
).origin
const ALLOWED_METHODS = new Set([
  "personal_sign",
  "eth_accounts",
  "eth_requestAccounts",
  "eth_chainId",
])

type BridgeRequest = {
  type: "matchbox:id:wallet-request"
  requestId: string
  args: { method: string; params?: readonly unknown[] | object }
}

function isBridgeRequest(value: unknown): value is BridgeRequest {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<BridgeRequest>
  return (
    candidate.type === "matchbox:id:wallet-request" &&
    typeof candidate.requestId === "string" &&
    !!candidate.args &&
    typeof candidate.args.method === "string"
  )
}

function isProvider(value: unknown): value is EIP1193Provider {
  return (
    typeof value === "object" &&
    value !== null &&
    "request" in value &&
    typeof value.request === "function"
  )
}

export default function MatchboxIdBridgePage(): JSX.Element {
  const account = useAccount()

  useEffect(() => {
    if (window.parent === window) return
    window.parent.postMessage(
      {
        type: "matchbox:id:wallet-status",
        address: account.address ?? null,
        connected: account.isConnected,
      },
      ID_ORIGIN,
    )
  }, [account.address, account.isConnected])

  useEffect(() => {
    async function handleRequest(event: MessageEvent<unknown>): Promise<void> {
      if (
        event.origin !== ID_ORIGIN ||
        event.source !== window.parent ||
        !isBridgeRequest(event.data)
      )
        return
      const { requestId, args } = event.data
      if (!ALLOWED_METHODS.has(args.method)) {
        window.parent.postMessage(
          {
            type: "matchbox:id:wallet-response",
            requestId,
            error: "Wallet method is not allowed through the Matchbox bridge",
          },
          ID_ORIGIN,
        )
        return
      }
      try {
        const candidate: unknown = await account.connector?.getProvider()
        if (!isProvider(candidate)) throw new Error("Wallet is not connected")
        const result = await candidate.request(args as never)
        window.parent.postMessage(
          { type: "matchbox:id:wallet-response", requestId, result },
          ID_ORIGIN,
        )
      } catch (error) {
        window.parent.postMessage(
          {
            type: "matchbox:id:wallet-response",
            requestId,
            error:
              error instanceof Error
                ? error.message
                : "Wallet request was rejected",
          },
          ID_ORIGIN,
        )
      }
    }

    window.addEventListener("message", handleRequest)
    return () => window.removeEventListener("message", handleRequest)
  }, [account.connector])

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Matchbox ID wallet bridge</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This protected page lets Matchbox ID reuse your connected wallet. It
          does not authorize apps or sign anything automatically.
        </p>
      </div>
    </main>
  )
}
