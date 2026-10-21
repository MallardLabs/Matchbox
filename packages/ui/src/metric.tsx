import {
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  forwardRef,
} from "react"
import { tv } from "./cn"

const ROOT_NAME = "Metric"

const metricStyles = tv({
  slots: {
    root: "flex min-w-0 flex-col",
    label: "truncate font-500 text-secondary",
    value: "truncate font-600 tabular-nums text-ink",
    sub: "truncate font-400 text-secondary",
  },
  variants: {
    size: {
      sm: {
        root: "gap-0.5",
        label: "text-caption",
        value: "text-lead",
        sub: "text-caption",
      },
      md: {
        root: "gap-0.5",
        label: "text-label",
        value: "text-metric",
        sub: "text-caption",
      },
      lg: {
        root: "gap-1",
        label: "text-label",
        value: "text-hero tracking-[-0.01em]",
        sub: "text-label",
      },
    },
    tone: {
      default: {},
      accent: { value: "text-accent-ink" },
      pos: { value: "text-pos" },
      neg: { value: "text-neg" },
      muted: { value: "text-muted" },
    },
  },
  defaultVariants: { size: "md", tone: "default" },
})

export type MetricSize = "sm" | "md" | "lg"
export type MetricTone = "default" | "accent" | "pos" | "neg" | "muted"

export type RootProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  size?: MetricSize
  tone?: MetricTone
}

/** Label / value / qualifier stack (“Claimable · $1,049.90 · 3 sources”). */
export const Root = forwardRef<HTMLDivElement, RootProps>(function Metric(
  { label, value, sub, size, tone, className, ...props },
  ref,
): ReactElement {
  const styles = metricStyles({ size, tone })
  return (
    <div ref={ref} className={styles.root({ className })} {...props}>
      <span className={styles.label()}>{label}</span>
      <span className={styles.value()}>{value}</span>
      {sub ? <span className={styles.sub()}>{sub}</span> : null}
    </div>
  )
})
Root.displayName = ROOT_NAME
