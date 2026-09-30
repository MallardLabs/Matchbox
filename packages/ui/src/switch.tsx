import * as SwitchPrimitive from "@radix-ui/react-switch"
import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactElement,
  forwardRef,
} from "react"
import { cn } from "./cn"

const ROOT_NAME = "Switch"

export type SwitchProps = ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>

/** Off: outlined track, muted knob. On: accent track, ink knob (AA in both themes). */
export const Root = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(function Switch({ className, ...props }, ref): ReactElement {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        "group inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-muted bg-inset-2 p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-3.5 rounded-full bg-muted shadow-knob transition-transform data-[state=checked]:translate-x-4 data-[state=checked]:bg-on-accent" />
    </SwitchPrimitive.Root>
  )
})
Root.displayName = ROOT_NAME
