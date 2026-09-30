import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
  type ReactElement,
  createContext,
  forwardRef,
  useContext,
} from "react"
import { cn, tv } from "./cn"
import { useFocusRestore } from "./focus-restore"

const CONTENT_NAME = "DialogContent"
const HEADER_NAME = "DialogHeader"
const TITLE_NAME = "DialogTitle"
const DESCRIPTION_NAME = "DialogDescription"
const BODY_NAME = "DialogBody"
const FOOTER_NAME = "DialogFooter"

export const Root = DialogPrimitive.Root
export const Trigger = DialogPrimitive.Trigger
export const Close = DialogPrimitive.Close

/** center: Pro connect modal. sheet: Pro bottom sheet (checkout, claim, lock). */
export type DialogPlacement = "center" | "sheet"
export type DialogSize = "sm" | "md" | "lg"

const PlacementContext = createContext<DialogPlacement>("center")

const contentStyles = tv({
  slots: {
    overlay:
      "fixed inset-0 z-40 flex overflow-y-auto bg-black/60 data-[state=open]:animate-fade-in",
    content: "relative flex flex-col bg-surface text-ink outline-none",
    column: "flex w-full flex-col gap-4",
  },
  variants: {
    placement: {
      center: {
        overlay: "items-start justify-center p-4 sm:items-center",
        content:
          "my-auto w-full rounded-xl p-5 shadow-dialog data-[state=open]:animate-pop-in",
      },
      sheet: {
        overlay: "items-end",
        content:
          "max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3 shadow-sheet data-[state=open]:animate-sheet-in sm:px-10",
        column: "mx-auto",
      },
    },
    size: { sm: {}, md: {}, lg: {} },
  },
  compoundVariants: [
    { placement: "center", size: "sm", class: { content: "max-w-[380px]" } },
    { placement: "center", size: "md", class: { content: "max-w-[520px]" } },
    { placement: "center", size: "lg", class: { content: "max-w-[640px]" } },
    { placement: "sheet", size: "sm", class: { column: "max-w-[520px]" } },
    { placement: "sheet", size: "md", class: { column: "max-w-[640px]" } },
  ],
  defaultVariants: { placement: "center", size: "sm" },
})

export type ContentProps = ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> & {
  placement?: DialogPlacement
  size?: DialogSize
  /** Hide the built-in close button (the dialog still closes on Escape). */
  hideClose?: boolean
  overlayClassName?: string
}

export const Content = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ContentProps
>(function DialogContent(
  {
    placement = "center",
    size = "sm",
    hideClose = false,
    overlayClassName,
    className,
    children,
    onOpenAutoFocus,
    onCloseAutoFocus,
    ...props
  },
  ref,
): ReactElement {
  const styles = contentStyles({ placement, size })
  const focus = useFocusRestore(onOpenAutoFocus, onCloseAutoFocus)
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={styles.overlay({ className: overlayClassName })}
      >
        <DialogPrimitive.Content
          ref={ref}
          className={styles.content({ className })}
          onOpenAutoFocus={focus.onOpenAutoFocus}
          onCloseAutoFocus={focus.onCloseAutoFocus}
          {...props}
        >
          <PlacementContext.Provider value={placement}>
            {placement === "sheet" ? (
              <span
                aria-hidden="true"
                className="mx-auto mb-3 block h-1 w-10 shrink-0 rounded-full bg-line-2"
              />
            ) : null}
            <div className={styles.column()}>{children}</div>
            {hideClose ? null : (
              <DialogPrimitive.Close
                aria-label="Close"
                className={cn(
                  "absolute flex size-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-inset hover:text-ink",
                  placement === "sheet"
                    ? "right-4 top-6 sm:right-8"
                    : "right-3 top-3",
                )}
              >
                <X aria-hidden="true" size={16} strokeWidth={1.75} />
              </DialogPrimitive.Close>
            )}
          </PlacementContext.Provider>
        </DialogPrimitive.Content>
      </DialogPrimitive.Overlay>
    </DialogPrimitive.Portal>
  )
})
Content.displayName = CONTENT_NAME

export const Header = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function DialogHeader({ className, ...props }, ref): ReactElement {
  return (
    <div
      ref={ref}
      className={cn("flex flex-col gap-1 pr-10", className)}
      {...props}
    />
  )
})
Header.displayName = HEADER_NAME

export const Title = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref): ReactElement {
  const placement = useContext(PlacementContext)
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn(
        "font-650 text-ink",
        placement === "sheet" ? "text-[22px]" : "text-[18px]",
        className,
      )}
      {...props}
    />
  )
})
Title.displayName = TITLE_NAME

export const Description = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref): ReactElement {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn("text-[13px] text-secondary", className)}
      {...props}
    />
  )
})
Description.displayName = DESCRIPTION_NAME

export const Body = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function DialogBody({ className, ...props }, ref): ReactElement {
    return (
      <div
        ref={ref}
        className={cn("flex min-w-0 flex-col gap-3", className)}
        {...props}
      />
    )
  },
)
Body.displayName = BODY_NAME

export const Footer = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function DialogFooter({ className, ...props }, ref): ReactElement {
  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  )
})
Footer.displayName = FOOTER_NAME
