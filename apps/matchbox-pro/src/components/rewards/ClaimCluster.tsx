import Button from "@/components/ui/Button"
import { cn } from "@/lib/cn"
import { formatMicroUsd, formatTokenAmountDigits } from "@/lib/money"
import type { ReactElement } from "react"
import type { RewardSource } from "./rewardRows"

const VISIBLE_SOURCES = 5

type ClaimClusterProps = {
  value: string
  natives: string
  note: string | null
  warn: boolean
  sources: RewardSource[]
  lockOrder: string[]
  reviewLabel: string
  canReview: boolean
  onReview: () => void
}

/** Pen "Claim cluster": claimable hero, native breakdown, signature note, and source rows. */
export default function ClaimCluster({
  value,
  natives,
  note,
  warn,
  sources,
  lockOrder,
  reviewLabel,
  canReview,
  onReview,
}: ClaimClusterProps): ReactElement {
  const hidden = sources.length - VISIBLE_SOURCES
  return (
    <section
      aria-labelledby="claimable-heading"
      className="flex min-w-0 flex-col gap-2.5"
    >
      <h2 id="claimable-heading" className="text-[13px] text-muted">
        Claimable now
      </h2>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[40px] font-600 leading-none tabular-nums tracking-tight text-ink">
          {value}
        </p>
        <Button
          disabled={!canReview}
          onClick={onReview}
          className="h-9 rounded-md px-3.5 text-[13px] font-600"
        >
          {reviewLabel}
        </Button>
      </div>
      {natives ? (
        <p className="text-[13px] tabular-nums text-secondary">{natives}</p>
      ) : null}
      <p aria-live="polite">
        {note ? (
          <span
            className={cn(
              "inline-flex h-[22px] items-center rounded-[5px] px-2 text-[11px] font-650",
              warn
                ? "bg-accent-soft text-accent-ink"
                : "bg-inset text-secondary",
            )}
          >
            {note}
          </span>
        ) : null}
      </p>
      {sources.length > 0 ? (
        <ul>
          {sources.slice(0, VISIBLE_SOURCES).map((source) => (
            <li
              key={source.key}
              className="flex items-center gap-2.5 border-b border-line py-2"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="truncate text-[13px] font-500 text-ink">
                  {source.name} · veMEZO #{source.tokenId.toString()}
                </p>
                <p className="truncate font-mono text-[11px] text-muted">
                  BribeVotingReward {source.bribe.slice(0, 6)}…
                  {source.bribe.slice(-4)}
                </p>
              </div>
              <p className="hidden w-[140px] truncate text-right text-[12px] tabular-nums text-secondary sm:block">
                {source.rewards
                  .map(
                    (reward) =>
                      `${formatTokenAmountDigits(reward.earned, reward.decimals, 2)} ${reward.symbol}`,
                  )
                  .join(" · ")}
              </p>
              <p className="w-[76px] text-right text-[13px] font-600 tabular-nums text-ink">
                {source.unpriced === source.rewards.length
                  ? "—"
                  : formatMicroUsd(source.usdMicro)}
              </p>
              <span className="inline-flex h-[22px] items-center rounded bg-inset px-2 text-[10px] text-secondary">
                Signature {lockOrder.indexOf(source.tokenId.toString()) + 1}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {hidden > 0 ? (
        <p className="text-[12px] text-muted">+{hidden} more</p>
      ) : null}
    </section>
  )
}
