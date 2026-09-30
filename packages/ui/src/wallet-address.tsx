import { type HTMLAttributes, type ReactElement, forwardRef } from "react"
import { cn } from "./cn"
import { CopyButton } from "./copy-button"

const ROOT_NAME = "WalletAddress"

export function shortenAddress(address: string, lead = 6, tail = 4): string {
  if (address.length <= lead + tail + 1) return address
  return `${address.slice(0, lead)}…${address.slice(-tail)}`
}

export type WalletAddressProps = Omit<
  HTMLAttributes<HTMLSpanElement>,
  "children"
> & {
  address: string
  /** Characters kept at the start (including 0x) and end. */
  lead?: number
  tail?: number
  copyable?: boolean
}

/** Short mono address (0x1234…abcd), full value in title and for screen readers. */
export const Root = forwardRef<HTMLSpanElement, WalletAddressProps>(
  function WalletAddress(
    { address, lead = 6, tail = 4, copyable = true, className, ...props },
    ref,
  ): ReactElement {
    return (
      <span
        ref={ref}
        className={cn("inline-flex min-w-0 items-center gap-0.5", className)}
        {...props}
      >
        <span
          title={address}
          className="font-mono text-[12px] font-500 text-ink-2"
        >
          <span aria-hidden="true">{shortenAddress(address, lead, tail)}</span>
          <span className="sr-only">{address}</span>
        </span>
        {copyable ? <CopyButton value={address} label="address" /> : null}
      </span>
    )
  },
)
Root.displayName = ROOT_NAME
