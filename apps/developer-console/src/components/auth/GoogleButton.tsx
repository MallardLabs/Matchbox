import * as Skeleton from "@repo/ui/skeleton"
import { useTheme } from "@repo/ui/theme"
import { type ReactElement, useEffect, useRef, useState } from "react"
import * as api from "../../lib/api"
import { errorMessage } from "../../lib/api-client"
import { type GoogleButtonText, renderGoogleButton } from "../../lib/google"

/** Nonces live 10 minutes; refresh before the button goes stale. */
const nonceRefreshMs = 9 * 60_000

export type GoogleButtonProps = {
  purpose: "sign-in" | "step-up"
  text?: GoogleButtonText
  /** Receives the ID token; a rejection re-arms the button with a new nonce. */
  onCredential: (credential: string) => Promise<void>
  /** Reports load and verification errors to the parent. */
  onError: (message: string | null) => void
}

/**
 * The GIS button. Each render asks the Worker for a fresh single-use nonce
 * (cookie-bound), so every credential is tied to this browser and purpose.
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
    setStatus("loading")
    async function arm(): Promise<void> {
      try {
        const { clientId, nonce } = await api.auth.googleNonce(purpose)
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
    const refresh = window.setTimeout(
      () => setAttempt((value) => value + 1),
      nonceRefreshMs,
    )
    return () => {
      active = false
      window.clearTimeout(refresh)
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
