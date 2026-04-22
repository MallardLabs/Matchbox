import { AddGaugeIncentiveModal } from "@/components/AddGaugeIncentiveModal"
import { ClickableAddress } from "@/components/ClickableAddress"
import { TokenIcon } from "@/components/TokenIcon"
import type { GaugeProfile } from "@/config/supabase"
import { useGaugeWeight } from "@/hooks/useGauges"
import { formatUsdValue } from "@/hooks/useTokenPrices"
import type { StandaloneVotableSummary } from "@/hooks/useVotables"
import type { VoteableTargetMetadata } from "@/hooks/useVoteableTargetMetadata"
import { getStandaloneVoteablePresentation } from "@/utils/voteableTarget"
import { Button, Tag } from "@mezo-org/mezo-clay"
import Link from "next/link"
import { useState } from "react"

function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0%"
  if (value < 0.01) return "<0.01%"
  if (value < 1) return `${value.toFixed(2)}%`
  if (value < 100) return `${value.toFixed(1)}%`
  return `${Math.round(value)}%`
}

function targetTypeColor(targetType: string): "blue" | "green" | "purple" {
  if (targetType === "vault") return "purple"
  if (targetType === "pool") return "green"
  return "blue"
}

type StandaloneVoteableCardProps = {
  voteable: StandaloneVotableSummary
  metadata: VoteableTargetMetadata | undefined
  profile: GaugeProfile | null | undefined
}

export default function StandaloneVoteableCard({
  voteable,
  metadata,
  profile,
}: StandaloneVoteableCardProps): JSX.Element {
  const [isAddOpen, setIsAddOpen] = useState(false)
  const { weight } = useGaugeWeight(voteable.gauge)
  const gaugeHasNoVotes = weight !== undefined && weight === 0n
  const detailHref = `/voteables/${voteable.targetId}`
  const { title, subtitle, iconSymbol, targetLabel } =
    getStandaloneVoteablePresentation({
      voteable,
      metadata,
      profile,
    })

  return (
    <>
      <article className="group relative flex h-full min-w-0 flex-col gap-4 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex items-start justify-between gap-3">
          <Link
            href={detailHref}
            className="flex min-w-0 items-center gap-3 text-inherit no-underline"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-secondary)]">
              {profile?.profile_picture_url ? (
                <img
                  src={profile.profile_picture_url}
                  alt={title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <TokenIcon symbol={iconSymbol} size={20} className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-[var(--content-primary)]">
                  {title}
                </h3>
              </div>
              <p className="mt-0.5 truncate text-2xs text-[var(--content-tertiary)]">
                {subtitle}
              </p>
            </div>
          </Link>

          <div className="flex flex-shrink-0 flex-col items-end gap-1">
            <Tag color={targetTypeColor(voteable.targetType)} closeable={false}>
              {targetLabel}
            </Tag>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-[var(--content-tertiary)]">vAPR</dt>
            <dd
              className={`font-mono tabular-nums ${
                voteable.votingApr > 0
                  ? "text-[#F7931A]"
                  : "text-[var(--content-primary)]"
              }`}
            >
              {formatPercent(voteable.votingApr)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--content-tertiary)]">Voter Fees</dt>
            <dd
              className={`font-mono tabular-nums ${
                voteable.voterFeesUsd > 0
                  ? "text-[#F7931A]"
                  : "text-[var(--content-primary)]"
              }`}
            >
              {formatUsdValue(voteable.voterFeesUsd)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--content-tertiary)]">Bribes</dt>
            <dd
              className={`font-mono tabular-nums ${
                voteable.bribesUsd > 0
                  ? "text-[#F7931A]"
                  : "text-[var(--content-primary)]"
              }`}
            >
              {formatUsdValue(voteable.bribesUsd)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--content-tertiary)]">Total Incentives</dt>
            <dd
              className={`font-mono tabular-nums ${
                voteable.totalVoterIncentivesUsd > 0
                  ? "text-[var(--content-primary)]"
                  : "text-[var(--content-secondary)]"
              }`}
            >
              {formatUsdValue(voteable.totalVoterIncentivesUsd)}
            </dd>
          </div>
        </dl>

        <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3 text-2xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--content-tertiary)]">Target</span>
            <ClickableAddress address={voteable.targetId} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--content-tertiary)]">Gauge</span>
            <ClickableAddress address={voteable.gauge} />
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
          <Link
            href={detailHref}
            className="text-xs text-[var(--content-secondary)] transition-colors hover:text-[#F7931A]"
            style={{ textDecoration: "none" }}
          >
            View details &rarr;
          </Link>
          <Button
            kind="primary"
            size="small"
            onClick={() => setIsAddOpen(true)}
            overrides={{
              BaseButton: { style: { height: "32px" } },
            }}
          >
            Add Incentives
          </Button>
        </div>
      </article>

      <AddGaugeIncentiveModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        gaugeAddress={voteable.gauge}
        gaugeName={title}
        gaugeTokenId={undefined}
        gaugeImageUrl={profile?.profile_picture_url}
        gaugeIconSymbol={iconSymbol}
        totalIncentivesUsd={voteable.bribesUsd}
        gaugeHasNoVotes={gaugeHasNoVotes}
      />
    </>
  )
}
