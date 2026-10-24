import { type HTMLAttributes, type ReactElement, forwardRef } from "react"
import type { VariantProps } from "tailwind-variants"
import { tv } from "./cn"

const ROOT_NAME = "Skeleton"

const skeletonStyles = tv({
  base: "block animate-pulse bg-inset motion-reduce:animate-none",
  variants: {
    shape: {
      line: "h-3 w-full rounded",
      block: "h-9 w-full rounded",
      circle: "size-8 rounded-full",
    },
  },
  defaultVariants: { shape: "line" },
})

export type SkeletonShape = NonNullable<
  VariantProps<typeof skeletonStyles>["shape"]
>

export type SkeletonProps = HTMLAttributes<HTMLSpanElement> & {
  shape?: SkeletonShape
}

/** Decorative placeholder; put aria-busy on the region that is loading. */
export const Root = forwardRef<HTMLSpanElement, SkeletonProps>(
  function Skeleton({ shape, className, ...props }, ref): ReactElement {
    return (
      <span
        ref={ref}
        aria-hidden="true"
        className={skeletonStyles({ shape, className })}
        {...props}
      />
    )
  },
)
Root.displayName = ROOT_NAME
