import { Check, LoaderCircle, TriangleAlert } from "lucide-react"
import {
  type HTMLAttributes,
  type OlHTMLAttributes,
  type ReactElement,
  type ReactNode,
  forwardRef,
} from "react"
import { cn } from "./cn"

const ROOT_NAME = "SigningSteps"
const STEP_NAME = "SigningStepsStep"

export type SigningStepStatus = "done" | "active" | "pending" | "failed"

/**
 * Ordered wallet-signature progress (Pro checkout, claim and incentive
 * sheets). The active step is enlarged; finished steps compress above it.
 */
export const Root = forwardRef<
  HTMLOListElement,
  OlHTMLAttributes<HTMLOListElement>
>(function SigningSteps({ className, ...props }, ref): ReactElement {
  return (
    <ol
      ref={ref}
      aria-live="polite"
      className={cn("m-0 flex list-none flex-col gap-2.5 p-0", className)}
      {...props}
    />
  )
})
Root.displayName = ROOT_NAME

export type StepProps = HTMLAttributes<HTMLLIElement> & {
  status: SigningStepStatus
  label: ReactNode
  /** Secondary line under the active or failed step ("Waiting for wallet"). */
  detail?: ReactNode
  /** Shown beside a failed step's detail (e.g. a Retry button). */
  action?: ReactNode
}

export const Step = forwardRef<HTMLLIElement, StepProps>(function SigningStep(
  { status, label, detail, action, className, ...props },
  ref,
): ReactElement {
  const prominent = status === "active" || status === "failed"
  return (
    <li
      ref={ref}
      aria-current={status === "active" ? "step" : undefined}
      className={cn(
        "flex flex-col gap-1",
        status === "pending" && "opacity-45",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "flex items-center",
          prominent ? "gap-3" : "gap-2",
          status === "done" && "text-pos",
          status === "pending" && "text-muted",
          status === "active" && "text-ink",
          status === "failed" && "text-neg",
        )}
      >
        <StepIcon status={status} />
        <span
          className={cn(
            prominent
              ? "text-metric font-700"
              : "text-nav font-650 tabular-nums",
          )}
        >
          {label}
        </span>
        <span className="sr-only">{statusText(status)}</span>
      </span>
      {detail || action ? (
        <span
          className={cn(
            "flex flex-wrap items-center gap-2 text-body-sm font-500",
            prominent ? "pl-[34px]" : "pl-6",
            status === "failed" ? "text-neg" : "text-muted",
          )}
        >
          {detail}
          {action}
        </span>
      ) : null}
    </li>
  )
})
Step.displayName = STEP_NAME

function statusText(status: SigningStepStatus): string {
  switch (status) {
    case "done":
      return "Signed"
    case "active":
      return "In progress"
    case "pending":
      return "Not started"
    case "failed":
      return "Failed"
  }
}

function StepIcon({ status }: { status: SigningStepStatus }): ReactElement {
  switch (status) {
    case "done":
      return <Check aria-hidden="true" size={16} strokeWidth={2.5} />
    case "active":
      return (
        <LoaderCircle
          aria-hidden="true"
          size={22}
          strokeWidth={2}
          className="animate-spin text-muted motion-reduce:animate-none"
        />
      )
    case "failed":
      return <TriangleAlert aria-hidden="true" size={22} strokeWidth={2} />
    case "pending":
      return (
        <span
          aria-hidden="true"
          className="mx-[3px] size-2.5 rounded-full border border-current"
        />
      )
  }
}
