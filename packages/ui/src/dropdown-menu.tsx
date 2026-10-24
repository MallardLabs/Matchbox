import * as MenuPrimitive from "@radix-ui/react-dropdown-menu"
import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactElement,
  forwardRef,
} from "react"
import { cn } from "./cn"

const CONTENT_NAME = "DropdownMenuContent"
const ITEM_NAME = "DropdownMenuItem"
const LABEL_NAME = "DropdownMenuLabel"
const SEPARATOR_NAME = "DropdownMenuSeparator"

export const Root = MenuPrimitive.Root
export const Trigger = MenuPrimitive.Trigger
export const Group = MenuPrimitive.Group

export type ContentProps = ComponentPropsWithoutRef<
  typeof MenuPrimitive.Content
>

/** Pro "More" popover: hairline card with pop shadow. */
export const Content = forwardRef<
  ElementRef<typeof MenuPrimitive.Content>,
  ContentProps
>(function DropdownMenuContent(
  { className, sideOffset = 6, align = "end", ...props },
  ref,
): ReactElement {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "z-50 min-w-44 rounded-lg border border-line bg-surface p-1 text-ink shadow-pop data-[state=open]:animate-pop-in",
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  )
})
Content.displayName = CONTENT_NAME

export type ItemProps = ComponentPropsWithoutRef<typeof MenuPrimitive.Item> & {
  tone?: "default" | "danger"
}

export const Item = forwardRef<
  ElementRef<typeof MenuPrimitive.Item>,
  ItemProps
>(function DropdownMenuItem(
  { tone = "default", className, ...props },
  ref,
): ReactElement {
  return (
    <MenuPrimitive.Item
      ref={ref}
      className={cn(
        "flex h-9 cursor-default select-none items-center gap-2.5 rounded-md px-2.5 text-[13px] font-500 outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-inset data-[disabled]:opacity-40 [&>svg]:shrink-0 [&>svg]:text-secondary",
        tone === "danger" ? "text-neg [&>svg]:text-neg" : "text-ink",
        className,
      )}
      {...props}
    />
  )
})
Item.displayName = ITEM_NAME

export const Label = forwardRef<
  ElementRef<typeof MenuPrimitive.Label>,
  ComponentPropsWithoutRef<typeof MenuPrimitive.Label>
>(function DropdownMenuLabel({ className, ...props }, ref): ReactElement {
  return (
    <MenuPrimitive.Label
      ref={ref}
      className={cn(
        "px-2.5 pb-1 pt-2 text-[11px] font-650 uppercase tracking-[0.04em] text-secondary",
        className,
      )}
      {...props}
    />
  )
})
Label.displayName = LABEL_NAME

export const Separator = forwardRef<
  ElementRef<typeof MenuPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof MenuPrimitive.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref): ReactElement {
  return (
    <MenuPrimitive.Separator
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-line", className)}
      {...props}
    />
  )
})
Separator.displayName = SEPARATOR_NAME
