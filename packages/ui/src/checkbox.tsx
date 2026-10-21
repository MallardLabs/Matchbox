import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check, Minus } from "lucide-react"
import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactElement,
  forwardRef,
} from "react"
import { cn } from "./cn"

const ROOT_NAME = "Checkbox"

export type CheckboxProps = ComponentPropsWithoutRef<
  typeof CheckboxPrimitive.Root
>

export const Root = forwardRef<
  ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(function Checkbox({ className, ...props }, ref): ReactElement {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        "group inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-muted bg-surface text-on-accent transition-colors hover:border-secondary disabled:cursor-not-allowed disabled:opacity-40 aria-[invalid=true]:border-neg data-[state=checked]:border-accent data-[state=indeterminate]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:bg-accent",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        <Check
          aria-hidden="true"
          size={12}
          strokeWidth={3}
          className="group-data-[state=indeterminate]:hidden"
        />
        <Minus
          aria-hidden="true"
          size={12}
          strokeWidth={3}
          className="hidden group-data-[state=indeterminate]:block"
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
})
Root.displayName = ROOT_NAME
