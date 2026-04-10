import { TokenIcon } from "@/components/TokenIcon"
import { Card, Tag } from "@mezo-org/mezo-clay"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { formatUnits } from "viem"

function ChevronLeftIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function ChevronRightIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

// Format token values with appropriate precision
function formatTokenValue(amount: bigint, decimals: number): string {
  const value = Number(formatUnits(amount, decimals))
  if (value === 0) return "0"
  if (value >= 1000)
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (value >= 1)
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
  if (value >= 0.0001)
    return value.toLocaleString(undefined, { maximumFractionDigits: 6 })
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 8,
    minimumSignificantDigits: 1,
  })
}

// Format APY value
function formatAPY(apy: number): string {
  if (apy === Number.POSITIVE_INFINITY) return "∞%"
  if (apy >= 1000) return `${(apy / 1000).toFixed(1)}k%`
  return `${apy.toFixed(1)}%`
}

export interface LockItem {
  tokenId: bigint
  amount: bigint
  votingPower: bigint
  isPermanent?: boolean
  end?: bigint
}

// Extended lock data for rich cards
export interface VeMEZOLockData extends LockItem {
  canVote?: boolean
  usedWeight?: bigint
  lastVoted?: bigint
  hasVotedThisEpoch?: boolean
  claimableUSD?: number | null
  upcomingAPY?: number | null
  projectedAPY?: number | null // Dynamic APY based on pending vote allocations
  isLoadingUsedWeight?: boolean
  isLoadingAPY?: boolean
}

export interface VeBTCLockData extends LockItem {
  profilePictureUrl?: string | null
  displayName?: string | null
  description?: string | null
  hasGauge?: boolean
  boostMultiplier?: number
  gaugeAPY?: number | null
}

interface LockCarouselSelectorProps<T extends LockItem> {
  locks: T[]
  // Single-select API (existing)
  selectedIndex?: number | undefined
  onSelect?: (index: number) => void
  // Multi-select API (opt-in)
  multiSelect?: boolean
  selectedIndexes?: Set<number>
  onToggle?: (index: number) => void
  lockType: "veMEZO" | "veBTC"
  label?: string
  renderCard?: (lock: T, index: number, isSelected: boolean) => React.ReactNode
}

// Dashboard-style card for veMEZO locks
function DashboardVeMEZOCard({
  lock,
  isSelected,
}: {
  lock: VeMEZOLockData
  isSelected: boolean
}) {
  const unlockDate = lock.end ? new Date(Number(lock.end) * 1000) : null
  const isExpired = unlockDate ? unlockDate < new Date() : false

  const hasClaimable =
    lock.claimableUSD !== null &&
    lock.claimableUSD !== undefined &&
    lock.claimableUSD > 0
  const hasAPY =
    hasClaimable ||
    (lock.upcomingAPY !== null &&
      lock.upcomingAPY !== undefined &&
      lock.upcomingAPY > 0) ||
    (lock.projectedAPY !== null &&
      lock.projectedAPY !== undefined &&
      lock.projectedAPY > 0)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--content-primary)]">
              veMEZO #{lock.tokenId.toString()}
            </span>
            {isSelected && (
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#F7931A]">
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#0B0B0B"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            )}
          </div>
          {lock.isLoadingAPY ? (
            <div className="mt-1">
              <span className="inline-flex items-center rounded border border-[var(--border)] bg-[var(--surface-secondary)] px-1.5 py-0.5 text-[11px] text-[var(--content-tertiary)]">
                Loading...
              </span>
            </div>
          ) : (
            hasAPY && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {/* Projected APY from pending votes (shown prominently) */}
                {lock.projectedAPY !== null &&
                  lock.projectedAPY !== undefined &&
                  lock.projectedAPY > 0 && (
                    <span
                      className="inline-flex items-center rounded border border-[rgba(247,147,26,0.4)] bg-[rgba(247,147,26,0.15)] px-1.5 py-0.5 text-[11px] font-semibold text-[#F7931A]"
                      title="Projected APY based on your pending votes"
                    >
                      {formatAPY(lock.projectedAPY)} APY
                    </span>
                  )}
                {/* Upcoming APY from on-chain votes (shown when no projected) */}
                {lock.upcomingAPY !== null &&
                  lock.upcomingAPY !== undefined &&
                  lock.upcomingAPY > 0 &&
                  !(
                    lock.projectedAPY !== null &&
                    lock.projectedAPY !== undefined &&
                    lock.projectedAPY > 0
                  ) && (
                    <span className="inline-flex items-center rounded border border-[rgba(var(--positive-rgb),0.3)] bg-[rgba(var(--positive-rgb),0.15)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--positive)]">
                      {formatAPY(lock.upcomingAPY)} APY
                    </span>
                  )}
                {/* Claimable rewards USD */}
                {hasClaimable &&
                  !(
                    lock.projectedAPY !== null &&
                    lock.projectedAPY !== undefined &&
                    lock.projectedAPY > 0
                  ) && (
                    <span
                      className="inline-flex items-center rounded-sm border border-[var(--border)] bg-[var(--surface-secondary)] px-1 py-0.5 text-[9px] font-medium text-[var(--content-secondary)]"
                      title="Total unclaimed rewards"
                    >
                      ${(lock.claimableUSD ?? 0).toFixed(2)} claimable
                    </span>
                  )}
              </div>
            )
          )}
        </div>
        <Tag
          closeable={false}
          color={lock.isPermanent ? "green" : isExpired ? "red" : "yellow"}
        >
          {lock.isPermanent ? "Permanent" : isExpired ? "Expired" : "Active"}
        </Tag>
      </div>

      {/* Stats grid */}
      <div className="mb-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <div>
          <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
            Locked Amount
          </p>
          <div className="flex items-center gap-1.5">
            <TokenIcon symbol="MEZO" size={16} />
            <span className="font-mono text-sm font-medium tabular-nums text-[var(--content-primary)]">
              {formatTokenValue(lock.amount, 18)}
            </span>
          </div>
        </div>
        <div>
          <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
            Voting Power
          </p>
          <span className="font-mono text-sm font-medium tabular-nums text-[var(--content-primary)]">
            {formatTokenValue(lock.votingPower, 18)}
          </span>
        </div>
        <div>
          <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
            {lock.isLoadingUsedWeight
              ? "Allocation"
              : lock.hasVotedThisEpoch
                ? "Allocated"
                : lock.usedWeight && lock.usedWeight > 0n
                  ? "Prior Allocation"
                  : "Allocation"}
          </p>
          {lock.isLoadingUsedWeight ? (
            <span className="font-mono text-sm text-[var(--content-tertiary)]">
              —
            </span>
          ) : (
            <span
              className={`font-mono text-sm font-medium tabular-nums ${
                lock.hasVotedThisEpoch
                  ? "text-[var(--content-primary)]"
                  : lock.usedWeight && lock.usedWeight > 0n
                    ? "text-[var(--content-tertiary)]"
                    : "text-[var(--content-primary)]"
              }`}
            >
              {lock.usedWeight ? formatTokenValue(lock.usedWeight, 18) : "0"}
            </span>
          )}
        </div>
        <div>
          <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
            Can Vote
          </p>
          {lock.isLoadingUsedWeight ? (
            <span className="text-sm text-[var(--content-tertiary)]">—</span>
          ) : lock.canVote ? (
            <span className="text-sm font-medium text-[var(--positive)]">
              Vote Now
            </span>
          ) : lock.hasVotedThisEpoch ? (
            <span className="text-sm font-medium text-[var(--content-tertiary)]">
              Voted
            </span>
          ) : (
            <span className="text-sm font-medium text-[var(--warning)]">
              Window Closed
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto border-t border-[var(--border)] pt-3">
        <p className="text-xs text-[var(--content-secondary)]">
          Unlocks:{" "}
          {lock.isPermanent ? "Never" : unlockDate?.toLocaleDateString()}
        </p>
      </div>
    </div>
  )
}

// Dashboard-style card for veBTC locks
function DashboardVeBTCCard({
  lock,
  isSelected,
}: {
  lock: VeBTCLockData
  isSelected: boolean
}) {
  const unlockDate = lock.end ? new Date(Number(lock.end) * 1000) : null
  const isExpired = unlockDate ? unlockDate < new Date() : false

  return (
    <div className="flex h-full flex-col">
      {/* Header with profile */}
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* Profile Picture */}
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-secondary)]">
            {lock.profilePictureUrl ? (
              <img
                src={lock.profilePictureUrl}
                alt={`veBTC #${lock.tokenId.toString()}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xs text-[var(--content-secondary)]">
                #{lock.tokenId.toString()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`truncate text-sm font-medium ${
                  lock.displayName
                    ? "text-[var(--positive)]"
                    : "text-[var(--content-primary)]"
                }`}
              >
                {lock.displayName || `veBTC #${lock.tokenId.toString()}`}
              </span>
              {lock.displayName && (
                <span className="inline-flex items-center rounded bg-[rgba(247,147,26,0.15)] border border-[rgba(247,147,26,0.3)] px-1.5 py-0.5 font-mono text-2xs font-semibold tracking-wide text-[#F7931A]">
                  #{lock.tokenId.toString()}
                </span>
              )}
              {isSelected && (
                <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#F7931A]">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#0B0B0B"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}
            </div>
            {lock.hasGauge &&
              lock.gaugeAPY !== null &&
              lock.gaugeAPY !== undefined &&
              lock.gaugeAPY > 0 && (
                <div className="mt-1 flex w-fit items-center rounded border border-[var(--positive-subtle)] bg-[var(--positive-subtle)] px-1.5 py-0.5">
                  <span className="text-xs font-medium text-[var(--positive)]">
                    {formatAPY(lock.gaugeAPY)} APY
                  </span>
                </div>
              )}
          </div>
        </div>
        <Tag
          closeable={false}
          color={lock.isPermanent ? "green" : isExpired ? "red" : "yellow"}
        >
          {lock.isPermanent ? "Permanent" : isExpired ? "Expired" : "Active"}
        </Tag>
      </div>

      {/* Stats grid */}
      <div className="mb-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <div>
          <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
            Locked Amount
          </p>
          <div className="flex items-center gap-1.5">
            <TokenIcon symbol="BTC" size={16} />
            <span className="font-mono text-sm font-medium tabular-nums text-[var(--content-primary)]">
              {formatTokenValue(lock.amount, 18)}
            </span>
          </div>
        </div>
        <div>
          <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
            Voting Power
          </p>
          <span className="font-mono text-sm font-medium tabular-nums text-[var(--content-primary)]">
            {formatTokenValue(lock.votingPower, 18)}
          </span>
        </div>
        <div>
          <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
            Current Boost
          </p>
          <span
            className={`font-mono text-sm font-medium tabular-nums ${
              lock.boostMultiplier && lock.boostMultiplier > 1
                ? "text-[var(--positive)]"
                : "text-[var(--content-primary)]"
            }`}
          >
            {lock.boostMultiplier?.toFixed(2) ?? "1.00"}x
          </span>
        </div>
        <div>
          <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
            Gauge
          </p>
          <span
            className={`text-sm font-medium ${
              lock.hasGauge
                ? "text-[var(--positive)]"
                : "text-[var(--content-secondary)]"
            }`}
          >
            {lock.hasGauge ? "Active" : "No Gauge"}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto border-t border-[var(--border)] pt-3">
        <p className="text-xs text-[var(--content-secondary)]">
          Unlocks:{" "}
          {lock.isPermanent ? "Never" : unlockDate?.toLocaleDateString()}
        </p>
      </div>
    </div>
  )
}

// Simple fallback card
function SimpleDashboardCard({
  lock,
  lockType,
  isSelected,
}: {
  lock: LockItem
  lockType: "veMEZO" | "veBTC"
  isSelected: boolean
}) {
  const tokenSymbol = lockType === "veMEZO" ? "MEZO" : "BTC"
  const unlockDate = lock.end ? new Date(Number(lock.end) * 1000) : null
  const isExpired = unlockDate ? unlockDate < new Date() : false

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--content-primary)]">
            {lockType} #{lock.tokenId.toString()}
          </span>
          {isSelected && (
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#F7931A]">
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#0B0B0B"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          )}
        </div>
        <Tag
          closeable={false}
          color={lock.isPermanent ? "green" : isExpired ? "red" : "yellow"}
        >
          {lock.isPermanent ? "Permanent" : isExpired ? "Expired" : "Active"}
        </Tag>
      </div>

      {/* Stats */}
      <div className="mb-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <div>
          <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
            Locked Amount
          </p>
          <div className="flex items-center gap-1.5">
            <TokenIcon symbol={tokenSymbol} size={16} />
            <span className="font-mono text-sm font-medium tabular-nums text-[var(--content-primary)]">
              {formatTokenValue(lock.amount, 18)}
            </span>
          </div>
        </div>
        <div>
          <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
            Voting Power
          </p>
          <span className="font-mono text-sm font-medium tabular-nums text-[var(--content-primary)]">
            {formatTokenValue(lock.votingPower, 18)}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto border-t border-[var(--border)] pt-3">
        <p className="text-xs text-[var(--content-secondary)]">
          Unlocks:{" "}
          {lock.isPermanent ? "Never" : unlockDate?.toLocaleDateString()}
        </p>
      </div>
    </div>
  )
}

export function LockCarouselSelector<T extends LockItem>({
  locks,
  selectedIndex,
  onSelect,
  multiSelect = false,
  selectedIndexes,
  onToggle,
  lockType,
  label = "Select Lock",
  renderCard,
}: LockCarouselSelectorProps<T>) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  // Drag-to-scroll state
  const [isDragging, setIsDragging] = useState(false)
  const [dragStartX, setDragStartX] = useState(0)
  const [scrollStartX, setScrollStartX] = useState(0)
  const [dragDistance, setDragDistance] = useState(0)
  const dragThreshold = 5

  const checkScrollability = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const { scrollLeft, scrollWidth, clientWidth } = container
    setCanScrollLeft(scrollLeft > 0)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1)
  }, [])

  useEffect(() => {
    checkScrollability()
    const container = scrollContainerRef.current
    if (container) {
      container.addEventListener("scroll", checkScrollability)
      window.addEventListener("resize", checkScrollability)
      return () => {
        container.removeEventListener("scroll", checkScrollability)
        window.removeEventListener("resize", checkScrollability)
      }
    }
  }, [checkScrollability])

  const scrollTo = useCallback((direction: "left" | "right") => {
    const container = scrollContainerRef.current
    if (!container) return

    const firstCard = container.querySelector(
      "[data-carousel-card]",
    ) as HTMLElement | null
    const cardWidth = (firstCard?.offsetWidth ?? 280) + 16
    const scrollAmount = direction === "left" ? -cardWidth : cardWidth

    container.scrollBy({
      left: scrollAmount,
      behavior: "smooth",
    })
  }, [])

  const handleSelect = useCallback(
    (index: number) => {
      setIsAnimating(true)

      if (multiSelect && onToggle) {
        onToggle(index)
      } else if (onSelect) {
        onSelect(index)
      }

      const container = scrollContainerRef.current
      if (container && !multiSelect) {
        const cards = container.querySelectorAll("[data-carousel-card]")
        const selectedCard = cards[index] as HTMLElement
        if (selectedCard) {
          const containerRect = container.getBoundingClientRect()
          const cardRect = selectedCard.getBoundingClientRect()
          const scrollLeft =
            cardRect.left -
            containerRect.left +
            container.scrollLeft -
            (containerRect.width - cardRect.width) / 2

          container.scrollTo({
            left: Math.max(0, scrollLeft),
            behavior: "smooth",
          })
        }
      }

      setTimeout(() => setIsAnimating(false), 300)
    },
    [multiSelect, onToggle, onSelect],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const container = scrollContainerRef.current
      if (!container) return

      if (isDragging) {
        e.preventDefault()
        const currentX = e.clientX
        const distance = Math.abs(currentX - dragStartX)
        setDragDistance(distance)

        const delta = dragStartX - currentX
        container.scrollLeft = scrollStartX + delta
      }
    },
    [isDragging, dragStartX, scrollStartX],
  )

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return

    const container = scrollContainerRef.current
    if (!container) return

    setIsDragging(true)
    setDragStartX(e.clientX)
    setScrollStartX(container.scrollLeft)
    setDragDistance(0)

    e.preventDefault()
  }, [])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const selectedCount = multiSelect
    ? (selectedIndexes?.size ?? 0)
    : selectedIndex !== undefined
      ? 1
      : 0
  const showSelectionPrompt = selectedCount === 0

  if (locks.length === 0) {
    return null
  }

  const defaultRenderCard = (lock: T, _index: number, isSelected: boolean) => {
    if (
      lockType === "veMEZO" &&
      ("canVote" in lock || "usedWeight" in lock || "currentAPY" in lock)
    ) {
      return (
        <DashboardVeMEZOCard
          lock={lock as VeMEZOLockData}
          isSelected={isSelected}
        />
      )
    }

    if (
      lockType === "veBTC" &&
      ("hasGauge" in lock ||
        "profilePictureUrl" in lock ||
        "boostMultiplier" in lock)
    ) {
      return (
        <DashboardVeBTCCard
          lock={lock as VeBTCLockData}
          isSelected={isSelected}
        />
      )
    }

    return (
      <SimpleDashboardCard
        lock={lock}
        lockType={lockType}
        isSelected={isSelected}
      />
    )
  }

  const cardRenderer = renderCard || defaultRenderCard

  const handleSelectAll = useCallback(() => {
    if (!multiSelect || !onToggle) return
    const allSelected = selectedIndexes?.size === locks.length
    if (allSelected) {
      // Deselect all by toggling each selected one
      for (const idx of selectedIndexes ?? []) {
        onToggle(idx)
      }
    } else {
      // Select all by toggling each unselected one
      for (let i = 0; i < locks.length; i++) {
        if (!selectedIndexes?.has(i)) {
          onToggle(i)
        }
      }
    }
  }, [multiSelect, onToggle, selectedIndexes, locks.length])

  const selectedLabel = useMemo(() => {
    if (multiSelect) {
      const count = selectedIndexes?.size ?? 0
      if (count === 0) return "No locks selected"
      if (count === 1 && selectedIndexes) {
        const idx = Array.from(selectedIndexes)[0]
        if (idx !== undefined) {
          const lock = locks[idx]
          if (lock) return `${lockType} #${lock.tokenId.toString()}`
        }
      }
      return `${count} locks selected`
    }
    if (selectedIndex === undefined) return "No lock selected"
    const lock = locks[selectedIndex]
    if (!lock) return "No lock selected"
    return `${lockType} #${lock.tokenId.toString()}`
  }, [multiSelect, selectedIndexes, selectedIndex, locks, lockType])

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(247,147,26,0.35)] bg-[rgba(247,147,26,0.15)] text-[#F7931A] ${
              showSelectionPrompt ? "animate-pulse" : ""
            }`}
          >
            <TokenIcon
              symbol={lockType === "veMEZO" ? "MEZO" : "BTC"}
              size={18}
            />
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wider text-[var(--content-tertiary)]">
              {showSelectionPrompt ? (
                <span className="uppercase">Choose a lock</span>
              ) : (
                label
              )}
            </p>
            <p className="text-2xs text-[var(--content-secondary)]">
              {showSelectionPrompt
                ? "Select a lock to continue"
                : selectedLabel}
            </p>
          </div>
        </div>
        {locks.length > 1 && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {multiSelect && (
              <button
                type="button"
                onClick={handleSelectAll}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--content-secondary)] transition-colors hover:bg-[var(--surface-secondary)]"
              >
                {selectedIndexes?.size === locks.length
                  ? "Deselect All"
                  : "Select All"}
              </button>
            )}
            <span className="text-xs text-[var(--content-secondary)]">
              {multiSelect
                ? `${selectedCount} / ${locks.length}`
                : `${selectedIndex !== undefined ? selectedIndex + 1 : 0} / ${locks.length}`}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => scrollTo("left")}
                disabled={!canScrollLeft}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] transition-all ${
                  canScrollLeft
                    ? "cursor-pointer text-[var(--content-primary)] hover:bg-[var(--surface-secondary)]"
                    : "cursor-not-allowed text-[var(--content-tertiary)] opacity-50"
                }`}
                aria-label="Scroll left"
              >
                <ChevronLeftIcon size={16} />
              </button>
              <button
                type="button"
                onClick={() => scrollTo("right")}
                disabled={!canScrollRight}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] transition-all ${
                  canScrollRight
                    ? "cursor-pointer text-[var(--content-primary)] hover:bg-[var(--surface-secondary)]"
                    : "cursor-not-allowed text-[var(--content-tertiary)] opacity-50"
                }`}
                aria-label="Scroll right"
              >
                <ChevronRightIcon size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cards */}
      <div
        ref={scrollContainerRef}
        className={`-mx-4 flex gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{
          scrollSnapType: isDragging ? "none" : "x proximity",
          scrollPaddingLeft: "16px",
          scrollPaddingRight: "16px",
          scrollBehavior: isDragging ? "auto" : "smooth",
          userSelect: "none",
          WebkitUserSelect: "none",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {locks.map((lock, index) => {
          const isSelected = multiSelect
            ? (selectedIndexes?.has(index) ?? false)
            : selectedIndex === index

          return (
            <button
              key={lock.tokenId.toString()}
              type="button"
              ref={(el) => {
                cardRefs.current[index] = el
              }}
              data-carousel-card
              onClick={(e) => {
                if (dragDistance > dragThreshold) {
                  e.preventDefault()
                  return
                }
                handleSelect(index)
              }}
              className={`relative flex-shrink-0 text-left outline-none ${
                isAnimating ? "pointer-events-none" : ""
              }`}
              style={{
                scrollSnapAlign: "start",
                width: "min(280px, calc(100vw - 2.5rem))",
              }}
              aria-pressed={isSelected}
            >
              <Card
                withBorder
                overrides={{
                  Root: {
                    style: {
                      height: "100%",
                      minHeight: "clamp(210px, 48vw, 240px)",
                      cursor: isDragging ? "grabbing" : "pointer",
                      transition: isDragging
                        ? "none"
                        : "border-color 0.15s ease, opacity 0.15s ease",
                      borderColor: isSelected ? "#F7931A" : "var(--border)",
                      borderWidth: isSelected ? "2px" : "1px",
                    },
                    props: {
                      onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
                        if (!isDragging) {
                          e.currentTarget.style.opacity = "0.85"
                        }
                      },
                      onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
                        e.currentTarget.style.opacity = "1"
                      },
                    },
                  },
                  Body: {
                    style: {
                      height: "100%",
                    },
                  },
                }}
              >
                {cardRenderer(lock, index, isSelected)}
              </Card>
            </button>
          )
        })}
      </div>

      {/* Dot indicators for mobile */}
      {locks.length > 1 && locks.length <= 6 && (
        <div className="flex justify-center gap-2 sm:hidden">
          {locks.map((lock, index) => {
            const isDotSelected = multiSelect
              ? (selectedIndexes?.has(index) ?? false)
              : selectedIndex === index
            return (
              <button
                key={lock.tokenId.toString()}
                type="button"
                onClick={() => handleSelect(index)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  isDotSelected
                    ? "w-6 bg-[#F7931A]"
                    : "w-2 bg-[var(--border)] hover:bg-[var(--content-tertiary)]"
                }`}
                aria-label={`Select ${lockType} #${lock.tokenId.toString()}`}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

export default LockCarouselSelector
