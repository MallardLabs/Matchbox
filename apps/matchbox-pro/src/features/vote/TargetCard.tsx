import { formatMicroUsd } from "@/lib/money"
import { cn } from "@repo/ui/cn"
import * as Tooltip from "@repo/ui/tooltip"
import { Link } from "@tanstack/react-router"
import { Check, Plus, Star } from "lucide-react"
import type { ReactElement, ReactNode } from "react"
import TargetAvatar from "./TargetAvatar"
import { formatApy, formatUsdApprox, formatUsdHeadline } from "./format"
import type { Density, TargetFooter, VoteTarget } from "./model"
import type { RewardToken } from "./projection"

export type TargetActions = {
  onBallot: boolean
  /** Why the target cannot be added (dead gauge, 30-target cap), if it can't. */
  addBlocked: string | null
  watching: boolean
  onToggleBallot: () => void
  onToggleWatch: () => void
}

type TargetCardProps = TargetActions & {
  target: VoteTarget
  density: Density
  perUnitLabel: string
}

const DOT_BY_SYMBOL: Record<string, string> = {
  MEZO: "bg-mezo-brand",
  BTC: "bg-accent",
  TBTC: "bg-accent",
  WBTC: "bg-accent",
  MUSD: "bg-ink",
}

export function rewardDot(symbol: string): string {
  return DOT_BY_SYMBOL[symbol.toUpperCase()] ?? "bg-line-2"
}

/** Gauge / validator / pool card (Pen J04, 08c, 08d, 29, 30). */
export default function TargetCard({
  target,
  density,
  perUnitLabel,
  ...actions
}: TargetCardProps): ReactElement {
  const compact = density === "compact"
  return (
    <article
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-line-2",
        compact ? "gap-2.5 pt-3.5" : "gap-3 pt-4",
      )}
    >
      <header className="flex items-center gap-2.5 px-3.5">
        <TargetAvatar mark={target.mark} size={40} />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <h3 className="flex min-w-0 items-center gap-1.5">
            <TargetName target={target} />
            {target.chip ? (
              <span className="flex h-[18px] shrink-0 items-center rounded-[4px] bg-accent-soft px-1.5 font-mono text-micro font-500 text-accent-ink">
                {target.chip}
              </span>
            ) : null}
          </h3>
          {target.description ? (
            <p
              title={target.description}
              className="overflow-hidden whitespace-nowrap text-caption text-secondary [mask-image:linear-gradient(to_right,black_calc(100%-36px),transparent)]"
            >
              {target.description}
            </p>
          ) : null}
        </div>
        <BallotToggle target={target} {...actions} />
        <WatchToggle target={target} {...actions} />
      </header>

      <dl className="flex flex-wrap gap-x-9 gap-y-2 px-3.5">
        {target.stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-0.5">
            <dt className="text-caption font-500 text-muted">{stat.label}</dt>
            <dd className="text-nav font-400 text-ink tabular-nums">
              {stat.value}
            </dd>
          </div>
        ))}
        <div className="flex flex-col gap-0.5">
          <dt className="text-micro font-500 text-muted">APY</dt>
          <dd>
            <ApyValue
              apyBps={target.apyBps}
              perUnit={target.perUnitMicroUsd}
              perUnitLabel={perUnitLabel}
            />
          </dd>
        </div>
      </dl>

      <Incentives target={target} />

      {target.footer ? (
        <Footer footer={target.footer} />
      ) : (
        <span className="mt-auto" />
      )}
      <Meter footer={target.footer} />
    </article>
  )
}

function TargetName({ target }: { target: VoteTarget }): ReactElement {
  const className = "truncate text-[17px] font-700 leading-[22px] text-ink"
  if (!target.hasDetail) return <span className={className}>{target.name}</span>
  return (
    <Link
      to="/gauges/$address"
      params={{ address: target.id }}
      className={cn(
        className,
        "after:absolute after:inset-0 after:rounded-xl hover:underline focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-accent-ink",
      )}
    >
      {target.name}
    </Link>
  )
}

export function BallotToggle({
  target,
  onBallot,
  addBlocked,
  onToggleBallot,
  size = "md",
}: Pick<TargetActions, "onBallot" | "addBlocked" | "onToggleBallot"> & {
  target: VoteTarget
  size?: "md" | "lg"
}): ReactElement {
  const blocked = !onBallot && addBlocked !== null
  return (
    <button
      type="button"
      onClick={onToggleBallot}
      disabled={blocked}
      title={blocked ? (addBlocked ?? undefined) : undefined}
      aria-pressed={onBallot}
      aria-label={
        onBallot
          ? `Remove ${target.name} from ballot`
          : `Add ${target.name} to ballot`
      }
      className={cn(
        "relative z-[1] flex shrink-0 items-center justify-center transition-[filter,background-color] disabled:cursor-not-allowed disabled:opacity-40",
        size === "md" ? "size-7 rounded-[6px]" : "size-8 rounded-lg",
        onBallot
          ? "bg-accent-soft text-accent-ink hover:bg-accent-soft-2"
          : "bg-accent text-on-accent hover:brightness-95",
      )}
    >
      {onBallot ? (
        <Check aria-hidden="true" size={15} strokeWidth={2.5} />
      ) : (
        <Plus aria-hidden="true" size={15} strokeWidth={2.5} />
      )}
    </button>
  )
}

function WatchToggle({
  target,
  watching,
  onToggleWatch,
}: Pick<TargetActions, "watching" | "onToggleWatch"> & {
  target: VoteTarget
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onToggleWatch}
      aria-pressed={watching}
      aria-label={
        watching ? `Stop watching ${target.name}` : `Watch ${target.name}`
      }
      className={cn(
        "relative z-[1] -mx-0.5 flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
        watching ? "text-accent" : "text-faint hover:text-muted",
      )}
    >
      <Star
        aria-hidden="true"
        size={17}
        strokeWidth={1.75}
        fill={watching ? "currentColor" : "none"}
      />
    </button>
  )
}

export function ApyValue({
  apyBps,
  perUnit,
  perUnitLabel,
  className,
}: {
  apyBps: bigint | null
  perUnit: bigint | null
  perUnitLabel: string
  className?: string
}): ReactElement {
  const label = formatApy(apyBps)
  const tone = apyBps === null ? "text-muted" : "text-pos"
  if (perUnit === null)
    return (
      <span className={cn("text-lead font-700 tabular-nums", tone, className)}>
        {label}
      </span>
    )
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className={cn(
            "relative z-[1] rounded-sm text-lead font-700 tabular-nums",
            tone,
            className,
          )}
        >
          {label}
          <span className="sr-only">
            , {formatMicroUsd(perUnit)} per {perUnitLabel}
          </span>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Content side="right" className="px-2.5 py-2 text-label font-600">
        {formatMicroUsd(perUnit)} / {perUnitLabel}
      </Tooltip.Content>
    </Tooltip.Root>
  )
}

function Incentives({ target }: { target: VoteTarget }): ReactElement {
  let total: ReactNode = formatUsdHeadline(target.incentiveMicroUsd)
  if (target.incentiveMicroUsd === 0n && target.hasUnpriced) total = "Unpriced"
  return (
    <div className="flex flex-col gap-1 px-3.5">
      <p className="text-micro font-500 text-muted">Incentives</p>
      <p
        className={cn(
          "text-lead font-400 tabular-nums",
          target.incentiveMicroUsd === 0n ? "text-muted" : "text-ink",
        )}
      >
        {total}
      </p>
      {target.rewards.length > 0 ? (
        <ul className="flex flex-wrap gap-1">
          {target.rewards.map((reward) => (
            <RewardPill key={reward.tokenAddress} reward={reward} />
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function RewardPill({ reward }: { reward: RewardToken }): ReactElement {
  return (
    <li className="flex h-5 items-center gap-1 rounded-full border border-line bg-inset px-1.5 text-caption font-500 text-secondary tabular-nums">
      <span
        aria-hidden="true"
        className={cn("size-2.5 rounded-full", rewardDot(reward.symbol))}
      />
      {reward.symbol}
      <span className="ml-0.5">
        {reward.microUsd === null
          ? "Unpriced"
          : formatUsdApprox(reward.microUsd)}
      </span>
    </li>
  )
}

function Footer({ footer }: { footer: TargetFooter }): ReactElement {
  return (
    <div className="mt-auto flex flex-col gap-1 px-3.5">
      <p className="flex items-center justify-between gap-2 text-caption">
        <span className="font-500 text-muted">{footer.label}</span>
        {footer.side ? (
          <span
            className={cn(
              "truncate tabular-nums",
              footer.side.tone === "neg" ? "text-neg" : "text-muted",
            )}
          >
            {footer.side.text}
          </span>
        ) : null}
      </p>
      <p className="flex items-end justify-between gap-2">
        <span className="truncate text-title-sm font-400 text-ink tabular-nums">
          {footer.value}
        </span>
        {footer.multiplier ? (
          <span
            className={cn(
              "font-700 tabular-nums",
              footer.multiplier.atMax
                ? "text-lead text-pos"
                : "text-body text-ink",
            )}
          >
            {footer.multiplier.text}
          </span>
        ) : null}
      </p>
    </div>
  )
}

/** Bottom bar flush with the card edge; the same figures are in the text above. */
function Meter({ footer }: { footer: TargetFooter | null }): ReactElement {
  const meter = footer?.meter
  return (
    <div aria-hidden="true" className="flex h-2 shrink-0 bg-inset-2">
      {meter ? (
        <>
          <span
            className={meter.tone === "pos" ? "bg-pos" : "bg-accent"}
            style={{ width: `${Math.max(0, Math.min(1, meter.fill)) * 100}%` }}
          />
          {meter.over > 0 ? (
            <span
              className="bg-neg"
              style={{ width: `${Math.min(1, meter.over) * 100}%` }}
            />
          ) : null}
        </>
      ) : null}
    </div>
  )
}
