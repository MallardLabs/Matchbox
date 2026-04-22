import { SpringIn } from "@/components/SpringIn"
import type { GaugeProfile } from "@/config/supabase"
import { useAllGaugeProfiles } from "@/hooks/useGaugeProfiles"
import {
  type EpochVotesBundle,
  type GaugeVoteRow,
  useGaugeVotesByEpoch,
} from "@/hooks/useGaugeVotesByEpoch"
import { ChevronLeft, ChevronRight, Skeleton, Tag } from "@mezo-org/mezo-clay"
import { useMemo, useState } from "react"
import { formatUnits } from "viem"

type WeightBasis = "vebtc" | "vemezo"

const TOP_N = 12

const WEIGHT_BASIS_LABELS: Record<WeightBasis, string> = {
  vebtc: "veBTC",
  vemezo: "veMEZO",
}

const WEIGHT_BASIS_DESCRIPTIONS: Record<WeightBasis, string> = {
  vebtc: "BTC-backed vote allocation",
  vemezo: "MEZO-backed boost allocation",
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function formatEpochLabel(epochStart: number): string {
  const date = new Date(epochStart * 1000)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatShortEpochLabel(epochStart: number): string {
  const date = new Date(epochStart * 1000)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function safeBigInt(value: string | undefined | null): bigint {
  if (!value) return 0n
  try {
    return BigInt(value)
  } catch {
    return 0n
  }
}

function formatWeight(value: string | undefined | null): string {
  const big = safeBigInt(value)
  if (big === 0n) return "0"
  const num = Number(formatUnits(big, 18))
  if (!Number.isFinite(num)) return "0"
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
  if (num >= 1) return num.toFixed(2)
  return num.toFixed(4)
}

function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction) || fraction <= 0) return "0.00%"
  const pct = fraction * 100
  if (pct < 0.01) return "<0.01%"
  return `${pct.toFixed(2)}%`
}

function formatDelta(delta: number): {
  label: string
  sign: "up" | "down" | "zero"
} {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.0001) {
    return { label: "—", sign: "zero" }
  }
  const pct = delta * 100
  const sign = delta > 0 ? "up" : "down"
  const prefix = delta > 0 ? "+" : ""
  return {
    label: `${prefix}${pct.toFixed(2)}pp`,
    sign,
  }
}

type VoteRow = {
  gaugeAddress: string
  displayName: string
  currentWeight: bigint
  currentShare: number
  previousShare: number | null
  delta: number | null
  incentivesUsd: number
  isNew: boolean
  isDropped: boolean
}

function computeRows(
  current: EpochVotesBundle,
  previous: EpochVotesBundle | undefined,
  basis: WeightBasis,
  profileMap: Map<string, GaugeProfile>,
): VoteRow[] {
  const getWeight = (row: GaugeVoteRow) =>
    safeBigInt(basis === "vebtc" ? row.vebtcWeight : row.vemezoWeight)

  const totalBig = safeBigInt(
    basis === "vebtc" ? current.totalVebtcWeight : current.totalVemezoWeight,
  )

  const prevTotalBig = previous
    ? safeBigInt(
        basis === "vebtc"
          ? previous.totalVebtcWeight
          : previous.totalVemezoWeight,
      )
    : 0n

  const prevShareMap = new Map<string, number>()
  if (previous && prevTotalBig > 0n) {
    const prevTotalNum = Number(formatUnits(prevTotalBig, 18))
    for (const row of previous.gauges) {
      const w = getWeight(row)
      if (w === 0n) continue
      const shareNum = Number(formatUnits(w, 18)) / prevTotalNum
      prevShareMap.set(row.gaugeAddress.toLowerCase(), shareNum)
    }
  }

  const totalNum = totalBig > 0n ? Number(formatUnits(totalBig, 18)) : 0

  const rows: VoteRow[] = current.gauges.map((row) => {
    const weight = getWeight(row)
    const weightNum = Number(formatUnits(weight, 18))
    const share = totalNum > 0 ? weightNum / totalNum : 0
    const prevShare = prevShareMap.get(row.gaugeAddress.toLowerCase()) ?? null
    const delta = prevShare !== null ? share - prevShare : null
    const profile = profileMap.get(row.gaugeAddress.toLowerCase())
    const displayName =
      profile?.display_name ?? truncateAddress(row.gaugeAddress)

    return {
      gaugeAddress: row.gaugeAddress,
      displayName,
      currentWeight: weight,
      currentShare: share,
      previousShare: prevShare,
      delta,
      incentivesUsd: row.totalIncentivesUsd,
      isNew: prevShare === null && share > 0,
      isDropped: false,
    }
  })

  // Surface gauges that existed previously but dropped out entirely.
  const currentKeys = new Set(rows.map((r) => r.gaugeAddress.toLowerCase()))
  if (previous) {
    for (const [addr, prevShare] of prevShareMap.entries()) {
      if (currentKeys.has(addr)) continue
      if (prevShare <= 0) continue
      const profile = profileMap.get(addr)
      rows.push({
        gaugeAddress: addr,
        displayName: profile?.display_name ?? truncateAddress(addr),
        currentWeight: 0n,
        currentShare: 0,
        previousShare: prevShare,
        delta: -prevShare,
        incentivesUsd: 0,
        isNew: false,
        isDropped: true,
      })
    }
  }

  rows.sort((a, b) => {
    if (a.currentShare !== b.currentShare) {
      return b.currentShare - a.currentShare
    }
    return (b.previousShare ?? 0) - (a.previousShare ?? 0)
  })

  return rows
}

type BarRowProps = {
  row: VoteRow
  maxShare: number
  basis: WeightBasis
}

function BarRow({ row, maxShare, basis }: BarRowProps) {
  const widthPct =
    maxShare > 0 ? Math.max(2, (row.currentShare / maxShare) * 100) : 0
  const delta = row.delta !== null ? formatDelta(row.delta) : null

  const barColor = basis === "vebtc" ? "#F7931A" : "var(--positive)"

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_72px_72px] items-center gap-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="truncate font-mono text-sm text-[var(--content-primary)]"
            title={row.gaugeAddress}
          >
            {row.displayName}
          </span>
          {row.isNew && (
            <Tag closeable={false} color="green">
              new
            </Tag>
          )}
          {row.isDropped && (
            <Tag closeable={false} color="gray">
              dropped
            </Tag>
          )}
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-sm bg-[var(--surface-secondary)]">
          <div
            className="h-full rounded-sm transition-[width] duration-500"
            style={{
              width: `${widthPct}%`,
              backgroundColor: barColor,
              opacity: row.isDropped ? 0.25 : 0.9,
            }}
          />
        </div>
      </div>
      <div className="text-right font-mono text-sm text-[var(--content-primary)]">
        {formatPercent(row.currentShare)}
      </div>
      <div className="text-right font-mono text-xs">
        {delta ? (
          <span
            className={
              delta.sign === "up"
                ? "text-[var(--positive)]"
                : delta.sign === "down"
                  ? "text-[var(--negative)]"
                  : "text-[var(--content-tertiary)]"
            }
          >
            {delta.label}
          </span>
        ) : (
          <span className="text-[var(--content-tertiary)]">—</span>
        )}
      </div>
    </div>
  )
}

type BasisPillProps = {
  basis: WeightBasis
  activeBasis: WeightBasis
  onClick: (b: WeightBasis) => void
}

function BasisPill({ basis, activeBasis, onClick }: BasisPillProps) {
  const isActive = basis === activeBasis
  return (
    <button
      type="button"
      onClick={() => onClick(basis)}
      className={`rounded-md border px-2.5 py-1 font-mono text-2xs uppercase tracking-wider transition-colors ${
        isActive
          ? "border-[#F7931A] bg-brand-subtle text-[#F7931A]"
          : "border-[var(--border)] text-[var(--content-secondary)] hover:bg-[var(--surface-secondary)]"
      }`}
    >
      {WEIGHT_BASIS_LABELS[basis]}
    </button>
  )
}

export function AnalyticsGaugeVotes(): JSX.Element {
  const [basis, setBasis] = useState<WeightBasis>("vebtc")
  const [epochIndex, setEpochIndex] = useState(0)
  const [showAll, setShowAll] = useState(false)

  const { epochs, isLoading } = useGaugeVotesByEpoch(12)
  const { profiles } = useAllGaugeProfiles()

  const safeIndex = Math.min(epochIndex, Math.max(0, epochs.length - 1))
  const current = epochs[safeIndex]
  const previous = epochs[safeIndex + 1]

  const rows = useMemo(() => {
    if (!current) return []
    return computeRows(current, previous, basis, profiles)
  }, [current, previous, basis, profiles])

  const visibleRows = showAll ? rows : rows.slice(0, TOP_N)

  const maxShare = rows.reduce(
    (max, r) => (r.currentShare > max ? r.currentShare : max),
    0,
  )

  const canGoOlder = safeIndex < epochs.length - 1
  const canGoNewer = safeIndex > 0

  const epochLabel = current ? formatEpochLabel(current.epochStart) : "—"
  const isLatest = safeIndex === 0

  return (
    <SpringIn delay={5} variant="default">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6 shadow-terminal-sm">
        <header className="mb-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-mono text-lg font-bold text-[var(--content-primary)]">
              <span className="text-[#F7931A]">$</span> gauge vote share
            </h2>
            <p className="mt-1 font-mono text-xs text-[var(--content-secondary)]">
              {WEIGHT_BASIS_DESCRIPTIONS[basis]} across all gauges
            </p>
          </div>
          <div className="flex items-center gap-1">
            <BasisPill basis="vebtc" activeBasis={basis} onClick={setBasis} />
            <BasisPill basis="vemezo" activeBasis={basis} onClick={setBasis} />
          </div>
        </header>

        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setEpochIndex((i) => Math.min(i + 1, epochs.length - 1))
              }
              disabled={!canGoOlder}
              aria-label="Previous epoch"
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-1.5 font-mono text-[var(--content-secondary)] transition-colors hover:bg-[var(--surface-elevated)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="flex flex-col">
              <span className="font-mono text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                epoch
              </span>
              <span className="font-mono text-sm font-bold text-[var(--content-primary)]">
                {epochLabel}
                {isLatest && (
                  <span className="ml-2 font-normal text-2xs text-[#F7931A]">
                    current
                  </span>
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setEpochIndex((i) => Math.max(i - 1, 0))}
              disabled={!canGoNewer}
              aria-label="Next epoch"
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-1.5 font-mono text-[var(--content-secondary)] transition-colors hover:bg-[var(--surface-elevated)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {epochs.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 overflow-x-auto">
              {epochs.map((e, idx) => (
                <button
                  key={e.epochStart}
                  type="button"
                  onClick={() => setEpochIndex(idx)}
                  className={`rounded border px-1.5 py-0.5 font-mono text-2xs transition-colors ${
                    idx === safeIndex
                      ? "border-[#F7931A] bg-brand-subtle text-[#F7931A]"
                      : "border-[var(--border)] text-[var(--content-tertiary)] hover:bg-[var(--surface-elevated)]"
                  }`}
                  title={formatEpochLabel(e.epochStart)}
                >
                  {formatShortEpochLabel(e.epochStart)}
                </button>
              ))}
            </div>
          )}
        </div>

        {current && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatBox
              label={`total ${WEIGHT_BASIS_LABELS[basis]}`}
              value={formatWeight(
                basis === "vebtc"
                  ? current.totalVebtcWeight
                  : current.totalVemezoWeight,
              )}
            />
            <StatBox
              label="active gauges"
              value={rows.filter((r) => r.currentShare > 0).length.toString()}
            />
            <StatBox
              label="incentives (epoch)"
              value={`$${current.totalIncentivesUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            />
            <StatBox label="top gauge share" value={formatPercent(maxShare)} />
          </div>
        )}

        {isLoading && rows.length === 0 ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} height="36px" width="100%" animation />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-secondary)] p-8 text-center">
            <p className="font-mono text-sm text-[var(--content-secondary)]">
              <span className="text-[#F7931A]">$</span> no vote data for this
              epoch
            </p>
            <p className="mt-2 font-mono text-xs text-[var(--content-tertiary)]">
              Vote weights will appear once gauge history is recorded
            </p>
          </div>
        ) : (
          <>
            <div className="mb-2 grid grid-cols-[minmax(0,1fr)_72px_72px] items-center gap-3 border-b border-[var(--border)] pb-2 font-mono text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              <div>Gauge</div>
              <div className="text-right">Share</div>
              <div className="text-right">Δ vs prev</div>
            </div>
            <div className="flex flex-col divide-y divide-[var(--border-subtle)]">
              {visibleRows.map((row) => (
                <BarRow
                  key={row.gaugeAddress}
                  row={row}
                  maxShare={maxShare}
                  basis={basis}
                />
              ))}
            </div>
            {rows.length > TOP_N && (
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowAll((s) => !s)}
                  className="rounded-md border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-1 font-mono text-2xs uppercase tracking-wider text-[var(--content-secondary)] transition-colors hover:bg-[var(--surface-elevated)]"
                >
                  {showAll
                    ? `collapse to top ${TOP_N}`
                    : `show all ${rows.length} gauges`}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </SpringIn>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-3">
      <div className="font-mono text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
        {label}
      </div>
      <div className="mt-1 font-mono text-sm font-bold text-[var(--content-primary)]">
        {value}
      </div>
    </div>
  )
}

export default AnalyticsGaugeVotes
