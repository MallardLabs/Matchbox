import { supabase } from "@/config/supabase"
import type { EthereumWallet } from "@supabase/auth-js"
import { useEffect, useRef, useState } from "react"
import { z } from "zod"

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.matchbox.markets"
const appOrigin = new URL(appUrl).origin

const statusSchema = z.object({
  type: z.literal("matchbox:id:wallet-status"),
  address: z.string().nullable(),
  connected: z.boolean(),
})
const responseSchema = z.object({
  type: z.literal("matchbox:id:wallet-response"),
  requestId: z.string(),
  result: z.unknown().optional(),
  error: z.string().optional(),
})

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

export function useMatchboxWalletBridge() {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const pending = useRef(new Map<string, PendingRequest>())
  const [address, setAddress] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    const timeout = window.setTimeout(() => setIsChecking(false), 1800)
    function handleMessage(event: MessageEvent<unknown>): void {
      if (
        event.origin !== appOrigin ||
        event.source !== frameRef.current?.contentWindow
      )
        return
      const status = statusSchema.safeParse(event.data)
      if (status.success) {
        setAddress(status.data.connected ? status.data.address : null)
        setIsChecking(false)
        window.clearTimeout(timeout)
        return
      }
      const response = responseSchema.safeParse(event.data)
      if (!response.success) return
      const request = pending.current.get(response.data.requestId)
      if (!request) return
      pending.current.delete(response.data.requestId)
      if (response.data.error) request.reject(new Error(response.data.error))
      else request.resolve(response.data.result)
    }
    window.addEventListener("message", handleMessage)
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener("message", handleMessage)
      for (const request of pending.current.values())
        request.reject(new Error("Matchbox wallet bridge closed"))
      pending.current.clear()
    }
  }, [])

  function request(args: {
    method: string
    params?: readonly unknown[] | object
  }): Promise<unknown> {
    const target = frameRef.current?.contentWindow
    if (!target || !address)
      return Promise.reject(new Error("Matchbox wallet is not available"))
    const requestId = crypto.randomUUID()
    return new Promise((resolve, reject) => {
      pending.current.set(requestId, { resolve, reject })
      target.postMessage(
        { type: "matchbox:id:wallet-request", requestId, args },
        appOrigin,
      )
    })
  }

  async function signIn(): Promise<void> {
    if (!address) throw new Error("Matchbox wallet is not available")
    const wallet: EthereumWallet = {
      address,
      request: (args) => request(args as never) as never,
      on: () => undefined,
      removeListener: () => undefined,
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

  return {
    address,
    frameRef,
    isChecking,
    signIn,
    src: `${appOrigin}/id-bridge`,
  }
}
