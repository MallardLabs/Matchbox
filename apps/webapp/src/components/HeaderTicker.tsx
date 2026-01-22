import { useBtcPrice } from "@/hooks/useBtcPrice"
import { useEpochCountdown } from "@/hooks/useEpochCountdown"
import { useMezoPrice } from "@/hooks/useMezoPrice"
import { useRpcHealth } from "@/hooks/useRpcHealth"
import { useEffect, useRef, useState } from "react"

const CYCLE_INTERVAL_MS = 4000 // 4 seconds per metric

type TickerMetric = {
  id: string
  label: string
  value: string
  icon?: string
  statusColor?: string
  isClockIcon?: boolean
}

function formatPrice(price: number | null): string {
  if (price === null) return "—"

  if (price >= 1000) {
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  return price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}

function TickerItem({
  metric,
  animationClass,
}: {
  metric: TickerMetric
  animationClass?: string
}): JSX.Element {
  return (
    <div
      className={`absolute inset-0 flex items-center gap-2 ${animationClass ?? ""}`}
    >
      {metric.icon && (
        <img
          src={metric.icon}
          alt={metric.label}
          width={20}
          height={20}
          className="h-5 w-5 rounded-full"
        />
      )}
      {metric.statusColor && (
        <span
          className="h-2 w-2 rounded-full"
          style={{
            backgroundColor: metric.statusColor,
            boxShadow: `0 0 6px ${metric.statusColor}`,
          }}
        />
      )}
      <span className="whitespace-nowrap font-mono text-xs text-[var(--content-secondary)]">
        {metric.label}
      </span>
      <span className="whitespace-nowrap font-mono text-xs tabular-nums text-[#F7931A]">
        {metric.value}
      </span>
    </div>
  )
}

export function HeaderTicker(): JSX.Element {
  const { price: btcPrice, isLoading: btcLoading } = useBtcPrice()
  const {
    price: mezoPrice,
    isLoading: mezoLoading,
    isError: mezoError,
  } = useMezoPrice()
  const { timeRemaining } = useEpochCountdown()
  const { status: rpcStatus } = useRpcHealth()

  const [currentIndex, setCurrentIndex] = useState(0)
  const [prevIndex, setPrevIndex] = useState<number | null>(null)
  const [isTransitioning, setIsTransitioning] = useState(false)

  const getStatusColor = (status: string): string => {
    switch (status) {
      case "connected":
        return "#22C55E"
      case "delayed":
        return "#EAB308"
      case "disconnected":
        return "#EF4444"
      default:
        return "#22C55E"
    }
  }

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case "connected":
        return "Synced"
      case "delayed":
        return "Delayed"
      case "disconnected":
        return "Offline"
      default:
        return "Synced"
    }
  }

  const metrics: TickerMetric[] = [
    {
      id: "mezo",
      label: "MEZO",
      value: mezoLoading
        ? "..."
        : mezoError
          ? "N/A"
          : `$${formatPrice(mezoPrice)}`,
      icon: "/token icons/Mezo.svg",
    },
    {
      id: "btc",
      label: "BTC",
      value: btcLoading ? "..." : `$${formatPrice(btcPrice)}`,
      icon: "/token icons/Bitcoin.svg",
    },
    {
      id: "epoch",
      label: "Epoch",
      value: timeRemaining,
      isClockIcon: true,
    },
    {
      id: "rpc",
      label: "RPC",
      value: getStatusLabel(rpcStatus),
      statusColor: getStatusColor(rpcStatus),
    },
  ]

  useEffect(() => {
    const interval = setInterval(() => {
      setIsTransitioning(true)
      setPrevIndex(currentIndex)

      // After transition starts, update to next index
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % metrics.length)
      }, 50)

      // Reset transition state after animation completes
      setTimeout(() => {
        setIsTransitioning(false)
        setPrevIndex(null)
      }, 400)
    }, CYCLE_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [currentIndex, metrics.length])

  const safeCurrentIndex = currentIndex % metrics.length
  const currentMetric: TickerMetric = metrics[safeCurrentIndex] as TickerMetric
  const prevMetric: TickerMetric | null =
    prevIndex !== null
      ? (metrics[prevIndex % metrics.length] as TickerMetric)
      : null

  const [isHovered, setIsHovered] = useState(false)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
    }
    setIsHovered(true)
  }

  const handleMouseLeave = () => {
    // Small delay before closing to prevent flickering
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false)
    }, 150)
  }

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Orange accent bar */}
      <div className="mr-3 h-6 w-0.5 bg-[#F7931A]" />

      {/* Ticker container - fixed width to prevent layout shift */}
      <div className="relative h-5 w-[200px] cursor-pointer overflow-hidden">
        {/* Previous item sliding out */}
        {isTransitioning && prevMetric && (
          <TickerItem metric={prevMetric} animationClass="ticker-slide-out" />
        )}

        {/* Current item */}
        <TickerItem
          metric={currentMetric}
          animationClass={isTransitioning ? "ticker-slide-in" : ""}
        />
      </div>

      {/* Hover dropdown */}
      <div
        className={`absolute -left-1 top-full z-50 min-w-[200px] overflow-hidden border border-[var(--border)] bg-[var(--surface)] shadow-lg ${
          isHovered
            ? "ticker-dropdown-enter"
            : "ticker-dropdown-exit pointer-events-none"
        }`}
      >
        <div className="flex flex-col">
          {metrics.map((metric, index) => (
            <div
              key={metric.id}
              className={`flex items-center gap-3 px-4 py-2.5 ${
                index < metrics.length - 1
                  ? "border-b border-[var(--border)]"
                  : ""
              }`}
            >
              {/* Icon container - consistent 24px width for alignment */}
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center">
                {metric.icon && (
                  <img
                    src={metric.icon}
                    alt=""
                    width={24}
                    height={24}
                    className="h-6 w-6 rounded-full"
                  />
                )}
                {metric.isClockIcon && (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-[var(--content-secondary)]"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                )}
                {metric.statusColor && !metric.icon && !metric.isClockIcon && (
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: metric.statusColor,
                      boxShadow: `0 0 6px ${metric.statusColor}`,
                    }}
                  />
                )}
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-xs text-[var(--content-secondary)]">
                  {metric.label}
                </span>
                <span className="font-mono text-sm tabular-nums text-[#F7931A]">
                  {metric.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
