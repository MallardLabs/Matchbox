import {
  GaugeIcon,
  HomeIcon,
  MoreIcon,
  RewardsIcon,
  SearchIcon,
  ThemeIcon,
  VoteIcon,
  WalletIcon,
} from "@/components/ui/Icons"
import { runQuery as runLiveQuery } from "@/lib/query/client"
import type { QueryResponse } from "@/lib/query/contracts"
import { runDemoQuery } from "@/lib/query/engine"
import { shortenAddress } from "@/lib/wallet/selection"
import {
  noWalletContext,
  useWalletSelection,
} from "@/lib/wallet/useWalletSelection"
import { cn } from "@/utils/cn"
import { useEffect, useRef, useState } from "react"
import WalletSelector from "../wallet/WalletSelector"
import { CommandPalette } from "./CommandPalette"
import { Overview } from "./Overview"
import { QueryCanvas } from "./QueryCanvas"

type View = "overview" | "query"

const primaryNav = [
  { label: "Overview", icon: HomeIcon, action: "overview" },
  {
    label: "Vote",
    icon: VoteIcon,
    action: "vote on the best gauges this epoch for me",
  },
  { label: "Rewards", icon: RewardsIcon, action: "show my claimable rewards" },
  {
    label: "Gauges",
    icon: GaugeIcon,
    action: "which gauges consistently have good incentives",
  },
  { label: "More", icon: MoreIcon, action: "bridge transactions" },
] as const

export function QueryPrototype() {
  const [view, setView] = useState<View>("overview")
  const [response, setResponse] = useState<QueryResponse>(() =>
    runDemoQuery("wormhole transactions"),
  )
  const [commandOpen, setCommandOpen] = useState(false)
  const [walletOpen, setWalletOpen] = useState(false)
  const [lightMode, setLightMode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [queryError, setQueryError] = useState<string | null>(null)
  const requestSequence = useRef(0)
  const walletSelection = useWalletSelection()
  const selectedWallet = walletSelection.activeWallet

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setCommandOpen((current) => !current)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  function runQuery(query: string) {
    const sequence = requestSequence.current + 1
    requestSequence.current = sequence
    setView("query")
    setLoading(true)
    setQueryError(null)
    void runLiveQuery({
      query,
      wallet: {
        address: (selectedWallet ?? noWalletContext).address,
        mode: (selectedWallet ?? noWalletContext).mode,
        label: (selectedWallet ?? noWalletContext).label,
      },
    })
      .then((result) => {
        if (requestSequence.current !== sequence) return
        setResponse(result)
      })
      .catch((error: unknown) => {
        if (requestSequence.current !== sequence) return
        setQueryError(
          error instanceof Error
            ? error.message
            : "Stuart could not answer this Query",
        )
      })
      .finally(() => {
        if (requestSequence.current === sequence) setLoading(false)
      })
  }

  function selectNav(action: (typeof primaryNav)[number]["action"]) {
    if (action === "overview") {
      setView("overview")
      return
    }
    runQuery(action)
  }

  return (
    <div className={cn("min-h-dvh bg-canvas text-ink", lightMode && "light")}>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r border-line bg-canvas lg:flex">
        <div className="flex h-[69px] items-center gap-3 border-b border-line px-5">
          <span className="inline-flex size-7 items-center justify-center rounded-md bg-accent font-mono text-sm font-semibold text-[#0a0a0c]">
            M
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Matchbox</p>
            <p className="font-mono text-[11px] text-muted">
              mainnet · prototype
            </p>
          </div>
          <span className="rounded bg-accent-soft px-2 py-1 text-[10px] font-medium text-accent">
            PRO
          </span>
        </div>

        <div className="border-b border-line px-5 py-3">
          <button
            className="flex min-h-10 w-full items-center gap-2 rounded-md border border-line bg-panel px-3 text-left text-xs text-muted hover:bg-raised hover:text-secondary"
            onClick={() => setCommandOpen(true)}
            type="button"
          >
            <SearchIcon className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              Search or ask Stuart…
            </span>
            <kbd className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>
          </button>
        </div>

        <nav aria-label="Primary" className="flex-1 px-3 py-5">
          <p className="px-3 pb-2 text-[11px] font-medium uppercase text-muted">
            Matchbox
          </p>
          <div className="space-y-1">
            {primaryNav.map((item) => {
              const Icon = item.icon
              const active =
                (item.action === "overview" && view === "overview") ||
                (item.label === "Vote" &&
                  view === "query" &&
                  response.kind === "vote")
              return (
                <button
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm",
                    active
                      ? "bg-raised text-ink"
                      : "text-secondary hover:bg-panel hover:text-ink",
                  )}
                  key={item.label}
                  onClick={() => selectNav(item.action)}
                  type="button"
                >
                  {active && (
                    <span className="absolute left-0 h-5 w-0.5 rounded-full bg-accent" />
                  )}
                  <Icon className={cn("size-4", active && "text-accent")} />
                  <span>{item.label}</span>
                  {item.label === "Vote" && (
                    <span className="ml-auto rounded-full bg-positive-soft px-2 py-0.5 text-[10px] font-medium text-positive">
                      LIVE
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </nav>

        <div className="border-t border-line p-5">
          <div className="rounded-lg border border-line bg-panel p-4">
            <p className="text-[11px] font-medium uppercase text-muted">
              Stuart data plane
            </p>
            <p className="mt-2 text-sm font-medium text-positive">
              Live indexer + Mezo RPC
            </p>
            <p className="mt-2 text-xs leading-5 text-muted">
              Wallet-specific values appear only after a sourced Query.
            </p>
          </div>
          <p className="mt-4 text-center font-mono text-[10px] text-muted">
            STUART QUERY MVP · V0.1
          </p>
        </div>
      </aside>

      <div className="min-h-dvh lg:pl-[260px]">
        <header className="sticky top-0 z-20 flex h-[60px] items-center gap-3 border-b border-line bg-canvas px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 lg:hidden">
            <span className="inline-flex size-7 items-center justify-center rounded-md bg-accent font-mono text-sm font-semibold text-[#0a0a0c]">
              M
            </span>
            <span className="hidden text-sm font-semibold text-ink sm:inline">
              Matchbox Pro
            </span>
          </div>
          <div className="hidden min-w-0 items-center gap-2 lg:flex">
            <span className="text-sm font-medium text-ink">
              {view === "overview" ? "Overview" : "Query"}
            </span>
            <span className="text-muted">/</span>
            <span className="max-w-52 truncate text-xs text-muted">
              {view === "overview"
                ? (selectedWallet?.label ?? "No wallet selected")
                : response.title}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 md:flex">
              <span className="size-1.5 rounded-full bg-positive" />
              <span className="text-xs text-secondary">Mezo Mainnet live</span>
            </div>
            <button
              aria-label="Open Query"
              className="inline-flex size-11 items-center justify-center rounded-md border border-line bg-panel text-secondary hover:bg-raised hover:text-ink lg:hidden"
              onClick={() => setCommandOpen(true)}
              type="button"
            >
              <SearchIcon className="size-4" />
            </button>
            <button
              aria-label={lightMode ? "Use dark theme" : "Use light theme"}
              className="inline-flex size-11 items-center justify-center rounded-md border border-line bg-panel text-secondary hover:bg-raised hover:text-ink lg:size-9"
              onClick={() => setLightMode((current) => !current)}
              type="button"
            >
              <ThemeIcon className="size-4" />
            </button>
            <button
              aria-label={
                selectedWallet
                  ? `Change wallet context from ${selectedWallet.label}`
                  : "Connect or watch a wallet"
              }
              className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-line bg-panel px-2.5 text-left hover:bg-raised lg:min-h-9 lg:min-w-0 lg:justify-start"
              onClick={() => setWalletOpen(true)}
              type="button"
            >
              <WalletIcon
                className={cn(
                  "size-4",
                  selectedWallet?.mode === "watching"
                    ? "text-warning"
                    : "text-accent",
                )}
              />
              <span className="hidden sm:block">
                <span className="block font-mono text-xs text-ink">
                  {selectedWallet
                    ? shortenAddress(selectedWallet.address)
                    : "Connect / watch"}
                </span>
                <span className="block text-[10px] text-muted">
                  {selectedWallet?.mode === "watching"
                    ? "Watch only"
                    : selectedWallet
                      ? "Connected · Mezo"
                      : "Choose wallet context"}
                </span>
              </span>
            </button>
          </div>
        </header>

        {view === "overview" ? (
          <Overview onQuery={runQuery} />
        ) : (
          <QueryCanvas
            error={queryError}
            loading={loading}
            onOpenCommand={() => setCommandOpen(true)}
            onQuery={runQuery}
            response={response}
          />
        )}
      </div>

      <CommandPalette
        onOpenChange={setCommandOpen}
        onShowOverview={() => setView("overview")}
        onSubmit={runQuery}
        open={commandOpen}
      />
      <WalletSelector
        activeWallet={selectedWallet}
        onAddWatchedWallet={(input) => {
          const wallet = walletSelection.addWatchedWallet(input)
          setView("overview")
          return wallet
        }}
        onDisconnect={walletSelection.disconnectWallet}
        onOpenChange={setWalletOpen}
        onSelectConnected={() => {
          walletSelection.selectConnectedWallet()
          setView("overview")
        }}
        onSelectWatched={(wallet) => {
          walletSelection.selectWatchedWallet(wallet)
          setView("overview")
        }}
        open={walletOpen}
        watchedWallets={walletSelection.watchedWallets}
      />
    </div>
  )
}
