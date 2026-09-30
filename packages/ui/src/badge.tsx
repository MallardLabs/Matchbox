import { type HTMLAttributes, type ReactElement, forwardRef } from "react"
import type { VariantProps } from "tailwind-variants"
import { tv } from "./cn"

const ROOT_NAME = "Badge"

const badgeStyles = tv({
  base: "inline-flex h-[22px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2 text-[11px] font-650",
  variants: {
    tone: {
      neutral: "bg-inset text-secondary",
      accent: "bg-accent-soft text-accent-ink",
      pos: "bg-pos/10 text-pos",
      warn: "bg-warn/10 text-warn",
      neg: "bg-neg/10 text-neg",
    },
    mono: {
      true: "font-mono font-500",
    },
  },
  defaultVariants: { tone: "neutral" },
})

export type BadgeTone = NonNullable<VariantProps<typeof badgeStyles>["tone"]>

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone
  /** Leading status dot in the tone colour. */
  dot?: boolean
  /** Mono for ids and token numbers (#1234). */
  mono?: boolean
}

/** Status chip (Pro gauge header chips). */
export const Root = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone, dot = false, mono = false, className, children, ...props },
  ref,
): ReactElement {
  return (
    <span
      ref={ref}
      className={badgeStyles({ tone, mono, className })}
      {...props}
    >
      {dot ? (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      ) : null}
      {children}
    </span>
  )
})
Root.displayName = ROOT_NAME
