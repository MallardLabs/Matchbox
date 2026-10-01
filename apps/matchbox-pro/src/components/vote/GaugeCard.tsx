import { cn } from "@/lib/cn"
import {
  formatApyBasisPoints,
  formatBoost,
  formatMicroUsd,
  formatTokenAmountDigits,
  microUsdToDecimalString,
} from "@/lib/money"
import {
  calculateRewardPer10kVeMezo,
  formatRewardPer10kVeMezo,
} from "@/lib/rewardPerVeMezo"
import { Link } from "@tanstack/react-router"
import { Check, Plus, Star } from "lucide-react"
import type { ReactElement } from "react"
import type { Density, IncentivePill, VoteGaugeCard } from "./model"

type GaugeCardProps = {
  card: VoteGaugeCard
  density: Density
  onBallot: boolean
  watching: boolean
  onToggleBallot: () => void
  onToggleWatch: () => void
}

const pillDot: Record<string, string> = {
  MEZO: "bg-mezo-brand",
  BTC: "bg-accent",
}

function wholeVe(amount: bigint): string {
  return formatTokenAmountDigits(amount, 18, 0)
}

export default function GaugeCard({
  card,
  density,
  onBallot,
  watching,
  onToggleBallot,
  onToggleWatch,
}: GaugeCardProps): ReactElement {
  const { gauge, profile, name } = card
  const compact = density === "compact"
  const optimal = gauge.optimalVeMEZO
  const over =
    optimal && gauge.totalWeight > optimal ? gauge.totalWeight - optimal : 0n
  const shortfall =
    optimal && optimal > gauge.totalWeight ? optimal - gauge.totalWeight : 0n
  const atMax = gauge.boostMultiplier >= 5
  const description =
    profile?.description ??
    `Unclaimed · ${gauge.address.slice(0, 6)}…${gauge.address.slice(-4)}`
  const per10k = formatRewardPer10kVeMezo(
    calculateRewardPer10kVeMezo(
      microUsdToDecimalString(card.incentives),
      gauge.totalWeight,
    ),
  )

  let side: ReactElement | null = null
  if (over > 0n) side = <span className="text-neg">+{wholeVe(over)} over</span>
  else if (shortfall > 0n)
    side = <span className="text-muted">{wholeVe(shortfall)} to 5x</span>

  return (
    <article
      className={cn(
        "relative hidden h-full flex-col overflow-hidden rounded-xl md:flex border border-line bg-surface transition-colors hover:border-line-2",
        compact ? "gap-2.5 pt-3.5" : "gap-3 pt-4",
      )}
    >
      <header className="flex items-center gap-2.5 px-3.5">
        <Avatar card={card} />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <h3 className="flex min-w-0 items-center gap-1.5">
            <Link
              to="/gauges/$address"
              params={{ address: gauge.address }}
              className="truncate text-[17px] font-700 text-ink after:absolute after:inset-0 hover:underline"
            >
              {name}
            </Link>
            {card.tokenId ? (
              <span className="flex h-[18px] shrink-0 items-center rounded-[4px] bg-accent-soft px-1.5 font-mono text-[10px] font-700 text-accent-ink">
                #{card.tokenId}
              </span>
            ) : null}
          </h3>
          <p
            title={description}
            className="overflow-hidden whitespace-nowrap text-[11px] leading-[14px] text-secondary [mask-image:linear-gradient(to_right,black_calc(100%-36px),transparent)]"
          >
            {description}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleBallot}
          aria-pressed={onBallot}
          aria-label={
            onBallot ? `Remove ${name} from ballot` : `Add ${name} to ballot`
          }
          className={cn(
            "relative flex size-7 shrink-0 items-center justify-center rounded-[6px] transition-[filter,background-color]",
            onBallot
              ? "bg-accent-soft text-accent-ink hover:bg-accent-soft-2"
              : "bg-accent text-on-accent hover:brightness-95",
          )}
        >
          {onBallot ? (
            <Check size={15} strokeWidth={2.25} />
          ) : (
            <Plus size={15} strokeWidth={2.25} />
          )}
        </button>
        <button
          type="button"
          onClick={onToggleWatch}
          aria-pressed={watching}
          aria-label={watching ? `Stop watching ${name}` : `Watch ${name}`}
          className={cn(
            "relative -mx-1 flex size-6 shrink-0 items-center justify-center rounded-md",
            watching ? "text-accent" : "text-faint hover:text-muted",
          )}
        >
          <Star
            size={16}
            strokeWidth={1.75}
            fill={watching ? "currentColor" : "none"}
          />
        </button>
      </header>

      <dl className="flex gap-9 px-3.5">
        <Stat label="veBTC">
          {gauge.veBTCWeight !== undefined
            ? formatTokenAmountDigits(gauge.veBTCWeight, 18, 4)
            : "—"}
        </Stat>
        <Stat label="veMEZO">{wholeVe(gauge.totalWeight)}</Stat>
        <div className="group relative flex flex-col gap-0.5">
          <dt className="text-[10px] font-500 text-muted">APY</dt>
          <dd
            className={cn(
              "relative text-[16px] font-700 tabular-nums",
              card.apy === null ? "text-muted" : "text-pos",
            )}
          >
            {formatApyBasisPoints(card.apy)}
            <span
              role="tooltip"
              className="pointer-events-none absolute left-full top-1/2 z-10 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-[6px] bg-ink px-2.5 py-2 text-[12px] font-600 text-canvas shadow-pop group-hover:block"
            >
              {per10k}
            </span>
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-1 px-3.5">
        <p className="text-[10px] font-500 text-muted">Incentives</p>
        <p className="text-[16px] font-650 text-ink tabular-nums">
          {formatMicroUsd(card.incentives)}
        </p>
        {card.pills.length > 0 ? (
          <ul className="flex flex-wrap gap-1">
            {card.pills.map((pill) => (
              <IncentiveChip key={pill.symbol} pill={pill} />
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-auto flex flex-col gap-1 px-3.5">
        <p className="flex items-center justify-between text-[11px]">
          <span className="font-500 text-muted">Optimal veMEZO</span>
          <span className="font-650 tabular-nums">{side}</span>
        </p>
        <p className="flex items-end justify-between">
          <span className="text-[18px] font-650 text-ink tabular-nums">
            {optimal ? wholeVe(optimal) : "—"}
          </span>
          <span
            className={cn(
              "font-700 tabular-nums",
              atMax ? "text-[16px] text-pos" : "text-[14px] text-ink",
            )}
          >
            {formatBoost(gauge.boostMultiplier)}
          </span>
        </p>
      </div>

      <BoostTrack
        boost={gauge.boostMultiplier}
        weight={gauge.totalWeight}
        over={over}
      />
    </article>
  )
}

function Stat({
  label,
  children,
}: {
  label: string
  children: string
}): ReactElement {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-500 text-muted">{label}</dt>
      <dd className="text-[15px] font-650 text-ink tabular-nums">{children}</dd>
    </div>
  )
}

function IncentiveChip({ pill }: { pill: IncentivePill }): ReactElement {
  return (
    <li className="flex h-5 items-center gap-1 rounded-full border border-line bg-inset px-1.5 text-[11px] font-500 text-secondary tabular-nums">
      <span
        aria-hidden="true"
        className={cn(
          "size-2.5 rounded-full",
          pillDot[pill.symbol] ?? "bg-line-2",
        )}
      />
      {pill.symbol}
      <span className="ml-1">~{formatMicroUsd(pill.usd)}</span>
    </li>
  )
}

function Avatar({ card }: { card: VoteGaugeCard }): ReactElement {
  const url = card.profile?.profile_picture_url
  if (url)
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        className="size-10 shrink-0 rounded-full bg-inset object-cover"
      />
    )
  const initial = card.profile
    ? card.name.slice(0, 1).toUpperCase()
    : card.gauge.address.slice(2, 4).toUpperCase()
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft-2 text-[15px] font-650 text-accent-ink"
    >
      {initial}
    </span>
  )
}

/** Bottom rail: orange toward 5×, green at 5×, red for veMEZO past the optimum. */
function BoostTrack({
  boost,
  weight,
  over,
}: {
  boost: number
  weight: bigint
  over: bigint
}): ReactElement {
  const overPercent =
    over > 0n && weight > 0n ? Number((over * 100n) / weight) : 0
  const atMax = boost >= 5
  return (
    <div aria-hidden="true" className="flex h-2 bg-inset-2">
      <span
        className={atMax ? "bg-pos" : "bg-accent"}
        style={{
          width: `${atMax ? 100 - overPercent : Math.min(100, boost * 20)}%`,
        }}
      />
      {overPercent > 0 ? (
        <span className="bg-neg" style={{ width: `${overPercent}%` }} />
      ) : null}
    </div>
  )
}
