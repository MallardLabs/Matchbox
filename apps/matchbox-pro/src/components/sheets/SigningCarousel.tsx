import {
  type CarouselItem,
  type CarouselState,
  hasQueuedAfter,
} from "@/lib/carousel"
import { cn } from "@/lib/cn"
import { Check, Circle, Loader, X } from "lucide-react"
import type { ReactElement } from "react"

type SigningCarouselProps = {
  state: CarouselState
  onRetry?: (id: string) => void
}

/** Index of the step shown large: the one signing, else the failed one, else the last confirmed. */
function focusIndex(items: CarouselItem[]): number {
  const signing = items.findIndex((item) => item.status === "signing")
  if (signing >= 0) return signing
  const failed = items.findIndex((item) => item.status === "failed")
  if (failed >= 0) return failed
  return items.every((item) => item.status === "done") ? items.length - 1 : -1
}

/** Pen "Add caro" / "Claim caro": vertical wallet-prompt carousel with the active step enlarged. */
export default function SigningCarousel({
  state,
  onRetry,
}: SigningCarouselProps): ReactElement {
  const focus = focusIndex(state.items)
  const fadeTop = focus > 0
  const fadeBottom = hasQueuedAfter(state)

  return (
    <section
      aria-label="Wallet signatures"
      className="flex w-full max-w-[420px] flex-col gap-2.5"
    >
      <h3 className="text-[11px] font-650 uppercase tracking-[0.07em] text-muted">
        Signing
      </h3>
      <div className="relative h-[280px] overflow-hidden">
        <ol
          aria-live="polite"
          className="flex h-full flex-col justify-center gap-3.5 py-9"
        >
          {state.items.map((item, index) =>
            index === focus ? (
              <FocusStep key={item.id} item={item} onRetry={onRetry} />
            ) : (
              <li
                key={item.id}
                className={cn(
                  "flex items-center gap-2 text-[15px]",
                  item.status === "queued" && "opacity-40",
                )}
              >
                <StepIcon status={item.status} size={14} />
                <span
                  className={cn(
                    item.status === "done" && "font-700 text-pos",
                    item.status === "failed" && "font-700 text-neg",
                    item.status === "queued" && "font-500 text-muted",
                  )}
                >
                  {item.label}
                </span>
              </li>
            ),
          )}
        </ol>
        {fadeTop ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-surface to-transparent" />
        ) : null}
        {fadeBottom ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface to-transparent" />
        ) : null}
      </div>
    </section>
  )
}

function FocusStep({
  item,
  onRetry,
}: {
  item: CarouselItem
  onRetry: ((id: string) => void) | undefined
}): ReactElement {
  const tone =
    item.status === "done"
      ? "text-pos"
      : item.status === "failed"
        ? "text-neg"
        : "text-ink"
  return (
    <li className="flex flex-col gap-1">
      <p className="flex items-center gap-3">
        <StepIcon status={item.status} size={20} />
        <span className={cn("text-[22px] font-700", tone)}>{item.label}</span>
      </p>
      {item.status === "signing" ? (
        <p className="pl-8 text-[13px] font-500 text-muted">
          Waiting for wallet
        </p>
      ) : item.status === "done" ? (
        <p className="pl-8 text-[13px] font-500 text-pos">Confirmed</p>
      ) : item.status === "failed" ? (
        <div className="flex flex-col items-start gap-1 pl-8">
          {item.error ? (
            <p
              role="alert"
              className="max-w-sm text-pretty text-[12px] leading-5 text-neg"
            >
              {item.error}
            </p>
          ) : null}
          {onRetry ? (
            <button
              type="button"
              onClick={() => onRetry(item.id)}
              className="text-[13px] font-650 text-neg underline-offset-2 hover:underline"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function StepIcon({
  status,
  size,
}: {
  status: CarouselItem["status"]
  size: number
}): ReactElement {
  if (status === "done")
    return (
      <Check
        aria-hidden="true"
        size={size}
        strokeWidth={2.5}
        className="shrink-0 text-pos"
      />
    )
  if (status === "failed")
    return (
      <X
        aria-hidden="true"
        size={size}
        strokeWidth={2.5}
        className="shrink-0 text-neg"
      />
    )
  if (status === "signing")
    return (
      <Loader
        aria-hidden="true"
        size={size}
        strokeWidth={1.75}
        className="shrink-0 animate-spin text-secondary motion-reduce:animate-none"
      />
    )
  return (
    <Circle
      aria-hidden="true"
      size={size - 1}
      strokeWidth={1.75}
      className="shrink-0 text-faint"
    />
  )
}
