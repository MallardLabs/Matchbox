import { Slot } from "@radix-ui/react-slot"
import {
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  forwardRef,
} from "react"
import { cn } from "./cn"

const ROOT_NAME = "EmptyState"
const TITLE_NAME = "EmptyStateTitle"
const ACTION_NAME = "EmptyStateAction"

export type EmptyStateLayout = "inline" | "centered"

export type RootProps = HTMLAttributes<HTMLDivElement> & {
  layout?: EmptyStateLayout
}

/** Pro "Empty": a divider row with a title and one action. */
export const Root = forwardRef<HTMLDivElement, RootProps>(function EmptyState(
  { layout = "inline", className, ...props },
  ref,
): ReactElement {
  return (
    <div
      ref={ref}
      className={cn(
        "border-t border-line",
        layout === "inline"
          ? "flex flex-wrap items-center justify-between gap-3 py-6"
          : "flex flex-col items-center gap-3 py-10 text-center",
        className,
      )}
      {...props}
    />
  )
})
Root.displayName = ROOT_NAME

export type TitleProps = HTMLAttributes<HTMLHeadingElement> & {
  asChild?: boolean
}

export const Title = forwardRef<HTMLHeadingElement, TitleProps>(
  function EmptyStateTitle(
    { asChild = false, className, ...props },
    ref,
  ): ReactElement {
    const Comp = asChild ? Slot : "h3"
    return (
      <Comp
        ref={ref}
        className={cn("text-[14px] font-600 text-ink", className)}
        {...props}
      />
    )
  },
)
Title.displayName = TITLE_NAME

/** Wraps the single action (usually a Button.Root). */
export const Action = forwardRef<HTMLElement, { children: ReactNode }>(
  function EmptyStateAction({ children, ...props }, ref): ReactElement {
    return (
      <Slot ref={ref} {...props}>
        {children}
      </Slot>
    )
  },
)
Action.displayName = ACTION_NAME
