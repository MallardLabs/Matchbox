import { useConnectDialog } from "@/app/ConnectDialog"
import { useBoostGauges } from "@/hooks/useBoostGauges"
import { profileForGauge, useGaugeProfiles } from "@/hooks/useProfiles"
import {
  SEARCH_GROUPS,
  type SearchHit,
  isStuartQuestion,
  rankSearchHits,
} from "@/lib/search"
import { useViewer } from "@/lib/viewer"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { cn } from "@repo/ui/cn"
import { useNavigate } from "@tanstack/react-router"
import {
  Activity,
  CornerDownLeft,
  Gift,
  Hexagon,
  LayoutGrid,
  type LucideIcon,
  Search,
  Sparkles,
  Vote,
  Wallet,
} from "lucide-react"
import {
  type ReactElement,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react"

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

const PAGE_HITS: SearchHit[] = [
  {
    id: "overview",
    group: "Go to",
    label: "Overview",
    detail: "Home",
    to: "/",
  },
  { id: "vote", group: "Go to", label: "Vote", detail: "veMEZO", to: "/vote" },
  {
    id: "rewards",
    group: "Go to",
    label: "Rewards",
    detail: "Claims",
    to: "/rewards",
  },
  {
    id: "activity",
    group: "Go to",
    label: "Activity",
    detail: "This wallet",
    to: "/activity",
  },
]

const ICONS: Record<string, LucideIcon> = {
  overview: LayoutGrid,
  vote: Vote,
  rewards: Gift,
  activity: Activity,
  connect: Wallet,
  optimize: Sparkles,
}

export function SearchPaletteProvider({
  children,
}: {
  children: ReactNode
}): ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const [initialQuery, setInitialQuery] = useState("")

  const open = useCallback((query?: string) => {
    setInitialQuery(query ?? "")
    setIsOpen(true)
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
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

function SearchPalette({
  initialQuery,
  onClose,
}: {
  initialQuery: string
  onClose: () => void
}): ReactElement {
  const navigate = useNavigate()
  const { viewer } = useViewer()
  const { open: openConnect } = useConnectDialog()
  const { gauges } = useBoostGauges()
  const { data: profiles } = useGaugeProfiles()
  const [query, setQuery] = useState(initialQuery)
  const [activeIndex, setActiveIndex] = useState(0)
  const listId = useId()

  const catalog = useMemo<SearchHit[]>(() => {
    const gaugeHits: SearchHit[] = gauges.map((gauge) => {
      const profile = profileForGauge(profiles, gauge.address)
      const tokenId = profile?.vebtc_token_id
      return {
        id: gauge.address,
        group: "Gauges",
        label: profile?.display_name || `Gauge ${gauge.address.slice(0, 6)}`,
        detail: tokenId ? `#${tokenId}` : undefined,
        to: `/gauges/${gauge.address}`,
      }
    })
    const actions: SearchHit[] =
      viewer.mode === "disconnected"
        ? [{ id: "connect", group: "Actions", label: "Connect wallet" }]
        : [
            {
              id: "optimize",
              group: "Actions",
              label: "Optimize my votes",
              detail: "Ballot",
              to: "/vote?optimize=1",
            },
          ]
    return [...PAGE_HITS, ...gaugeHits, ...actions]
  }, [gauges, profiles, viewer.mode])

  const hits = useMemo(() => rankSearchHits(query, catalog), [query, catalog])
  const question = query.trim().length > 0 && isStuartQuestion(query)
  const stuartRow = query.trim().length > 0
  const rowCount = hits.length + (stuartRow ? 1 : 0)

  useEffect(() => {
    setActiveIndex(question ? hits.length : 0)
  }, [hits.length, question])

  function activate(index: number): void {
    if (index === hits.length && stuartRow) {
      onClose()
      void navigate({ to: "/query", search: { q: query.trim() } })
      return
    }
    const hit = hits[index]
    if (!hit) return
    onClose()
    if (hit.id === "connect") {
      openConnect()
      return
    }
    if (hit.to) void navigate({ to: hit.to })
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((index) => (rowCount === 0 ? 0 : (index + 1) % rowCount))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((index) =>
        rowCount === 0 ? 0 : (index - 1 + rowCount) % rowCount,
      )
    } else if (event.key === "Enter") {
      event.preventDefault()
      activate(activeIndex)
    }
  }

  let rowIndex = -1

  return (
    <DialogPrimitive.Root open onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-overlay bg-scrim data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[8vh] z-overlay flex max-h-[80dvh] w-[min(640px,calc(100vw-24px))] -translate-x-1/2 flex-col overflow-hidden rounded-[14px] bg-surface shadow-dialog data-[state=open]:animate-pop-in"
        >
          <DialogPrimitive.Title className="sr-only">
            Search Matchbox or ask Stuart
          </DialogPrimitive.Title>
          <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-4">
            <Search
              aria-hidden="true"
              size={16}
              strokeWidth={1.75}
              className="text-muted"
            />
            <input
              // biome-ignore lint/a11y/noAutofocus: the palette exists to type into
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={`${listId}-${activeIndex}`}
              aria-label="Search Matchbox or ask Stuart"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search Matchbox or ask Stuart…"
              className="h-full min-w-0 flex-1 bg-transparent text-lead font-500 text-ink outline-none placeholder:text-muted"
            />
            <span className="text-caption font-500 text-muted">esc</span>
          </div>

          <div
            id={listId}
            // biome-ignore lint/a11y/useSemanticElements: ARIA combobox popup; a native select can not hold grouped, rich rows
            role="listbox"
            tabIndex={-1}
            aria-label="Results"
            className="flex min-h-0 flex-col gap-3.5 overflow-y-auto px-2.5 pb-2 pt-3"
          >
            {SEARCH_GROUPS.map((group) => {
              const rows = hits.filter((hit) => hit.group === group)
              if (rows.length === 0) return null
              return (
                // biome-ignore lint/a11y/useSemanticElements: ARIA combobox popup; a native select can not hold grouped, rich rows
                <div key={group} role="group" aria-label={group}>
                  <p className="m-0 px-2.5 pb-1 text-caption uppercase text-muted">
                    {group}
                  </p>
                  {rows.map((hit) => {
                    rowIndex += 1
                    const index = rowIndex
                    const Icon = ICONS[hit.id] ?? Hexagon
                    return (
                      <PaletteRow
                        key={hit.id}
                        id={`${listId}-${index}`}
                        active={index === activeIndex}
                        icon={<Icon size={16} strokeWidth={1.75} />}
                        label={hit.label}
                        detail={hit.detail}
                        onHover={() => setActiveIndex(index)}
                        onSelect={() => activate(index)}
                      />
                    )
                  })}
                </div>
              )
            })}
            {stuartRow ? (
              // biome-ignore lint/a11y/useSemanticElements: ARIA combobox popup; a native select can not hold grouped, rich rows
              <div role="group" aria-label="Ask Stuart">
                <p className="m-0 px-2.5 pb-1 text-caption uppercase text-muted">
                  Ask Stuart
                </p>
                <PaletteRow
                  id={`${listId}-${hits.length}`}
                  active={activeIndex === hits.length}
                  icon={<Sparkles size={16} strokeWidth={1.75} />}
                  label={query.trim()}
                  detail="Ask"
                  onHover={() => setActiveIndex(hits.length)}
                  onSelect={() => activate(hits.length)}
                />
              </div>
            ) : null}
            {rowCount === 0 ? (
              <p className="m-0 px-2.5 py-6 text-center text-body-sm text-secondary">
                Type to search pages, gauges, and locks.
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-3 bg-raised px-4 py-2.5 text-caption font-500 text-muted">
            <span className="flex-1">Pages, gauges, and Stuart</span>
            <span className="flex items-center gap-1">
              ↑↓
              <CornerDownLeft aria-hidden="true" size={11} /> open
            </span>
            <span>esc close</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function PaletteRow({
  id,
  active,
  icon,
  label,
  detail,
  onHover,
  onSelect,
}: {
  id: string
  active: boolean
  icon: ReactNode
  label: string
  detail?: string | undefined
  onHover: () => void
  onSelect: () => void
}): ReactElement {
  return (
    <div
      id={id}
      // biome-ignore lint/a11y/useSemanticElements: ARIA combobox popup; a native select can not hold grouped, rich rows
      role="option"
      aria-selected={active}
      tabIndex={-1}
      onMouseMove={onHover}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter") onSelect()
      }}
      className={cn(
        "flex h-[42px] cursor-pointer items-center gap-3 rounded-lg px-2.5 text-body font-500 text-ink",
        active && "bg-accent-soft",
      )}
    >
      <span aria-hidden="true" className="flex text-secondary">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail ? (
        <span className="text-label text-secondary">{detail}</span>
      ) : null}
    </div>
  )
}
