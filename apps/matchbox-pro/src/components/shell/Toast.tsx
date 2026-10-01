import { CircleCheck } from "lucide-react"
import { type ReactElement, useEffect, useRef } from "react"

/** Pen C/Toast: soft-accent confirmation card, auto-dismisses after 2.8s. */
export default function Toast({
  message,
  onDone,
}: {
  message: string | null
  onDone: () => void
}): ReactElement {
  // Callers pass inline callbacks; a ref keeps the timer from restarting on every render.
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    if (!message) return
    const id = window.setTimeout(() => done.current(), 2800)
    return () => window.clearTimeout(id)
  }, [message])

  return (
    <output
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 right-6 z-[60] block"
    >
      {message ? (
        <p className="flex w-[360px] max-w-[calc(100vw-32px)] items-center gap-2.5 rounded-lg border border-line-2 bg-accent-soft px-3.5 py-3 text-[13px] font-600 text-ink shadow-[0_8px_24px_rgb(0_0_0/0.25)] animate-[sheet-in_200ms_cubic-bezier(0.2,0.8,0.2,1)]">
          <CircleCheck
            aria-hidden="true"
            size={16}
            strokeWidth={1.75}
            className="shrink-0 text-pos"
          />
          {message}
        </p>
      ) : null}
    </output>
  )
}
