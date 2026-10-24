import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactElement,
  forwardRef,
} from "react"
import { cn } from "./cn"

const CONTENT_NAME = "TooltipContent"

/** Mount once near the app root. */
export const Provider = TooltipPrimitive.Provider
export const Root = TooltipPrimitive.Root
export const Trigger = TooltipPrimitive.Trigger

export const Content = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent(
  { className, sideOffset = 6, ...props },
  ref,
): ReactElement {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-w-64 rounded-md bg-ink px-2 py-1 text-[12px] font-500 text-canvas shadow-pop data-[state=delayed-open]:animate-fade-in",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
})
Content.displayName = CONTENT_NAME
