import type { ReactElement, ReactNode } from "react"

/** Page title for auth screens, with an optional step counter. */
export default function AuthHeading({
  title,
  step,
  children,
}: {
  title: string
  step?: { current: number; total: number }
  children?: ReactNode
}): ReactElement {
  return (
    <header className="mb-6 flex flex-col gap-1">
      {step === undefined ? null : (
        <p className="font-mono text-[11px] text-secondary">
          {`${step.current} / ${step.total}`}
        </p>
      )}
      <h1 className="text-[24px] font-600 text-ink">{title}</h1>
      {children}
    </header>
  )
}
