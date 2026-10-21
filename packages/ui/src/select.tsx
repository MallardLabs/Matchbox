import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown } from "lucide-react"
import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactElement,
  forwardRef,
} from "react"
import { cn } from "./cn"
import { type ControlSize, controlStyles } from "./input"

const TRIGGER_NAME = "SelectTrigger"
const CONTENT_NAME = "SelectContent"
const ITEM_NAME = "SelectItem"
const LABEL_NAME = "SelectLabel"
const SEPARATOR_NAME = "SelectSeparator"

export const Root = SelectPrimitive.Root
export const Group = SelectPrimitive.Group
export const Value = SelectPrimitive.Value

export type TriggerProps = ComponentPropsWithoutRef<
  typeof SelectPrimitive.Trigger
> & {
  size?: ControlSize
}

export const Trigger = forwardRef<
  ElementRef<typeof SelectPrimitive.Trigger>,
  TriggerProps
>(function SelectTrigger(
  { size, className, children, ...props },
  ref,
): ReactElement {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={controlStyles({
        size,
        className: [
          "flex items-center justify-between gap-2 text-left data-[placeholder]:text-muted [&>span]:truncate",
          className,
        ],
      })}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown
          aria-hidden="true"
          size={14}
          strokeWidth={1.75}
          className="shrink-0 text-muted"
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
})
Trigger.displayName = TRIGGER_NAME

export type ContentProps = ComponentPropsWithoutRef<
  typeof SelectPrimitive.Content
>

export const Content = forwardRef<
  ElementRef<typeof SelectPrimitive.Content>,
  ContentProps
>(function SelectContent(
  { className, children, position = "popper", sideOffset = 4, ...props },
  ref,
): ReactElement {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-h-[min(var(--radix-select-content-available-height),320px)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-line bg-surface text-ink shadow-pop data-[state=open]:animate-pop-in",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
})
Content.displayName = CONTENT_NAME

export type ItemProps = ComponentPropsWithoutRef<typeof SelectPrimitive.Item>

export const Item = forwardRef<
  ElementRef<typeof SelectPrimitive.Item>,
  ItemProps
>(function SelectItem({ className, children, ...props }, ref): ReactElement {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex h-8 cursor-default select-none items-center rounded-md pl-2 pr-7 text-[13px] font-500 text-ink outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-inset data-[disabled]:opacity-40",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center text-accent-ink">
        <Check aria-hidden="true" size={14} strokeWidth={2} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
})
Item.displayName = ITEM_NAME

export const Label = forwardRef<
  ElementRef<typeof SelectPrimitive.Label>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(function SelectLabel({ className, ...props }, ref): ReactElement {
  return (
    <SelectPrimitive.Label
      ref={ref}
      className={cn(
        "px-2 pb-1 pt-2 text-[11px] font-650 uppercase tracking-[0.04em] text-secondary",
        className,
      )}
      {...props}
    />
  )
})
Label.displayName = LABEL_NAME

export const Separator = forwardRef<
  ElementRef<typeof SelectPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(function SelectSeparator({ className, ...props }, ref): ReactElement {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-line", className)}
      {...props}
    />
  )
})
Separator.displayName = SEPARATOR_NAME
