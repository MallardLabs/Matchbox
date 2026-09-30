import * as Button from "@repo/ui/button"
import * as Dialog from "@repo/ui/dialog"
import { KeyRound } from "lucide-react"
import {
  type ReactElement,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react"
import * as api from "./api"
import { ApiError, errorMessage } from "./api-client"
import { assertPasskey } from "./webauthn"

/** Thrown when the user dismisses the step-up prompt. */
export class StepUpCancelledError extends Error {
  constructor() {
    super("Confirmation cancelled.")
    this.name = "StepUpCancelledError"
  }
}

export function isStepUpCancelled(error: unknown): boolean {
  return error instanceof StepUpCancelledError
}

export type StepUpVerifier = () => Promise<void>

/** Passkey assertion against `/api/auth/step-up/*`. */
export async function passkeyStepUp(): Promise<void> {
  const { challengeId, options } = await api.auth.stepUpOptions()
  const credential = await assertPasskey(options)
  await api.auth.stepUpVerify({ challengeId, credential })
}

/** Terse copy for the recovery lock-out; other errors pass through. */
export function stepUpErrorMessage(error: unknown): string {
  if (
    error instanceof ApiError &&
    error.code === "forbidden" &&
    /recover/i.test(error.message)
  ) {
    return "Recovered passkey · step-up in 24 h. Use another passkey."
  }
  return errorMessage(error)
}

async function devStepUp(): Promise<void> {
  await api.auth.devStepUp()
}

type Pending = { resolve: () => void; reject: (error: Error) => void }

type StepUpContextValue = { request: () => Promise<void> }

const StepUpContext = createContext<StepUpContextValue | null>(null)

type StepUpProviderProps = {
  children: ReactNode
  /** Injected in tests; defaults to the passkey ceremony. */
  verify?: StepUpVerifier
  /** Dev memory mode: offer the no-passkey step-up route. */
  allowDevStepUp?: boolean
}

export function StepUpProvider({
  children,
  verify = passkeyStepUp,
  allowDevStepUp = import.meta.env.DEV,
}: StepUpProviderProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef<Pending | null>(null)

  const request = useCallback(() => {
    pending.current?.reject(new StepUpCancelledError())
    setError(null)
    setOpen(true)
    return new Promise<void>((resolve, reject) => {
      pending.current = { resolve, reject }
    })
  }, [])

  function settle(outcome: "done" | "cancel"): void {
    const current = pending.current
    pending.current = null
    setOpen(false)
    setBusy(false)
    if (current === null) return
    if (outcome === "done") current.resolve()
    else current.reject(new StepUpCancelledError())
  }

  async function confirm(verifier: StepUpVerifier): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await verifier()
      settle("done")
    } catch (caught) {
      setBusy(false)
      setError(stepUpErrorMessage(caught))
    }
  }

  const value = useMemo(() => ({ request }), [request])

  return (
    <StepUpContext.Provider value={value}>
      {children}
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) settle("cancel")
        }}
      >
        <Dialog.Content size="sm" aria-describedby={undefined}>
          <Dialog.Header>
            <Dialog.Title>Confirm with passkey</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <p className="flex items-center gap-2 text-[13px] text-secondary">
              <KeyRound aria-hidden="true" size={16} strokeWidth={1.75} />
              Valid 10 min
            </p>
            {error === null ? null : (
              <p role="alert" className="text-[12px] font-500 text-neg">
                {error}
              </p>
            )}
          </Dialog.Body>
          <Dialog.Footer>
            {allowDevStepUp ? (
              <Button.Root
                variant="ghost"
                disabled={busy}
                onClick={() => void confirm(devStepUp)}
              >
                Dev step-up
              </Button.Root>
            ) : null}
            <Dialog.Close asChild>
              <Button.Root variant="secondary" disabled={busy}>
                Cancel
              </Button.Root>
            </Dialog.Close>
            <Button.Root loading={busy} onClick={() => void confirm(verify)}>
              Use passkey
            </Button.Root>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Root>
    </StepUpContext.Provider>
  )
}

export type StepUp = {
  /** Runs `action`; on `403 step_up_required` prompts once, then retries once. */
  run: <Result>(action: () => Promise<Result>) => Promise<Result>
}

export function useStepUp(): StepUp {
  const context = useContext(StepUpContext)
  if (context === null) {
    throw new Error("useStepUp must be used inside <StepUpProvider>")
  }
  const { request } = context
  return useMemo(
    () => ({
      async run<Result>(action: () => Promise<Result>): Promise<Result> {
        try {
          return await action()
        } catch (error) {
          if (
            !(error instanceof ApiError) ||
            error.code !== "step_up_required"
          ) {
            throw error
          }
          await request()
          return action()
        }
      },
    }),
    [request],
  )
}
