import { SpringIn } from "@/components/SpringIn"
import { useMezoActivity } from "@/hooks/useMezoActivity"
import {
  type MezoActivityApiResponse,
  type MezoActivityFilter,
  type MezoActivityItem,
} from "@/types/mezoActivity"
import { useMemo, useState } from "react"

const FILTERS: Array<{ key: MezoActivityFilter; label: string }> = [
  { key: "locks", label: "Locks" },
  { key: "boostMatchbox", label: "Boost (Matchbox)" },
  { key: "boostPair", label: "Boost (Mezo Pairing)" },
  { key: "extensions", label: "Extensions" },
]

const ALL_FILTERS = FILTERS.map((filter) => filter.key)

const now = Math.floor(Date.now() / 1000)
const DEFAULT_FROM = now - 30 * 86_400

function toDateInputValue(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10)
}

function fromDateInputValue(value: string, endOfDay = false): number {
  const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z"
  return Math.floor(new Date(`${value}${suffix}`).getTime() / 1000)
}

function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = Math.max(now - timestamp, 0)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86_400)}d ago`
}

function formatCompactAmount(value?: bigint): string {
  if (value === undefined) return "-"
  const asNumber = Number(value) / 1e18
  if (!Number.isFinite(asNumber)) return value.toString()
  if (asNumber >= 1_000_000) return `${(asNumber / 1_000_000).toFixed(2)}M`
  if (asNumber >= 1_000) return `${(asNumber / 1_000).toFixed(2)}K`
  return asNumber.toFixed(4)
}

function actionLabel(item: MezoActivityItem): string {
  if (item.actionType === "lockCreated") return "Locked MEZO > veMEZO"
  if (item.actionType === "lockExtended") return "Extended veMEZO Lock"
  if (item.boostContext === "matchboxGaugeBoost") return "Boosted BTC (Matchbox)"
  if (item.boostContext === "mezoVeBtcPairBoost") return "Boosted BTC (Mezo Pairing)"
  if (item.actionType === "pairCreated") return "Created Pair & Boost Gauge"
  if (item.actionType === "boostPoke") return "Poked Boost"
  return "Boost Vote"
}

function itemMatchesFilters(
  item: Pick<MezoActivityItem, "actionType" | "boostContext">,
  filters: MezoActivityFilter[],
): boolean {
  const selected = new Set(filters)
  if (item.actionType === "lockCreated") return selected.has("locks")
  if (item.actionType === "lockExtended") return selected.has("extensions")
  if (item.boostContext === "matchboxGaugeBoost") {
    return selected.has("boostMatchbox")
  }
  if (item.boostContext === "mezoVeBtcPairBoost") return selected.has("boostPair")
  return selected.has("boostMatchbox") || selected.has("boostPair")
}

function csvEscape(value: string | number | bigint | undefined): string {
  const raw = value === undefined ? "" : value.toString()
  return `"${raw.replaceAll('"', '""')}"`
}

export default function MezoActivityPage() {
  const [filters, setFilters] = useState<MezoActivityFilter[]>(ALL_FILTERS)
  const [fromDate, setFromDate] = useState(() => toDateInputValue(DEFAULT_FROM))
  const [toDate, setToDate] = useState(() => toDateInputValue(now))
  const [cursor, setCursor] = useState<string | undefined>()
  const [isExporting, setIsExporting] = useState(false)
  const fromTimestamp = useMemo(() => fromDateInputValue(fromDate), [fromDate])
  const toTimestamp = useMemo(() => fromDateInputValue(toDate, true), [toDate])
  const { data, isLoading, isError, error, nextCursor, isFetching } = useMezoActivity(
    cursor
      ? { filters, fromTimestamp, toTimestamp, cursor, limit: 50 }
      : { filters, fromTimestamp, toTimestamp, limit: 50 },
  )

  const nextCursorString = useMemo(
    () => (nextCursor ? JSON.stringify(nextCursor) : undefined),
    [nextCursor],
  )

  const toggleFilter = (filter: MezoActivityFilter) => {
    setFilters((current) => {
      if (current.includes(filter)) {
        return current.filter((item) => item !== filter)
      }
      return [...current, filter]
    })
    setCursor(undefined)
  }

  const exportCsv = async () => {
    setIsExporting(true)
    try {
      const params = new URLSearchParams({
        from: fromTimestamp.toString(),
        to: toTimestamp.toString(),
        limit: "1000",
      })
      const response = await fetch(`/api/activity?${params.toString()}`)
      if (!response.ok) throw new Error(`Export failed: ${response.status}`)
      const json = (await response.json()) as MezoActivityApiResponse
      const rows = json.data.filter((item) => itemMatchesFilters(item, filters))
      const header = [
        "timestamp",
        "actionType",
        "boostContext",
        "source",
        "actorAddress",
        "tokenId",
        "amount",
        "duration",
        "gaugeAddress",
        "txHash",
        "explorerUrl",
      ]
      const csv = [
        header.join(","),
        ...rows.map((item) =>
          [
            csvEscape(item.timestamp),
            csvEscape(item.actionType),
            csvEscape(item.boostContext),
            csvEscape(item.source),
            csvEscape(item.actorAddress),
            csvEscape(item.tokenId),
            csvEscape(item.amount),
            csvEscape(item.duration),
            csvEscape(item.gaugeAddress),
            csvEscape(item.txHash),
            csvEscape(item.explorerUrl),
          ].join(","),
        ),
      ].join("\n")
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `matchbox-activity-${fromDate}-to-${toDate}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:py-12">
      <SpringIn delay={0} variant="card">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h1 className="font-mono text-2xl text-[var(--content-primary)] md:text-3xl">
            global activity
          </h1>
          <p className="mt-2 text-sm text-[var(--content-secondary)]">
            Live feed for veMEZO locks, BTC boosts, and lock extensions.
            Boost rows are labeled as Matchbox gauge boosts vs Mezo pairing boosts.
          </p>
        </div>
      </SpringIn>

      <SpringIn delay={1} variant="card">
        <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const active = filters.includes(f.key)
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleFilter(f.key)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "border-[#F7931A] bg-[#F7931A]/10 text-[#F7931A]"
                      : "border-[var(--border)] text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
                  }`}
                >
                  <span
                    className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border text-[9px] leading-none ${
                      active
                        ? "border-[#F7931A] bg-[#F7931A] text-black"
                        : "border-[var(--content-muted)] text-transparent"
                    }`}
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  {f.label}
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--content-secondary)]">
            <label className="flex items-center gap-2">
              From
              <input
                type="date"
                value={fromDate}
                max={toDate}
                onChange={(event) => {
                  setFromDate(event.target.value)
                  setCursor(undefined)
                }}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-2 py-1 font-mono text-[var(--content-primary)]"
              />
            </label>
            <label className="flex items-center gap-2">
              To
              <input
                type="date"
                value={toDate}
                min={fromDate}
                onChange={(event) => {
                  setToDate(event.target.value)
                  setCursor(undefined)
                }}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-2 py-1 font-mono text-[var(--content-primary)]"
              />
            </label>
            <button
              type="button"
              onClick={exportCsv}
              disabled={isExporting || filters.length === 0}
              className="rounded-lg border border-[var(--border)] px-3 py-1 font-mono text-xs text-[var(--content-secondary)] transition-colors hover:text-[#F7931A] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isExporting ? "Exporting..." : "Export CSV"}
            </button>
          </div>
          <p className="text-xs leading-relaxed text-[var(--content-tertiary)]">
            Locks use indexed Goldsky stake data. Boosts and extensions will be
            fully historical once the dedicated Matchbox Activity Goldsky subgraph
            is deployed; until then, only recent RPC fallback events may appear.
          </p>
        </div>
      </SpringIn>

      <SpringIn delay={2} variant="card">
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="grid grid-cols-[1.7fr_0.9fr_0.9fr_1fr_0.8fr] gap-3 border-b border-[var(--border)] px-4 py-3 text-xs uppercase tracking-wider text-[var(--content-tertiary)]">
            <span>Action</span>
            <span>Amount</span>
            <span>Token ID</span>
            <span>Source</span>
            <span>Time</span>
          </div>

          {isLoading && (
            <div className="px-4 py-8 text-sm text-[var(--content-secondary)]">
              Loading activity feed...
            </div>
          )}
          {isError && (
            <div className="px-4 py-8 text-sm text-red-400">
              Failed to load activity: {error instanceof Error ? error.message : "unknown"}
            </div>
          )}
          {!isLoading && !isError && data.length === 0 && (
            <div className="px-4 py-8 text-sm text-[var(--content-secondary)]">
              No activity found for this filter yet.
            </div>
          )}

          {!isLoading &&
            !isError &&
            data.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[1.7fr_0.9fr_0.9fr_1fr_0.8fr] gap-3 border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--content-primary)] last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate">{actionLabel(item)}</p>
                  <p className="truncate text-xs text-[var(--content-tertiary)]">
                    {item.actorAddress ?? "unknown actor"}
                  </p>
                </div>
                <span className="text-[var(--content-secondary)]">
                  {formatCompactAmount(item.amount)}
                </span>
                <span className="text-[var(--content-secondary)]">
                  {item.tokenId?.toString() ?? "-"}
                </span>
                <div className="flex items-center gap-2">
                  <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-xs text-[var(--content-secondary)]">
                    {item.source}
                  </span>
                  {item.txHash ? (
                    <a
                      href={item.explorerUrl ?? `https://explorer.mezo.org/tx/${item.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#F7931A] no-underline hover:underline"
                    >
                      tx
                    </a>
                  ) : (
                    <span className="text-xs text-[var(--content-tertiary)]">
                      indexed
                    </span>
                  )}
                </div>
                <span className="text-xs text-[var(--content-tertiary)]">
                  {formatRelativeTime(item.timestamp)}
                </span>
              </div>
            ))}
        </div>
      </SpringIn>

      <div>
        <button
          type="button"
          disabled={!nextCursorString || isFetching}
          onClick={() => setCursor(nextCursorString)}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--content-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isFetching ? "Loading..." : "Load More"}
        </button>
      </div>
    </div>
  )
}
