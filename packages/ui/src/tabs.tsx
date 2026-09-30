import * as TabsPrimitive from "@radix-ui/react-tabs"
import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactElement,
  forwardRef,
} from "react"
import { cn } from "./cn"

const LIST_NAME = "TabsList"
const TRIGGER_NAME = "TabsTrigger"
const CONTENT_NAME = "TabsContent"

export const Root = TabsPrimitive.Root

export const List = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref): ReactElement {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        "flex min-w-0 gap-5 overflow-x-auto border-b border-line",
        className,
      )}
      {...props}
    />
  )
})
List.displayName = LIST_NAME

/** Underline tab; the active tab carries the view's accent bar. */
export const Trigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref): ReactElement {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "relative -mb-px inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] font-550 text-secondary transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-sm after:bg-transparent hover:text-ink disabled:pointer-events-none disabled:opacity-40 data-[state=active]:font-600 data-[state=active]:text-ink data-[state=active]:after:bg-accent",
        className,
      )}
      {...props}
    />
  )
})
Trigger.displayName = TRIGGER_NAME

export const Content = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref): ReactElement {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn("pt-5 focus-visible:outline-offset-4", className)}
      {...props}
    />
  )
})
Content.displayName = CONTENT_NAME
