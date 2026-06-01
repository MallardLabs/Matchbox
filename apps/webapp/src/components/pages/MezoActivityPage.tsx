import { SpringIn } from "@/components/SpringIn"
import { useActivityEnrichment } from "@/hooks/useActivityEnrichment"
import {
  type IncentiveHistoryEpoch,
  type IncentiveHistoryScope,
  useActivityIncentiveHistory,
} from "@/hooks/useActivityIncentiveHistory"
import { useMezoActivity } from "@/hooks/useMezoActivity"
import {
  SYSTEM_ACTION_TYPES_GRAPHQL,
  USER_ACTION_TYPES_GRAPHQL,
  isAutomatedAddress,
} from "@/lib/mezoActivity/constants"
import {
  type EnrichmentContext,
  formatActivity,
  formatBoost,
  shortenAddress,
} from "@/lib/mezoActivity/format"
import { groupActivityByTx } from "@/lib/mezoActivity/normalize"
import type {
  MezoActivityActionType,
  MezoActivityApiResponse,
  MezoActivityFilter,
  MezoActivityItem,
  MezoActivityTab,
  MezoSystemFilter,
} from "@/types/mezoActivity"
import { useEffect, useMemo, useState } from "react"

const ACTIVITY_FILTERS: Array<{ key: MezoActivityFilter; label: string }> = [
  { key: "locks", label: "Locks" },
  { key: "boostMatchbox", label: "Boost (Matchbox)" },
  { key: "boostPair", label: "Boost (Mezo Pairing)" },
  { key: "extensions", label: "Extensions" },
  { key: "incentives", label: "Incentives & Rewards" },
]

const SYSTEM_FILTERS: Array<{ key: MezoSystemFilter; label: string }> = [
  { key: "automatedPokes", label: "Automated pokes" },
  { key: "rewardDistributions", label: "Reward distributions" },
  { key: "gaugeLifecycle", label: "Gauge lifecycle" },
  { key: "incentives", label: "Incentives" },
  { key: "splitterPeriods", label: "Splitter periods" },
  { key: "emissions", label: "MEZO emissions" },
  { key: "rebaseCheckpoints", label: "Rebase checkpoints" },
  { key: "pcvDistributions", label: "PCV distributions" },
  { key: "savingsRate", label: "mUSD savings yield" },
]

const ALL_ACTIVITY_FILTERS = ACTIVITY_FILTERS.map((f) => f.key)
const ALL_SYSTEM_FILTERS = SYSTEM_FILTERS.map((f) => f.key)

const SYSTEM_ACTION_TYPES: ReadonlySet<MezoActivityActionType> = new Set([
  "rewardDistributed",
  "rewardNotified",
  "gaugeCreated",
  "gaugeKilled",
  "gaugeRevived",
  "pairCreated",
  "boostableTokenBurned",
  "thirdPartyGaugeCreated",
  "validatorGaugeCreated",
  "validatorLeft",
  "periodUpdated",
  "epochProcessed",
  "emissionsEnabled",
  "rebaseCheckpoint",
  "merkleDistributionAdded",
  "protocolYieldReceived",
  "strategyYieldReceived",
  "pcvDistribution",
  "pcvDebtPayment",
])

const GAUGE_LIFECYCLE_ACTIONS: ReadonlySet<MezoActivityActionType> = new Set([
  "gaugeCreated",
  "gaugeKilled",
  "gaugeRevived",
  "pairCreated",
  "boostableTokenBurned",
  "thirdPartyGaugeCreated",
  "validatorGaugeCreated",
  "validatorLeft",
])

const INCENTIVE_SCOPE_OPTIONS: Array<{
  key: IncentiveHistoryScope
  label: string
}> = [
  { key: "both", label: "Both" },
  { key: "vebtc", label: "veBTC" },
  { key: "pools", label: "Pools" },
]

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

const DEFAULT_FROM_OFFSET = 30 * 86_400

function toDateInputValue(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10)
}

function fromDateInputValue(value: string, endOfDay = false): number {
  const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z"
  return Math.floor(new Date(`${value}${suffix}`).getTime() / 1000)
}

function formatRelativeTime(timestamp: number): string {
  const diff = Math.max(nowSeconds() - timestamp, 0)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86_400)}d ago`
}

function formatUsdCompact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$0"
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 10_000) return `$${Math.round(value).toLocaleString()}`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  if (value >= 1) {
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  }
  return "<$1"
}

function formatUsdDetailed(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$0.00"
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatEpochRange(start: number, end: number): string {
  const from = new Date(start * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
  const to = new Date((end - 1) * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
  return `${from} - ${to}`
}

function scopedUsd(
  epoch: IncentiveHistoryEpoch,
  scope: IncentiveHistoryScope,
): number {
  if (scope === "vebtc") return epoch.vebtcUsd
  if (scope === "pools") return epoch.poolsUsd
  return epoch.totalUsd
}

function scopedEvents(
  epoch: IncentiveHistoryEpoch,
  scope: IncentiveHistoryScope,
): number {
  if (scope === "vebtc") return epoch.vebtcEvents
  if (scope === "pools") return epoch.poolsEvents
  return epoch.totalEvents
}

function isSystemItem(item: MezoActivityItem): boolean {
  if (SYSTEM_ACTION_TYPES.has(item.actionType)) return true
  if (item.actionType === "boostPoke") {
    if (isAutomatedAddress(item.txFrom)) return true
    if (item.pokeMethod === "pokeBoosts" && !item.actorAddress) return true
  }
  return false
}

function matchesActivityFilter(
  item: MezoActivityItem,
  selected: Set<MezoActivityFilter>,
): boolean {
  if (
    item.actionType === "lockCreated" ||
    item.actionType === "lockAmountIncreased" ||
    item.actionType === "lockWithdrawn" ||
    item.actionType === "lockPermanent" ||
    item.actionType === "lockPermanentUnlocked"
  ) {
    return selected.has("locks")
  }
  if (item.actionType === "lockExtended") return selected.has("extensions")
  if (
    item.actionType === "incentiveAdded" ||
    item.actionType === "rewardDistributed" ||
    item.actionType === "rewardNotified" ||
    item.actionType === "rebaseClaimed" ||
    item.actionType === "merkleClaimed" ||
    item.actionType === "savingsDeposit" ||
    item.actionType === "savingsWithdraw" ||
    item.actionType === "savingsYieldClaimed"
  ) {
    return selected.has("incentives")
  }
  if (item.boostContext === "matchboxGaugeBoost") {
    return selected.has("boostMatchbox")
  }
  if (item.boostContext === "mezoVeBtcPairBoost") {
    return selected.has("boostPair")
  }
  return selected.has("boostMatchbox") || selected.has("boostPair")
}

function matchesSystemFilter(
  item: MezoActivityItem,
  selected: Set<MezoSystemFilter>,
): boolean {
  if (item.actionType === "boostPoke") return selected.has("automatedPokes")
  if (
    item.actionType === "rewardDistributed" ||
    item.actionType === "rewardNotified"
  ) {
    return selected.has("rewardDistributions")
  }
  if (
    item.actionType === "incentiveAdded" ||
    item.actionType === "merkleDistributionAdded"
  ) {
    return selected.has("incentives")
  }
  if (GAUGE_LIFECYCLE_ACTIONS.has(item.actionType)) {
    return selected.has("gaugeLifecycle")
  }
  if (item.actionType === "periodUpdated") {
    return selected.has("splitterPeriods")
  }
  if (
    item.actionType === "epochProcessed" ||
    item.actionType === "emissionsEnabled"
  ) {
    return selected.has("emissions")
  }
  if (item.actionType === "rebaseCheckpoint") {
    return selected.has("rebaseCheckpoints")
  }
  if (
    item.actionType === "pcvDistribution" ||
    item.actionType === "pcvDebtPayment"
  ) {
    return selected.has("pcvDistributions")
  }
  if (
    item.actionType === "protocolYieldReceived" ||
    item.actionType === "strategyYieldReceived"
  ) {
    return selected.has("savingsRate")
  }
  return false
}

function csvEscape(value: string | number | bigint | undefined): string {
  const raw = value === undefined ? "" : value.toString()
  return `"${raw.replaceAll('"', '""')}"`
}

type Row =
  | { kind: "single"; item: MezoActivityItem }
  | {
      kind: "batchPoke"
      txHash: string
      txFrom?: string
      timestamp: number
      events: MezoActivityItem[]
    }
  | {
      kind: "txGroup"
      primary: MezoActivityItem
      siblings: MezoActivityItem[]
    }

function buildSystemRows(items: MezoActivityItem[]): Row[] {
  const byTx = new Map<string, MezoActivityItem[]>()
  const order: string[] = []
  const singles: MezoActivityItem[] = []
  for (const item of items) {
    if (item.actionType !== "boostPoke" || !item.txHash) {
      singles.push(item)
      continue
    }
    const list = byTx.get(item.txHash)
    if (list) {
      list.push(item)
    } else {
      byTx.set(item.txHash, [item])
      order.push(item.txHash)
    }
  }
  const rows: Row[] = []
  for (const txHash of order) {
    const events = byTx.get(txHash) ?? []
    const first = events[0]
    if (!first) continue
    if (events.length === 1) {
      rows.push({ kind: "single", item: first })
      continue
    }
    rows.push({
      kind: "batchPoke",
      txHash,
      timestamp: first.timestamp,
      events,
      ...(first.txFrom ? { txFrom: first.txFrom } : {}),
    })
  }
  for (const item of singles) {
    rows.push({ kind: "single", item })
  }
  rows.sort((a, b) => rowTimestamp(b) - rowTimestamp(a))
  return rows
}

function rowTimestamp(row: Row): number {
  if (row.kind === "batchPoke") return row.timestamp
  if (row.kind === "txGroup") return row.primary.timestamp
  return row.item.timestamp
}

function buildActivityRows(items: MezoActivityItem[]): Row[] {
  const grouped = groupActivityByTx(items)
  return grouped.map((group) =>
    group.siblings.length === 0
      ? { kind: "single", item: group.primary }
      : {
          kind: "txGroup",
          primary: group.primary,
          siblings: group.siblings,
        },
  )
}

type ExpandedSet = ReadonlySet<string>

const GRID_COLS = "grid-cols-[1.6fr_0.8fr_1.2fr_0.6fr_0.6fr_0.3fr]"

function GaugeWhereCell({
  where,
}: {
  where: ReturnType<typeof formatActivity>["where"]
}) {
  if (!where) {
    return <span className="text-[var(--content-tertiary)]">—</span>
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      {where.imageUrl ? (
        <img
          src={where.imageUrl}
          alt=""
          className="h-5 w-5 flex-none rounded-full border border-[var(--border)] object-cover"
        />
      ) : (
        <span className="h-2 w-2 flex-none rounded-full bg-[#F7931A]/60" />
      )}
      <div className="min-w-0">
        {where.href ? (
          <a
            href={where.href}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-[var(--content-primary)] no-underline hover:text-[#F7931A]"
          >
            {where.label}
          </a>
        ) : (
          <p className="truncate">{where.label}</p>
        )}
        {where.sub ? (
          <p className="truncate text-[10px] text-[var(--content-tertiary)]">
            {where.sub}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function Drawer({
  fields,
  extra,
}: {
  fields: Array<{ label: string; value: string; mono?: boolean; href?: string }>
  extra?: React.ReactNode
}) {
  return (
    <div className="bg-[var(--surface-secondary)]/30 px-4 pb-3 pt-2">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2 md:grid-cols-3">
        {fields.map((f) => (
          <div
            key={`${f.label}-${f.value}`}
            className="flex flex-col gap-0.5 py-0.5"
          >
            <dt className="text-[var(--content-tertiary)]">{f.label}</dt>
            <dd
              className={
                f.mono
                  ? "font-mono text-[var(--content-primary)]"
                  : "text-[var(--content-primary)]"
              }
            >
              {f.href ? (
                <a
                  href={f.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#F7931A] no-underline hover:underline"
                >
                  {f.value}
                </a>
              ) : (
                f.value
              )}
            </dd>
          </div>
        ))}
      </dl>
      {extra}
    </div>
  )
}

function SingleActivityRow({
  item,
  ctx,
  expanded,
  onToggle,
  extraDrawer,
  badge,
}: {
  item: MezoActivityItem
  ctx: EnrichmentContext
  expanded: ExpandedSet
  onToggle: (key: string) => void
  extraDrawer?: React.ReactNode
  badge?: string
}) {
  const fmt = formatActivity(item, ctx)
  const key = `single:${item.id}`
  const isOpen = expanded.has(key)
  return (
    <div className="border-b border-[var(--border)] last:border-b-0">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => onToggle(key)}
        className={`grid w-full ${GRID_COLS} items-center gap-3 px-4 py-3 text-left text-sm text-[var(--content-primary)] transition-colors hover:bg-[var(--surface-secondary)]/40`}
      >
        <div className="flex min-w-0 items-start gap-2">
          <span aria-hidden="true" className="pt-0.5 text-base leading-none">
            {fmt.emoji}
          </span>
          <div className="min-w-0">
            <p className="truncate">{fmt.title}</p>
            {fmt.subtitle ? (
              <p className="truncate text-xs text-[var(--content-tertiary)]">
                {fmt.subtitle}
              </p>
            ) : null}
            {badge ? (
              <p className="mt-0.5 inline-block rounded border border-[#F7931A]/50 bg-[#F7931A]/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#F7931A]">
                {badge}
              </p>
            ) : null}
          </div>
        </div>
        <div className="min-w-0 truncate">
          <p className="text-[var(--content-primary)]">{fmt.amount ?? "—"}</p>
          {fmt.amountSubtext ? (
            <p className="text-[10px] text-[var(--content-tertiary)]">
              {fmt.amountSubtext}
            </p>
          ) : null}
        </div>
        <GaugeWhereCell where={fmt.where} />
        <span className="flex items-center justify-start">
          <span className="truncate rounded border border-[var(--border)] px-1.5 py-0.5 text-xs text-[var(--content-secondary)]">
            {item.source}
          </span>
        </span>
        <span className="text-xs text-[var(--content-tertiary)]">
          {formatRelativeTime(item.timestamp)}
        </span>
        <span
          aria-hidden="true"
          className={`justify-self-end text-xs text-[var(--content-tertiary)] transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {isOpen ? <Drawer fields={fmt.drawer} extra={extraDrawer} /> : null}
    </div>
  )
}

function BatchPokeRow({
  row,
  ctx,
  expanded,
  onToggle,
}: {
  row: Extract<Row, { kind: "batchPoke" }>
  ctx: EnrichmentContext
  expanded: ExpandedSet
  onToggle: (key: string) => void
}) {
  const key = `batch:${row.txHash}`
  const isOpen = expanded.has(key)
  const isCron = isAutomatedAddress(row.txFrom as `0x${string}` | undefined)
  const first = row.events[0]
  const title = isCron
    ? `Automated Boost Refresh — ${row.events.length} positions`
    : `Boost Refresh (batch) — ${row.events.length} positions`
  return (
    <div className="border-b border-[var(--border)] last:border-b-0">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => onToggle(key)}
        className={`grid w-full ${GRID_COLS} items-center gap-3 px-4 py-3 text-left text-sm text-[var(--content-primary)] transition-colors hover:bg-[var(--surface-secondary)]/40`}
      >
        <div className="flex min-w-0 items-start gap-2">
          <span aria-hidden="true" className="pt-0.5 text-base leading-none">
            🤖
          </span>
          <div className="min-w-0">
            <p className="truncate">{title}</p>
            <p className="truncate text-xs text-[var(--content-tertiary)]">
              {isCron
                ? "Tigris maintainer (cron) · pokeBoosts(uint256[])"
                : `${shortenAddress(row.txFrom)} · pokeBoosts(uint256[])`}
            </p>
          </div>
        </div>
        <div className="min-w-0 truncate">
          <p>{row.events.length}×</p>
          <p className="text-[10px] text-[var(--content-tertiary)]">
            positions
          </p>
        </div>
        <span className="text-xs text-[var(--content-tertiary)]">
          {isOpen ? "Hide list" : "Show list"}
        </span>
        <span className="flex items-center justify-start">
          <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-xs text-[var(--content-secondary)]">
            subgraph
          </span>
        </span>
        <span className="text-xs text-[var(--content-tertiary)]">
          {formatRelativeTime(row.timestamp)}
        </span>
        <span
          aria-hidden="true"
          className={`justify-self-end text-xs text-[var(--content-tertiary)] transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {isOpen ? (
        <div className="bg-[var(--surface-secondary)]/30 px-4 pb-3 pt-2">
          <div className="mb-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2 md:grid-cols-3">
            {first?.txHash ? (
              <div className="flex flex-col gap-0.5">
                <span className="text-[var(--content-tertiary)]">
                  Transaction
                </span>
                <a
                  href={`https://explorer.mezo.org/tx/${first.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[#F7931A] no-underline hover:underline"
                >
                  {shortenAddress(first.txHash)}
                </a>
              </div>
            ) : null}
            <div className="flex flex-col gap-0.5">
              <span className="text-[var(--content-tertiary)]">Caller</span>
              <span className="font-mono text-[var(--content-primary)]">
                {isCron ? "Tigris maintainer" : shortenAddress(row.txFrom)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[var(--content-tertiary)]">
                Block / time
              </span>
              <span className="text-[var(--content-primary)]">
                {first?.blockNumber.toString()} ·{" "}
                {formatRelativeTime(row.timestamp)}
              </span>
            </div>
          </div>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--content-tertiary)]">
            Per-position boost
          </p>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-[var(--content-secondary)] sm:grid-cols-2 md:grid-cols-3">
            {row.events.map((event) => {
              const gauge = event.tokenId
                ? ctx.boostableGauges.get(event.tokenId.toString())
                : undefined
              const pool = gauge
                ? ctx.poolsByGauge.get(gauge.toLowerCase())
                : undefined
              const label = pool
                ? `${pool.token0.symbol}/${pool.token1.symbol}`
                : gauge
                  ? shortenAddress(gauge)
                  : "—"
              return (
                <li
                  key={event.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="font-mono text-[var(--content-primary)]">
                    #{event.tokenId?.toString() ?? "?"}
                  </span>
                  <span className="truncate text-[var(--content-tertiary)]">
                    {label}
                  </span>
                  <span className="text-[var(--content-secondary)]">
                    {formatBoost(event.boost)}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function TxGroupRow({
  row,
  ctx,
  expanded,
  onToggle,
}: {
  row: Extract<Row, { kind: "txGroup" }>
  ctx: EnrichmentContext
  expanded: ExpandedSet
  onToggle: (key: string) => void
}) {
  const fmt = formatActivity(row.primary, ctx)
  const key = `group:${row.primary.id}`
  const isOpen = expanded.has(key)
  return (
    <div className="border-b border-[var(--border)] last:border-b-0">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => onToggle(key)}
        className={`grid w-full ${GRID_COLS} items-center gap-3 px-4 py-3 text-left text-sm text-[var(--content-primary)] transition-colors hover:bg-[var(--surface-secondary)]/40`}
      >
        <div className="flex min-w-0 items-start gap-2">
          <span aria-hidden="true" className="pt-0.5 text-base leading-none">
            {fmt.emoji}
          </span>
          <div className="min-w-0">
            <p className="truncate">{fmt.title}</p>
            <p className="truncate text-xs text-[var(--content-tertiary)]">
              {fmt.subtitle ?? ""}
              {fmt.subtitle ? " · " : ""}
              <span className="text-[#F7931A]">
                +{row.siblings.length} more in this tx
              </span>
            </p>
          </div>
        </div>
        <div className="min-w-0 truncate">
          <p>{fmt.amount ?? "—"}</p>
          {fmt.amountSubtext ? (
            <p className="text-[10px] text-[var(--content-tertiary)]">
              {fmt.amountSubtext}
            </p>
          ) : null}
        </div>
        <GaugeWhereCell where={fmt.where} />
        <span className="flex items-center justify-start">
          <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-xs text-[var(--content-secondary)]">
            {row.primary.source}
          </span>
        </span>
        <span className="text-xs text-[var(--content-tertiary)]">
          {formatRelativeTime(row.primary.timestamp)}
        </span>
        <span
          aria-hidden="true"
          className={`justify-self-end text-xs text-[var(--content-tertiary)] transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {isOpen ? (
        <Drawer
          fields={fmt.drawer}
          extra={
            <div className="mt-3 border-t border-[var(--border)] pt-2">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--content-tertiary)]">
                Sub-actions in this transaction
              </p>
              <ul className="space-y-1 text-xs">
                {row.siblings.map((sibling) => {
                  const sub = formatActivity(sibling, ctx)
                  return (
                    <li
                      key={sibling.id}
                      className="flex items-center justify-between gap-3 text-[var(--content-secondary)]"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span aria-hidden="true">{sub.emoji}</span>
                        <span className="truncate">{sub.title}</span>
                      </span>
                      <span className="flex-none text-[var(--content-tertiary)]">
                        {sub.amount ?? ""}
                        {sub.amount && sub.amountSubtext ? " " : ""}
                        {sub.amountSubtext ?? ""}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          }
        />
      ) : null}
    </div>
  )
}

function ActivityRow({
  row,
  ctx,
  expanded,
  onToggle,
}: {
  row: Row
  ctx: EnrichmentContext
  expanded: ExpandedSet
  onToggle: (key: string) => void
}) {
  if (row.kind === "single") {
    return (
      <SingleActivityRow
        item={row.item}
        ctx={ctx}
        expanded={expanded}
        onToggle={onToggle}
      />
    )
  }
  if (row.kind === "batchPoke") {
    return (
      <BatchPokeRow
        row={row}
        ctx={ctx}
        expanded={expanded}
        onToggle={onToggle}
      />
    )
  }
  return (
    <TxGroupRow row={row} ctx={ctx} expanded={expanded} onToggle={onToggle} />
  )
}

function IncentiveHistoryPanel({
  scope,
  onScopeChange,
}: {
  scope: IncentiveHistoryScope
  onScopeChange: (scope: IncentiveHistoryScope) => void
}) {
  const { epochs, isLoading, isError, error, isFetching } =
    useActivityIncentiveHistory()
  const [selectedEpochStart, setSelectedEpochStart] = useState<
    number | undefined
  >()

  useEffect(() => {
    if (epochs.length === 0) return
    setSelectedEpochStart((current) => {
      if (current && epochs.some((epoch) => epoch.epochStart === current)) {
        return current
      }
      return epochs[epochs.length - 1]?.epochStart
    })
  }, [epochs])

  const selectedIndex = Math.max(
    epochs.findIndex((epoch) => epoch.epochStart === selectedEpochStart),
    0,
  )
  const selectedEpoch =
    epochs[selectedIndex] ?? epochs[epochs.length - 1] ?? undefined
  const maxUsd = Math.max(...epochs.map((epoch) => scopedUsd(epoch, scope)), 1)
  const selectedUsd = selectedEpoch ? scopedUsd(selectedEpoch, scope) : 0
  const selectedEvents = selectedEpoch ? scopedEvents(selectedEpoch, scope) : 0
  const canGoBack = selectedIndex > 0
  const canGoForward = selectedIndex < epochs.length - 1

  const goToEpoch = (index: number) => {
    const next = epochs[index]
    if (next) setSelectedEpochStart(next.epochStart)
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 md:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-full rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-1 sm:w-auto">
          {INCENTIVE_SCOPE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => onScopeChange(option.key)}
              aria-pressed={scope === option.key}
              className={`min-h-0 flex-1 rounded-md px-3 py-1.5 text-sm transition-colors sm:flex-none ${
                scope === option.key
                  ? "bg-[var(--surface)] text-[#F7931A] shadow-sm"
                  : "text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--content-tertiary)]">
          Epoch history starts Apr 2
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase text-[var(--content-tertiary)]">
              Total incentives
            </p>
            <p className="mt-2 truncate font-mono text-2xl font-semibold tabular-nums text-[var(--content-primary)] md:text-3xl">
              ~{formatUsdDetailed(selectedUsd)}
            </p>
            <p className="mt-2 text-xs text-[var(--content-tertiary)]">
              {selectedEpoch
                ? `${formatEpochRange(selectedEpoch.epochStart, selectedEpoch.epochEnd)} · ${selectedEvents} deployment${
                    selectedEvents === 1 ? "" : "s"
                  }`
                : "Loading epoch"}
            </p>
          </div>

          <div className="flex flex-none items-center gap-1">
            <button
              type="button"
              onClick={() => goToEpoch(selectedIndex - 1)}
              disabled={!canGoBack}
              aria-label="Show previous epoch"
              className="flex size-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-lg text-[var(--content-secondary)] transition-colors hover:text-[#F7931A] disabled:cursor-not-allowed disabled:opacity-40"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => goToEpoch(selectedIndex + 1)}
              disabled={!canGoForward}
              aria-label="Show next epoch"
              className="flex size-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-lg text-[var(--content-secondary)] transition-colors hover:text-[#F7931A] disabled:cursor-not-allowed disabled:opacity-40"
            >
              ›
            </button>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs text-[var(--content-tertiary)]">
              Past epochs
            </p>
            <p className="text-xs text-[var(--content-tertiary)]">
              {isFetching && !isLoading ? "Refreshing..." : "USD deployed"}
            </p>
          </div>
          <div
            className="grid h-32 items-end gap-1.5"
            style={{
              gridTemplateColumns: `repeat(${Math.max(epochs.length, 1)}, minmax(18px, 1fr))`,
            }}
          >
            {epochs.map((epoch) => {
              const total = scopedUsd(epoch, scope)
              const barHeight =
                total > 0 ? Math.max((total / maxUsd) * 100, 8) : 0
              const isSelected = epoch.epochStart === selectedEpoch?.epochStart

              return (
                <button
                  key={epoch.epochStart}
                  type="button"
                  onClick={() => setSelectedEpochStart(epoch.epochStart)}
                  aria-label={`${formatEpochRange(epoch.epochStart, epoch.epochEnd)}: ${formatUsdCompact(total)}`}
                  aria-pressed={isSelected}
                  title={`${formatEpochRange(epoch.epochStart, epoch.epochEnd)} · ${formatUsdDetailed(total)}`}
                  className="flex h-full min-h-0 items-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#F7931A]"
                >
                  <span
                    className={`block w-full rounded-t-sm transition-colors ${
                      isSelected
                        ? "bg-[#F7931A]"
                        : "bg-[var(--content-muted)] hover:bg-[var(--content-secondary)]"
                    }`}
                    style={{ height: `${barHeight}%` }}
                  />
                </button>
              )
            })}
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--content-tertiary)]">
            <span>Apr 2</span>
            <span>
              {selectedEpoch
                ? `${selectedIndex + 1} / ${epochs.length}`
                : "0 / 0"}
            </span>
            <span>Current</span>
          </div>

          {isLoading ? (
            <p className="mt-3 text-xs text-[var(--content-tertiary)]">
              Loading incentive history...
            </p>
          ) : null}
          {isError ? (
            <p className="mt-3 text-xs text-[var(--negative)]">
              Failed to load incentive history:{" "}
              {error instanceof Error ? error.message : "unknown error"}
            </p>
          ) : null}
          {!isLoading &&
          !isError &&
          epochs.some((epoch) => epoch.unpricedEvents > 0) ? (
            <p className="mt-3 text-xs text-[var(--content-tertiary)]">
              Some token amounts are listed without USD value because pricing is
              unavailable.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

const PAGE_SIZE = 50

export default function MezoActivityPage() {
  const [tab, setTab] = useState<MezoActivityTab>("activity")
  const [incentiveScope, setIncentiveScope] =
    useState<IncentiveHistoryScope>("both")
  const [activityFilters, setActivityFilters] =
    useState<MezoActivityFilter[]>(ALL_ACTIVITY_FILTERS)
  const [systemFilters, setSystemFilters] =
    useState<MezoSystemFilter[]>(ALL_SYSTEM_FILTERS)
  const initialNow = useMemo(nowSeconds, [])
  const [fromDate, setFromDate] = useState(() =>
    toDateInputValue(initialNow - DEFAULT_FROM_OFFSET),
  )
  const [toDate, setToDate] = useState(() => toDateInputValue(initialNow))
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [isExporting, setIsExporting] = useState(false)
  const [page, setPage] = useState(0)
  const [jumpInput, setJumpInput] = useState("")
  const [maxKnownPage, setMaxKnownPage] = useState(0)
  const fromTimestamp = useMemo(() => fromDateInputValue(fromDate), [fromDate])
  const toTimestamp = useMemo(() => fromDateInputValue(toDate, true), [toDate])

  const allFilters = useMemo<MezoActivityFilter[]>(
    () => ALL_ACTIVITY_FILTERS,
    [],
  )
  const apiActionTypes =
    tab === "activity"
      ? (USER_ACTION_TYPES_GRAPHQL as readonly string[])
      : (SYSTEM_ACTION_TYPES_GRAPHQL as readonly string[])

  const { rawData, isLoading, isError, error, isFetching, hasMore } =
    useMezoActivity({
      filters: allFilters,
      fromTimestamp,
      toTimestamp,
      page,
      limit: PAGE_SIZE,
      actionTypes: apiActionTypes,
    })

  useEffect(() => {
    setMaxKnownPage((prev) => {
      const confirmed = hasMore ? page + 1 : page
      return Math.max(prev, confirmed)
    })
  }, [page, hasMore])

  // biome-ignore lint/correctness/useExhaustiveDependencies: setters are stable
  useEffect(() => {
    setPage(0)
    setMaxKnownPage(0)
  }, [fromTimestamp, toTimestamp, tab])

  const toggleExpanded = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleActivityFilter = (filter: MezoActivityFilter) => {
    setActivityFilters((current) =>
      current.includes(filter)
        ? current.filter((item) => item !== filter)
        : [...current, filter],
    )
  }

  const toggleSystemFilter = (filter: MezoSystemFilter) => {
    setSystemFilters((current) =>
      current.includes(filter)
        ? current.filter((item) => item !== filter)
        : [...current, filter],
    )
  }

  const { activityItems, systemItems } = useMemo(() => {
    const activity: MezoActivityItem[] = []
    const system: MezoActivityItem[] = []
    for (const item of rawData) {
      if (isSystemItem(item)) system.push(item)
      else activity.push(item)
    }
    return { activityItems: activity, systemItems: system }
  }, [rawData])

  const visibleActivityRows = useMemo(() => {
    const selected = new Set(activityFilters)
    const filtered = activityItems.filter((item) =>
      matchesActivityFilter(item, selected),
    )
    return buildActivityRows(filtered)
  }, [activityItems, activityFilters])

  const visibleSystemRows = useMemo(() => {
    const selected = new Set(systemFilters)
    const filtered = systemItems.filter((item) =>
      matchesSystemFilter(item, selected),
    )
    return buildSystemRows(filtered)
  }, [systemItems, systemFilters])

  const enrichmentInput = useMemo(() => {
    if (tab === "activity") return activityItems
    return systemItems
  }, [tab, activityItems, systemItems])
  const enrichment = useActivityEnrichment(enrichmentInput)

  const rows = tab === "activity" ? visibleActivityRows : visibleSystemRows
  const emptyText =
    tab === "activity"
      ? "No user activity matches your filters yet."
      : "No system events match your filters in this window."

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
      const header = [
        "timestamp",
        "actionType",
        "boostContext",
        "source",
        "actorAddress",
        "txFrom",
        "pokeMethod",
        "tokenId",
        "amount",
        "boost",
        "duration",
        "gaugeAddress",
        "txHash",
        "explorerUrl",
      ]
      const csv = [
        header.join(","),
        ...json.data.map((item) =>
          [
            csvEscape(item.timestamp),
            csvEscape(item.actionType),
            csvEscape(item.boostContext),
            csvEscape(item.source),
            csvEscape(item.actorAddress),
            csvEscape(item.txFrom),
            csvEscape(item.pokeMethod),
            csvEscape(item.tokenId),
            csvEscape(item.amount),
            csvEscape(item.boost),
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
            Live feed for veMEZO locks, BTC boosts, lock extensions, incentives
            and rewards across Mezo Earn. Switch to the System tab to see
            automated boost refreshes and protocol-level events.
          </p>
        </div>
      </SpringIn>

      <SpringIn delay={1} variant="card">
        <IncentiveHistoryPanel
          scope={incentiveScope}
          onScopeChange={setIncentiveScope}
        />
      </SpringIn>

      <SpringIn delay={2} variant="card">
        <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
            {(["activity", "system"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-pressed={tab === key}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === key
                    ? "bg-[#F7931A]/10 text-[#F7931A]"
                    : "text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
                }`}
              >
                {key === "activity" ? "Activity" : "System"}
              </button>
            ))}
            <span className="ml-auto text-xs text-[var(--content-tertiary)]">
              {tab === "activity"
                ? `${activityItems.length} user events loaded`
                : `${systemItems.length} system events loaded`}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {tab === "activity"
              ? ACTIVITY_FILTERS.map((f) => {
                  const active = activityFilters.includes(f.key)
                  return (
                    <button
                      key={f.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleActivityFilter(f.key)}
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
                })
              : SYSTEM_FILTERS.map((f) => {
                  const active = systemFilters.includes(f.key)
                  return (
                    <button
                      key={f.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleSystemFilter(f.key)}
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
                }}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-2 py-1 font-mono text-[var(--content-primary)]"
              />
            </label>
            <button
              type="button"
              onClick={exportCsv}
              disabled={isExporting}
              className="rounded-lg border border-[var(--border)] px-3 py-1 font-mono text-xs text-[var(--content-secondary)] transition-colors hover:text-[#F7931A] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isExporting ? "Exporting..." : "Export CSV"}
            </button>
          </div>
          <p className="text-xs leading-relaxed text-[var(--content-tertiary)]">
            Sourced from the Matchbox Explorer subgraph. Automated 4-hour boost
            refreshes from the protocol cron are collapsed on the System tab.
          </p>
        </div>
      </SpringIn>

      <SpringIn delay={3} variant="card">
        <div
          // Keying the rows container on the current page forces React to
          // unmount the previous page's row instances when the user paginates.
          // Without this, stale DOM (row drawers, etc.) could persist across
          // page transitions and make pagination look broken.
          key={`activity-rows-${tab}-${page}`}
          className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
        >
          <div
            className={`grid ${GRID_COLS} gap-3 border-b border-[var(--border)] px-4 py-3 text-xs uppercase tracking-wider text-[var(--content-tertiary)]`}
          >
            <span>Action</span>
            <span>Amount</span>
            <span>Where</span>
            <span>Source</span>
            <span>Time</span>
            <span aria-hidden="true" />
          </div>

          {isLoading && (
            <div className="px-4 py-8 text-sm text-[var(--content-secondary)]">
              Loading activity feed (page {page + 1})...
            </div>
          )}
          {isError && (
            <div className="px-4 py-8 text-sm text-red-400">
              Failed to load activity:{" "}
              {error instanceof Error ? error.message : "unknown"}
            </div>
          )}
          {!isLoading && !isError && rows.length === 0 && (
            <div className="px-4 py-8 text-sm text-[var(--content-secondary)]">
              {emptyText}
            </div>
          )}

          {!isLoading &&
            !isError &&
            rows.map((row) => (
              <ActivityRow
                key={
                  row.kind === "batchPoke"
                    ? `batch:${row.txHash}`
                    : row.kind === "txGroup"
                      ? `group:${row.primary.id}`
                      : `single:${row.item.id}`
                }
                row={row}
                ctx={enrichment}
                expanded={expanded}
                onToggle={toggleExpanded}
              />
            ))}
        </div>
      </SpringIn>

      <Pagination
        page={page}
        hasMore={hasMore}
        isFetching={isFetching}
        maxKnownPage={maxKnownPage}
        jumpInput={jumpInput}
        onJumpInputChange={setJumpInput}
        onJump={(target) => {
          if (!Number.isFinite(target) || target < 0) return
          setPage(target)
          setJumpInput("")
        }}
        onPrev={() => setPage((p) => Math.max(0, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />
    </div>
  )
}

function Pagination({
  page,
  hasMore,
  isFetching,
  maxKnownPage,
  jumpInput,
  onJumpInputChange,
  onJump,
  onPrev,
  onNext,
}: {
  page: number
  hasMore: boolean
  isFetching: boolean
  maxKnownPage: number
  jumpInput: string
  onJumpInputChange: (value: string) => void
  onJump: (target: number) => void
  onPrev: () => void
  onNext: () => void
}) {
  const visiblePages = useMemo(() => {
    const lastKnown = Math.max(maxKnownPage, page)
    const start = Math.max(0, page - 2)
    const end = Math.min(lastKnown, page + 2)
    const result: number[] = []
    for (let i = start; i <= end; i += 1) result.push(i)
    return result
  }, [page, maxKnownPage])

  const handleJump = (event: React.FormEvent) => {
    event.preventDefault()
    const target = Number.parseInt(jumpInput, 10) - 1
    onJump(target)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onPrev}
          disabled={page === 0 || isFetching}
          className="rounded-md border border-[var(--border)] px-2.5 py-1 font-mono text-xs text-[var(--content-secondary)] transition-colors hover:text-[#F7931A] disabled:cursor-not-allowed disabled:opacity-50"
        >
          ‹ Prev
        </button>
        {visiblePages[0] !== undefined && visiblePages[0] > 0 ? (
          <>
            <button
              type="button"
              onClick={() => onJump(0)}
              className="rounded-md px-2 py-1 font-mono text-xs text-[var(--content-secondary)] hover:text-[#F7931A]"
            >
              1
            </button>
            {visiblePages[0] > 1 ? (
              <span className="px-1 text-xs text-[var(--content-tertiary)]">
                …
              </span>
            ) : null}
          </>
        ) : null}
        {visiblePages.map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            onClick={() => onJump(pageNumber)}
            className={`rounded-md px-2 py-1 font-mono text-xs transition-colors ${
              pageNumber === page
                ? "border border-[#F7931A] bg-[#F7931A]/10 text-[#F7931A]"
                : "border border-transparent text-[var(--content-secondary)] hover:text-[#F7931A]"
            }`}
          >
            {pageNumber + 1}
          </button>
        ))}
        {hasMore ? (
          <span className="px-1 text-xs text-[var(--content-tertiary)]">…</span>
        ) : null}
        <button
          type="button"
          onClick={onNext}
          disabled={!hasMore || isFetching}
          className="rounded-md border border-[var(--border)] px-2.5 py-1 font-mono text-xs text-[var(--content-secondary)] transition-colors hover:text-[#F7931A] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next ›
        </button>
      </div>
      <form
        onSubmit={handleJump}
        className="flex items-center gap-2 text-xs text-[var(--content-tertiary)]"
      >
        <span>
          Page <span className="text-[var(--content-primary)]">{page + 1}</span>
          {hasMore || maxKnownPage > page ? "" : " (last)"}
        </span>
        <label className="flex items-center gap-1">
          Jump to
          <input
            type="number"
            min={1}
            value={jumpInput}
            onChange={(event) => onJumpInputChange(event.target.value)}
            className="w-16 rounded-md border border-[var(--border)] bg-[var(--surface-secondary)] px-2 py-1 font-mono text-xs text-[var(--content-primary)]"
            placeholder="#"
          />
        </label>
        <button
          type="submit"
          className="rounded-md border border-[var(--border)] px-2 py-1 font-mono text-xs text-[var(--content-secondary)] hover:text-[#F7931A]"
        >
          Go
        </button>
      </form>
    </div>
  )
}
