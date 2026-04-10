import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

interface TooltipProps {
  content: string
  id: string
}

export default function Tooltip({ content, id }: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [positionAbove, setPositionAbove] = useState(true)
  const [tooltipPosition, setTooltipPosition] = useState<{
    left: number
    top: number
  } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const updateTooltipPosition = useCallback(() => {
    if (!buttonRef.current || typeof window === "undefined") return

    const rect = buttonRef.current.getBoundingClientRect()
    const tooltipWidth = 208
    const viewportPadding = 12
    const triggerCenter = rect.left + rect.width / 2
    const clampedLeft = Math.min(
      Math.max(triggerCenter, viewportPadding + tooltipWidth / 2),
      window.innerWidth - viewportPadding - tooltipWidth / 2,
    )
    const showAbove = rect.top > 120

    setPositionAbove(showAbove)
    setTooltipPosition({
      left: clampedLeft,
      top: showAbove ? rect.top - 8 : rect.bottom + 8,
    })
  }, [])

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    updateTooltipPosition()
    window.addEventListener("resize", updateTooltipPosition)
    window.addEventListener("scroll", updateTooltipPosition, true)

    return () => {
      window.removeEventListener("resize", updateTooltipPosition)
      window.removeEventListener("scroll", updateTooltipPosition, true)
    }
  }, [isOpen, updateTooltipPosition])

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        type="button"
        aria-describedby={isOpen ? id : undefined}
        onMouseEnter={() => {
          updateTooltipPosition()
          setIsOpen(true)
        }}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => {
          updateTooltipPosition()
          setIsOpen(true)
        }}
        onBlur={() => setIsOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setIsOpen(false)
        }}
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded border border-[var(--border)] bg-[var(--surface-secondary)] font-mono text-[10px] text-[var(--content-tertiary)] transition-colors hover:border-[#F7931A] hover:text-[#F7931A] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#F7931A]"
      >
        ?
      </button>
      {isOpen &&
        isMounted &&
        tooltipPosition &&
        createPortal(
          <span
            role="tooltip"
            id={id}
            className={`pointer-events-none fixed z-[1000] w-52 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 text-xs leading-relaxed text-[var(--content-secondary)] shadow-terminal-md ${
              positionAbove
                ? "-translate-x-1/2 -translate-y-full"
                : "-translate-x-1/2"
            }`}
            style={{
              left: tooltipPosition.left,
              top: tooltipPosition.top,
            }}
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  )
}
