import type {
  GoogleNoncePurpose,
  GoogleNonceResponse,
} from "@repo/platform-contracts/console"
import * as Skeleton from "@repo/ui/skeleton"
import { useTheme } from "@repo/ui/theme"
import { type ReactElement, useEffect, useRef, useState } from "react"
import * as api from "../../lib/api"
import { errorMessage } from "../../lib/api-client"
import { type GoogleButtonText, renderGoogleButton } from "../../lib/google"

/** Nonces live 10 minutes; refresh before the button goes stale. */
const nonceRefreshMs = 9 * 60_000

/**
 * One nonce request per purpose at a time: an effect that re-runs while a
 * request is in flight (StrictMode, theme change) reuses its nonce.
 */
const pendingNonces = new Map<
  GoogleNoncePurpose,
  Promise<GoogleNonceResponse>
>()

function requestNonce(
  purpose: GoogleNoncePurpose,
): Promise<GoogleNonceResponse> {
  const pending = pendingNonces.get(purpose)
  if (pending !== undefined) return pending
  const request = api.auth.googleNonce(purpose).finally(() => {
    pendingNonces.delete(purpose)
  })
  pendingNonces.set(purpose, request)
  return request
}

export type GoogleButtonProps = {
  purpose: GoogleNoncePurpose
  text?: GoogleButtonText
  /** Receives the ID token; a rejection re-arms the button with a new nonce. */
  onCredential: (credential: string) => Promise<void>
  /** Reports load and verification errors to the parent. */
  onError: (message: string | null) => void
}

/**
 * The GIS button. Each render asks the Worker for a nonce bound to this
 * browser and purpose, so every credential is tied to both. Timers stall in
 * background tabs and during sleep, so the button also re-arms when the page
 * comes back after the nonce has gone stale.
 */
export default function GoogleButton({
  purpose,
  text = "continue_with",
  onCredential,
  onError,
}: GoogleButtonProps): ReactElement {
  const container = useRef<HTMLDivElement>(null)
  const { resolved } = useTheme()
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  )
  const handlers = useRef({ onCredential, onError })
  handlers.current = { onCredential, onError }

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-arms the button with a new nonce
  useEffect(() => {
    let active = true
    const armedAt = Date.now()
    setStatus("loading")
    async function arm(): Promise<void> {
      try {
        const { clientId, nonce } = await requestNonce(purpose)
        const parent = container.current
        if (!active || parent === null) return
        await renderGoogleButton(parent, {
          clientId,
          nonce,
          purpose,
          text,
          dark: resolved === "dark",
          onCredential(credential) {
            handlers.current.onError(null)
            handlers.current.onCredential(credential).catch((error) => {
              handlers.current.onError(errorMessage(error))
              if (active) setAttempt((value) => value + 1)
            })
          },
        })
        if (active) setStatus("ready")
      } catch (error) {
        if (!active) return
        setStatus("failed")
        handlers.current.onError(errorMessage(error))
      }
    }
    void arm()
    const rearm = () => setAttempt((value) => value + 1)
    const refresh = window.setTimeout(rearm, nonceRefreshMs)
    function rearmIfStale(): void {
      if (
        document.visibilityState === "visible" &&
        Date.now() - armedAt >= nonceRefreshMs
      ) {
        rearm()
      }
    }
    document.addEventListener("visibilitychange", rearmIfStale)
    window.addEventListener("focus", rearmIfStale)
    window.addEventListener("pageshow", rearmIfStale)
    return () => {
      active = false
      window.clearTimeout(refresh)
      document.removeEventListener("visibilitychange", rearmIfStale)
      window.removeEventListener("focus", rearmIfStale)
      window.removeEventListener("pageshow", rearmIfStale)
    }
  }, [attempt, purpose, resolved, text])

  return (
    <div className={status === "failed" ? "hidden" : "relative min-h-11"}>
      {status !== "loading" ? null : (
        <Skeleton.Root
          shape="block"
          className="absolute inset-0 h-11"
          aria-hidden="true"
        />
      )}
      <div
        ref={container}
        className="flex min-h-11 w-full justify-center [color-scheme:normal]"
      />
    </div>
  )
}
