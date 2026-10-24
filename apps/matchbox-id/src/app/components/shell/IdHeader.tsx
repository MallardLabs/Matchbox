import { cn } from "@repo/ui/cn"
import * as Logo from "@repo/ui/logo"
import { Link } from "@tanstack/react-router"
import type { ReactElement } from "react"
import type { IdentityAccountView } from "../../../shared/contracts"
import { legalLinks } from "../../lib/legal"
import AccountMenu from "./AccountMenu"

/** Wordmark + "ID", then the wallet chip (signed in) or legal links. */
export default function IdHeader({
  account,
  transparent = false,
}: {
  account: IdentityAccountView | null
  /** Let the page ground (sign-in glow) show through. */
  transparent?: boolean
}): ReactElement {
  return (
    <header
      className={cn(
        "flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-4 md:h-[72px] md:px-12",
        transparent ? "bg-transparent" : "bg-surface",
      )}
    >
      <Link
        to="/"
        aria-label="Matchbox ID"
        className="flex items-center gap-2.5 rounded-md"
      >
        <Logo.Root variant="wordmark" alt="" className="h-[18px] md:h-[25px]" />
        <span
          aria-hidden="true"
          className="flex h-[22px] items-center rounded px-2 text-caption font-700 text-canvas bg-ink"
        >
          ID
        </span>
      </Link>
      <div className="ml-auto flex items-center">
        {account === null ? (
          <nav
            aria-label="Legal"
            className="hidden items-center gap-3 text-label text-secondary md:flex"
          >
            <a
              href={legalLinks.privacy}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-sm underline-offset-2 hover:text-ink hover:underline"
            >
              Privacy
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <a
              href={legalLinks.terms}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-sm underline-offset-2 hover:text-ink hover:underline"
            >
              Terms
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </nav>
        ) : (
          <AccountMenu account={account} />
        )}
      </div>
    </header>
  )
}
