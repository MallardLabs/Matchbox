import { type HTMLAttributes, type ReactElement, forwardRef } from "react"
import { cn } from "./cn"
import { CopyButton } from "./copy-button"

const ROOT_NAME = "CopyField"

export type CopyFieldProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  /** Exact value written to the clipboard and shown in the title. */
  value: string
  /** Accessible name of what is copied ("client ID", "API key"). */
  label: string
  /** Alternative visible text, e.g. a masked secret. Defaults to `value`. */
  display?: string
  size?: "sm" | "md"
  /** Show "Copy"/"Copied" text on the button. */
  showText?: boolean
}

/** Mono value (keys, ids, URIs) with truncation and a copy button. */
export const Root = forwardRef<HTMLDivElement, CopyFieldProps>(
  function CopyField(
    {
      value,
      label,
      display,
      size = "md",
      showText = false,
      className,
      ...props
    },
    ref,
  ): ReactElement {
    return (
      <div
        ref={ref}
        className={cn(
          "flex w-full min-w-0 items-center gap-1 rounded-[7px] border border-line bg-inset pl-2.5 pr-[3px]",
          size === "md" ? "h-[34px]" : "h-8",
          className,
        )}
        {...props}
      >
        <code
          title={value}
          className={cn(
            "min-w-0 flex-1 truncate font-mono text-ink",
            size === "md" ? "text-[12px]" : "text-[11px]",
          )}
        >
          {display ?? value}
        </code>
        <CopyButton value={value} label={label} showText={showText} />
      </div>
    )
  },
)
Root.displayName = ROOT_NAME
