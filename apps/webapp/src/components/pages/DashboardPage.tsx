import { Layout } from "@/components/Layout"
import { SpringIn } from "@/components/SpringIn"
import {
  formatAPY,
  useGaugeAPY,
  useGaugesAPY,
  useUpcomingVotingAPY,
  useVotingAPY,
} from "@/hooks/useAPY"
import { useBtcPrice } from "@/hooks/useBtcPrice"
import { useGaugeProfile } from "@/hooks/useGaugeProfiles"
import {
  useBoostGaugeForToken,
  useBoostGauges,
  useBoostInfo,
  useGaugeWeight,
} from "@/hooks/useGauges"
import { useVeBTCLocks, useVeMEZOLocks } from "@/hooks/useLocks"
import {
  type ClaimableBribe,
  useAllUsedWeights,
  useAllVoteAllocations,
  useClaimBribes,
  useClaimableBribes,
  useVoteAllocations,
  useVoteState,
} from "@/hooks/useVoting"
import {
  Button,
  Card,
  ParagraphMedium,
  ParagraphSmall,
  Skeleton,
  Tag,
} from "@mezo-org/mezo-clay"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { type Address, formatUnits } from "viem"
import { useAccount } from "wagmi"

// Price constants
const MEZO_PRICE = 0.22
const MEZO_TOKEN_ADDRESS =
  "0x7b7c000000000000000000000000000000000001".toLowerCase()

// Format token values with appropriate precision based on magnitude
function formatTokenValue(amount: bigint, decimals: number): string {
  const value = Number(formatUnits(amount, decimals))
  if (value === 0) return "0"
  if (value >= 1000)
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (value >= 1)
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
  if (value >= 0.0001)
    return value.toLocaleString(undefined, { maximumFractionDigits: 6 })
  // For very small values (like satoshis), show up to 8 decimals
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 8,
    minimumSignificantDigits: 1,
  })
}

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

function VeBTCLockCard({
  lock,
}: { lock: ReturnType<typeof useVeBTCLocks>["locks"][0] }): JSX.Element {
  const { hasGauge, gaugeAddress } = useBoostGaugeForToken(lock.tokenId)
  const { boostMultiplier } = useBoostInfo(lock.tokenId)
  const { profile } = useGaugeProfile(gaugeAddress)
  const { weight: gaugeWeight } = useGaugeWeight(gaugeAddress)
  const { apy, isLoading: isLoadingAPY } = useGaugeAPY(
    gaugeAddress,
    gaugeWeight,
  )

  const unlockDate = new Date(Number(lock.end) * 1000)
  const isExpired = unlockDate < new Date()

  return (
    <Card withBorder overrides={{ Root: { style: { height: "100%" } } }}>
      <div className="flex h-full flex-col py-2">
        {/* Header with Profile Picture, Name, and Status */}
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* Profile Picture */}
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-secondary)]">
              {profile?.profile_picture_url ? (
                <img
                  src={profile.profile_picture_url}
                  alt={`veBTC #${lock.tokenId.toString()}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xs text-[var(--content-secondary)]">
                  #{lock.tokenId.toString()}
                </span>
              )}
            </div>
            {/* Name and Description */}
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-sm font-medium ${
                    profile?.display_name ||
                    profile?.description ||
                    profile?.profile_picture_url
                      ? "text-[var(--positive)]"
                      : "text-[var(--negative)]"
                  }`}
                >
                  {profile?.display_name || `veBTC #${lock.tokenId.toString()}`}
                </span>
                {profile?.display_name && (
                  <span className="inline-flex items-center rounded bg-[rgba(247,147,26,0.15)] border border-[rgba(247,147,26,0.3)] px-1.5 py-0.5 font-mono text-2xs font-semibold tracking-wide text-[#F7931A]">
                    #{lock.tokenId.toString()}
                  </span>
                )}
              </div>
              {profile?.description && (
                <ParagraphSmall
                  color="var(--content-secondary)"
                  overrides={{
                    Block: {
                      style: {
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "180px",
                        margin: 0,
                      },
                    },
                  }}
                >
                  {profile.description}
                </ParagraphSmall>
              )}
            </div>
          </div>
          <Tag
            color={lock.isPermanent ? "green" : isExpired ? "red" : "yellow"}
          >
            {lock.isPermanent ? "Permanent" : isExpired ? "Expired" : "Active"}
          </Tag>
        </div>

        <div className="flex-1">
          <div className="grid grid-cols-2 gap-4 max-[480px]:gap-3">
            <div>
              <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
                Locked Amount
              </p>
              <div className="flex items-center gap-1.5">
                <TokenIcon symbol="BTC" size={18} />
                <span className="font-mono text-sm font-medium text-[var(--content-primary)] tabular-nums">
                  {formatTokenValue(lock.amount, 18)} BTC
                </span>
              </div>
            </div>
            <div>
              <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
                Voting Power
              </p>
              <span className="font-mono text-sm font-medium text-[var(--content-primary)] tabular-nums">
                {formatTokenValue(lock.votingPower, 18)}
              </span>
            </div>
            <div>
              <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
                Current Boost
              </p>
              <span
                className={`font-mono text-sm font-medium tabular-nums ${
                  boostMultiplier > 1
                    ? "text-[var(--positive)]"
                    : "text-[var(--content-primary)]"
                }`}
              >
                {boostMultiplier.toFixed(2)}x
              </span>
            </div>
            <div>
              <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
                Gauge
              </p>
              {hasGauge && gaugeAddress ? (
                <>
                  <Link
                    href={`/gauges/${gaugeAddress}`}
                    className="text-[var(--accent)] no-underline hover:underline"
                  >
                    <span className="text-sm font-medium text-[var(--accent)]">
                      View Gauge →
                    </span>
                  </Link>
                  {!isLoadingAPY &&
                  apy !== null &&
                  (apy > 0 || apy === Number.POSITIVE_INFINITY) ? (
                    <div className="mt-1 flex w-fit items-center rounded border border-[var(--positive-subtle)] bg-[var(--positive-subtle)] px-1.5 py-0.5">
                      <span className="text-xs font-medium text-[var(--positive)]">
                        {formatAPY(apy)} APY
                      </span>
                    </div>
                  ) : (
                    <div className="mt-1 h-[26px]" />
                  )}
                </>
              ) : (
                <>
                  <span className="text-sm text-[var(--content-secondary)]">
                    No Gauge
                  </span>
                  <div className="mt-1 h-[26px]" />
                </>
              )}
            </div>
          </div>
        </div>

        {(lock.isPermanent || !isExpired) && (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <p className="text-xs text-[var(--content-secondary)]">
              Unlocks:{" "}
              {lock.isPermanent ? "Never" : unlockDate.toLocaleDateString()}
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}

function VeMEZOLockCard({
  lock,
  claimableUSD,
  allGaugeAddresses,
  apyMap,
}: {
  lock: ReturnType<typeof useVeMEZOLocks>["locks"][0]
  claimableUSD: number
  allGaugeAddresses: Address[]
  apyMap: Map<string, ReturnType<typeof useGaugeAPY>>
}): JSX.Element {
  const { usedWeight, canVoteInCurrentEpoch } = useVoteState(lock.tokenId)
  const { apy } = useVotingAPY(claimableUSD, usedWeight)

  // Get vote allocations for this specific token
  const { allocations } = useVoteAllocations(lock.tokenId, allGaugeAddresses)

  // Calculate projected APY based on vote allocations
  const { upcomingAPY } = useUpcomingVotingAPY(allocations, apyMap, usedWeight)

  const unlockDate = new Date(Number(lock.end) * 1000)
  const isExpired = unlockDate < new Date()

  return (
    <Card withBorder overrides={{ Root: { style: { height: "100%" } } }}>
      <div className="flex h-full flex-col py-2">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <span className="text-sm font-medium text-[var(--content-primary)]">
              veMEZO #{lock.tokenId.toString()}
            </span>
            {(apy !== null && apy > 0) ||
            (upcomingAPY !== null && upcomingAPY > 0) ? (
              <div className="mt-1 flex items-center gap-1.5">
                {/* Current APY */}
                {apy !== null && apy > 0 && (
                  <span className="inline-flex items-center rounded border border-[rgba(var(--positive-rgb),0.3)] bg-[rgba(var(--positive-rgb),0.15)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--positive)]">
                    {formatAPY(apy)} APY
                  </span>
                )}
                {/* Upcoming/Projected APY */}
                {upcomingAPY !== null && upcomingAPY > 0 && (
                  <>
                    {apy !== null && apy > 0 && (
                      <span className="text-[8px] text-[var(--content-tertiary)]">
                        →
                      </span>
                    )}
                    <span className="inline-flex items-center rounded-sm border border-[var(--border)] bg-[var(--surface-secondary)] px-1 py-0.5 text-[9px] font-medium text-[var(--content-secondary)]">
                      {formatAPY(upcomingAPY)}
                    </span>
                  </>
                )}
              </div>
            ) : (
              <div className="mt-1 h-[30px]" />
            )}
          </div>
          <Tag
            color={lock.isPermanent ? "green" : isExpired ? "red" : "yellow"}
          >
            {lock.isPermanent ? "Permanent" : isExpired ? "Expired" : "Active"}
          </Tag>
        </div>

        <div className="grid flex-1 grid-cols-2 gap-4">
          <div>
            <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
              Locked Amount
            </p>
            <div className="flex items-center gap-1.5">
              <TokenIcon symbol="MEZO" size={18} />
              <span className="font-mono text-sm font-medium text-[var(--content-primary)] tabular-nums">
                {formatTokenValue(lock.amount, 18)} MEZO
              </span>
            </div>
          </div>
          <div>
            <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
              Voting Power
            </p>
            <span className="font-mono text-sm font-medium text-[var(--content-primary)] tabular-nums">
              {formatTokenValue(lock.votingPower, 18)}
            </span>
          </div>
          <div>
            <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
              Used Weight
            </p>
            <span className="font-mono text-sm font-medium text-[var(--content-primary)] tabular-nums">
              {usedWeight ? formatTokenValue(usedWeight, 18) : "0"}
            </span>
          </div>
          <div>
            <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
              Can Vote
            </p>
            <span
              className={`text-sm font-medium ${
                canVoteInCurrentEpoch
                  ? "text-[var(--positive)]"
                  : "text-[var(--warning)]"
              }`}
            >
              {canVoteInCurrentEpoch ? "Yes" : "Next Epoch"}
            </span>
          </div>
        </div>

        {(lock.isPermanent || !isExpired) && (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <p className="text-xs text-[var(--content-secondary)]">
              Unlocks:{" "}
              {lock.isPermanent ? "Never" : unlockDate.toLocaleDateString()}
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}

function ClaimableRewardRow({
  tokenId,
  bribes,
  onClaim,
  isPending,
  isConfirming,
  isLast,
  claimableUSD,
  allGaugeAddresses,
  apyMap,
  btcPrice,
}: {
  tokenId: bigint
  bribes: ClaimableBribe[]
  onClaim: () => void
  isPending: boolean
  isConfirming: boolean
  isLast: boolean
  claimableUSD: number
  allGaugeAddresses: Address[]
  apyMap: Map<string, ReturnType<typeof useGaugeAPY>>
  btcPrice: number | null
}): JSX.Element | null {
  const { usedWeight } = useVoteState(tokenId)
  const { apy } = useVotingAPY(claimableUSD, usedWeight)

  // Get vote allocations for upcoming APY and projected rewards
  const { allocations } = useVoteAllocations(tokenId, allGaugeAddresses)
  const { upcomingAPY, projectedIncentivesUSD, projectedRewardsByToken } =
    useUpcomingVotingAPY(allocations, apyMap, usedWeight)

  // Group rewards by token across all bribes for this tokenId
  const rewardsByToken = useMemo(() => {
    const map = new Map<
      string,
      { symbol: string; decimals: number; amount: bigint; tokenAddress: string }
    >()
    for (const bribe of bribes) {
      for (const reward of bribe.rewards) {
        const key = reward.tokenAddress.toLowerCase()
        const existing = map.get(key)
        if (existing) {
          existing.amount += reward.earned
        } else {
          map.set(key, {
            symbol: reward.symbol,
            decimals: reward.decimals,
            amount: reward.earned,
            tokenAddress: reward.tokenAddress,
          })
        }
      }
    }
    return Array.from(map.values())
  }, [bribes])

  const hasRewards = rewardsByToken.length > 0
  const hasPendingRewards = projectedIncentivesUSD > 0
  const [isExpanded, setIsExpanded] = useState(false)

  if (!hasRewards) {
    return null
  }

  return (
    <div>
      {/* Main row */}
      <div
        className={`flex items-center justify-between gap-4 py-4 max-[600px]:flex-col max-[600px]:items-stretch max-[600px]:gap-4 ${
          isLast && !isExpanded ? "" : "border-b border-[var(--border)]"
        }`}
      >
        {/* Left side: Collapsible chevron and Token ID badge */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex min-w-[180px] items-center gap-3 text-left transition-colors hover:opacity-80"
          type="button"
          aria-label={isExpanded ? "Collapse details" : "Expand details"}
        >
          <span
            className={`inline-block text-sm text-[var(--content-secondary)] transition-transform duration-200 ${
              isExpanded ? "rotate-90" : ""
            }`}
          >
            ▸
          </span>
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-tertiary)]">
            <span className="text-xs font-medium text-[var(--content-secondary)]">
              #{tokenId.toString()}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-[var(--content-primary)]">
              veMEZO
            </span>
            {((apy !== null && apy > 0) ||
              (upcomingAPY !== null && upcomingAPY > 0)) && (
              <div className="flex items-center gap-1">
                {apy !== null && apy > 0 && (
                  <span className="inline-flex items-center rounded-sm border border-[rgba(var(--positive-rgb),0.3)] bg-[rgba(var(--positive-rgb),0.15)] px-1 py-0.5 text-[9px] font-semibold text-[var(--positive)]">
                    {formatAPY(apy)}
                  </span>
                )}
                {upcomingAPY !== null && upcomingAPY > 0 && (
                  <>
                    {apy !== null && apy > 0 && (
                      <span className="text-[8px] text-[var(--content-tertiary)]">
                        →
                      </span>
                    )}
                    <span className="inline-flex items-center rounded-sm border border-[var(--border)] bg-[var(--surface-secondary)] px-1 py-0.5 text-[9px] font-medium text-[var(--content-secondary)]">
                      {formatAPY(upcomingAPY)}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </button>

        {/* Center: Total USD Value (collapsed) or asset icons */}
        <div className="flex flex-1 items-center justify-center gap-3 max-[600px]:justify-start">
          {/* Show stacked token icons as preview */}
          <div className="flex items-center -space-x-1">
            {rewardsByToken.slice(0, 3).map((reward) => (
              <div
                key={reward.symbol}
                className="rounded-full border-2 border-[var(--surface)] bg-[var(--surface)]"
              >
                <TokenIcon symbol={reward.symbol} size={20} />
              </div>
            ))}
          </div>
          {/* Show total USD */}
          <span className="font-mono text-lg font-semibold tabular-nums text-[var(--content-primary)]">
            $
            {claimableUSD.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
          </span>
        </div>

        {/* Right side: Claim button */}
        <Button
          onClick={(e) => {
            e.stopPropagation()
            onClaim()
          }}
          size="small"
          kind="secondary"
          isLoading={isPending || isConfirming}
          disabled={isPending || isConfirming}
          overrides={{
            Root: {
              style: {
                minWidth: "100px",
              },
            },
          }}
        >
          {isPending ? "Confirm..." : isConfirming ? "Claiming..." : "Claim"}
        </Button>
      </div>

      {/* Collapsible details section */}
      {isExpanded && (
        <div
          className={`bg-[var(--surface-secondary)] px-6 py-4 ${
            isLast ? "" : "border-b border-[var(--border)]"
          }`}
        >
          {/* Claimable rewards breakdown */}
          <div className={hasPendingRewards ? "mb-4" : ""}>
            <span className="mb-3 block text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              Claimable Rewards
            </span>
            <div className="flex flex-col gap-2">
              {rewardsByToken.map((reward) => {
                const tokenAmount =
                  Number(reward.amount) / Math.pow(10, reward.decimals)
                const isMezo =
                  reward.tokenAddress.toLowerCase() === MEZO_TOKEN_ADDRESS
                const price = isMezo ? MEZO_PRICE : (btcPrice ?? 0)
                const usdValue = tokenAmount * price

                return (
                  <div
                    key={reward.symbol}
                    className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <TokenIcon symbol={reward.symbol} size={24} />
                      <span className="text-sm font-medium text-[var(--content-primary)]">
                        {reward.symbol}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="font-mono text-sm font-medium tabular-nums text-[var(--content-primary)]">
                        {formatTokenValue(reward.amount, reward.decimals)}
                      </span>
                      {usdValue > 0 && (
                        <span className="text-xs text-[var(--content-tertiary)]">
                          ≈ $
                          {usdValue.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Pending rewards section */}
          {hasPendingRewards && projectedRewardsByToken.length > 0 && (
            <div>
              <span className="mb-3 block text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                Pending Rewards
              </span>
              <div className="flex flex-col gap-2">
                {projectedRewardsByToken.map((reward) => (
                  <div
                    key={reward.tokenAddress}
                    className="flex items-center justify-between rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-3 opacity-75"
                  >
                    <div className="flex items-center gap-3">
                      <TokenIcon symbol={reward.symbol} size={24} />
                      <span className="text-sm font-medium text-[var(--content-secondary)]">
                        {reward.symbol}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="font-mono text-sm font-medium tabular-nums text-[var(--content-secondary)]">
                        ≈ {formatTokenValue(reward.amount, reward.decimals)}
                      </span>
                      {reward.usdValue > 0 && (
                        <span className="text-xs text-[var(--content-tertiary)]">
                          ≈ $
                          {reward.usdValue.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ProjectedRewardRow({
  tokenId,
  allGaugeAddresses,
  apyMap,
  isLast,
}: {
  tokenId: bigint
  allGaugeAddresses: Address[]
  apyMap: Map<string, ReturnType<typeof useGaugeAPY>>
  isLast: boolean
}): JSX.Element | null {
  const { usedWeight } = useVoteState(tokenId)
  const { allocations } = useVoteAllocations(tokenId, allGaugeAddresses)
  const [isExpanded, setIsExpanded] = useState(false)

  // Calculate projected rewards and APY for this specific token
  const { upcomingAPY, projectedIncentivesUSD, projectedRewardsByToken } =
    useUpcomingVotingAPY(allocations, apyMap, usedWeight)

  if (projectedIncentivesUSD === 0) {
    return null
  }

  return (
    <div>
      <div
        className={`flex items-center justify-between gap-4 py-4 max-[600px]:flex-col max-[600px]:items-stretch max-[600px]:gap-4 ${
          isLast && !isExpanded ? "" : "border-b border-[var(--border)]"
        }`}
      >
        {/* Left side: Collapsible chevron and Token ID badge */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex min-w-[180px] items-center gap-3 text-left transition-colors hover:opacity-80"
          type="button"
          aria-label={isExpanded ? "Collapse details" : "Expand details"}
        >
          <span
            className={`inline-block text-sm text-[var(--content-secondary)] transition-transform duration-200 ${
              isExpanded ? "rotate-90" : ""
            }`}
          >
            ▸
          </span>
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-[var(--border)] bg-[var(--surface-tertiary)]">
            <span className="text-xs font-medium text-[var(--content-secondary)]">
              #{tokenId.toString()}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-[var(--content-secondary)]">
              veMEZO
            </span>
            {upcomingAPY !== null && upcomingAPY > 0 && (
              <span className="inline-flex items-center rounded-sm border border-[var(--border)] bg-[var(--surface-secondary)] px-1 py-0.5 text-[9px] font-medium text-[var(--content-secondary)]">
                {formatAPY(upcomingAPY)}
              </span>
            )}
          </div>
        </button>

        {/* Center: Total USD Value with token icons */}
        <div className="flex flex-1 items-center justify-center gap-3 max-[600px]:justify-start">
          {/* Show stacked token icons as preview */}
          <div className="flex items-center -space-x-1">
            {projectedRewardsByToken.slice(0, 3).map((reward) => (
              <div
                key={reward.tokenAddress}
                className="rounded-full border-2 border-[var(--surface)] bg-[var(--surface)] opacity-60"
              >
                <TokenIcon symbol={reward.symbol} size={20} />
              </div>
            ))}
          </div>
          <span className="font-mono text-lg font-semibold tabular-nums text-[var(--content-secondary)]">
            ≈ $
            {projectedIncentivesUSD.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
          </span>
        </div>

        {/* Right side: Disabled Claim button */}
        <Button
          size="small"
          kind="secondary"
          disabled
          overrides={{
            Root: {
              style: {
                minWidth: "100px",
                opacity: 0.5,
              },
            },
          }}
        >
          Pending
        </Button>
      </div>

      {/* Collapsible details section */}
      {isExpanded && (
        <div
          className={`bg-[var(--surface-secondary)] px-6 py-4 ${
            isLast ? "" : "border-b border-[var(--border)]"
          }`}
        >
          {/* Pending rewards breakdown */}
          <div>
            <span className="mb-3 block text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              Pending Rewards
            </span>
            <div className="flex flex-col gap-2">
              {projectedRewardsByToken.map((reward) => (
                <div
                  key={reward.tokenAddress}
                  className="flex items-center justify-between rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-3 opacity-75"
                >
                  <div className="flex items-center gap-3">
                    <TokenIcon symbol={reward.symbol} size={24} />
                    <span className="text-sm font-medium text-[var(--content-secondary)]">
                      {reward.symbol}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="font-mono text-sm font-medium tabular-nums text-[var(--content-secondary)]">
                      ≈ {formatTokenValue(reward.amount, reward.decimals)}
                    </span>
                    {reward.usdValue > 0 && (
                      <span className="text-xs text-[var(--content-tertiary)]">
                        ≈ $
                        {reward.usdValue.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function DashboardPage(): JSX.Element {
  const { isConnected } = useAccount()
  const { locks: veBTCLocks, isLoading: isLoadingVeBTC } = useVeBTCLocks()
  const { locks: veMEZOLocks, isLoading: isLoadingVeMEZO } = useVeMEZOLocks()
  const { price: btcPrice } = useBtcPrice()

  const veMEZOTokenIds = useMemo(
    () => veMEZOLocks.map((lock) => lock.tokenId),
    [veMEZOLocks],
  )

  const {
    claimableBribes,
    totalClaimable,
    refetch: refetchBribes,
  } = useClaimableBribes(veMEZOTokenIds)

  const {
    claimBribes,
    isPending: isClaimPending,
    isConfirming: isClaimConfirming,
    isSuccess: isClaimSuccess,
  } = useClaimBribes()

  // Refetch bribes after successful claim
  useEffect(() => {
    if (isClaimSuccess) {
      refetchBribes()
    }
  }, [isClaimSuccess, refetchBribes])

  // Group claimable bribes by tokenId
  const bribesGroupedByTokenId = useMemo(() => {
    const map = new Map<string, ClaimableBribe[]>()
    for (const bribe of claimableBribes) {
      const key = bribe.tokenId.toString()
      const existing = map.get(key) ?? []
      existing.push(bribe)
      map.set(key, existing)
    }
    return map
  }, [claimableBribes])

  // Calculate total claimable USD value
  const totalClaimableUSD = useMemo(() => {
    let total = 0
    for (const [tokenAddr, info] of totalClaimable.entries()) {
      const tokenAmount = Number(info.amount) / Math.pow(10, info.decimals)
      const isMezo = tokenAddr.toLowerCase() === MEZO_TOKEN_ADDRESS
      const price = isMezo ? MEZO_PRICE : (btcPrice ?? 0)
      total += tokenAmount * price
    }
    return total
  }, [totalClaimable, btcPrice])

  // Calculate claimable USD per tokenId
  const claimableUSDByTokenId = useMemo(() => {
    const map = new Map<string, number>()
    for (const bribe of claimableBribes) {
      const tokenIdKey = bribe.tokenId.toString()
      let usdValue = 0
      for (const reward of bribe.rewards) {
        const tokenAmount =
          Number(reward.earned) / Math.pow(10, reward.decimals)
        const isMezo = reward.tokenAddress.toLowerCase() === MEZO_TOKEN_ADDRESS
        const price = isMezo ? MEZO_PRICE : (btcPrice ?? 0)
        usdValue += tokenAmount * price
      }
      const existing = map.get(tokenIdKey) ?? 0
      map.set(tokenIdKey, existing + usdValue)
    }
    return map
  }, [claimableBribes, btcPrice])

  const handleClaimBribes = (tokenId: bigint) => {
    const bribesForToken = bribesGroupedByTokenId.get(tokenId.toString()) ?? []
    if (bribesForToken.length === 0) return

    const bribesData = bribesForToken.map((bribe) => ({
      bribeAddress: bribe.bribeAddress,
      tokens: bribe.rewards.map((r) => r.tokenAddress),
    }))

    claimBribes(tokenId, bribesData)
  }

  const isLoading = isLoadingVeBTC || isLoadingVeMEZO

  const totalVeBTCVotingPower = veBTCLocks.reduce(
    (acc, lock) => acc + lock.votingPower,
    0n,
  )
  const totalVeMEZOVotingPower = veMEZOLocks.reduce(
    (acc, lock) => acc + lock.votingPower,
    0n,
  )

  // Calculate total APY based on total claimable and total veMEZO voting power
  const { apy: totalAPY } = useVotingAPY(
    totalClaimableUSD,
    totalVeMEZOVotingPower,
  )

  // Get all gauges for upcoming APY calculation
  const { gauges: allGauges } = useBoostGauges()

  // Build gauge data for APY map
  const gaugeDataForAPY = useMemo(() => {
    return allGauges.map((gauge) => ({
      address: gauge.address,
      totalWeight: gauge.totalWeight,
    }))
  }, [allGauges])

  // Get APY map for all gauges
  const { apyMap } = useGaugesAPY(gaugeDataForAPY)

  // Get all gauge addresses for vote allocation queries
  const allGaugeAddresses = useMemo(() => {
    return allGauges.map((g) => g.address)
  }, [allGauges])

  // Get aggregated vote allocations across all veMEZO tokens
  const { aggregatedAllocations } = useAllVoteAllocations(
    veMEZOTokenIds,
    allGaugeAddresses,
  )

  // Get total used weight across all veMEZO tokens
  const { totalUsedWeight } = useAllUsedWeights(veMEZOTokenIds)

  // Calculate upcoming APY based on aggregated vote proportions
  const { upcomingAPY, projectedIncentivesUSD } = useUpcomingVotingAPY(
    aggregatedAllocations,
    apyMap,
    totalUsedWeight,
  )

  const hasClaimableRewards = claimableBribes.length > 0
  const hasFutureRewards = projectedIncentivesUSD > 0
  const showRewardsSection = hasClaimableRewards || hasFutureRewards

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="mb-2 text-2xl font-semibold text-[var(--content-primary)]">
            <span className="text-[#F7931A]">$</span> dashboard --status
          </h1>
          <ParagraphMedium color="var(--content-secondary)">
            Track your veBTC and veMEZO positions
          </ParagraphMedium>
        </header>

        {!isConnected ? (
          <SpringIn delay={0} variant="card">
            <Card withBorder overrides={{}}>
              <div className="py-12 text-center">
                <ParagraphMedium color="var(--content-secondary)">
                  Connect your wallet to view your dashboard
                </ParagraphMedium>
              </div>
            </Card>
          </SpringIn>
        ) : isLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton width="100%" height="100px" animation />
            <Skeleton width="100%" height="200px" animation />
            <Skeleton width="100%" height="200px" animation />
          </div>
        ) : (
          <>
            {/* Claimable Rewards Section */}
            {showRewardsSection && (
              <SpringIn delay={0} variant="card">
                <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                  {/* Header with total rewards */}
                  <div className="border-b border-[var(--border)] bg-gradient-to-br from-[var(--surface)] to-[var(--surface-secondary)] px-7 py-6">
                    <div className="flex items-start justify-between gap-6 max-[600px]:flex-col max-[600px]:gap-5">
                      <div className="flex-1">
                        <div className="mb-4 flex items-center gap-3">
                          <p className="text-2xs font-medium uppercase tracking-wider text-[var(--content-secondary)]">
                            Total Claimable
                          </p>
                          {((totalAPY !== null && totalAPY > 0) ||
                            (upcomingAPY !== null && upcomingAPY > 0)) && (
                            <div className="inline-flex items-center gap-1.5">
                              {totalAPY !== null && totalAPY > 0 && (
                                <span className="inline-flex items-center rounded-full border border-[rgba(var(--positive-rgb),0.4)] bg-[rgba(var(--positive-rgb),0.15)] px-2.5 py-1 text-xs font-semibold text-[var(--positive)]">
                                  {formatAPY(totalAPY)} APY
                                </span>
                              )}
                              {upcomingAPY !== null && upcomingAPY > 0 && (
                                <>
                                  {totalAPY !== null && totalAPY > 0 && (
                                    <span className="text-xs text-[var(--content-tertiary)]">
                                      →
                                    </span>
                                  )}
                                  <span
                                    className={`inline-flex items-center rounded-full border px-2.5 py-1 font-medium ${
                                      totalAPY === null || totalAPY === 0
                                        ? "border-[rgba(var(--positive-rgb),0.4)] bg-[rgba(var(--positive-rgb),0.15)] text-xs font-semibold text-[var(--positive)]"
                                        : "border-[var(--border)] bg-[var(--surface)] text-[11px] text-[var(--content-secondary)]"
                                    }`}
                                  >
                                    {formatAPY(upcomingAPY)}
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Total USD Value - prominent display */}
                        {hasClaimableRewards && totalClaimableUSD > 0 && (
                          <div className="mb-5">
                            <span className="font-mono text-4xl font-bold tabular-nums text-[var(--content-primary)]">
                              $
                              {totalClaimableUSD.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                        )}

                        {/* Asset breakdown */}
                        {hasClaimableRewards && (
                          <div className="flex flex-wrap gap-3">
                            {Array.from(totalClaimable.entries()).map(
                              ([tokenAddr, info]) => {
                                const tokenAmount =
                                  Number(info.amount) /
                                  Math.pow(10, info.decimals)
                                const isMezo =
                                  tokenAddr.toLowerCase() === MEZO_TOKEN_ADDRESS
                                const price = isMezo
                                  ? MEZO_PRICE
                                  : (btcPrice ?? 0)
                                const usdValue = tokenAmount * price

                                return (
                                  <div
                                    key={tokenAddr}
                                    className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                                  >
                                    <TokenIcon symbol={info.symbol} size={24} />
                                    <div className="flex flex-col">
                                      <div className="flex items-baseline gap-1.5">
                                        <span className="font-mono text-base font-semibold tabular-nums text-[var(--content-primary)]">
                                          {formatTokenValue(
                                            info.amount,
                                            info.decimals,
                                          )}
                                        </span>
                                        <span className="text-xs text-[var(--content-secondary)]">
                                          {info.symbol}
                                        </span>
                                      </div>
                                      {usdValue > 0 && (
                                        <span className="text-xs text-[var(--content-tertiary)]">
                                          $
                                          {usdValue.toLocaleString(undefined, {
                                            maximumFractionDigits: 2,
                                          })}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )
                              },
                            )}
                          </div>
                        )}

                        {/* Projected future rewards */}
                        {hasFutureRewards && (
                          <div
                            className={
                              hasClaimableRewards
                                ? "mt-5 border-t border-[var(--border)] pt-5"
                                : ""
                            }
                          >
                            <div className="flex items-center gap-3">
                              <p className="text-2xs font-medium uppercase tracking-wider text-[var(--content-tertiary)]">
                                Pending Rewards
                              </p>
                              <span className="font-mono text-lg font-semibold tabular-nums text-[var(--content-secondary)]">
                                +$
                                {projectedIncentivesUSD.toLocaleString(
                                  undefined,
                                  { maximumFractionDigits: 2 },
                                )}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {hasClaimableRewards && (
                        <div className="flex items-center gap-2 self-start rounded-full border border-[rgba(var(--positive-rgb),0.3)] bg-[rgba(var(--positive-rgb),0.1)] px-4 py-2">
                          <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--positive)] shadow-[0_0_10px_var(--positive)]" />
                          <span className="text-sm font-medium text-[var(--positive)]">
                            {bribesGroupedByTokenId.size}{" "}
                            {bribesGroupedByTokenId.size === 1
                              ? "position"
                              : "positions"}{" "}
                            ready
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Reward rows */}
                  {(hasClaimableRewards || hasFutureRewards) && (
                    <div className="px-7 py-1 pb-2">
                      {/* Calculate which tokens have pending rewards but no claimable rewards */}
                      {(() => {
                        const tokensWithPendingOnly: Array<{
                          tokenId: bigint
                          index: number
                        }> = []
                        veMEZOLocks.forEach((lock, index) => {
                          const tokenIdStr = lock.tokenId.toString()
                          const hasClaimable =
                            bribesGroupedByTokenId.has(tokenIdStr)
                          if (!hasClaimable) {
                            tokensWithPendingOnly.push({
                              tokenId: lock.tokenId,
                              index,
                            })
                          }
                        })

                        // Calculate total rows to determine last one
                        const totalClaimableRows = bribesGroupedByTokenId.size
                        const totalPendingOnlyRows =
                          tokensWithPendingOnly.length
                        const totalRows =
                          totalClaimableRows + totalPendingOnlyRows

                        let currentRowIndex = 0

                        return (
                          <>
                            {/* Claimable rewards section */}
                            {hasClaimableRewards && (
                              <>
                                {Array.from(
                                  bribesGroupedByTokenId.entries(),
                                ).map(([tokenIdStr, bribes]) => {
                                  currentRowIndex++
                                  return (
                                    <ClaimableRewardRow
                                      key={`claimable-${tokenIdStr}`}
                                      tokenId={BigInt(tokenIdStr)}
                                      bribes={bribes}
                                      onClaim={() =>
                                        handleClaimBribes(BigInt(tokenIdStr))
                                      }
                                      isPending={isClaimPending}
                                      isConfirming={isClaimConfirming}
                                      isLast={currentRowIndex === totalRows}
                                      claimableUSD={
                                        claimableUSDByTokenId.get(tokenIdStr) ??
                                        0
                                      }
                                      allGaugeAddresses={allGaugeAddresses}
                                      apyMap={apyMap}
                                      btcPrice={btcPrice}
                                    />
                                  )
                                })}
                              </>
                            )}

                            {/* Projected rewards section - only for tokens without claimable rewards */}
                            {tokensWithPendingOnly.map(({ tokenId }) => {
                              currentRowIndex++
                              return (
                                <ProjectedRewardRow
                                  key={`projected-${tokenId.toString()}`}
                                  tokenId={tokenId}
                                  allGaugeAddresses={allGaugeAddresses}
                                  apyMap={apyMap}
                                  isLast={currentRowIndex === totalRows}
                                />
                              )
                            })}
                          </>
                        )
                      })()}
                    </div>
                  )}
                </div>
              </SpringIn>
            )}

            <div className="grid grid-cols-4 gap-4 max-[1024px]:grid-cols-2 max-[480px]:grid-cols-1 max-[480px]:gap-3">
              <SpringIn delay={showRewardsSection ? 1 : 0} variant="card">
                <Card withBorder overrides={{}}>
                  <div className="py-2">
                    <div className="mb-1 flex items-center gap-1.5">
                      <TokenIcon symbol="MEZO" size={14} />
                      <p className="text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
                        Your veMEZO Locks
                      </p>
                    </div>
                    <span className="font-mono text-xl font-semibold text-[var(--content-primary)]">
                      {veMEZOLocks.length}
                    </span>
                  </div>
                </Card>
              </SpringIn>

              <SpringIn delay={showRewardsSection ? 2 : 1} variant="card">
                <Card withBorder overrides={{}}>
                  <div className="py-2">
                    <div className="mb-1 flex items-center gap-1.5">
                      <TokenIcon symbol="MEZO" size={14} />
                      <p className="text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
                        Your veMEZO Power
                      </p>
                    </div>
                    <span className="font-mono text-xl font-semibold tabular-nums text-[var(--content-primary)]">
                      {formatTokenValue(totalVeMEZOVotingPower, 18)}
                    </span>
                  </div>
                </Card>
              </SpringIn>

              <SpringIn delay={showRewardsSection ? 3 : 2} variant="card">
                <Card withBorder overrides={{}}>
                  <div className="py-2">
                    <div className="mb-1 flex items-center gap-1.5">
                      <TokenIcon symbol="BTC" size={14} />
                      <p className="text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
                        Your veBTC Locks
                      </p>
                    </div>
                    <span className="font-mono text-xl font-semibold text-[var(--content-primary)]">
                      {veBTCLocks.length}
                    </span>
                  </div>
                </Card>
              </SpringIn>

              <SpringIn delay={showRewardsSection ? 4 : 3} variant="card">
                <Card withBorder overrides={{}}>
                  <div className="py-2">
                    <div className="mb-1 flex items-center gap-1.5">
                      <TokenIcon symbol="BTC" size={14} />
                      <p className="text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
                        Your veBTC Power
                      </p>
                    </div>
                    <span className="font-mono text-xl font-semibold tabular-nums text-[var(--content-primary)]">
                      {formatTokenValue(totalVeBTCVotingPower, 18)}
                    </span>
                  </div>
                </Card>
              </SpringIn>
            </div>

            <SpringIn delay={showRewardsSection ? 5 : 4} variant="card">
              <div>
                <h2 className="mb-4 text-xl font-semibold text-[var(--content-primary)]">
                  Your veMEZO Locks
                </h2>
                {veMEZOLocks.length === 0 ? (
                  <Card withBorder overrides={{}}>
                    <div className="py-8 text-center">
                      <ParagraphMedium color="var(--content-secondary)">
                        No veMEZO locks found
                      </ParagraphMedium>
                    </div>
                  </Card>
                ) : (
                  <div className="grid grid-cols-3 gap-4 max-[1024px]:grid-cols-2 max-[640px]:grid-cols-1 max-[480px]:gap-3">
                    {veMEZOLocks.map((lock, index) => (
                      <SpringIn
                        key={lock.tokenId.toString()}
                        delay={(showRewardsSection ? 6 : 5) + index}
                        variant="card"
                      >
                        <VeMEZOLockCard
                          lock={lock}
                          claimableUSD={
                            claimableUSDByTokenId.get(
                              lock.tokenId.toString(),
                            ) ?? 0
                          }
                          allGaugeAddresses={allGaugeAddresses}
                          apyMap={apyMap}
                        />
                      </SpringIn>
                    ))}
                  </div>
                )}
              </div>
            </SpringIn>

            <SpringIn
              delay={(showRewardsSection ? 6 : 5) + veMEZOLocks.length}
              variant="card"
            >
              <div>
                <h2 className="mb-4 text-xl font-semibold text-[var(--content-primary)]">
                  Your veBTC Locks
                </h2>
                {veBTCLocks.length === 0 ? (
                  <Card withBorder overrides={{}}>
                    <div className="py-8 text-center">
                      <ParagraphMedium color="var(--content-secondary)">
                        No veBTC locks found
                      </ParagraphMedium>
                    </div>
                  </Card>
                ) : (
                  <div className="grid grid-cols-3 gap-4 max-[1024px]:grid-cols-2 max-[640px]:grid-cols-1 max-[480px]:gap-3">
                    {veBTCLocks.map((lock, index) => (
                      <SpringIn
                        key={lock.tokenId.toString()}
                        delay={
                          (showRewardsSection ? 7 : 6) +
                          veMEZOLocks.length +
                          index
                        }
                        variant="card"
                      >
                        <VeBTCLockCard lock={lock} />
                      </SpringIn>
                    ))}
                  </div>
                )}
              </div>
            </SpringIn>
          </>
        )}
      </div>
    </Layout>
  )
}
