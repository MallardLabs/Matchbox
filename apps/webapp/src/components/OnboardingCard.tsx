import { useEffect, useState } from "react"

export interface OnboardingStep {
  title: string
  description: string
}

interface OnboardingCardProps {
  steps: OnboardingStep[]
  storageKey: string
  heading: string
}

export default function OnboardingCard({
  steps,
  storageKey,
  heading,
}: OnboardingCardProps) {
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    const dismissed = localStorage.getItem(storageKey)
    if (!dismissed) {
      setMounted(true)
      // allow paint before animating in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
    }
  }, [storageKey])

  const dismiss = () => {
    setVisible(false)
    localStorage.setItem(storageKey, "1")
    setTimeout(() => setMounted(false), 300)
  }

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1)
    } else {
      dismiss()
    }
  }

  if (!mounted) return null

  const step = steps[currentStep]
  const isLast = currentStep === steps.length - 1

  return (
    <section
      className={`fixed bottom-4 right-4 z-40 w-72 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-terminal-lg transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      }`}
      aria-label="Getting started guide"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-1.5 font-mono text-xs text-[var(--content-primary)]">
          <span style={{ color: "#F7931A" }} aria-hidden="true">
            $
          </span>
          <span>{heading}</span>
          <span
            className="ml-0.5 inline-block h-3 w-1.5 animate-cursor-blink"
            style={{ backgroundColor: "#F7931A" }}
            aria-hidden="true"
          />
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss guide"
          className="flex h-5 w-5 items-center justify-center rounded text-[var(--content-tertiary)] transition-colors hover:text-[var(--content-primary)]"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 px-4 pt-3">
        <span className="font-mono text-2xs text-[var(--content-tertiary)]">
          Step {currentStep + 1} of {steps.length}
        </span>
        <div className="flex items-center gap-1" aria-hidden="true">
          {steps.map((step, i) => (
            <span
              key={step.title}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === currentStep
                  ? "w-3 bg-[#F7931A]"
                  : i < currentStep
                    ? "w-1.5 bg-[#F7931A] opacity-40"
                    : "w-1.5 bg-[var(--border)]"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-4 pt-2">
        <p className="mb-1.5 text-sm font-semibold text-[var(--content-primary)]">
          {step.title}
        </p>
        <p className="text-xs leading-relaxed text-[var(--content-secondary)]">
          {step.description}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3">
        <button
          type="button"
          onClick={dismiss}
          className="font-mono text-xs text-[var(--content-tertiary)] transition-colors hover:text-[var(--content-secondary)]"
        >
          skip
        </button>
        <button
          type="button"
          onClick={handleNext}
          className="flex items-center gap-1.5 rounded-lg border border-[#F7931A] bg-[rgba(247,147,26,0.1)] px-3 py-1.5 font-mono text-xs font-semibold text-[#F7931A] transition-colors hover:bg-[rgba(247,147,26,0.2)]"
        >
          {isLast ? "done" : "next"}
          {!isLast && (
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          )}
        </button>
      </div>
    </section>
  )
}
