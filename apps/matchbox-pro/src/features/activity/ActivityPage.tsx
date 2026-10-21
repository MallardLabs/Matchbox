import { useConnectDialog } from "@/app/ConnectDialog"
import {
  type ActivityItem,
  type HistoryPagesResult,
  useActivityTx,
  useProtocolActivity,
  useWalletActivity,
} from "@/features/history/useHistory"
import ToggleChip from "@/features/rewards/ToggleChip"
import { csvFilename, downloadCsv, toCsv } from "@/features/rewards/csv"
import {
  epochStartOf,
  epochTitle,
  formatEpochDate,
  periodFrom,
} from "@/features/rewards/ledgerModel"
import { DESKTOP_QUERY, useMediaQuery } from "@/hooks/useMediaQuery"
import { useNetwork } from "@/lib/network"
import { useViewer } from "@/lib/viewer"
import * as Button from "@repo/ui/button"
import { cn } from "@repo/ui/cn"
import * as Dialog from "@repo/ui/dialog"
import { shortenAddress } from "@repo/ui/wallet-address"
import { Link } from "@tanstack/react-router"
import { History } from "lucide-react"
import { type ReactElement, useEffect, useMemo, useState } from "react"
import { usePublicClient } from "wagmi"
import EventDetail from "./EventDetail"
import EventTable from "./EventTable"
import TextSelect from "./TextSelect"
import {
  ACTIVITY_CSV_HEADERS,
  type ActivityEvent,
  KIND_FILTERS,
  activityCsvRows,
  eventStale,
  filterKinds,
  groupEvents,
  permalinkPath,
} from "./activityModel"
import {
  ACTIVITY_DEFAULTS,
  type ActivityPageSize,
  type ActivityRange,
  type ActivityScope,
  type ActivitySearch,
  PAGE_SIZES,
  useActivitySearch,
} from "./activitySearch"
import { useActivityNames } from "./useActivityNames"

const RANGES: ReadonlyArray<{ id: ActivityRange; label: string }> = [
  { id: "epoch", label: "This epoch" },
  { id: "last-8", label: "Last 8" },
  { id: "all", label: "All time" },
]

/**
 * Rows per request. A re-vote is up to ~14 rows that group into one event,
 * so pages are fetched in large row batches and filled up to the page size
 * in events (at most MAX_AUTO_PAGES requests per page).
 */
const RAW_ROWS = 200
const MAX_AUTO_PAGES = 10

/** Same windows as Rewards: this epoch, or eight sealed plus current. */
function rangeFrom(range: ActivityRange, now: number): number | undefined {
  return periodFrom(range === "all" ? "lifetime" : range, now)
}

function formatLag(seconds: number): string {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min`
  if (seconds < 172_800) return `${Math.round(seconds / 3600)} h`
  return `${Math.round(seconds / 86_400)} days`
}

function groupThousands(value: bigint): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

type ActivityPageProps = {
  /** Permalink scope: this wallet instead of the viewer. */
  address?: string | undefined
  /** Permalink: the transaction to select. */
  txHash?: string | undefined
  /** Filters from the URL; without them the page keeps its own state. */
  search?: ActivitySearch | undefined
  onSearchChange?: ((next: ActivitySearch) => void) | undefined
}

/** Expert explorer: normalized wallet or protocol events with permalinks. */
export default function ActivityPage({
  address: pinned,
  txHash,
  search: searchProp,
  onSearchChange,
}: ActivityPageProps): ReactElement {
  const { viewer } = useViewer()
  const { open: openConnect } = useConnectDialog()
  const { chainId } = useNetwork()
  const client = usePublicClient({ chainId })
  const explorer = client?.chain?.blockExplorers?.default.url
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const names = useActivityNames()

  const wallet = pinned ?? viewer.address
  const [now] = useState(() => Math.floor(Date.now() / 1000))
  const [search, setSearch] = useActivitySearch(searchProp, onSearchChange)
  const scope: ActivityScope = search.scope ?? (wallet ? "wallet" : "protocol")
  const kind = search.kind ?? ACTIVITY_DEFAULTS.kind
  const range = search.range ?? ACTIVITY_DEFAULTS.range
  const pageSize: ActivityPageSize = search.size ?? ACTIVITY_DEFAULTS.size
  const [picked, setPicked] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(!!txHash)

  const filters = {
    kinds: filterKinds(kind),
    from: rangeFrom(range, now),
    limit: RAW_ROWS,
  }
  const walletFeed = useWalletActivity(
    scope === "wallet" ? wallet : undefined,
    filters,
  )
  const protocolFeed = useProtocolActivity(filters, {
    enabled: scope === "protocol",
  })
  const feed: HistoryPagesResult<ActivityItem> =
    scope === "wallet" ? walletFeed : protocolFeed
  const tx = useActivityTx(txHash, wallet)

  const events = useMemo(() => groupEvents(feed.data ?? []), [feed.data])

  // Pages are counted in events. "Load more" asks for another page's worth;
  // the effect keeps fetching row batches until that many events exist.
  const filterKey = `${scope}|${kind}|${range}|${pageSize}|${wallet ?? ""}`
  const [extra, setExtra] = useState({ key: filterKey, pages: 0 })
  const wanted = pageSize * (1 + (extra.key === filterKey ? extra.pages : 0))
  const rowsLoaded = feed.data?.length ?? 0
  const {
    status: feedStatus,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = feed
  useEffect(() => {
    if (
      feedStatus === "ready" &&
      hasNextPage &&
      !isFetchingNextPage &&
      events.length < wanted &&
      rowsLoaded < RAW_ROWS * MAX_AUTO_PAGES * (wanted / pageSize)
    ) {
      fetchNextPage()
    }
  }, [
    feedStatus,
    hasNextPage,
    isFetchingNextPage,
    events.length,
    wanted,
    rowsLoaded,
    pageSize,
    fetchNextPage,
  ])
  const visible = events.slice(0, wanted)
  const canLoadMore = events.length > wanted || hasNextPage
  const txEvents = useMemo(() => groupEvents(tx.data?.items ?? []), [tx.data])
  const pinnedEvent = txEvents[0] ?? null
  const selected: ActivityEvent | null =
    events.find((event) => event.id === picked) ??
    (picked === null && pinnedEvent
      ? (events.find((event) => event.txHash === pinnedEvent.txHash) ??
        pinnedEvent)
      : null) ??
    events[0] ??
    null

  // Permalink to a tx the index hasn't got (yet): say so instead of
  // silently showing another event.
  const txMissing =
    txHash && tx.status === "ready" && tx.data && tx.data.index !== "indexed"
      ? tx.data.index
      : null

  const freshness = feed.freshness
  const stale = freshness?.state === "stale"
  const lagSeconds = freshness?.lagSeconds ?? null
  const permalinkAddress =
    scope === "wallet" && wallet
      ? wallet
      : (selected?.items[0]?.txFrom ?? selected?.items[0]?.actor ?? null)

  function retry(): void {
    feed.refetch()
    if (txHash) tx.refetch?.()
  }

  function exportCsv(): void {
    const label = scope === "wallet" && wallet ? wallet : "protocol"
    downloadCsv(
      csvFilename("activity", label, new Date()),
      toCsv(ACTIVITY_CSV_HEADERS, activityCsvRows(events, names)),
    )
  }

  function select(event: ActivityEvent): void {
    setPicked(event.id)
    if (!desktop) setSheetOpen(true)
  }

  const kindLabel =
    KIND_FILTERS.find((item) => item.id === kind)?.label ?? "All"
  const loading = feed.status === "loading"
  const unavailable = feed.status === "unavailable" || feed.status === "error"

  return (
    <div className="flex flex-col gap-3 md:gap-4 xl:gap-5">
      {stale && freshness ? (
        <section
          aria-label="Index status"
          className="flex min-h-[52px] flex-wrap items-center gap-x-2.5 gap-y-2 rounded-lg bg-warn-soft px-4 py-2.5"
        >
          <History
            aria-hidden="true"
            size={16}
            className="shrink-0 text-warn"
          />
          <p
            aria-live="polite"
            className="min-w-0 flex-1 text-body-sm text-ink"
          >
            {freshness.source === "frozen-explorer" && freshness.indexedAt
              ? `Index frozen · as of ${formatEpochDate(Date.parse(freshness.indexedAt) / 1000)}`
              : `Index is ${lagSeconds === null ? "behind" : `${formatLag(lagSeconds)} behind`}`}
            {freshness.indexedThroughBlock !== null
              ? ` · last block ${groupThousands(freshness.indexedThroughBlock)}`
              : ""}
          </p>
          <Button.Root size="sm" className="font-600" onClick={retry}>
            Retry index
          </Button.Root>
        </section>
      ) : null}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="hidden text-label text-muted xl:block">
            Expert explorer ·{" "}
            {scope === "wallet" && wallet
              ? pinned && pinned.toLowerCase() !== viewer.address?.toLowerCase()
                ? shortenAddress(pinned)
                : "this wallet"
              : "protocol"}
            {stale ? " · index lagging" : ""}
          </p>
          <h1 className="text-[22px] font-600 leading-7 text-ink md:text-[26px] md:leading-8 xl:text-title">
            Activity
          </h1>
        </div>
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          <fieldset className="m-0 flex min-w-0 items-center gap-2 border-0 p-0">
            <legend className="sr-only">Scope</legend>
            <ToggleChip
              pressed={scope === "wallet"}
              disabled={!wallet}
              onClick={() => {
                setSearch({ scope: "wallet" })
                setPicked(null)
              }}
            >
              This wallet
            </ToggleChip>
            <ToggleChip
              pressed={scope === "protocol"}
              onClick={() => {
                setSearch({ scope: "protocol" })
                setPicked(null)
              }}
            >
              Protocol
            </ToggleChip>
          </fieldset>
          <Button.Root
            variant="secondary"
            size="sm"
            className="h-8 px-3 font-500"
            disabled={events.length === 0}
            onClick={exportCsv}
          >
            Export CSV
          </Button.Root>
        </div>
      </header>

      <div className="-mx-4 flex min-w-0 items-center gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:gap-2 md:overflow-visible md:px-0">
        <fieldset className="m-0 flex shrink-0 items-center gap-1.5 border-0 p-0 md:gap-2">
          <legend className="sr-only">Event kind</legend>
          {KIND_FILTERS.map((item) => (
            <ToggleChip
              key={item.id}
              tone="solid"
              className="px-2 md:px-2.5"
              pressed={kind === item.id}
              onClick={() => {
                setSearch({ kind: item.id })
                setPicked(null)
              }}
            >
              {item.label}
            </ToggleChip>
          ))}
        </fieldset>
        <span className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap text-label text-muted md:flex">
          <span aria-hidden="true">·</span>
          <span>{epochTitle(epochStartOf(now))}</span>
          <span aria-hidden="true">·</span>
          <TextSelect
            id="activity-range"
            label="Range"
            value={range}
            options={RANGES.map((item) => ({
              value: item.id,
              label: item.label,
            }))}
            onChange={(value) => {
              const next = RANGES.find((item) => item.id === value)
              if (next) setSearch({ range: next.id })
            }}
          />
          <span aria-hidden="true">·</span>
          <span className={cn(stale && "text-warn")}>
            {stale ? "Stale" : "Finalized"}
          </span>
        </span>
      </div>

      {txMissing && txHash ? (
        <p aria-live="polite" className="text-body-sm text-warn">
          Tx{" "}
          <span className="font-mono">{`${txHash.slice(0, 6)}…${txHash.slice(-4)}`}</span>{" "}
          ·{" "}
          {txMissing === "pending_index"
            ? "not indexed yet"
            : "not found in the index"}
        </p>
      ) : null}

      {scope === "wallet" && !wallet ? (
        <EmptyBox title="No wallet connected">
          <Button.Root size="md" onClick={openConnect}>
            Connect wallet
          </Button.Root>
        </EmptyBox>
      ) : unavailable ? (
        <EmptyBox title="Activity unavailable">
          <Button.Root variant="secondary" size="md" onClick={retry}>
            Retry
          </Button.Root>
        </EmptyBox>
      ) : !loading && events.length === 0 ? (
        <EmptyBox
          title="No matching events"
          line={[
            kind === "all" ? "No events" : `No ${kindLabel.toLowerCase()}`,
            scope === "wallet" ? "this wallet" : "protocol",
            RANGES.find((item) => item.id === range)?.label ?? "",
          ].join(" · ")}
        >
          {kind !== "all" || range !== "all" ? (
            <Button.Root
              size="md"
              onClick={() => setSearch({ kind: "all", range: "all" })}
            >
              Clear filters
            </Button.Root>
          ) : null}
        </EmptyBox>
      ) : (
        <div className="flex min-w-0 gap-6">
          <div className="flex min-w-0 flex-1 flex-col">
            <EventTable
              events={visible}
              loading={loading}
              names={names}
              stale={(event) => eventStale(event, freshness)}
              selectedId={
                desktop || picked !== null || pinnedEvent
                  ? (selected?.id ?? null)
                  : null
              }
              onSelect={select}
            />
            {!loading ? (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-label text-muted">
                <div className="flex items-center gap-1.5">
                  <span>
                    {visible.length} {visible.length === 1 ? "event" : "events"}
                  </span>
                  <span aria-hidden="true">·</span>
                  <TextSelect
                    id="activity-page-size"
                    label="Page size"
                    value={String(pageSize)}
                    options={PAGE_SIZES.map((size) => ({
                      value: String(size),
                      label: `${size} / page`,
                    }))}
                    onChange={(value) => {
                      const size = PAGE_SIZES.find(
                        (item) => String(item) === value,
                      )
                      if (size) setSearch({ size })
                    }}
                  />
                  {!canLoadMore && feed.truncated ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-warn">
                        Older rows not in frozen index
                      </span>
                    </>
                  ) : null}
                  {canLoadMore ? (
                    <Button.Root
                      variant="ghost"
                      size="sm"
                      loading={isFetchingNextPage}
                      onClick={() =>
                        setExtra({
                          key: filterKey,
                          pages:
                            (extra.key === filterKey ? extra.pages : 0) + 1,
                        })
                      }
                    >
                      Load more
                    </Button.Root>
                  ) : null}
                </div>
                {selected?.txHash && permalinkAddress ? (
                  <Link
                    to="/activity/$address/tx/$hash"
                    params={{
                      address: permalinkAddress.toLowerCase(),
                      hash: selected.txHash,
                    }}
                    className="hidden truncate text-caption text-muted hover:text-ink md:block"
                  >
                    Permalink{" "}
                    <span className="font-mono">
                      {permalinkPath(
                        shortenAddress(permalinkAddress),
                        `${selected.txHash.slice(0, 6)}`,
                      )}
                    </span>
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
          {selected && desktop ? (
            <aside className="hidden w-[360px] shrink-0 self-start xl:block">
              <EventDetail
                event={selected}
                names={names}
                address={permalinkAddress}
                stale={eventStale(selected, freshness)}
                explorer={explorer}
              />
            </aside>
          ) : null}
        </div>
      )}

      {selected && !desktop ? (
        <Dialog.Root
          open={sheetOpen && (picked !== null || !!pinnedEvent)}
          onOpenChange={setSheetOpen}
        >
          <Dialog.Content
            placement="sheet"
            size="sm"
            aria-describedby={undefined}
          >
            <EventDetail
              event={selected}
              names={names}
              address={permalinkAddress}
              stale={eventStale(selected, freshness)}
              explorer={explorer}
              framed={false}
              renderTitle={(title) => (
                <Dialog.Title className="text-lead font-600">
                  {title}
                </Dialog.Title>
              )}
            />
          </Dialog.Content>
        </Dialog.Root>
      ) : null}
    </div>
  )
}

function EmptyBox({
  title,
  line,
  children,
}: {
  title: string
  line?: string
  children?: ReactElement | null
}): ReactElement {
  return (
    <section className="flex flex-col items-start gap-3 rounded-lg bg-inset p-6 md:p-8">
      <h2 className="text-lead font-600 text-ink">{title}</h2>
      {line ? <p className="text-body-sm text-secondary">{line}</p> : null}
      {children}
    </section>
  )
}
