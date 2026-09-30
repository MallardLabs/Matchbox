import { type HTMLAttributes, type ReactElement, forwardRef } from "react"
import { cn } from "./cn"

const ROOT_NAME = "PageHeader"
const HEADING_NAME = "PageHeaderHeading"
const EYEBROW_NAME = "PageHeaderEyebrow"
const TITLE_NAME = "PageHeaderTitle"
const DESCRIPTION_NAME = "PageHeaderDescription"
const ACTIONS_NAME = "PageHeaderActions"

export const Root = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(
  function PageHeader({ className, ...props }, ref): ReactElement {
    return (
      <header
        ref={ref}
        className={cn(
          "flex flex-wrap items-end justify-between gap-4",
          className,
        )}
        {...props}
      />
    )
  },
)
Root.displayName = ROOT_NAME

/** Groups eyebrow, title and description. */
export const Heading = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function PageHeaderHeading({ className, ...props }, ref): ReactElement {
  return (
    <div
      ref={ref}
      className={cn("flex min-w-0 flex-col gap-1", className)}
      {...props}
    />
  )
})
Heading.displayName = HEADING_NAME

export const Eyebrow = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function PageHeaderEyebrow({ className, ...props }, ref): ReactElement {
  return (
    <p
      ref={ref}
      className={cn(
        "text-[11px] font-650 uppercase tracking-[0.04em] text-secondary",
        className,
      )}
      {...props}
    />
  )
})
Eyebrow.displayName = EYEBROW_NAME

export const Title = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(function PageHeaderTitle({ className, ...props }, ref): ReactElement {
  return (
    <h1
      ref={ref}
      className={cn(
        "text-balance text-[28px] font-600 leading-tight text-ink",
        className,
      )}
      {...props}
    />
  )
})
Title.displayName = TITLE_NAME

export const Description = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function PageHeaderDescription({ className, ...props }, ref): ReactElement {
  return (
    <p
      ref={ref}
      className={cn(
        "max-w-3xl text-pretty text-[14px] font-500 text-secondary",
        className,
      )}
      {...props}
    />
  )
})
Description.displayName = DESCRIPTION_NAME

export const Actions = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function PageHeaderActions({ className, ...props }, ref): ReactElement {
  return (
    <div
      ref={ref}
      className={cn("flex shrink-0 flex-wrap items-center gap-2", className)}
      {...props}
    />
  )
})
Actions.displayName = ACTIONS_NAME
