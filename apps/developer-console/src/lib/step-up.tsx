import * as Button from "@repo/ui/button"
import * as Dialog from "@repo/ui/dialog"
import { ShieldCheck } from "lucide-react"
import {
  type ComponentType,
  type ReactElement,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react"
import GoogleButton, {
  type GoogleButtonProps,
} from "../components/auth/GoogleButton"
import * as api from "./api"
import { ApiError } from "./api-client"

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

/** Exchanges a Google ID token for a stepped-up session. */
export type StepUpVerifier = (credential: string) => Promise<void>

export async function googleStepUp(credential: string): Promise<void> {
  await api.auth.googleStepUp(credential)
}

/** The control that yields a credential (the GIS button in the app). */
export type StepUpControl = ComponentType<
  Pick<GoogleButtonProps, "onCredential" | "onError">
>

function GoogleStepUpButton(
  props: Pick<GoogleButtonProps, "onCredential" | "onError">,
): ReactElement {
  return <GoogleButton purpose="step-up" text="continue_with" {...props} />
}

type Pending = { resolve: () => void; reject: (error: Error) => void }

type StepUpContextValue = { request: () => Promise<void> }

const StepUpContext = createContext<StepUpContextValue | null>(null)

type StepUpProviderProps = {
  children: ReactNode
  /** Injected in tests; defaults to `POST /api/auth/step-up/google`. */
  verify?: StepUpVerifier
  /** Injected in tests; defaults to the Google button. */
  control?: StepUpControl
  /** Dev memory mode: offer the no-Google step-up route. */
  allowDevStepUp?: boolean
}

export function StepUpProvider({
  children,
  verify = googleStepUp,
  control: Control = GoogleStepUpButton,
  allowDevStepUp = import.meta.env.DEV,
}: StepUpProviderProps): ReactElement {
  const [open, setOpen] = useState(false)
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

  const settle = useCallback((outcome: "done" | "cancel") => {
    const current = pending.current
    pending.current = null
    setOpen(false)
    if (current === null) return
    if (outcome === "done") current.resolve()
    else current.reject(new StepUpCancelledError())
  }, [])

  const confirm = useCallback(
    async (credential: string) => {
      await verify(credential)
      settle("done")
    },
    [settle, verify],
  )

  async function devConfirm(): Promise<void> {
    try {
      await api.auth.devStepUp()
      settle("done")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed.")
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
            <Dialog.Title>Confirm with Google</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <p className="flex items-center gap-2 text-body-sm text-secondary">
              <ShieldCheck aria-hidden="true" size={16} strokeWidth={1.75} />
              Valid 10 min
            </p>
            {open ? (
              <Control onCredential={confirm} onError={setError} />
            ) : null}
            {error === null ? null : (
              <p role="alert" className="text-label font-500 text-neg">
                {error}
              </p>
            )}
          </Dialog.Body>
          <Dialog.Footer>
            {allowDevStepUp ? (
              <Button.Root variant="ghost" onClick={() => void devConfirm()}>
                Dev step-up
              </Button.Root>
            ) : null}
            <Dialog.Close asChild>
              <Button.Root variant="secondary">Cancel</Button.Root>
            </Dialog.Close>
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
