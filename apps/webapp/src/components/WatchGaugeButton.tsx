import { useGaugeWatchlist } from "@/hooks/useGaugeWatchlist"

type WatchGaugeButtonProps = {
  gaugeAddress: string
  compact?: boolean
  className?: string
}

function StarIcon({ filled }: { filled: boolean }): JSX.Element {
  return (
    <svg
      className="size-4"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

export default function WatchGaugeButton({
  gaugeAddress,
  compact = false,
  className = "",
}: WatchGaugeButtonProps): JSX.Element {
  const { isWatching, toggleWatching } = useGaugeWatchlist()
  const watching = isWatching(gaugeAddress)
  const label = watching ? "Remove from watchlist" : "Add to watchlist"

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={watching}
      title={label}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        toggleWatching(gaugeAddress)
      }}
      className={`inline-flex items-center justify-center gap-2 rounded-md border transition-colors ${
        compact ? "size-7" : "h-9 px-3 text-sm font-medium"
      } ${
        watching
          ? "border-[rgba(247,147,26,0.35)] bg-[rgba(247,147,26,0.12)] text-[#F7931A]"
          : "border-[var(--border)] text-[var(--content-secondary)] hover:border-[var(--content-tertiary)] hover:text-[var(--content-primary)]"
      } ${className}`}
    >
      <StarIcon filled={watching} />
      {!compact && <span>{watching ? "Watching" : "Watch"}</span>}
    </button>
  )
}
