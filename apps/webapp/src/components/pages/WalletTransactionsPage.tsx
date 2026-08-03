import { SpringIn } from "@/components/SpringIn"
import { useNetwork } from "@/contexts/NetworkContext"
import { useActivityEnrichment } from "@/hooks/useActivityEnrichment"
import { useWalletTransactions } from "@/hooks/useWalletTransactions"
import { WALLET_ACTION_TYPES_GRAPHQL } from "@/lib/mezoActivity/constants"
import {
  type EnrichmentContext,
  formatActivity,
} from "@/lib/mezoActivity/format"
import { groupActivityByTx } from "@/lib/mezoActivity/normalize"
import type {
  MezoActivityApiResponse,
  MezoActivityFilter,
  MezoActivityItem,
} from "@/types/mezoActivity"
import { useWalletAccount } from "@mezo-org/passport"
import { CHAIN_ID } from "@repo/shared/contracts"
import dynamic from "next/dynamic"
import { useEffect, useMemo, useState } from "react"

const ConnectWalletDrawer = dynamic(
  () =>
    import("@/components/ConnectWalletDrawer").then(
      (mod) => mod.ConnectWalletDrawer,
    ),
  { ssr: false },
)

const WALLET_FILTERS: Array<{ key: MezoActivityFilter; label: string }> = [
  { key: "locks", label: "Locks" },
  { key: "boostMatchbox", label: "Votes (pools)" },
  { key: "boostPair", label: "Boost (veBTC)" },
  { key: "claims", label: "Claims" },
  { key: "capital", label: "Capital" },
  { key: "swaps", label: "Swaps" },
  { key: "extensions", label: "Extensions" },
  { key: "incentives", label: "Incentives" },
]

const ALL_WALLET_FILTERS = WALLET_FILTERS.map((f) => f.key)

const PAGE_SIZE = 50
const DEFAULT_FROM_OFFSET = 30 * 86_400
const GRID_COLS = "grid-cols-[1.6fr_0.8fr_1.2fr_0.8fr_0.3fr]"

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

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

function formatAbsoluteTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function csvEscape(value: string | number | bigint | undefined): string {
  const raw = value === undefined ? "" : value.toString()
  return `"${raw.replaceAll('"', '""')}"`
}

type Row =
  | { kind: "single"; item: MezoActivityItem }
  | {
      kind: "txGroup"
      primary: MezoActivityItem
      siblings: MezoActivityItem[]
    }

type ExpandedSet = ReadonlySet<string>

function buildRows(items: MezoActivityItem[], groupByTx: boolean): Row[] {
  if (!groupByTx) {
    return items.map((item) => ({ kind: "single" as const, item }))
  }
  const grouped = groupActivityByTx(items)
  return grouped.map((group) =>
    group.siblings.length === 0
      ? { kind: "single" as const, item: group.primary }
      : {
          kind: "txGroup" as const,
          primary: group.primary,
          siblings: group.siblings,
        },
  )
}

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

function SingleTransactionRow({
  item,
  ctx,
  expanded,
  onToggle,
}: {
  item: MezoActivityItem
  ctx: EnrichmentContext
  expanded: ExpandedSet
  onToggle: (key: string) => void
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
          </div>
        </div>
        <div className="min-w-0 truncate">
          <p className="font-mono text-[var(--content-primary)]">
            {fmt.amount ?? "—"}
          </p>
          {fmt.amountSubtext ? (
            <p className="text-[10px] text-[var(--content-tertiary)]">
              {fmt.amountSubtext}
            </p>
          ) : null}
        </div>
        <GaugeWhereCell where={fmt.where} />
        <div className="min-w-0">
          <p className="text-xs text-[var(--content-secondary)]">
            {formatRelativeTime(item.timestamp)}
          </p>
          <p className="truncate text-[10px] text-[var(--content-tertiary)]">
            {formatAbsoluteTime(item.timestamp)}
          </p>
        </div>
        <span
          aria-hidden="true"
          className={`justify-self-end text-xs text-[var(--content-tertiary)] transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {isOpen ? <Drawer fields={fmt.drawer} /> : null}
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
          <p className="font-mono">{fmt.amount ?? "—"}</p>
          {fmt.amountSubtext ? (
            <p className="text-[10px] text-[var(--content-tertiary)]">
              {fmt.amountSubtext}
            </p>
          ) : null}
        </div>
        <GaugeWhereCell where={fmt.where} />
        <div className="min-w-0">
          <p className="text-xs text-[var(--content-secondary)]">
            {formatRelativeTime(row.primary.timestamp)}
          </p>
          <p className="truncate text-[10px] text-[var(--content-tertiary)]">
            {formatAbsoluteTime(row.primary.timestamp)}
          </p>
        </div>
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
                      <span className="flex-none font-mono text-[var(--content-tertiary)]">
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

function TransactionRow({
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
  if (row.kind === "txGroup") {
    return (
      <TxGroupRow row={row} ctx={ctx} expanded={expanded} onToggle={onToggle} />
    )
  }
  return (
    <SingleTransactionRow
      item={row.item}
      ctx={ctx}
      expanded={expanded}
      onToggle={onToggle}
    />
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

export default function WalletTransactionsPage() {
  const { accountAddress, isConnected } = useWalletAccount()
  const { chainId } = useNetwork()
  const networkLabel = chainId === CHAIN_ID.testnet ? "testnet" : "mainnet"
  const [connectOpen, setConnectOpen] = useState(false)
  const [filters, setFilters] =
    useState<MezoActivityFilter[]>(ALL_WALLET_FILTERS)
  const [groupByTx, setGroupByTx] = useState(true)
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

  const { data, rawData, isLoading, isError, error, isFetching, hasMore } =
    useWalletTransactions({
      actor: accountAddress,
      filters,
      fromTimestamp,
      toTimestamp,
      page,
      limit: PAGE_SIZE,
      actionTypes: WALLET_ACTION_TYPES_GRAPHQL,
    })

  useEffect(() => {
    setMaxKnownPage((prev) => {
      const confirmed = hasMore ? page + 1 : page
      return Math.max(prev, confirmed)
    })
  }, [page, hasMore])

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset paging when range changes
  useEffect(() => {
    setPage(0)
    setMaxKnownPage(0)
  }, [fromTimestamp, toTimestamp, accountAddress])

  const toggleExpanded = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleFilter = (filter: MezoActivityFilter) => {
    setFilters((current) =>
      current.includes(filter)
        ? current.filter((item) => item !== filter)
        : [...current, filter],
    )
  }

  const enrichment = useActivityEnrichment(rawData)
  const rows = useMemo(() => buildRows(data, groupByTx), [data, groupByTx])

  const exportCsv = async () => {
    if (!accountAddress) return
    setIsExporting(true)
    try {
      const params = new URLSearchParams({
        network: networkLabel,
        actor: accountAddress,
        from: fromTimestamp.toString(),
        to: toTimestamp.toString(),
        limit: "1000",
        actionTypes: WALLET_ACTION_TYPES_GRAPHQL.join(","),
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
        "tokenId",
        "amount",
        "firstRecipientAmount",
        "secondRecipientAmount",
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
            csvEscape(item.tokenId),
            csvEscape(item.amount),
            csvEscape(item.firstRecipientAmount),
            csvEscape(item.secondRecipientAmount),
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
      link.download = `matchbox-transactions-${networkLabel}-${fromDate}-to-${toDate}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } finally {
      setIsExporting(false)
    }
  }

  if (!isConnected) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:py-12">
        <SpringIn delay={0} variant="card">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h1 className="font-mono text-2xl text-[var(--content-primary)] md:text-3xl">
              Your transactions
            </h1>
            <p className="mt-2 text-sm text-[var(--content-secondary)]">
              Personal Mezo activity ledger for locks, votes, claims, and
              capital moves.
            </p>
          </div>
        </SpringIn>
        <SpringIn delay={1} variant="card">
          <div className="flex flex-col items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
            <p className="text-sm text-[var(--content-secondary)]">
              Connect your wallet to view your transaction history.
            </p>
            <button
              type="button"
              onClick={() => setConnectOpen(true)}
              className="rounded-2xl bg-[var(--accent)] px-6 py-3 font-semibold text-white transition-opacity hover:opacity-90"
            >
              Connect wallet
            </button>
          </div>
        </SpringIn>
        <ConnectWalletDrawer
          isOpen={connectOpen}
          onClose={() => setConnectOpen(false)}
        />
      </div>
    )
  }

  if (!accountAddress) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:py-12">
        <SpringIn delay={0} variant="card">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h1 className="font-mono text-2xl text-[var(--content-primary)] md:text-3xl">
              Your transactions
            </h1>
            <p className="mt-2 text-sm text-[var(--content-secondary)]">
              Finish wallet setup so your EVM smart account is ready. History is
              scoped to that address — not your Bitcoin receive address.
            </p>
          </div>
        </SpringIn>
        <SpringIn delay={1} variant="card">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-12 text-center text-sm text-[var(--content-secondary)]">
            Waiting for smart account… open the wallet drawer to complete setup.
          </div>
        </SpringIn>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:py-12">
      <SpringIn delay={0} variant="card">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h1 className="font-mono text-2xl text-[var(--content-primary)] md:text-3xl">
            Your transactions
          </h1>
          <p className="mt-2 text-sm text-[var(--content-secondary)]">
            Personal Mezo activity ledger for your locks, votes, claims,
            liquidity, and swaps. For the full protocol feed, see{" "}
            <a
              href="/activity"
              className="text-[#F7931A] no-underline hover:underline"
            >
              global activity
            </a>
            .
          </p>
          <p className="mt-1 font-mono text-xs text-[var(--content-tertiary)]">
            {accountAddress}
          </p>
        </div>
      </SpringIn>

      <SpringIn delay={1} variant="card">
        <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-xs text-[var(--content-tertiary)]">
              {data.length} event{data.length === 1 ? "" : "s"} loaded
            </span>
            <label className="ml-auto inline-flex items-center gap-2 text-xs text-[var(--content-secondary)]">
              <input
                type="checkbox"
                checked={groupByTx}
                onChange={(event) => setGroupByTx(event.target.checked)}
                className="rounded border-[var(--border)]"
              />
              Group by transaction
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {WALLET_FILTERS.map((f) => {
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
                onChange={(event) => setFromDate(event.target.value)}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-2 py-1 font-mono text-[var(--content-primary)]"
              />
            </label>
            <label className="flex items-center gap-2">
              To
              <input
                type="date"
                value={toDate}
                min={fromDate}
                onChange={(event) => setToDate(event.target.value)}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] px-2 py-1 font-mono text-[var(--content-primary)]"
              />
            </label>
            <button
              type="button"
              onClick={() => void exportCsv()}
              disabled={isExporting}
              className="rounded-lg border border-[var(--border)] px-3 py-1 font-mono text-xs text-[var(--content-secondary)] transition-colors hover:text-[#F7931A] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isExporting ? "Exporting..." : "Export CSV"}
            </button>
          </div>
          <p className="text-xs leading-relaxed text-[var(--content-tertiary)]">
            Sourced from Matchbox Explorer for your connected EVM smart account.
            Indexing may lag a minute after on-chain actions.
          </p>
        </div>
      </SpringIn>

      <SpringIn delay={2} variant="card">
        <div
          key={`tx-rows-${page}-${groupByTx ? "g" : "f"}`}
          className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
        >
          <div
            className={`grid ${GRID_COLS} gap-3 border-b border-[var(--border)] px-4 py-3 text-xs uppercase tracking-wider text-[var(--content-tertiary)]`}
          >
            <span>Action</span>
            <span>Amount</span>
            <span>Where</span>
            <span>Time</span>
            <span aria-hidden="true" />
          </div>

          {isLoading ? (
            <div className="space-y-0">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
                  key={index}
                  className="border-b border-[var(--border)] px-4 py-4 last:border-b-0"
                >
                  <div className="h-5 w-2/3 animate-pulse rounded bg-[var(--border)]" />
                  <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-[var(--border)]" />
                </div>
              ))}
            </div>
          ) : null}

          {isError ? (
            <div className="px-4 py-8 text-sm text-red-400">
              Failed to load transactions:{" "}
              {error instanceof Error ? error.message : "unknown"}
            </div>
          ) : null}

          {!isLoading && !isError && rows.length === 0 ? (
            <div className="px-4 py-8 text-sm text-[var(--content-secondary)]">
              No activity yet for this account and filter set.
            </div>
          ) : null}

          {!isLoading &&
            !isError &&
            rows.map((row) => (
              <TransactionRow
                key={
                  row.kind === "txGroup"
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
