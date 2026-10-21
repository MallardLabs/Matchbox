import VoteTypeSelector from "@/features/vote/VoteTypeSelector"
import VoteWorkspace from "@/features/vote/VoteWorkspace"
import type { VoteType } from "@/features/vote/model"
import {
  ACTION_PARAMS,
  DEFAULT_VIEW,
  type VoteSearch,
  type VoteView,
  parseVoteSearch,
  searchFromView,
  viewFromSearch,
} from "@/features/vote/search"
import { createFileRoute } from "@tanstack/react-router"
import { type ReactElement, useCallback, useEffect, useRef } from "react"

export const Route = createFileRoute("/vote")({
  validateSearch: (search: Record<string, unknown>): VoteSearch =>
    parseVoteSearch(search),
  component: VotePage,
})

// Filters live in the URL; the last set is also kept for this tab so a bare
// `/vote` (the back link from gauge detail) lands where the viewer left off.
const LAST_SEARCH_KEY = "matchbox-pro:vote:last-search"

function readLastSearch(): VoteSearch {
  try {
    const raw = window.sessionStorage.getItem(LAST_SEARCH_KEY)
    if (!raw) return {}
    const value: unknown = JSON.parse(raw)
    return typeof value === "object" && value !== null
      ? parseVoteSearch({ ...value })
      : {}
  } catch {
    return {}
  }
}

function writeLastSearch(search: VoteSearch): void {
  try {
    const { optimize: _optimize, add: _add, ...rest } = search
    window.sessionStorage.setItem(LAST_SEARCH_KEY, JSON.stringify(rest))
  } catch {
    // Restoring is a convenience; the URL still carries the filters.
  }
}

function VotePage(): ReactElement {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const view = viewFromSearch(search)
  const restored = useRef(false)

  useEffect(() => {
    if (restored.current) return
    restored.current = true
    const actions: readonly string[] = ACTION_PARAMS
    if (Object.keys(search).some((key) => !actions.includes(key))) return
    const last = readLastSearch()
    if (Object.keys(last).length === 0) return
    void navigate({
      search: { ...last, optimize: search.optimize, add: search.add },
      replace: true,
    })
  }, [navigate, search])

  useEffect(() => {
    if (restored.current) writeLastSearch(search)
  }, [search])

  const onViewChange = useCallback(
    (patch: Partial<VoteView>) => {
      void navigate({
        search: (previous) => ({
          ...searchFromView({ ...viewFromSearch(previous), ...patch }),
          optimize: previous.optimize,
          add: previous.add,
        }),
        replace: true,
      })
    },
    [navigate],
  )

  const onActionHandled = useCallback(
    (action: (typeof ACTION_PARAMS)[number]) => {
      void navigate({
        search: (previous) => ({ ...previous, [action]: undefined }),
        replace: true,
      })
    },
    [navigate],
  )

  const searchFor = useCallback(
    (type: VoteType): VoteSearch =>
      searchFromView({ ...DEFAULT_VIEW, type, density: view.density }),
    [view.density],
  )

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 md:gap-7">
      <h1 className="sr-only md:not-sr-only md:text-title md:font-600 md:text-ink">
        Vote
      </h1>
      <VoteTypeSelector active={view.type} searchFor={searchFor} />
      <VoteWorkspace
        key={view.type}
        view={view}
        optimizeRequested={search.optimize === true}
        addRequested={search.add ?? null}
        onViewChange={onViewChange}
        onActionHandled={onActionHandled}
      />
    </div>
  )
}
