import TokenMark from "@/components/ui/TokenMark"
import { useMarketTicker } from "@/hooks/useMarketTicker"
import { ChevronDown, Search } from "lucide-react"
import type { ReactElement } from "react"
import { useAccount } from "wagmi"

type TopBarProps = {
  collapsed: boolean
  onOpenSearch: () => void
  onOpenConnect: () => void
}

export default function TopBar({
  collapsed,
  onOpenSearch,
  onOpenConnect,
}: TopBarProps): ReactElement {
  const { address, isConnected } = useAccount()

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface/95 px-4 backdrop-blur md:h-[72px] md:gap-4 md:px-6">
      <img
        src="/matchbox-icon-light.png"
        alt="Matchbox"
        className="h-5 w-auto md:hidden dark:hidden"
      />
      <img
        src="/matchbox-icon-dark.png"
        alt="Matchbox"
        className="hidden h-5 w-auto dark:inline md:dark:hidden"
      />
      <button
        type="button"
        onClick={onOpenSearch}
        className="order-last flex size-10 items-center justify-center rounded-md bg-inset text-muted md:order-none md:w-full md:max-w-[520px] md:justify-start md:gap-2.5 md:border md:border-line md:px-3 md:text-left md:text-[14px] md:transition-colors md:hover:border-line-2"
      >
        <Search
          size={16}
          strokeWidth={1.75}
          className="text-secondary md:size-3.5 md:text-faint"
          aria-hidden="true"
        />
        <span className="sr-only md:not-sr-only md:flex-1 md:truncate">
          Search Matchbox or ask Stuart…
        </span>
        <kbd className="hidden h-[22px] items-center rounded bg-inset-2 px-[7px] font-mono text-[10px] text-secondary md:inline-flex">
          ⌘ K
        </kbd>
      </button>

      <div className="flex-1" />

      {collapsed ? <BtcTicker /> : null}

      {isConnected && address ? (
        <button
          type="button"
          onClick={onOpenConnect}
          className="flex h-10 items-center md:min-w-[193px] gap-[9px] rounded-md border border-line bg-surface px-[11px] transition-colors hover:border-line-2"
        >
          <span
            aria-hidden="true"
            className="flex size-5 items-center justify-center rounded-[5px] bg-inset-2 font-mono text-[7px] font-500 text-accent-ink"
          >
            0x
          </span>
          <span className="font-mono text-[12px] font-500 text-ink-2">
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
          <span className="flex-1" />
          <ChevronDown size={13} className="text-faint" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onOpenConnect}
          className="h-10 rounded-md bg-accent px-4 text-[13px] font-650 text-on-accent transition-[filter] hover:brightness-95 active:brightness-90"
        >
          Connect wallet
        </button>
      )}
    </header>
  )
}

function BtcTicker(): ReactElement {
  const ticker = useMarketTicker()
  return (
    <p className="hidden h-10 items-center gap-2 rounded-md bg-inset px-3 text-[12px] font-500 text-secondary md:flex">
      <TokenMark kind="btc" />
      BTC
      <span className="font-mono text-accent-ink">{ticker.btc}</span>
    </p>
  )
}
