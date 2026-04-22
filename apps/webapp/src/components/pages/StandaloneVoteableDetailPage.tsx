import { AddGaugeIncentiveModal } from "@/components/AddGaugeIncentiveModal"
import { ClickableAddress } from "@/components/ClickableAddress"
import { SpringIn } from "@/components/SpringIn"
import { TokenIcon } from "@/components/TokenIcon"
import { formatAPY, useGaugeAPY } from "@/hooks/useAPY"
import { useEpochCountdown } from "@/hooks/useEpochCountdown"
import { useGaugeProfile } from "@/hooks/useGaugeProfiles"
import { useGaugeWeight } from "@/hooks/useGauges"
import { formatUsdValue } from "@/hooks/useTokenPrices"
import { useVotables } from "@/hooks/useVotables"
import { useVoteableTargetMetadata } from "@/hooks/useVoteableTargetMetadata"
import { formatTokenAmount } from "@/utils/format"
import { getStandaloneVoteablePresentation } from "@/utils/voteableTarget"
import { Button, Skeleton, Tag } from "@mezo-org/mezo-clay"
import Link from "next/link"
import { useMemo, useState } from "react"

type StandaloneVoteableDetailPageProps = {
  address: string
}

function targetTypeColor(targetType: string): "blue" | "green" | "purple" {
  if (targetType === "vault") return "purple"
  if (targetType === "pool") return "green"
  return "blue"
}

export default function StandaloneVoteableDetailPage({
  address,
}: StandaloneVoteableDetailPageProps): JSX.Element {
  const { standalone, isLoading } = useVotables()
  const voteable = useMemo(
    () => standalone.find((entry) => entry.targetId.toLowerCase() === address),
    [address, standalone],
  )
  const { metadata, isLoading: isLoadingMetadata } = useVoteableTargetMetadata(
    voteable ? [voteable.targetId] : [],
  )
  const targetMetadata = voteable
    ? metadata.get(voteable.targetId.toLowerCase())
    : undefined
  const { profile, isLoading: isLoadingProfile } = useGaugeProfile(
    voteable?.gauge,
  )
  const { weight } = useGaugeWeight(voteable?.gauge)
  const gaugeHasNoVotes = weight !== undefined && weight === 0n
  const {
    apy,
    totalIncentivesUSD,
    incentivesByToken,
    isLoading: isLoadingApy,
  } = useGaugeAPY(voteable?.gauge, weight)
  const { timeRemaining } = useEpochCountdown()
  const [isAddOpen, setIsAddOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton width="100%" height="80px" animation />
        <Skeleton width="100%" height="200px" animation />
      </div>
    )
  }

  if (!voteable) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
        <p className="font-mono text-sm text-[var(--content-secondary)]">
          <span className="text-[#F7931A]">$</span> voteable not found
        </p>
        <Link
          href="/pools"
          className="mt-4 inline-block text-sm text-[#F7931A]"
          style={{ textDecoration: "none" }}
        >
          &larr; Back to pools
        </Link>
      </div>
    )
  }

  const { title, subtitle, iconSymbol, targetLabel } =
    getStandaloneVoteablePresentation({
      voteable,
      metadata: targetMetadata,
      profile,
    })

  const description =
    profile?.description ??
    (subtitle !== iconSymbol ? subtitle : `${targetLabel} target on Matchbox`)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/pools"
          className="mb-3 inline-flex items-center gap-1 text-xs text-[var(--content-secondary)] transition-colors hover:text-[#F7931A]"
          style={{ textDecoration: "none" }}
        >
          &larr; All pools
        </Link>
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-secondary)]">
            {profile?.profile_picture_url ? (
              <img
                src={profile.profile_picture_url}
                alt={title}
                className="h-full w-full object-cover"
              />
            ) : (
              <TokenIcon symbol={iconSymbol} size={28} />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-[var(--content-primary)]">
                {title}
              </h1>
              <Tag
                color={targetTypeColor(voteable.targetType)}
                closeable={false}
              >
                {targetLabel}
              </Tag>
              <span className="rounded-full bg-[rgba(34,197,94,0.12)] px-2 py-0.5 text-2xs font-medium text-[var(--positive)]">
                Live Gauge
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--content-secondary)]">
              {description}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <SpringIn delay={0} variant="card">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              vAPR
            </p>
            <p
              className={`font-mono text-xl font-semibold tabular-nums ${
                voteable.votingApr > 0
                  ? "text-[#F7931A]"
                  : "text-[var(--content-primary)]"
              }`}
            >
              {formatAPY(voteable.votingApr)}
            </p>
          </div>
        </SpringIn>
        <SpringIn delay={1} variant="card">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              Voter Fees
            </p>
            <p className="font-mono text-xl font-semibold tabular-nums text-[var(--content-primary)]">
              {formatUsdValue(voteable.voterFeesUsd)}
            </p>
          </div>
        </SpringIn>
        <SpringIn delay={2} variant="card">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              External Bribes
            </p>
            <p className="font-mono text-xl font-semibold tabular-nums text-[var(--content-primary)]">
              {formatUsdValue(totalIncentivesUSD || voteable.bribesUsd)}
            </p>
          </div>
        </SpringIn>
        <SpringIn delay={3} variant="card">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              Gauge Weight
            </p>
            <p className="font-mono text-xl font-semibold tabular-nums text-[var(--content-primary)]">
              {weight !== undefined ? formatTokenAmount(weight, 18) : "-"}
            </p>
          </div>
        </SpringIn>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-1">
          <SpringIn delay={4} variant="card">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <h2 className="mb-3 text-sm font-semibold text-[var(--content-primary)]">
                Target Overview
              </h2>
              <p className="text-sm leading-relaxed text-[var(--content-secondary)]">
                {description}
              </p>
            </div>
          </SpringIn>

          <SpringIn delay={5} variant="card">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <h2 className="mb-3 text-sm font-semibold text-[var(--content-primary)]">
                Voting Snapshot
              </h2>
              <dl className="grid grid-cols-1 gap-2 text-xs">
                <div className="flex items-center justify-between">
                  <dt className="text-[var(--content-secondary)]">
                    Current APY
                  </dt>
                  <dd className="font-mono tabular-nums text-[var(--content-primary)]">
                    {isLoadingApy ? "..." : formatAPY(apy)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-[var(--content-secondary)]">
                    Total incentives
                  </dt>
                  <dd className="font-mono tabular-nums text-[var(--content-primary)]">
                    {formatUsdValue(voteable.totalVoterIncentivesUsd)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-[var(--content-secondary)]">
                    Gauge status
                  </dt>
                  <dd className="font-mono tabular-nums text-[var(--content-primary)]">
                    {gaugeHasNoVotes ? "No votes yet" : "Active"}
                  </dd>
                </div>
              </dl>
            </div>
          </SpringIn>

          <SpringIn delay={6} variant="card">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs">
              <h2 className="mb-3 text-sm font-semibold text-[var(--content-primary)]">
                Addresses
              </h2>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-2xs text-[var(--content-tertiary)]">
                    Target
                  </span>
                  <ClickableAddress address={voteable.targetId} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-2xs text-[var(--content-tertiary)]">
                    Gauge
                  </span>
                  <ClickableAddress address={voteable.gauge} />
                </div>
              </div>
            </div>
          </SpringIn>
        </div>

        <div className="lg:col-span-2">
          <SpringIn delay={6} variant="card">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <h2 className="text-sm font-semibold text-[var(--content-primary)]">
                    External bribes
                  </h2>
                  <span className="font-mono text-2xs text-[var(--content-tertiary)]">
                    Rolls to voters in {timeRemaining}
                  </span>
                </div>
                <Button
                  kind="secondary"
                  size="small"
                  onClick={() => setIsAddOpen(true)}
                >
                  Add
                </Button>
              </div>

              {isLoadingApy || isLoadingMetadata || isLoadingProfile ? (
                <div className="flex flex-col gap-2">
                  <Skeleton width="100%" height="40px" animation />
                  <Skeleton width="100%" height="40px" animation />
                </div>
              ) : incentivesByToken.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--border)] p-6 text-center">
                  <p className="text-sm text-[var(--content-secondary)]">
                    No bribes posted this epoch yet. Be the first to fund this
                    {` ${voteable.targetType} `}
                    gauge and attract veMEZO voters.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="rounded-lg border border-[rgba(247,147,26,0.25)] bg-[rgba(247,147,26,0.04)] p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--content-primary)]">
                          This epoch
                        </p>
                        <p className="mt-0.5 text-2xs text-[var(--content-tertiary)]">
                          Claimable by voters after the next rollover.
                        </p>
                      </div>
                      <span className="whitespace-nowrap font-mono text-xs text-[var(--content-secondary)]">
                        {incentivesByToken.length} token
                        {incentivesByToken.length === 1 ? "" : "s"} /{" "}
                        {formatUsdValue(totalIncentivesUSD)}
                      </span>
                    </div>
                    <ul className="flex flex-col divide-y divide-[var(--border)]">
                      {incentivesByToken.map((incentive) => (
                        <li
                          key={incentive.tokenAddress}
                          className="flex items-center justify-between gap-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <TokenIcon symbol={incentive.symbol} size={24} />
                            <span className="text-sm text-[var(--content-primary)]">
                              {incentive.symbol}
                            </span>
                          </div>
                          <div className="flex flex-col items-end leading-tight">
                            <span className="font-mono text-sm tabular-nums text-[var(--content-primary)]">
                              {formatTokenAmount(
                                incentive.amount,
                                incentive.decimals,
                              )}
                            </span>
                            {incentive.usdValue > 0 && (
                              <span className="font-mono text-2xs text-[var(--content-tertiary)]">
                                {formatUsdValue(incentive.usdValue)}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </SpringIn>
        </div>
      </div>

      <AddGaugeIncentiveModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        gaugeAddress={voteable.gauge}
        gaugeName={title}
        gaugeTokenId={undefined}
        gaugeImageUrl={profile?.profile_picture_url}
        gaugeIconSymbol={iconSymbol}
        totalIncentivesUsd={totalIncentivesUSD}
        gaugeHasNoVotes={gaugeHasNoVotes}
      />
    </div>
  )
}
