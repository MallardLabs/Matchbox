import type { ReactNode } from "react"

interface SpringInProps {
  children: ReactNode
  delay?: number
  variant?: "default" | "card" | "card-subtle"
  className?: string
}

/**
 * Wraps children with iOS-style spring fly-in animation.
 * @param delay - Stagger delay multiplier (each unit = 50ms)
 * @param variant - Animation variant: "default" for tables/sections, "card" for cards
 */
export function SpringIn({
  children,
  delay = 0,
  variant = "default",
  className = "",
}: SpringInProps) {
  const cappedDelay = Math.min(Math.max(delay, 0), 12)
  const animationClass =
    variant === "card"
      ? "spring-fly-in-card"
      : variant === "card-subtle"
        ? "spring-fly-in-card-subtle"
        : "spring-fly-in"
  const delayClass = cappedDelay <= 10 ? `spring-delay-${cappedDelay}` : ""
  const delayStyle =
    cappedDelay > 10
      ? ({ "--spring-delay": cappedDelay } as React.CSSProperties)
      : undefined

  return (
    <div
      className={`${animationClass} ${delayClass} ${className}`.trim()}
      style={{ height: "100%", ...delayStyle }}
    >
      {children}
    </div>
  )
}

interface SpringInGridProps {
  children: ReactNode[]
  startDelay?: number
  variant?: "default" | "card" | "card-subtle"
  className?: string
}

/**
 * Wraps each child with staggered spring fly-in animations.
 * Useful for grids of cards.
 */
export function SpringInGrid({
  children,
  startDelay = 0,
  variant = "card",
  className = "",
}: SpringInGridProps) {
  return (
    <>
      {children.map((child, index) => (
        <SpringIn
          key={index}
          delay={startDelay + index}
          variant={variant}
          className={className}
        >
          {child}
        </SpringIn>
      ))}
    </>
  )
}
