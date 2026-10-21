import { type HTMLAttributes, type ReactElement, forwardRef } from "react"
import { cn } from "./cn"

const ROOT_NAME = "Kbd"

export const Root = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  function Kbd({ className, ...props }, ref): ReactElement {
    return (
      <kbd
        ref={ref}
        className={cn(
          "inline-flex h-[22px] items-center rounded bg-inset-2 px-[7px] font-mono text-micro text-secondary",
          className,
        )}
        {...props}
      />
    )
  },
)
Root.displayName = ROOT_NAME
