import { useCallback, useEffect, useRef, useState } from "react"

type MarqueeTextProps = {
  children: string
  className?: string
  /** Gap between the end and repeated start in pixels */
  gap?: number
  /** Pixels per second scroll speed */
  speed?: number
}

/**
 * Spotify-style continuous marquee for text that overflows its container.
 * If the text fits, it renders statically with no animation.
 */
export default function MarqueeText({
  children,
  className = "",
  gap = 40,
  speed = 30,
}: MarqueeTextProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [shouldScroll, setShouldScroll] = useState(false)
  const [textWidth, setTextWidth] = useState(0)

  const measure = useCallback(() => {
    const container = containerRef.current
    const text = textRef.current
    if (!container || !text) return
    const cw = container.offsetWidth
    const tw = text.scrollWidth
    setShouldScroll(tw > cw)
    setTextWidth(tw)
  }, [])

  useEffect(() => {
    measure()
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [measure])

  const duration = shouldScroll ? (textWidth + gap) / speed : 0

  return (
    <div
      ref={containerRef}
      className={`marquee-container ${className}`}
      style={{
        overflow: "hidden",
        whiteSpace: "nowrap",
        position: "relative",
      }}
    >
      {shouldScroll ? (
        <div
          className="marquee-track"
          style={{
            display: "inline-flex",
            animation: `marquee-scroll ${duration}s linear infinite`,
          }}
        >
          <span ref={textRef}>{children}</span>
          <span style={{ width: `${gap}px`, flexShrink: 0 }} aria-hidden />
          <span aria-hidden="true">{children}</span>
          <span
            style={{ width: `${gap}px`, flexShrink: 0 }}
            aria-hidden="true"
          />
        </div>
      ) : (
        <span ref={textRef} className="truncate">
          {children}
        </span>
      )}
    </div>
  )
}
