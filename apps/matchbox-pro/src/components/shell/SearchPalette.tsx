import { cn } from "@/lib/cn"
import {
  SEARCH_GROUPS,
  type SearchHit,
  activateSearchHit,
  isStuartQuestion,
  rankSearchHits,
} from "@/lib/search"
import * as Dialog from "@radix-ui/react-dialog"
import { useNavigate } from "@tanstack/react-router"
import {
  Activity,
  Coins,
  Hexagon,
  LayoutGrid,
  type LucideIcon,
  Search,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react"
import { type ReactElement, useEffect, useMemo, useState } from "react"
import { useAccount } from "wagmi"

type SearchPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnect?: () => void
  extraHits?: SearchHit[]
}

const pageHits: SearchHit[] = [
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
    id: "query",
    group: "Go to",
    label: "Query",
    detail: "Stuart",
    to: "/query",
  },
  {
    id: "activity",
    group: "Go to",
    label: "Activity",
    detail: "This wallet",
    to: "/activity",
  },
]

const pageIcons: Record<string, LucideIcon> = {
  overview: LayoutGrid,
  vote: Target,
  rewards: Coins,
  query: Sparkles,
  activity: Activity,
  connect: Wallet,
}

const optionId = (index: number): string => `search-hit-${index}`

export default function SearchPalette({
  open,
  onOpenChange,
  onConnect,
  extraHits = [],
}: SearchPaletteProps): ReactElement {
  const navigate = useNavigate()
  const { isConnected } = useAccount()
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const hits = useMemo(() => {
    const connect: SearchHit = {
      id: "connect",
      group: "Actions",
      label: isConnected ? "Manage wallet" : "Connect wallet",
    }
    return rankSearchHits(query, [...pageHits, ...extraHits, connect])
  }, [extraHits, isConnected, query])
  const asksStuart = isStuartQuestion(query)

  useEffect(() => {
    if (open) {
      document.getElementById(optionId(active))?.scrollIntoView({
        block: "nearest",
      })
    }
  }, [active, open])

  function handleOpenChange(next: boolean): void {
    if (!next) {
      setQuery("")
      setActive(0)
    }
    onOpenChange(next)
  }

  function activate(item: SearchHit): void {
    const result = activateSearchHit(item)
    if (result.action === "connect") onConnect?.()
    if (result.to) void navigate({ to: result.to })
    handleOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 data-[state=open]:animate-[fade-in_160ms_ease-out]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[100px] z-50 flex max-h-[calc(100dvh-140px)] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-[14px] bg-surface shadow-[0_16px_40px_rgb(0_0_0/0.16)]"
        >
          <Dialog.Title className="sr-only">Search Matchbox</Dialog.Title>
          <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-4">
            <Search
              size={16}
              strokeWidth={1.75}
              className="shrink-0 text-muted"
              aria-hidden="true"
            />
            <input
              aria-label="Search Matchbox"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault()
                  setActive((i) =>
                    Math.min(i + 1, Math.max(hits.length - 1, 0)),
                  )
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault()
                  setActive((i) => Math.max(i - 1, 0))
                }
                if (e.key === "Enter") {
                  const item = hits[active]
                  if (item) activate(item)
                }
              }}
              placeholder="Search Matchbox or ask Stuart…"
              className="min-w-0 flex-1 bg-transparent text-[16px] font-500 text-ink outline-none focus-visible:outline-none placeholder:text-muted"
            />
            {asksStuart ? (
              <span className="shrink-0 rounded-md bg-inset px-2 py-0.5 text-[11px] font-600 text-secondary">
                Stuart · Unavailable
              </span>
            ) : null}
            <kbd className="font-sans text-[11px] font-500 text-muted">esc</kbd>
          </div>

          <div className="flex min-h-0 flex-col gap-3.5 overflow-y-auto px-2.5 pb-2 pt-3">
            {hits.length === 0 ? (
              <p className="px-2 py-6 text-center text-[13px] text-muted">
                No matches
              </p>
            ) : (
              SEARCH_GROUPS.map((group) => {
                const rows = hits.filter((item) => item.group === group)
                if (rows.length === 0) return null
                return (
                  <section key={group} className="flex flex-col gap-0.5">
                    <h2 className="text-[11px] font-650 uppercase text-muted">
                      {group}
                    </h2>
                    <ul className="flex flex-col gap-0.5">
                      {rows.map((item) => {
                        const index = hits.indexOf(item)
                        const Icon = pageIcons[item.id] ?? Hexagon
                        return (
                          <li key={item.id}>
                            <button
                              id={optionId(index)}
                              type="button"
                              aria-current={
                                index === active ? "true" : undefined
                              }
                              onMouseMove={() => setActive(index)}
                              onClick={() => activate(item)}
                              className={cn(
                                "flex h-10 w-full items-center gap-2.5 rounded-lg px-2 text-left outline-none focus-visible:ring-1 focus-visible:ring-line-2",
                                index === active && "bg-accent-soft",
                              )}
                            >
                              <Icon
                                size={15}
                                strokeWidth={1.75}
                                className="shrink-0 text-secondary"
                                aria-hidden="true"
                              />
                              <span className="min-w-0 flex-1 truncate text-[14px] font-500 text-ink">
                                {item.label}
                              </span>
                              {item.detail ? (
                                <span className="shrink-0 text-[12px] font-500 text-muted">
                                  {item.detail}
                                </span>
                              ) : null}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )
              })
            )}
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-4 bg-raised px-4 py-2.5 text-[11px] font-500 text-muted">
            <span aria-hidden="true" className="whitespace-pre">
              {"↑↓  ↵ open   esc close"}
            </span>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
