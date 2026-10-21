import { useConnectDialog } from "@/app/ConnectDialog"
import { useBoostGauges } from "@/hooks/useBoostGauges"
import { useVeBTCLocks, useVeMEZOLocks } from "@/hooks/useLocks"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { profileForGauge, useGaugeProfiles } from "@/hooks/useProfiles"
import { useViewer } from "@/lib/viewer"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { cn } from "@repo/ui/cn"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import {
  Activity,
  CornerDownLeft,
  Gift,
  Hexagon,
  LayoutGrid,
  ListChecks,
  Lock,
  type LucideIcon,
  Search,
  Sparkles,
  Vote,
  Wallet,
} from "lucide-react"
import {
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import { StuartProvider, useStuart } from "./StuartProvider"
import { formatTokenNumber } from "./format"
import {
  PALETTE_GROUPS,
  type PaletteIcon,
  type PaletteItem,
  defaultActiveIndex,
  rankPalette,
  stepActive,
  stuartRows,
} from "./palette"
import { suggestedQuestions } from "./suggestions"
import useBallotCount from "./useBallotCount"
import useStuartStatus from "./useStuartStatus"

type SearchPaletteContextValue = {
  open: (initialQuery?: string) => void
}

const SearchPaletteContext = createContext<SearchPaletteContextValue | null>(
  null,
)

export function useSearchPalette(): SearchPaletteContextValue {
  const value = useContext(SearchPaletteContext)
  if (!value) {
    throw new Error(
      "useSearchPalette must be used inside <SearchPaletteProvider>",
    )
  }
  return value
}

const PAGE_ITEMS: PaletteItem[] = [
  {
    id: "overview",
    group: "Go to",
    label: "Overview",
    detail: "Home",
    icon: "overview",
    to: "/",
  },
  {
    id: "vote",
    group: "Go to",
    label: "Vote",
    detail: "veMEZO",
    icon: "vote",
    to: "/vote",
  },
  {
    id: "rewards",
    group: "Go to",
    label: "Rewards",
    detail: "Claims",
    icon: "rewards",
    to: "/rewards",
  },
  {
    id: "activity",
    group: "Go to",
    label: "Activity",
    detail: "This wallet",
    icon: "activity",
    to: "/activity",
  },
  {
    id: "query",
    group: "Go to",
    label: "Query",
    detail: "Stuart",
    icon: "stuart",
    to: "/query",
    keywords: "stuart ask canvas",
  },
]

const ICONS: Record<PaletteIcon, LucideIcon> = {
  overview: LayoutGrid,
  vote: Vote,
  rewards: Gift,
  activity: Activity,
  gauge: Hexagon,
  lock: Lock,
  optimize: Sparkles,
  ballot: ListChecks,
  claim: Gift,
  connect: Wallet,
  stuart: Sparkles,
}

/**
 * ⌘K palette (frames 12 / 12b) plus the tab-session Stuart provider it asks
 * through, so the shell mounts both with this one provider.
 */
export function SearchPaletteProvider({
  children,
}: {
  children: ReactNode
}): ReactElement {
  return (
    <StuartProvider>
      <PaletteHost>{children}</PaletteHost>
    </StuartProvider>
  )
}

function PaletteHost({ children }: { children: ReactNode }): ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const [initialQuery, setInitialQuery] = useState("")

  const open = useCallback((query?: string) => {
    setInitialQuery(query ?? "")
    setIsOpen(true)
  }, [])

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setInitialQuery("")
        setIsOpen((current) => !current)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const value = useMemo(() => ({ open }), [open])

  return (
    <SearchPaletteContext.Provider value={value}>
      {children}
      {isOpen ? (
        <SearchPalette
          initialQuery={initialQuery}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </SearchPaletteContext.Provider>
  )
}

function usePaletteCatalog(): {
  catalog: PaletteItem[]
  topGauge: string | null
} {
  const { viewer } = useViewer()
  const { gauges } = useBoostGauges()
  const { data: profiles } = useGaugeProfiles()
  const mezoLocks = useVeMEZOLocks()
  const btcLocks = useVeBTCLocks()
  const ballotCount = useBallotCount()

  return useMemo(() => {
    const ranked = gauges
      .filter((gauge) => gauge.isAlive)
      .sort((a, b) =>
        a.totalWeight === b.totalWeight
          ? 0
          : a.totalWeight > b.totalWeight
            ? -1
            : 1,
      )
    const gaugeItems: PaletteItem[] = ranked.map((gauge) => {
      const profile = profileForGauge(profiles, gauge.address)
      const tokenId = profile?.vebtc_token_id
      return {
        id: `gauge-${gauge.address}`,
        group: "Gauges",
        label: profile?.display_name || `Gauge ${gauge.address.slice(0, 6)}`,
        detail: tokenId ? `#${tokenId}` : undefined,
        icon: "gauge",
        to: `/gauges/${gauge.address}`,
        keywords: gauge.address,
      }
    })
    const topGauge =
      ranked
        .map((gauge) => profileForGauge(profiles, gauge.address)?.display_name)
        .find((name): name is string => Boolean(name)) ?? null

    const lockItems: PaletteItem[] = [
      ...mezoLocks.locks.map((lock) => ({ lock, kind: "veMEZO" })),
      ...btcLocks.locks.map((lock) => ({ lock, kind: "veBTC" })),
    ].map(({ lock, kind }) => ({
      id: `lock-${kind}-${lock.tokenId}`,
      group: "Locks",
      label: `#${lock.tokenId} · ${kind}`,
      detail: formatTokenNumber({
        raw: lock.votingPower.toString(),
        decimals: 18,
        symbol: kind,
      }),
      icon: "lock",
      to: "/",
      keywords: `${lock.tokenId} lock`,
    }))

    const actions: PaletteItem[] =
      viewer.mode === "disconnected"
        ? [
            {
              id: "connect",
              group: "Actions",
              label: "Connect wallet",
              icon: "connect",
              action: "connect",
            },
          ]
        : [
            {
              id: "optimize",
              group: "Actions",
              label: "Optimize my votes",
              detail: "Ballot",
              icon: "optimize",
              to: "/vote?optimize=1",
            },
            ...(ballotCount > 0
              ? [
                  {
                    id: "ballot",
                    group: "Actions" as const,
                    label: "Open current ballot",
                    detail: `${ballotCount} ${ballotCount === 1 ? "gauge" : "gauges"}`,
                    icon: "ballot" as const,
                    to: "/vote",
                  },
                ]
              : []),
            {
              id: "claim",
              group: "Actions",
              label: "Claim all",
              detail: "Rewards",
              icon: "claim",
              to: "/rewards",
            },
          ]

    return {
      catalog: [...PAGE_ITEMS, ...gaugeItems, ...lockItems, ...actions],
      topGauge,
    }
  }, [
    ballotCount,
    btcLocks.locks,
    gauges,
    mezoLocks.locks,
    profiles,
    viewer.mode,
  ])
}

function SearchPalette({
  initialQuery,
  onClose,
}: {
  initialQuery: string
  onClose: () => void
}): ReactElement {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const docked = useMediaQuery("(min-width: 1680px)")
  const { viewer } = useViewer()
  const { open: openConnect } = useConnectDialog()
  const { ask, rail } = useStuart()
  const status = useStuartStatus()
  const toolsOnly = status?.stuart === "deterministic"
  const { catalog, topGauge } = usePaletteCatalog()
  const [query, setQuery] = useState(initialQuery)
  const [activeIndex, setActiveIndex] = useState(0)
  const listId = useId()
  const listRef = useRef<HTMLDivElement>(null)

  const suggestions = useMemo(
    () => suggestedQuestions({ viewer, topGauge }),
    [topGauge, viewer],
  )
  const askRows = useMemo(
    () => stuartRows({ query, suggestions }),
    [query, suggestions],
  )
  const rows = useMemo(
    () => rankPalette(query, catalog, askRows),
    [askRows, catalog, query],
  )

  useEffect(() => {
    setActiveIndex(defaultActiveIndex(rows, query))
  }, [query, rows])

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  function activate(index: number): void {
    const item = rows[index]
    if (!item || item.disabled) return
    onClose()
    if (item.action === "connect") {
      openConnect()
      return
    }
    if (item.question) {
      // Desktop keeps the page and docks the answer (frame 33); elsewhere
      // the canvas is the answer.
      if (docked && rail.mounted && pathname !== "/query") {
        ask(item.question, { surface: "palette", followUp: false })
        rail.show()
        return
      }
      void navigate({ to: "/query", search: { q: item.question } })
      return
    }
    if (item.to) void navigate({ to: item.to })
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((index) => stepActive(rows, index, 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((index) => stepActive(rows, index, -1))
    } else if (event.key === "Enter") {
      event.preventDefault()
      activate(activeIndex)
    }
  }

  const active = rows[activeIndex]
  let rowIndex = -1

  return (
    <DialogPrimitive.Root open onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-overlay bg-scrim data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-3 z-overlay flex max-h-[calc(100dvh-24px)] w-[min(640px,calc(100vw-24px))] -translate-x-1/2 flex-col overflow-hidden rounded-[14px] bg-surface shadow-dialog data-[state=open]:animate-pop-in md:top-[100px] md:max-h-[calc(100dvh-140px)]"
        >
          <DialogPrimitive.Title className="sr-only">
            Search Matchbox or ask Stuart
          </DialogPrimitive.Title>
          <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-4">
            <Search
              aria-hidden="true"
              size={16}
              strokeWidth={1.75}
              className="shrink-0 text-muted"
            />
            <input
              // biome-ignore lint/a11y/noAutofocus: the palette exists to type into
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-autocomplete="list"
              aria-controls={listId}
              aria-activedescendant={
                rows.length > 0 ? `${listId}-${activeIndex}` : undefined
              }
              aria-label="Search Matchbox or ask Stuart"
              value={query}
              maxLength={2_000}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search Matchbox or ask Stuart…"
              className="h-full min-w-0 flex-1 bg-transparent text-lead font-600 text-ink outline-none placeholder:font-500 placeholder:text-muted"
            />
            <kbd className="shrink-0 font-sans text-caption font-500 text-muted">
              esc
            </kbd>
          </div>

          <div
            ref={listRef}
            id={listId}
            // biome-ignore lint/a11y/useSemanticElements: ARIA combobox popup; a native select can not hold grouped, rich rows
            role="listbox"
            tabIndex={-1}
            aria-label="Results"
            className="flex min-h-0 flex-col gap-3.5 overflow-y-auto px-2.5 pb-2 pt-3"
          >
            {PALETTE_GROUPS.map((group) => {
              const groupRows = rows.filter((item) => item.group === group)
              if (groupRows.length === 0) return null
              const headingId = `${listId}-${group.replace(/\s+/g, "-")}`
              return (
                <div
                  key={group}
                  // biome-ignore lint/a11y/useSemanticElements: ARIA combobox popup; a native select can not hold grouped, rich rows
                  role="group"
                  aria-labelledby={headingId}
                  className="flex flex-col gap-0.5"
                >
                  <p
                    id={headingId}
                    className="m-0 px-2.5 pb-1 text-caption uppercase tracking-[0.02em] text-muted"
                  >
                    {group}
                  </p>
                  {groupRows.map((item) => {
                    rowIndex += 1
                    const index = rowIndex
                    const Icon = ICONS[item.icon]
                    return (
                      <PaletteRow
                        key={item.id}
                        id={`${listId}-${index}`}
                        index={index}
                        active={index === activeIndex}
                        disabled={item.disabled === true}
                        icon={<Icon size={16} strokeWidth={1.75} />}
                        label={item.label}
                        detail={item.detail}
                        onHover={() => {
                          if (!item.disabled) setActiveIndex(index)
                        }}
                        onSelect={() => activate(index)}
                      />
                    )
                  })}
                </div>
              )
            })}
            {rows.length === 0 ? (
              <p className="m-0 px-2.5 py-6 text-center text-body-sm text-secondary">
                No matches
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-3 bg-raised px-4 py-2.5 text-caption font-500 text-muted">
            <span className="min-w-0 flex-1 truncate">
              {active?.question
                ? toolsOnly
                  ? "↵ asks Stuart · Matchbox tools only"
                  : "↵ asks Stuart"
                : "Pages, gauges, locks, and Stuart"}
            </span>
            <span className="hidden items-center gap-1 sm:flex">
              ↑↓
              <CornerDownLeft aria-hidden="true" size={11} /> open
            </span>
            <span className="hidden sm:inline">esc close</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function PaletteRow({
  id,
  index,
  active,
  disabled,
  icon,
  label,
  detail,
  onHover,
  onSelect,
}: {
  id: string
  index: number
  active: boolean
  disabled: boolean
  icon: ReactNode
  label: string
  detail?: string | undefined
  onHover: () => void
  onSelect: () => void
}): ReactElement {
  return (
    <div
      id={id}
      data-index={index}
      // biome-ignore lint/a11y/useSemanticElements: ARIA combobox popup; a native select can not hold grouped, rich rows
      role="option"
      aria-selected={active}
      aria-disabled={disabled || undefined}
      tabIndex={-1}
      onMouseMove={onHover}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSelect()
      }}
      className={cn(
        "flex h-10 shrink-0 items-center gap-2.5 rounded-lg px-2 text-body font-500",
        disabled ? "cursor-not-allowed text-muted" : "cursor-pointer text-ink",
        active && !disabled && "bg-accent-soft",
      )}
    >
      <span
        aria-hidden="true"
        className={cn("flex", disabled ? "text-faint" : "text-secondary")}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail ? (
        <span className="shrink-0 text-label font-500 text-muted">
          {detail}
        </span>
      ) : null}
    </div>
  )
}
