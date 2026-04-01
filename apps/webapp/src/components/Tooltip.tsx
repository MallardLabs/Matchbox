import { useEffect, useRef, useState } from "react"

interface TooltipProps {
  content: string
  id: string
}

export default function Tooltip({ content, id }: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [positionAbove, setPositionAbove] = useState(true)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    setPositionAbove(rect.top > 120)
  }, [isOpen])

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        type="button"
        aria-describedby={isOpen ? id : undefined}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setIsOpen(false)
        }}
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded border border-[var(--border)] bg-[var(--surface-secondary)] font-mono text-[10px] text-[var(--content-tertiary)] transition-colors hover:border-[#F7931A] hover:text-[#F7931A] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#F7931A]"
      >
        ?
      </button>
      {isOpen && (
        <span
          role="tooltip"
          id={id}
          className={`pointer-events-none absolute left-1/2 z-50 w-52 -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 text-xs leading-relaxed text-[var(--content-secondary)] shadow-terminal-md ${
            positionAbove ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          {content}
        </span>
      )}
    </span>
  )
}
