import { useSearchPalette } from "@/features/query/SearchPalette"
import { useMarketTicker } from "@/hooks/useMarketTicker"
import * as AppShell from "@repo/ui/app-shell"
import * as Kbd from "@repo/ui/kbd"
import { useTheme } from "@repo/ui/theme"
import * as TokenMark from "@repo/ui/token-mark"
import { Link, useRouterState } from "@tanstack/react-router"
import { Search } from "lucide-react"
import type { ReactElement } from "react"
import WalletButton from "./WalletButton"
import { pageTitle } from "./nav"

type TopBarProps = {
  /** Sidebar is a rail or hidden, so the BTC ticker moves up here. */
  showTicker: boolean
}

export default function TopBar({ showTicker }: TopBarProps): ReactElement {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { open } = useSearchPalette()
  const { resolved } = useTheme()
  const isHome = pathname === "/"

  return (
    <AppShell.TopBar>
      <div className="flex min-w-0 items-center gap-2 md:hidden">
        {isHome ? (
          <Link to="/" aria-label="Matchbox home">
            <img
              src={`/matchbox-wordmark-${resolved}.png`}
              alt=""
              className="h-[18px] w-auto"
            />
          </Link>
        ) : (
          <>
            <img
              src={`/matchbox-icon-${resolved}.png`}
              alt=""
              className="h-4 w-auto"
            />
            <span className="truncate text-title-sm font-650 text-ink">
              {pageTitle(pathname)}
            </span>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => open()}
        aria-label="Search Matchbox or ask Stuart"
        aria-keyshortcuts="Control+K Meta+K"
        className="hidden h-10 w-full max-w-[520px] items-center gap-2.5 rounded-md border border-line bg-inset px-3 text-left text-body text-muted transition-colors hover:border-line-2 md:flex"
      >
        <Search aria-hidden="true" size={15} strokeWidth={1.75} />
        <span className="flex-1 truncate">Search Matchbox or ask Stuart…</span>
        <Kbd.Root>⌘ K</Kbd.Root>
      </button>

      <span className="flex-1" />

      {showTicker ? <BtcTicker /> : null}

      <button
        type="button"
        onClick={() => open()}
        aria-label="Search Matchbox or ask Stuart"
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-inset text-ink-2 md:hidden"
      >
        <Search aria-hidden="true" size={16} strokeWidth={1.75} />
      </button>
      <span className="md:hidden">
        <WalletButton compact />
      </span>
      <span className="hidden md:block">
        <WalletButton />
      </span>
    </AppShell.TopBar>
  )
}

function BtcTicker(): ReactElement {
  const ticker = useMarketTicker()
  return (
    <p className="m-0 hidden h-10 items-center gap-2 rounded-md bg-inset px-3 text-label font-500 text-secondary md:flex">
      <TokenMark.Root kind="btc" size={16} />
      BTC
      <span className="font-mono text-accent-ink">{ticker.btc}</span>
    </p>
  )
}
