import { SpringIn } from "@/components/SpringIn"
import { useMezoActivity } from "@/hooks/useMezoActivity"
import type { MezoActivityFilter, MezoActivityItem } from "@/types/mezoActivity"
import { useMemo, useState } from "react"

const FILTERS: Array<{ key: MezoActivityFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "locks", label: "Locks" },
  { key: "boostMatchbox", label: "Boost (Matchbox)" },
  { key: "boostPair", label: "Boost (Mezo Pairing)" },
  { key: "extensions", label: "Extensions" },
]

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

export default function MezoActivityPage() {
  const [filter, setFilter] = useState<MezoActivityFilter>("all")
  const [cursor, setCursor] = useState<string | undefined>()
  const { data, isLoading, isError, error, nextCursor, isFetching } = useMezoActivity(
    cursor ? { filter, cursor, limit: 50 } : { filter, limit: 50 },
  )

  const nextCursorString = useMemo(
    () => (nextCursor ? JSON.stringify(nextCursor) : undefined),
    [nextCursor],
  )

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:py-12">
      <SpringIn delay={0} variant="card">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h1 className="font-mono text-2xl text-[var(--content-primary)] md:text-3xl">
            mezo global activity
          </h1>
          <p className="mt-2 text-sm text-[var(--content-secondary)]">
            Live feed for veMEZO locks, BTC boosts, and lock extensions.
            Boost rows are labeled as Matchbox gauge boosts vs Mezo pairing boosts.
          </p>
        </div>
      </SpringIn>

      <SpringIn delay={1} variant="card">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = f.key === filter
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setFilter(f.key)
                  setCursor(undefined)
                }}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-[#F7931A] bg-[#F7931A]/10 text-[#F7931A]"
                    : "border-[var(--border)] text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
                }`}
              >
                {f.label}
              </button>
            )
          })}
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
                  <a
                    href={item.explorerUrl ?? `https://explorer.mezo.org/tx/${item.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#F7931A] no-underline hover:underline"
                  >
                    tx
                  </a>
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
