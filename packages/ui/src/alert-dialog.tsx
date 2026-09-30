import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"
import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
  type ReactElement,
  forwardRef,
} from "react"
import { type ButtonVariant, buttonStyles } from "./button"
import { cn } from "./cn"
import { useFocusRestore } from "./focus-restore"

const CONTENT_NAME = "AlertDialogContent"
const HEADER_NAME = "AlertDialogHeader"
const TITLE_NAME = "AlertDialogTitle"
const DESCRIPTION_NAME = "AlertDialogDescription"
const FOOTER_NAME = "AlertDialogFooter"
const CANCEL_NAME = "AlertDialogCancel"
const ACTION_NAME = "AlertDialogAction"

export const Root = AlertDialogPrimitive.Root
export const Trigger = AlertDialogPrimitive.Trigger

export type ContentProps = ComponentPropsWithoutRef<
  typeof AlertDialogPrimitive.Content
>

/**
 * Confirmation for destructive or irreversible actions. Focus starts on
 * Cancel and returns to whatever was focused before opening.
 */
export const Content = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Content>,
  ContentProps
>(function AlertDialogContent(
  { className, onOpenAutoFocus, onCloseAutoFocus, ...props },
  ref,
): ReactElement {
  const focus = useFocusRestore(onOpenAutoFocus, onCloseAutoFocus)
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 p-4 data-[state=open]:animate-fade-in sm:items-center">
        <AlertDialogPrimitive.Content
          ref={ref}
          className={cn(
            "my-auto flex w-full max-w-[420px] flex-col gap-4 rounded-xl bg-surface p-5 text-ink shadow-dialog outline-none data-[state=open]:animate-pop-in",
            className,
          )}
          onOpenAutoFocus={focus.onOpenAutoFocus}
          onCloseAutoFocus={focus.onCloseAutoFocus}
          {...props}
        />
      </AlertDialogPrimitive.Overlay>
    </AlertDialogPrimitive.Portal>
  )
})
Content.displayName = CONTENT_NAME

export const Header = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function AlertDialogHeader({ className, ...props }, ref): ReactElement {
  return (
    <div
      ref={ref}
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  )
})
Header.displayName = HEADER_NAME

export const Title = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(function AlertDialogTitle({ className, ...props }, ref): ReactElement {
  return (
    <AlertDialogPrimitive.Title
      ref={ref}
      className={cn("text-[18px] font-650 text-ink", className)}
      {...props}
    />
  )
})
Title.displayName = TITLE_NAME

export const Description = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(function AlertDialogDescription({ className, ...props }, ref): ReactElement {
  return (
    <AlertDialogPrimitive.Description
      ref={ref}
      className={cn("text-[13px] text-secondary", className)}
      {...props}
    />
  )
})
Description.displayName = DESCRIPTION_NAME

export const Footer = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function AlertDialogFooter({ className, ...props }, ref): ReactElement {
  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  )
})
Footer.displayName = FOOTER_NAME

export const Cancel = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Cancel>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(function AlertDialogCancel({ className, ...props }, ref): ReactElement {
  return (
    <AlertDialogPrimitive.Cancel
      ref={ref}
      className={buttonStyles({ variant: "secondary", className })}
      {...props}
    />
  )
})
Cancel.displayName = CANCEL_NAME

export type ActionProps = ComponentPropsWithoutRef<
  typeof AlertDialogPrimitive.Action
> & {
  variant?: Extract<ButtonVariant, "danger" | "primary">
}

export const Action = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Action>,
  ActionProps
>(function AlertDialogAction(
  { variant = "danger", className, ...props },
  ref,
): ReactElement {
  return (
    <AlertDialogPrimitive.Action
      ref={ref}
      className={buttonStyles({ variant, className })}
      {...props}
    />
  )
})
Action.displayName = ACTION_NAME
