import { Card, Tag } from "@mezo-org/mezo-clay"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { formatUnits } from "viem"

// Token icon mapping
const TOKEN_ICONS: Record<string, string> = {
  BTC: "/token icons/Bitcoin.svg",
  WBTC: "/token icons/Bitcoin.svg",
  tBTC: "/token icons/Bitcoin.svg",
  MEZO: "/token icons/Mezo.svg",
}

function TokenIcon({
  symbol,
  size = 16,
}: { symbol: string; size?: number }): JSX.Element | null {
  const iconPath = TOKEN_ICONS[symbol.toUpperCase()]
  if (!iconPath) return null

  return (
    <img
      src={iconPath}
      alt={symbol}
      width={size}
      height={size}
      className="inline-block flex-shrink-0 align-middle"
    />
  )
}

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
  currentAPY?: number | null
  upcomingAPY?: number | null
  claimableUSD?: number | null
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
  selectedIndex: number | undefined
  onSelect: (index: number) => void
  lockType: "veMEZO" | "veBTC"
  label?: string
  renderCard?: (lock: T, index: number, isSelected: boolean) => React.ReactNode
}

// Default rich card for veMEZO locks
function DefaultVeMEZOCard({
  lock,
  isSelected,
}: {
  lock: VeMEZOLockData
  isSelected: boolean
}) {
  const unlockDate = lock.end ? new Date(Number(lock.end) * 1000) : null
  const isExpired = unlockDate ? unlockDate < new Date() : false

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(247,147,26,0.35)] bg-[rgba(247,147,26,0.12)]">
            <TokenIcon symbol="MEZO" size={18} />
          </div>
          <div>
            <p className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              veMEZO
            </p>
            <p className="text-sm font-semibold text-[var(--content-primary)]">
              #{lock.tokenId.toString()}
            </p>
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-2xs font-semibold ${
            isSelected
              ? "bg-[#F7931A] text-[#0B0B0B]"
              : "border border-[var(--border)] text-[var(--content-tertiary)]"
          }`}
        >
          {isSelected ? "Selected" : "Select"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tag
          closeable={false}
          color={lock.isPermanent ? "green" : isExpired ? "red" : "yellow"}
        >
          {lock.isPermanent ? "Permanent" : isExpired ? "Expired" : "Active"}
        </Tag>
        {lock.currentAPY !== undefined && lock.currentAPY !== null && (
          <span className="inline-flex items-center rounded-full border border-[rgba(var(--positive-rgb),0.35)] bg-[rgba(var(--positive-rgb),0.15)] px-2 py-1 text-2xs font-semibold text-[var(--positive)]">
            {lock.currentAPY.toFixed(1)}% APY
          </span>
        )}
        {lock.upcomingAPY !== undefined &&
          lock.upcomingAPY !== null &&
          lock.upcomingAPY !== lock.currentAPY && (
            <span className="inline-flex items-center rounded-full border border-[rgba(247,147,26,0.35)] bg-[rgba(247,147,26,0.12)] px-2 py-1 text-2xs font-semibold text-[#F7931A]">
              Next {lock.upcomingAPY.toFixed(1)}%
            </span>
          )}
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-2.5">
        <div>
          <p className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
            Locked
          </p>
          <p className="font-mono text-xs font-semibold tabular-nums text-[var(--content-primary)]">
            {formatUnits(lock.amount, 18).slice(0, 8)} MEZO
          </p>
        </div>
        <div>
          <p className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
            Voting Power
          </p>
          <p className="font-mono text-xs font-semibold tabular-nums text-[var(--content-primary)]">
            {formatUnits(lock.votingPower, 18).slice(0, 8)}
          </p>
        </div>
        <div>
          <p className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
            Used Weight
          </p>
          <p className="font-mono text-xs font-semibold tabular-nums text-[var(--content-primary)]">
            {lock.usedWeight
              ? formatUnits(lock.usedWeight, 18).slice(0, 8)
              : "0"}
          </p>
        </div>
        <div>
          <p className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
            Can Vote
          </p>
          <p
            className={`text-xs font-semibold ${
              lock.canVote ? "text-[var(--positive)]" : "text-[var(--content-tertiary)]"
            }`}
          >
            {lock.canVote ? "Yes" : "No"}
          </p>
        </div>
      </div>

      <div className="mt-auto rounded-lg border border-[var(--border)] px-2 py-1.5 text-2xs text-[var(--content-secondary)]">
        {lock.isPermanent
          ? "Permanently locked"
          : isExpired
            ? "Lock expired"
            : unlockDate
              ? `Unlocks ${unlockDate.toLocaleDateString()}`
              : "Active lock"}
      </div>
    </div>
  )
}

// Default rich card for veBTC locks
function DefaultVeBTCCard({
  lock,
  isSelected,
}: {
  lock: VeBTCLockData
  isSelected: boolean
}) {
  const unlockDate = lock.end ? new Date(Number(lock.end) * 1000) : null
  const isExpired = unlockDate ? unlockDate < new Date() : false

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)]">
            {lock.profilePictureUrl ? (
              <img
                src={lock.profilePictureUrl}
                alt={`veBTC #${lock.tokenId.toString()}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-sm font-medium text-[var(--content-secondary)]">
                #{lock.tokenId.toString().slice(0, 2)}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              veBTC Gauge
            </p>
            <p
              className={`truncate text-sm font-semibold ${
                lock.displayName
                  ? "text-[var(--positive)]"
                  : "text-[var(--content-primary)]"
              }`}
            >
              {lock.displayName || `veBTC #${lock.tokenId.toString()}`}
            </p>
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-2xs font-semibold ${
            isSelected
              ? "bg-[#F7931A] text-[#0B0B0B]"
              : "border border-[var(--border)] text-[var(--content-tertiary)]"
          }`}
        >
          {isSelected ? "Selected" : "Select"}
        </span>
      </div>

      {lock.description && (
        <p className="line-clamp-2 text-2xs text-[var(--content-secondary)]">
          {lock.description}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Tag
          closeable={false}
          color={lock.isPermanent ? "green" : isExpired ? "red" : "yellow"}
        >
          {lock.isPermanent ? "Permanent" : isExpired ? "Expired" : "Active"}
        </Tag>
        {lock.hasGauge && lock.gaugeAPY !== undefined && lock.gaugeAPY !== null && lock.gaugeAPY > 0 && (
          <span className="inline-flex items-center rounded-full border border-[rgba(var(--positive-rgb),0.35)] bg-[rgba(var(--positive-rgb),0.15)] px-2 py-1 text-2xs font-semibold text-[var(--positive)]">
            {lock.gaugeAPY.toFixed(1)}% APY
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-2.5">
        <div>
          <p className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
            Locked BTC
          </p>
          <p className="font-mono text-xs font-semibold tabular-nums text-[var(--content-primary)]">
            {formatUnits(lock.amount, 18).slice(0, 8)}
          </p>
        </div>
        <div>
          <p className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
            Voting Power
          </p>
          <p className="font-mono text-xs font-semibold tabular-nums text-[var(--content-primary)]">
            {formatUnits(lock.votingPower, 18).slice(0, 8)}
          </p>
        </div>
        <div>
          <p className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
            Boost
          </p>
          <p className="font-mono text-xs font-semibold tabular-nums text-[var(--content-primary)]">
            {lock.boostMultiplier !== undefined
              ? `${lock.boostMultiplier.toFixed(2)}x`
              : "1.00x"}
          </p>
        </div>
        <div>
          <p className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
            Gauge
          </p>
          <p
            className={`text-xs font-semibold ${
              lock.hasGauge ? "text-[var(--positive)]" : "text-[var(--content-tertiary)]"
            }`}
          >
            {lock.hasGauge ? "Active" : "None"}
          </p>
        </div>
      </div>

      <div className="mt-auto rounded-lg border border-[var(--border)] px-2 py-1.5 text-2xs text-[var(--content-secondary)]">
        {lock.isPermanent
          ? "Permanently locked"
          : isExpired
            ? "Lock expired"
            : unlockDate
              ? `Unlocks ${unlockDate.toLocaleDateString()}`
              : "Active lock"}
      </div>
    </div>
  )
}

// Simple fallback card (original design)
function SimpleLockCard({
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
    <div className="flex flex-col gap-3 py-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TokenIcon symbol={tokenSymbol} size={20} />
          <span className="text-sm font-medium text-[var(--content-primary)]">
            {lockType} #{lock.tokenId.toString()}
          </span>
        </div>
        {isSelected && (
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#F7931A]">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
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

      {/* Stats */}
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
            {lockType === "veBTC" ? "Locked" : "Amount"}
          </p>
          <p className="font-mono text-sm font-medium tabular-nums text-[var(--content-primary)]">
            {formatUnits(lock.amount, 18).slice(0, 8)}{" "}
            {lockType === "veBTC" ? "BTC" : "MEZO"}
          </p>
        </div>
        <div>
          <p className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
            Voting Power
          </p>
          <p className="font-mono text-sm font-medium tabular-nums text-[var(--content-primary)]">
            {formatUnits(lock.votingPower, 18).slice(0, 8)}
          </p>
        </div>
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-1.5">
        <div
          className={`h-1.5 w-1.5 rounded-full ${
            lock.isPermanent
              ? "bg-[var(--positive)]"
              : isExpired
                ? "bg-[var(--negative)]"
                : "bg-[var(--warning)]"
          }`}
        />
        <span className="text-2xs text-[var(--content-secondary)]">
          {lock.isPermanent
            ? "Permanent"
            : isExpired
              ? "Expired"
              : unlockDate
                ? `Unlocks ${unlockDate.toLocaleDateString()}`
                : "Active"}
        </span>
      </div>
    </div>
  )
}

export function LockCarouselSelector<T extends LockItem>({
  locks,
  selectedIndex,
  onSelect,
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
  const dragThreshold = 5 // Minimum pixels to consider it a drag vs click

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

    const cardWidth = 200 // card width + gap
    const scrollAmount = direction === "left" ? -cardWidth : cardWidth

    container.scrollBy({
      left: scrollAmount,
      behavior: "smooth",
    })
  }, [])

  const handleSelect = useCallback(
    (index: number) => {
      setIsAnimating(true)
      onSelect(index)

      // Scroll the selected card into view
      const container = scrollContainerRef.current
      if (container) {
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
    [onSelect],
  )

  // Mouse tracking for drag-to-scroll
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
    // Only start drag on primary mouse button
    if (e.button !== 0) return

    const container = scrollContainerRef.current
    if (!container) return

    setIsDragging(true)
    setDragStartX(e.clientX)
    setScrollStartX(container.scrollLeft)
    setDragDistance(0)

    // Prevent text selection during drag
    e.preventDefault()
  }, [])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Determine if we should show the selection prompt
  const showSelectionPrompt = selectedIndex === undefined

  if (locks.length === 0) {
    return null
  }

  // Default card renderer
  const defaultRenderCard = (lock: T, _index: number, isSelected: boolean) => {
    // Check if it's a rich veMEZO lock
    if (
      lockType === "veMEZO" &&
      ("canVote" in lock || "usedWeight" in lock || "currentAPY" in lock)
    ) {
      return (
        <DefaultVeMEZOCard
          lock={lock as VeMEZOLockData}
          isSelected={isSelected}
        />
      )
    }

    // Check if it's a rich veBTC lock
    if (
      lockType === "veBTC" &&
      ("hasGauge" in lock ||
        "profilePictureUrl" in lock ||
        "boostMultiplier" in lock)
    ) {
      return (
        <DefaultVeBTCCard
          lock={lock as VeBTCLockData}
          isSelected={isSelected}
        />
      )
    }

    // Fallback to simple card
    return (
      <SimpleLockCard lock={lock} lockType={lockType} isSelected={isSelected} />
    )
  }

  const cardRenderer = renderCard || defaultRenderCard

  const selectedLabel = useMemo(() => {
    if (selectedIndex === undefined) return "No lock selected"
    const lock = locks[selectedIndex]
    if (!lock) return "No lock selected"
    return `${lockType} #${lock.tokenId.toString()}`
  }, [selectedIndex, locks, lockType])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(247,147,26,0.35)] bg-[rgba(247,147,26,0.15)] text-[#F7931A] ${
              showSelectionPrompt ? "carousel-prompt-pulse" : ""
            }`}
          >
            <span className="text-sm font-semibold">$</span>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--content-tertiary)]">
              {showSelectionPrompt ? "Choose a lock" : label}
            </p>
            <p className="text-2xs text-[var(--content-secondary)]">
              {showSelectionPrompt ? "Select a lock to continue" : selectedLabel}
            </p>
          </div>
        </div>
        {locks.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--content-secondary)]">
              {selectedIndex !== undefined ? selectedIndex + 1 : 0} /{" "}
              {locks.length}
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

      <div
        ref={scrollContainerRef}
        className={`carousel-scroll-container -mx-4 flex gap-4 px-6 pb-4 ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{
          overflowX: "auto",
          overflowY: "hidden",
          scrollSnapType: isDragging ? "none" : "x proximity",
          scrollPaddingLeft: "24px",
          scrollPaddingRight: "24px",
          scrollBehavior: isDragging ? "auto" : "smooth",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {locks.map((lock, index) => {
          const isSelected = selectedIndex === index

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
              className={`carousel-card flex-shrink-0 text-left ${
                isAnimating ? "pointer-events-none" : ""
              }`}
              style={{
                scrollSnapAlign: "center",
                width: "240px",
                height: "220px",
              }}
              aria-pressed={isSelected}
            >
              <Card
                withBorder
                overrides={{
                  Root: {
                    style: {
                      height: "100%",
                      cursor: isDragging ? "grabbing" : "pointer",
                      transition: isDragging
                        ? "none"
                        : "box-shadow 0.2s ease-out, border-color 0.2s ease-out, transform 0.2s ease-out",
                      borderColor: isSelected ? "#F7931A" : "var(--border)",
                      borderWidth: isSelected ? "2px" : "1px",
                      boxShadow: isSelected
                        ? "0 0 24px rgba(247, 147, 26, 0.35), 0 10px 24px rgba(0, 0, 0, 0.35)"
                        : "0 6px 16px rgba(0, 0, 0, 0.2)",
                      transform: isSelected ? "translateY(-2px)" : "none",
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

      {locks.length > 1 && locks.length <= 6 && (
        <div className="flex justify-center gap-2 sm:hidden">
          {locks.map((lock, index) => (
            <button
              key={lock.tokenId.toString()}
              type="button"
              onClick={() => handleSelect(index)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                selectedIndex === index
                  ? "w-6 bg-[#F7931A]"
                  : "w-2 bg-[var(--border)] hover:bg-[var(--content-tertiary)]"
              }`}
              aria-label={`Select ${lockType} #${lock.tokenId.toString()}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default LockCarouselSelector
