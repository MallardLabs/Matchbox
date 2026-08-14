import { AnimatedNumber } from "@/components/AnimatedNumber"
import GaugeCard from "@/components/GaugeCard"
import MarqueeText from "@/components/MarqueeText"
import PaginationControls from "@/components/PaginationControls"
import { SpringIn } from "@/components/SpringIn"
import { TokenIcon } from "@/components/TokenIcon"
import Tooltip from "@/components/Tooltip"
import type { GaugeProfile } from "@/config/supabase"
import {
  type GaugeAPYData,
  type ProjectedTokenReward,
  formatAPY,
  useGaugesAPY,
  useUpcomingVotingAPY,
} from "@/hooks/useAPY"
import { useBtcPrice } from "@/hooks/useBtcPrice"
import { useAllGaugeProfiles } from "@/hooks/useGaugeProfiles"
import { useGaugeWatchlist } from "@/hooks/useGaugeWatchlist"
import { useBatchGaugeData, useBoostGauges } from "@/hooks/useGauges"
import { useVeBTCLocks, useVeMEZOLocks } from "@/hooks/useLocks"
import { useMezoPrice } from "@/hooks/useMezoPrice"
import {
  type ClaimLockRequest,
  useMultiLockClaimBribes,
} from "@/hooks/useMultiLockClaimBribes"
import { usePagination } from "@/hooks/usePagination"
import {
  type ValidatorGaugeIncentives,
  useUpcomingValidatorRewards,
  useValidatorGaugeIncentives,
  useValidatorVoteAllocations,
} from "@/hooks/useValidatorRewards"
import {
  type ClaimableBribe,
  type VoteAllocation,
  useAllUsedWeights,
  useAllVoteAllocations,
  useBatchVoteState,
  useClaimBribes,
  useClaimableBribes,
  useClaimableValidatorBribes,
  usePokeBoost,
} from "@/hooks/useVoting"
import {
  Button,
  Card,
  ChevronDown,
  ChevronUp,
  Input,
  ParagraphMedium,
  ParagraphSmall,
  Skeleton,
  Tag,
} from "@mezo-org/mezo-clay"
import dynamic from "next/dynamic"
import Link from "next/link"
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react"
import { type Address, formatUnits } from "viem"
import { useAccount } from "wagmi"

import { getTokenUsdPrice } from "@repo/shared"

const TransferProfileModal = dynamic(
  () =>
    import("@/components/TransferProfileModal").then(
      (mod) => mod.TransferProfileModal,
    ),
  { ssr: false },
)

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

type GaugeSortColumn =
  | "veBTCWeight"
  | "veMEZOWeight"
  | "boost"
  | "optimalVeMEZO"
  | "incentives"
  | "apy"
  | null
type SortDirection = "asc" | "desc"
type StatusFilter = "all" | "active" | "inactive" | "watching"
const GAUGES_PER_PAGE = 9

function VeBTCLockCard({
  lock,
  hasGauge,
  gaugeAddress,
  boostMultiplier,
  profile,
  apy,
  isLoadingAPY,
  validatorClaimableUSD,
  validatorAllocations,
  validatorUsedWeight,
  validatorIncentivesByGauge,
}: {
  lock: ReturnType<typeof useVeBTCLocks>["locks"][0]
  hasGauge: boolean
  gaugeAddress: Address | undefined
  boostMultiplier: number
  profile: GaugeProfile | null
  apy: number | null
  isLoadingAPY: boolean
  /** Unclaimed validator-gauge bribes this NFT has earned. */
  validatorClaimableUSD: number
  validatorAllocations: VoteAllocation[]
  validatorUsedWeight: bigint | undefined
  validatorIncentivesByGauge: Map<string, ValidatorGaugeIncentives>
}): JSX.Element {
  const unlockDate = new Date(Number(lock.end) * 1000)
  const isExpired = unlockDate < new Date()
  const {
    pokeBoost,
    isPending: isPokePending,
    isConfirming: isPokeConfirming,
  } = usePokeBoost()
  // Validator-gauge rewards this NFT is on track for at the next epoch flip
  const { projectedIncentivesUSD: validatorProjectedUSD } =
    useUpcomingValidatorRewards(
      validatorAllocations,
      validatorIncentivesByGauge,
      validatorUsedWeight,
    )

  const cardContent = (
    <Card
      withBorder
      overrides={{
        Root: {
          style: {
            height: "100%",
            ...(hasGauge && gaugeAddress
              ? { cursor: "pointer", transition: "opacity 0.15s ease" }
              : {}),
          },
          props: {
            onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => {
              if (hasGauge && gaugeAddress) {
                e.currentTarget.style.opacity = "0.85"
              }
            },
            onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
              if (hasGauge && gaugeAddress) {
                e.currentTarget.style.opacity = "1"
              }
            },
          },
        },
      }}
    >
      <div className="flex h-full flex-col py-2">
        {/* Header with Profile Picture, Name, and Status */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
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
              <div className="flex items-center gap-2">
                <MarqueeText
                  className={`min-w-0 flex-1 text-sm font-medium ${
                    profile?.display_name ||
                    profile?.description ||
                    profile?.profile_picture_url
                      ? "text-[var(--positive)]"
                      : "text-[var(--negative)]"
                  }`}
                >
                  {profile?.display_name || `veBTC #${lock.tokenId.toString()}`}
                </MarqueeText>
                {profile?.display_name && (
                  <span className="inline-flex flex-shrink-0 items-center rounded bg-[rgba(247,147,26,0.15)] border border-[rgba(247,147,26,0.3)] px-1.5 py-0.5 font-mono text-2xs font-semibold tracking-wide text-[#F7931A]">
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
              {(validatorClaimableUSD > 0 || validatorProjectedUSD > 0) && (
                <div className="flex flex-wrap items-center gap-1">
                  {validatorClaimableUSD > 0 && (
                    <span className="inline-flex items-center rounded-sm border border-[rgba(var(--positive-rgb),0.3)] bg-[rgba(var(--positive-rgb),0.15)] px-1 py-0.5 text-[9px] font-semibold text-[var(--positive)]">
                      ${validatorClaimableUSD.toFixed(2)} claimable
                    </span>
                  )}
                  {validatorProjectedUSD > 0 && (
                    <span className="inline-flex items-center rounded-sm border border-[var(--border)] bg-[var(--surface-secondary)] px-1 py-0.5 text-[9px] font-medium text-[var(--content-secondary)]">
                      ≈ ${validatorProjectedUSD.toFixed(2)} pending
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <Tag
            color={
              lock.managedTokenId
                ? "blue"
                : lock.isPermanent
                  ? "green"
                  : isExpired
                    ? "red"
                    : "yellow"
            }
          >
            {lock.managedTokenId
              ? `Managed by #${lock.managedTokenId.toString()}`
              : lock.isPermanent
                ? "Permanent"
                : isExpired
                  ? "Expired"
                  : "Active"}
          </Tag>
        </div>

        <div className="flex-1">
          <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
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
              <p className="mb-1 flex items-center gap-1 text-2xs uppercase tracking-wider text-[var(--content-secondary)]">
                Current Boost
                <Tooltip
                  id={`dashboard-boost-${lock.tokenId.toString()}`}
                  content="Your gauge's current boost multiplier (1x–5x). Increases as more veMEZO voting weight is directed to your gauge. Max boost amplifies your BTC yield."
                />
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
                  <span className="text-sm font-medium text-[var(--accent)]">
                    {lock.managedTokenId ? "View managed gauge" : "View Gauge"}{" "}
                    →
                  </span>
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-[var(--content-secondary)]">
                Unlocks:{" "}
                {lock.isPermanent ? "Never" : unlockDate.toLocaleDateString()}
              </p>
              {hasGauge && !lock.managedTokenId && (
                <div className="flex items-center gap-1 self-start sm:self-auto">
                  <Button
                    kind="secondary"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      pokeBoost(lock.tokenId)
                    }}
                    disabled={isPokePending || isPokeConfirming}
                  >
                    {isPokePending || isPokeConfirming
                      ? "Poking..."
                      : "Poke Boost"}
                  </Button>
                  <Tooltip
                    id={`poke-boost-${lock.tokenId.toString()}`}
                    content="Poking refreshes your veBTC lock's boost multiplier. After veMEZO holders vote on your gauge, poke to recalculate your voting weight. Your updated boost (up to 5x) takes effect immediately."
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  )

  if (hasGauge && gaugeAddress) {
    return (
      <Link
        href={`/gauges/${gaugeAddress}`}
        className="block h-full no-underline"
      >
        {cardContent}
      </Link>
    )
  }

  return cardContent
}

function VeMEZOLockCard({
  lock,
  claimableUSD,
  usedWeight,
  canVoteInCurrentEpoch,
  allocations,
  apyMap,
}: {
  lock: ReturnType<typeof useVeMEZOLocks>["locks"][0]
  claimableUSD: number
  usedWeight: bigint | undefined
  canVoteInCurrentEpoch: boolean
  allocations: VoteAllocation[]
  apyMap: Map<string, GaugeAPYData>
}): JSX.Element {
  // Calculate projected APY based on vote allocations
  const { upcomingAPY } = useUpcomingVotingAPY(allocations, apyMap, usedWeight)

  const unlockDate = new Date(Number(lock.end) * 1000)
  const isExpired = unlockDate < new Date()
  const hasClaimable = claimableUSD > 0

  return (
    <Card withBorder overrides={{ Root: { style: { height: "100%" } } }}>
      <div className="flex h-full flex-col py-2">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <span className="text-sm font-medium text-[var(--content-primary)]">
              veMEZO #{lock.tokenId.toString()}
            </span>
            {(upcomingAPY !== null && upcomingAPY > 0) || hasClaimable ? (
              <div className="mt-1 flex items-center gap-1.5">
                {upcomingAPY !== null && upcomingAPY > 0 && (
                  <span className="inline-flex items-center gap-1 rounded border border-[rgba(var(--positive-rgb),0.3)] bg-[rgba(var(--positive-rgb),0.15)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--positive)]">
                    {formatAPY(upcomingAPY)} APY
                    <Tooltip
                      id={`dashboard-vemezo-apy-${lock.tokenId.toString()}`}
                      content="Estimated annualized yield based on your current vote allocations and gauge incentive pools. Actual rewards depend on epoch-end incentive totals."
                    />
                  </span>
                )}
                {hasClaimable && (
                  <span className="inline-flex items-center rounded-sm border border-[var(--border)] bg-[var(--surface-secondary)] px-1 py-0.5 text-[9px] font-medium text-[var(--content-secondary)]">
                    ${claimableUSD.toFixed(2)} claimable
                  </span>
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

        <div className="grid flex-1 grid-cols-1 gap-3 min-[520px]:grid-cols-2">
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

/** Which escrow's NFTs a reward row is describing. */
type RewardAsset = "veMEZO" | "veBTC"

type ProjectedRewardsSummary = {
  upcomingAPY: number | null
  projectedIncentivesUSD: number
  projectedRewardsByToken: ProjectedTokenReward[]
}

function ClaimableRewardRow({
  tokenId,
  asset,
  bribes,
  onClaim,
  isPending,
  isConfirming,
  isClaimDisabled = false,
  isLast,
  claimableUSD,
  projected,
  btcPrice,
  mezoPrice,
}: {
  tokenId: bigint
  asset: RewardAsset
  bribes: ClaimableBribe[]
  onClaim: () => void
  isPending: boolean
  isConfirming: boolean
  isClaimDisabled?: boolean
  isLast: boolean
  claimableUSD: number
  projected: ProjectedRewardsSummary
  btcPrice: number | null
  mezoPrice: number | null
}): JSX.Element | null {
  const { upcomingAPY, projectedIncentivesUSD, projectedRewardsByToken } =
    projected

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
              {asset}
            </span>
            {upcomingAPY !== null && upcomingAPY > 0 && (
              <div className="flex items-center gap-1">
                <span className="inline-flex items-center rounded-sm border border-[rgba(var(--positive-rgb),0.3)] bg-[rgba(var(--positive-rgb),0.15)] px-1 py-0.5 text-[9px] font-semibold text-[var(--positive)]">
                  {formatAPY(upcomingAPY)} APY
                </span>
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
          disabled={isClaimDisabled || isPending || isConfirming}
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
                  Number(reward.amount) / 10 ** reward.decimals
                const price =
                  getTokenUsdPrice(
                    reward.tokenAddress,
                    reward.symbol,
                    btcPrice,
                    mezoPrice,
                  ) ?? 0
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
  asset,
  projected,
  isLast,
}: {
  tokenId: bigint
  asset: RewardAsset
  projected: ProjectedRewardsSummary
  isLast: boolean
}): JSX.Element | null {
  const [isExpanded, setIsExpanded] = useState(false)

  const { upcomingAPY, projectedIncentivesUSD, projectedRewardsByToken } =
    projected

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
              {asset}
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

type ClaimableTotals = Map<
  Address,
  { symbol: string; decimals: number; amount: bigint }
>

function groupBribesByTokenId(
  bribes: ClaimableBribe[],
): Map<string, ClaimableBribe[]> {
  const map = new Map<string, ClaimableBribe[]>()
  for (const bribe of bribes) {
    const key = bribe.tokenId.toString()
    const existing = map.get(key) ?? []
    existing.push(bribe)
    map.set(key, existing)
  }
  return map
}

function mergeClaimableTotals(...totals: ClaimableTotals[]): ClaimableTotals {
  const merged: ClaimableTotals = new Map()
  for (const source of totals) {
    for (const [tokenAddress, info] of source.entries()) {
      const existing = merged.get(tokenAddress)
      if (existing) {
        existing.amount += info.amount
      } else {
        merged.set(tokenAddress, { ...info })
      }
    }
  }
  return merged
}

function sumClaimableTotalsUsd(
  totals: ClaimableTotals,
  btcPrice: number | null,
  mezoPrice: number | null,
): number {
  let total = 0
  for (const [tokenAddress, info] of totals.entries()) {
    const tokenAmount = Number(info.amount) / 10 ** info.decimals
    const price =
      getTokenUsdPrice(tokenAddress, info.symbol, btcPrice, mezoPrice) ?? 0
    total += tokenAmount * price
  }
  return total
}

function claimableUsdByTokenId(
  bribes: ClaimableBribe[],
  btcPrice: number | null,
  mezoPrice: number | null,
): Map<string, number> {
  const map = new Map<string, number>()
  for (const bribe of bribes) {
    const tokenIdKey = bribe.tokenId.toString()
    let usdValue = 0
    for (const reward of bribe.rewards) {
      const tokenAmount = Number(reward.earned) / 10 ** reward.decimals
      const price =
        getTokenUsdPrice(
          reward.tokenAddress,
          reward.symbol,
          btcPrice,
          mezoPrice,
        ) ?? 0
      usdValue += tokenAmount * price
    }
    map.set(tokenIdKey, (map.get(tokenIdKey) ?? 0) + usdValue)
  }
  return map
}

function toClaimRequests(
  tokenIds: bigint[],
  bribesByTokenId: Map<string, ClaimableBribe[]>,
): ClaimLockRequest[] {
  return tokenIds.flatMap((tokenId) => {
    const bribesForToken = bribesByTokenId.get(tokenId.toString())
    if (!bribesForToken || bribesForToken.length === 0) return []

    return [
      {
        tokenId,
        bribes: bribesForToken.map((bribe) => ({
          bribeAddress: bribe.bribeAddress,
          tokens: bribe.rewards.map((reward) => reward.tokenAddress),
        })),
      },
    ]
  })
}

/**
 * Wraps a multi-lock claim run with the snapshot bookkeeping the "claim all" and
 * "retry failed" controls need, plus the auto-dismiss on a clean finish.
 */
function useClaimAllController(
  claim: ReturnType<typeof useMultiLockClaimBribes>,
) {
  const [snapshot, setSnapshot] = useState<ClaimLockRequest[]>([])
  const { claimAll, exportClaimBatch, clear, lockStates, isDone, hasErrors } =
    claim

  useEffect(() => {
    if (isDone && !hasErrors) {
      const timer = setTimeout(() => {
        clear()
        setSnapshot([])
      }, 1500)

      return () => clearTimeout(timer)
    }
  }, [clear, isDone, hasErrors])

  const handleClaimAll = useCallback(
    (requests: ClaimLockRequest[]) => {
      if (requests.length === 0) return
      setSnapshot(requests)
      claimAll(requests)
    },
    [claimAll],
  )

  const handleExportClaimBatch = useCallback(
    (requests: ClaimLockRequest[]) => {
      if (requests.length < 2) return
      setSnapshot(requests)
      void exportClaimBatch(requests)
    },
    [exportClaimBatch],
  )

  const handleCloseMultiClaim = useCallback(() => {
    clear()
    setSnapshot([])
  }, [clear])

  const handleRetryFailedClaims = useCallback(() => {
    const failedTokenIds = new Set(
      lockStates
        .filter((state) => state.status === "error")
        .map((state) => state.tokenId.toString()),
    )

    const retryClaims = snapshot.filter((request) =>
      failedTokenIds.has(request.tokenId.toString()),
    )

    if (retryClaims.length === 0) return

    clear()
    setSnapshot(retryClaims)
    claimAll(retryClaims)
  }, [claimAll, clear, lockStates, snapshot])

  return {
    handleClaimAll,
    handleExportClaimBatch,
    handleCloseMultiClaim,
    handleRetryFailedClaims,
  }
}

function MultiClaimProgress({
  asset,
  claim,
  onClose,
  onRetryFailed,
}: {
  asset: RewardAsset
  claim: ReturnType<typeof useMultiLockClaimBribes>
  onClose: () => void
  onRetryFailed: () => void
}): JSX.Element | null {
  if (!claim.isInProgress && !claim.isDone) {
    return null
  }

  return (
    <div className="mt-5 border-t border-[var(--border)] pt-5">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
              {asset} Claim Progress
            </p>
            <p className="text-sm font-medium text-[var(--content-primary)]">
              {claim.isInProgress
                ? claim.executionMode === "safe-export"
                  ? "Waiting for execution in Safe"
                  : claim.executionMode === "batched"
                    ? "Confirm batch in wallet"
                    : `Signing transactions (${claim.currentIndex + 1}/${claim.totalLocks})`
                : claim.hasErrors
                  ? `${claim.successCount} of ${claim.totalLocks} succeeded`
                  : claim.executionMode === "safe-export"
                    ? "Safe batch executed"
                    : claim.executionMode === "batched"
                      ? "Batch confirmed"
                      : "All transactions confirmed"}
            </p>
          </div>
          {claim.isDone && !claim.hasErrors && (
            <Tag color="green" closeable={false}>
              Done
            </Tag>
          )}
        </div>

        <div className="mb-3 flex h-2 gap-0.5 overflow-hidden rounded-full">
          {claim.lockStates.map((state) => (
            <div
              key={state.tokenId.toString()}
              className={`flex-1 transition-colors ${
                state.status === "success"
                  ? "bg-[var(--positive)]"
                  : state.status === "error"
                    ? "bg-[var(--negative)]"
                    : state.status === "signing" ||
                        state.status === "confirming"
                      ? "animate-pulse bg-[#F7931A]"
                      : "bg-[var(--border)]"
              }`}
            />
          ))}
        </div>

        <ol className="flex flex-col gap-2">
          {claim.lockStates.map((state) => (
            <li
              key={state.tokenId.toString()}
              className="flex items-center justify-between text-xs"
            >
              <span className="font-mono text-[var(--content-primary)]">
                {asset} #{state.tokenId.toString()}
              </span>
              <span
                className={`flex items-center gap-1.5 ${
                  state.status === "success"
                    ? "text-[var(--positive)]"
                    : state.status === "error"
                      ? "text-[var(--negative)]"
                      : state.status === "signing" ||
                          state.status === "confirming"
                        ? "text-[#F7931A]"
                        : "text-[var(--content-secondary)]"
                }`}
              >
                {state.status === "success"
                  ? "Claimed"
                  : state.status === "error"
                    ? "Failed"
                    : state.status === "signing"
                      ? "Awaiting signature"
                      : state.status === "confirming"
                        ? claim.executionMode === "safe-export"
                          ? "Waiting for Safe"
                          : "Confirming"
                        : "Pending"}
              </span>
            </li>
          ))}
        </ol>

        {claim.isDone && claim.hasErrors && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button kind="secondary" onClick={onClose}>
              Close
            </Button>
            <Button kind="primary" onClick={onRetryFailed}>
              Retry Failed ({claim.errorCount})
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// The projection hooks must run per row, so each voter gets a thin wrapper that
// resolves its own numbers and hands them to the shared presentational rows.

function BoostRewardRows({
  tokenId,
  bribes,
  usedWeight,
  allocations,
  apyMap,
  ...rest
}: {
  tokenId: bigint
  bribes: ClaimableBribe[] | undefined
  usedWeight: bigint | undefined
  allocations: VoteAllocation[]
  apyMap: Map<string, GaugeAPYData>
  onClaim: () => void
  isPending: boolean
  isConfirming: boolean
  isClaimDisabled?: boolean
  isLast: boolean
  claimableUSD: number
  btcPrice: number | null
  mezoPrice: number | null
}): JSX.Element | null {
  const projected = useUpcomingVotingAPY(allocations, apyMap, usedWeight)

  if (!bribes || bribes.length === 0) {
    return (
      <ProjectedRewardRow
        tokenId={tokenId}
        asset="veMEZO"
        projected={projected}
        isLast={rest.isLast}
      />
    )
  }

  return (
    <ClaimableRewardRow
      {...rest}
      tokenId={tokenId}
      asset="veMEZO"
      bribes={bribes}
      projected={projected}
    />
  )
}

function ValidatorRewardRows({
  tokenId,
  bribes,
  usedWeight,
  allocations,
  incentivesByGauge,
  ...rest
}: {
  tokenId: bigint
  bribes: ClaimableBribe[] | undefined
  usedWeight: bigint | undefined
  allocations: VoteAllocation[]
  incentivesByGauge: Map<string, ValidatorGaugeIncentives>
  onClaim: () => void
  isPending: boolean
  isConfirming: boolean
  isClaimDisabled?: boolean
  isLast: boolean
  claimableUSD: number
  btcPrice: number | null
  mezoPrice: number | null
}): JSX.Element | null {
  const projected = useUpcomingValidatorRewards(
    allocations,
    incentivesByGauge,
    usedWeight,
  )

  if (!bribes || bribes.length === 0) {
    return (
      <ProjectedRewardRow
        tokenId={tokenId}
        asset="veBTC"
        projected={projected}
        isLast={rest.isLast}
      />
    )
  }

  return (
    <ClaimableRewardRow
      {...rest}
      tokenId={tokenId}
      asset="veBTC"
      bribes={bribes}
      projected={projected}
    />
  )
}

export default function DashboardPage(): JSX.Element {
  const { isConnected } = useAccount()
  const { locks: veBTCLocks, isLoading: isLoadingVeBTC } = useVeBTCLocks()
  const { locks: veMEZOLocks, isLoading: isLoadingVeMEZO } = useVeMEZOLocks()
  const { price: btcPrice } = useBtcPrice()
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false)
  const { price: mezoPrice } = useMezoPrice()
  const [gaugeSortColumn, setGaugeSortColumn] =
    useState<GaugeSortColumn>("incentives")
  const [gaugeSortDirection, setGaugeSortDirection] =
    useState<SortDirection>("desc")
  const [gaugeStatusFilter, setGaugeStatusFilter] =
    useState<StatusFilter>("active")
  const [showNeedsBoostOnly, setShowNeedsBoostOnly] = useState(false)
  const { isWatching, watchedGaugeAddresses } = useGaugeWatchlist()
  const [hasAnimatedGaugeCards, setHasAnimatedGaugeCards] = useState(false)
  const [gaugeSearchQuery, setGaugeSearchQuery] = useState("")
  const deferredGaugeSearchQuery = useDeferredValue(gaugeSearchQuery)

  const veMEZOTokenIds = useMemo(
    () => veMEZOLocks.map((lock) => lock.tokenId),
    [veMEZOLocks],
  )
  const veBTCGaugeTokenIds = useMemo(
    () =>
      Array.from(
        new Set(
          veBTCLocks.flatMap((lock) => [
            lock.tokenId,
            ...(lock.managedTokenId ? [lock.managedTokenId] : []),
          ]),
        ),
      ),
    [veBTCLocks],
  )
  // Validator votes and their bribes belong to the NFTs the caller owns, so this
  // deliberately excludes the managed NFTs that `veBTCGaugeTokenIds` pulls in for
  // gauge lookup: a managed lock votes through its manager, and only the manager
  // can claim against that NFT.
  const veBTCVotingTokenIds = useMemo(
    () => veBTCLocks.map((lock) => lock.tokenId),
    [veBTCLocks],
  )

  const { gaugeDataMap, isLoading: isLoadingBatchGaugeData } =
    useBatchGaugeData(veBTCGaugeTokenIds)
  const { voteStateMap } = useBatchVoteState(veMEZOTokenIds)

  const {
    claimableBribes,
    totalClaimable,
    isRefreshing: isRefreshingClaimableBribes,
    refetch: refetchBribes,
  } = useClaimableBribes(veMEZOTokenIds, {
    enabled: isConnected && veMEZOTokenIds.length > 0,
  })

  // Validator gauges are voted with veBTC on ValidatorsVoter, so their bribes
  // are a second, independent claim surface alongside the veMEZO/BoostVoter one.
  const {
    claimableBribes: validatorClaimableBribes,
    totalClaimable: validatorTotalClaimable,
    isRefreshing: isRefreshingValidatorBribes,
    refetch: refetchValidatorBribes,
  } = useClaimableValidatorBribes(veBTCVotingTokenIds, {
    enabled: isConnected && veBTCVotingTokenIds.length > 0,
  })

  const {
    claimBribes,
    isPending: isClaimPending,
    isConfirming: isClaimConfirming,
    isSuccess: isClaimSuccess,
  } = useClaimBribes()
  const {
    claimBribes: claimValidatorBribes,
    isPending: isValidatorClaimPending,
    isConfirming: isValidatorClaimConfirming,
    isSuccess: isValidatorClaimSuccess,
  } = useClaimBribes("validators")

  const boostMultiClaim = useMultiLockClaimBribes()
  const validatorMultiClaim = useMultiLockClaimBribes("validators")

  const {
    handleClaimAll,
    handleExportClaimBatch,
    handleCloseMultiClaim,
    handleRetryFailedClaims,
  } = useClaimAllController(boostMultiClaim)
  const {
    handleClaimAll: handleClaimAllValidator,
    handleExportClaimBatch: handleExportValidatorClaimBatch,
    handleCloseMultiClaim: handleCloseValidatorMultiClaim,
    handleRetryFailedClaims: handleRetryFailedValidatorClaims,
  } = useClaimAllController(validatorMultiClaim)

  // Refetch bribes after successful claim
  useEffect(() => {
    if (isClaimSuccess) {
      void refetchBribes()
    }
  }, [isClaimSuccess, refetchBribes])

  useEffect(() => {
    if (isValidatorClaimSuccess) {
      void refetchValidatorBribes()
    }
  }, [isValidatorClaimSuccess, refetchValidatorBribes])

  useEffect(() => {
    if (boostMultiClaim.isDone && boostMultiClaim.successCount > 0) {
      void refetchBribes()
    }
  }, [boostMultiClaim.isDone, boostMultiClaim.successCount, refetchBribes])

  useEffect(() => {
    if (validatorMultiClaim.isDone && validatorMultiClaim.successCount > 0) {
      void refetchValidatorBribes()
    }
  }, [
    validatorMultiClaim.isDone,
    validatorMultiClaim.successCount,
    refetchValidatorBribes,
  ])

  // Group claimable bribes by tokenId
  const bribesGroupedByTokenId = useMemo(
    () => groupBribesByTokenId(claimableBribes),
    [claimableBribes],
  )
  const validatorBribesGroupedByTokenId = useMemo(
    () => groupBribesByTokenId(validatorClaimableBribes),
    [validatorClaimableBribes],
  )

  // Claimable token totals across both voters, so the header reads as one pot
  const combinedTotalClaimable = useMemo(
    () => mergeClaimableTotals(totalClaimable, validatorTotalClaimable),
    [totalClaimable, validatorTotalClaimable],
  )

  const totalClaimableUSD = useMemo(
    () => sumClaimableTotalsUsd(combinedTotalClaimable, btcPrice, mezoPrice),
    [combinedTotalClaimable, btcPrice, mezoPrice],
  )

  // Calculate claimable USD per tokenId
  const claimableUSDByTokenId = useMemo(
    () => claimableUsdByTokenId(claimableBribes, btcPrice, mezoPrice),
    [claimableBribes, btcPrice, mezoPrice],
  )
  const validatorClaimableUSDByTokenId = useMemo(
    () => claimableUsdByTokenId(validatorClaimableBribes, btcPrice, mezoPrice),
    [validatorClaimableBribes, btcPrice, mezoPrice],
  )

  const claimAllRequests = useMemo(
    () => toClaimRequests(veMEZOTokenIds, bribesGroupedByTokenId),
    [bribesGroupedByTokenId, veMEZOTokenIds],
  )
  const validatorClaimAllRequests = useMemo(
    () => toClaimRequests(veBTCVotingTokenIds, validatorBribesGroupedByTokenId),
    [validatorBribesGroupedByTokenId, veBTCVotingTokenIds],
  )

  const handleClaimBribes = (tokenId: bigint) => {
    const request = toClaimRequests([tokenId], bribesGroupedByTokenId)[0]
    if (!request) return
    claimBribes(tokenId, request.bribes)
  }

  const handleClaimValidatorBribes = (tokenId: bigint) => {
    const request = toClaimRequests(
      [tokenId],
      validatorBribesGroupedByTokenId,
    )[0]
    if (!request) return
    claimValidatorBribes(tokenId, request.bribes)
  }

  const isLoadingCore = isLoadingVeBTC || isLoadingVeMEZO

  const totalVeBTCVotingPower = veBTCLocks.reduce(
    (acc, lock) => acc + lock.votingPower,
    0n,
  )
  const totalVeMEZOVotingPower = veMEZOLocks.reduce(
    (acc, lock) => acc + lock.votingPower,
    0n,
  )

  // Get gauge registry with ownership data so veBTC weights are available
  const { gauges: allGauges, isLoading: isLoadingGauges } = useBoostGauges({
    includeOwnership: true,
    enabled: true,
  })

  // Build gauge data for APY map
  const gaugeDataForAPY = useMemo(() => {
    return allGauges.map((gauge) => ({
      address: gauge.address,
      totalWeight: gauge.totalWeight,
    }))
  }, [allGauges])

  // Get APY map for all gauges
  const { apyMap, isLoading: isLoadingAPY } = useGaugesAPY(gaugeDataForAPY)

  // Get all gauge addresses for vote allocation queries
  const allGaugeAddresses = useMemo(() => {
    return allGauges.map((g) => g.address)
  }, [allGauges])

  // Get aggregated vote allocations across all veMEZO tokens
  const { allocationsByToken, aggregatedAllocations } = useAllVoteAllocations(
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

  // Validator gauge incentives, and how the caller's veBTC votes split them
  const {
    incentivesByGauge: validatorIncentivesByGauge,
    validatorGaugeAddresses,
  } = useValidatorGaugeIncentives({ enabled: isConnected })
  const {
    allocationsByToken: validatorAllocationsByToken,
    aggregatedAllocations: aggregatedValidatorAllocations,
    usedWeightsByToken: validatorUsedWeightsByToken,
    totalUsedWeight: totalValidatorUsedWeight,
  } = useValidatorVoteAllocations(veBTCVotingTokenIds, validatorGaugeAddresses)

  const {
    upcomingAPY: validatorUpcomingAPY,
    projectedIncentivesUSD: validatorProjectedIncentivesUSD,
  } = useUpcomingValidatorRewards(
    aggregatedValidatorAllocations,
    validatorIncentivesByGauge,
    totalValidatorUsedWeight,
  )

  const hasBoostClaimableRewards = claimableBribes.length > 0
  const hasValidatorClaimableRewards = validatorClaimableBribes.length > 0
  const hasClaimableRewards =
    hasBoostClaimableRewards || hasValidatorClaimableRewards
  const combinedProjectedIncentivesUSD =
    projectedIncentivesUSD + validatorProjectedIncentivesUSD
  const hasFutureRewards = combinedProjectedIncentivesUSD > 0
  const showRewardsSection =
    hasClaimableRewards ||
    hasFutureRewards ||
    boostMultiClaim.isInProgress ||
    boostMultiClaim.isDone ||
    validatorMultiClaim.isInProgress ||
    validatorMultiClaim.isDone

  // Get all gauge profiles for transfer modal
  const { profiles: allGaugeProfiles, refetch: refetchProfiles } =
    useAllGaugeProfiles()

  const veBTCGaugeCardData = useMemo(() => {
    const map = new Map<
      string,
      {
        hasGauge: boolean
        gaugeAddress: Address | undefined
        boostMultiplier: number
        profile: GaugeProfile | null
        apy: number | null
      }
    >()

    for (const lock of veBTCLocks) {
      const tokenIdKey = lock.tokenId.toString()
      const gaugeTokenId = lock.managedTokenId ?? lock.tokenId
      const gaugeData = gaugeDataMap.get(gaugeTokenId.toString())
      const gaugeAddress = gaugeData?.gaugeAddress
      const profile = gaugeAddress
        ? (allGaugeProfiles.get(gaugeAddress.toLowerCase()) ?? null)
        : null
      const apy =
        gaugeAddress !== undefined
          ? (apyMap.get(gaugeAddress.toLowerCase())?.apy ?? null)
          : null

      map.set(tokenIdKey, {
        hasGauge: gaugeData?.hasGauge ?? false,
        gaugeAddress,
        boostMultiplier: gaugeData?.boostMultiplier ?? 1,
        profile,
        apy,
      })
    }

    return map
  }, [veBTCLocks, gaugeDataMap, allGaugeProfiles, apyMap])

  // Build owned gauges list for the transfer modal
  // This maps veBTC locks to their corresponding gauges
  const ownedGauges = useMemo(() => {
    const result: Array<{
      tokenId: bigint
      gaugeAddress: Address
      profile: GaugeProfile | null
    }> = []

    for (const lock of veBTCLocks) {
      const gaugeData = gaugeDataMap.get(lock.tokenId.toString())
      if (gaugeData?.hasGauge && gaugeData.gaugeAddress) {
        const profile = allGaugeProfiles.get(
          gaugeData.gaugeAddress.toLowerCase(),
        )
        result.push({
          tokenId: lock.tokenId,
          gaugeAddress: gaugeData.gaugeAddress,
          profile: profile ?? null,
        })
      }
    }

    return result
  }, [veBTCLocks, gaugeDataMap, allGaugeProfiles])

  const canShowTransferButton = ownedGauges.length >= 2

  const handleGaugeSort = useCallback(
    (column: GaugeSortColumn) => {
      if (gaugeSortColumn === column) {
        setGaugeSortDirection((d) => (d === "asc" ? "desc" : "asc"))
      } else {
        setGaugeSortColumn(column)
        setGaugeSortDirection("desc")
      }
    },
    [gaugeSortColumn],
  )

  const getGaugeSortIndicator = (column: GaugeSortColumn): JSX.Element => {
    if (gaugeSortColumn === column) {
      return gaugeSortDirection === "asc" ? (
        <ChevronUp size={16} />
      ) : (
        <ChevronDown size={16} />
      )
    }
    return (
      <span className="opacity-30">
        <ChevronDown size={16} />
      </span>
    )
  }

  const filteredAndSortedGauges = useMemo(() => {
    let result = [...allGauges]

    const hasGaugeProfile = (gaugeAddress: Address) => {
      const profile = allGaugeProfiles.get(gaugeAddress.toLowerCase())
      return Boolean(
        profile?.display_name ||
          profile?.description ||
          profile?.profile_picture_url,
      )
    }

    if (gaugeStatusFilter === "active") {
      result = result.filter((g) => g.isAlive)
    } else if (gaugeStatusFilter === "inactive") {
      result = result.filter((g) => !g.isAlive)
    } else if (gaugeStatusFilter === "watching") {
      result = result.filter((g) => isWatching(g.address))
    }

    if (showNeedsBoostOnly) {
      result = result.filter((g) => g.boostMultiplier < 5)
    }

    if (deferredGaugeSearchQuery.trim()) {
      const query = deferredGaugeSearchQuery.trim().toLowerCase()
      result = result.filter((g) => {
        const profile = allGaugeProfiles.get(g.address.toLowerCase())
        const displayName = profile?.display_name?.toLowerCase() ?? ""
        const tokenIdStr = g.veBTCTokenId > 0n ? g.veBTCTokenId.toString() : ""
        const addressStr = g.address.toLowerCase()
        return (
          displayName.includes(query) ||
          tokenIdStr.includes(query) ||
          addressStr.includes(query)
        )
      })
    }

    if (gaugeSortColumn) {
      result.sort((a, b) => {
        let comparison = 0

        switch (gaugeSortColumn) {
          case "veBTCWeight": {
            const aVal = a.veBTCWeight ?? 0n
            const bVal = b.veBTCWeight ?? 0n
            comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
            break
          }
          case "veMEZOWeight": {
            const aVal = a.totalWeight
            const bVal = b.totalWeight
            comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
            break
          }
          case "boost":
            comparison = a.boostMultiplier - b.boostMultiplier
            break
          case "optimalVeMEZO": {
            const aVal = a.optimalVeMEZO ?? -1n
            const bVal = b.optimalVeMEZO ?? -1n
            comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
            break
          }
          case "apy": {
            const aAPY = apyMap.get(a.address.toLowerCase())?.apy ?? -1
            const bAPY = apyMap.get(b.address.toLowerCase())?.apy ?? -1
            comparison = aAPY < bAPY ? -1 : aAPY > bAPY ? 1 : 0
            break
          }
          case "incentives": {
            const aInc =
              apyMap.get(a.address.toLowerCase())?.totalIncentivesUSD ?? 0
            const bInc =
              apyMap.get(b.address.toLowerCase())?.totalIncentivesUSD ?? 0
            comparison = aInc < bInc ? -1 : aInc > bInc ? 1 : 0
            break
          }
          default:
            break
        }

        if (comparison === 0) {
          // Tiebreaker: gauges with profiles before those without
          const aHasProfile = hasGaugeProfile(a.address)
          const bHasProfile = hasGaugeProfile(b.address)
          if (aHasProfile !== bHasProfile) {
            return aHasProfile ? -1 : 1
          }
        }

        return gaugeSortDirection === "asc" ? comparison : -comparison
      })
    }

    return result
  }, [
    allGauges,
    allGaugeProfiles,
    gaugeStatusFilter,
    showNeedsBoostOnly,
    deferredGaugeSearchQuery,
    gaugeSortColumn,
    gaugeSortDirection,
    apyMap,
    isWatching,
  ])

  const {
    pageStart: paginatedGaugeStart,
    pageEnd: paginatedGaugeEnd,
    paginatedItems: paginatedGauges,
    currentPage: currentGaugePage,
    totalPages: totalGaugePages,
    goToPreviousPage: goToPreviousGaugePage,
    goToNextPage: goToNextGaugePage,
  } = usePagination(filteredAndSortedGauges, {
    pageSize: GAUGES_PER_PAGE,
    resetDeps: [
      gaugeStatusFilter,
      showNeedsBoostOnly,
      gaugeSortColumn,
      gaugeSortDirection,
      deferredGaugeSearchQuery,
      watchedGaugeAddresses,
    ],
  })

  useEffect(() => {
    if (
      !hasAnimatedGaugeCards &&
      !isLoadingGauges &&
      paginatedGauges.length > 0
    ) {
      setHasAnimatedGaugeCards(true)
    }
  }, [hasAnimatedGaugeCards, isLoadingGauges, paginatedGauges.length])

  return (
    <>
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
        ) : isLoadingCore ? (
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
                          {upcomingAPY !== null && upcomingAPY > 0 && (
                            <span className="inline-flex items-center rounded-full border border-[rgba(var(--positive-rgb),0.4)] bg-[rgba(var(--positive-rgb),0.15)] px-2.5 py-1 text-xs font-semibold text-[var(--positive)]">
                              {formatAPY(upcomingAPY)} veMEZO APY
                            </span>
                          )}
                          {validatorUpcomingAPY !== null &&
                            validatorUpcomingAPY > 0 && (
                              <span className="inline-flex items-center rounded-full border border-[rgba(247,147,26,0.4)] bg-[rgba(247,147,26,0.15)] px-2.5 py-1 text-xs font-semibold text-[#F7931A]">
                                {formatAPY(validatorUpcomingAPY)} veBTC APY
                              </span>
                            )}
                        </div>

                        {/* Total USD Value - prominent display */}
                        {hasClaimableRewards && totalClaimableUSD > 0 && (
                          <div className="mb-5">
                            <span className="font-mono text-4xl font-bold tabular-nums text-[var(--content-primary)]">
                              <AnimatedNumber
                                value={totalClaimableUSD}
                                prefix="$"
                              />
                            </span>
                          </div>
                        )}

                        {/* Asset breakdown */}
                        {hasClaimableRewards && (
                          <div className="flex flex-wrap gap-3">
                            {Array.from(combinedTotalClaimable.entries()).map(
                              ([tokenAddr, info]) => {
                                const tokenAmount =
                                  Number(info.amount) / 10 ** info.decimals
                                const price =
                                  getTokenUsdPrice(
                                    tokenAddr,
                                    info.symbol,
                                    btcPrice,
                                    mezoPrice,
                                  ) ?? 0
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
                                {combinedProjectedIncentivesUSD.toLocaleString(
                                  undefined,
                                  { maximumFractionDigits: 2 },
                                )}
                              </span>
                            </div>
                            {projectedIncentivesUSD > 0 &&
                              validatorProjectedIncentivesUSD > 0 && (
                                <p className="mt-1 text-xs text-[var(--content-tertiary)]">
                                  veMEZO gauges $
                                  {projectedIncentivesUSD.toLocaleString(
                                    undefined,
                                    { maximumFractionDigits: 2 },
                                  )}
                                  {" · "}
                                  veBTC validator gauges $
                                  {validatorProjectedIncentivesUSD.toLocaleString(
                                    undefined,
                                    { maximumFractionDigits: 2 },
                                  )}
                                </p>
                              )}
                          </div>
                        )}
                      </div>

                      {/*
                        The two voters need separate transactions, so they get
                        separate controls rather than one button that silently
                        fires two wallet prompts.
                      */}
                      <div className="flex flex-col items-stretch gap-2">
                        {hasBoostClaimableRewards &&
                          !boostMultiClaim.isInProgress &&
                          !boostMultiClaim.isDone && (
                            <div className="flex flex-wrap gap-2">
                              {boostMultiClaim.canExportSafeBatch &&
                                claimAllRequests.length > 1 && (
                                  <Button
                                    kind="secondary"
                                    onClick={() =>
                                      handleExportClaimBatch(claimAllRequests)
                                    }
                                    disabled={isRefreshingClaimableBribes}
                                  >
                                    Export Safe batch
                                  </Button>
                                )}
                              {boostMultiClaim.canCopyBatchJson &&
                                claimAllRequests.length > 1 && (
                                  <Button
                                    kind="tertiary"
                                    size="small"
                                    onClick={() =>
                                      void boostMultiClaim.copyClaimBatchJson(
                                        claimAllRequests,
                                      )
                                    }
                                  >
                                    {boostMultiClaim.copiedBatchJson
                                      ? "Copied"
                                      : "Copy tx JSON"}
                                  </Button>
                                )}
                              <Button
                                kind="primary"
                                onClick={() => handleClaimAll(claimAllRequests)}
                                disabled={
                                  claimAllRequests.length === 0 ||
                                  isClaimPending ||
                                  isClaimConfirming ||
                                  isRefreshingClaimableBribes
                                }
                              >
                                {hasValidatorClaimableRewards
                                  ? "Claim all veMEZO"
                                  : "Claim all"}
                              </Button>
                            </div>
                          )}

                        {hasValidatorClaimableRewards &&
                          !validatorMultiClaim.isInProgress &&
                          !validatorMultiClaim.isDone && (
                            <div className="flex flex-wrap gap-2">
                              {validatorMultiClaim.canExportSafeBatch &&
                                validatorClaimAllRequests.length > 1 && (
                                  <Button
                                    kind="secondary"
                                    onClick={() =>
                                      handleExportValidatorClaimBatch(
                                        validatorClaimAllRequests,
                                      )
                                    }
                                    disabled={isRefreshingValidatorBribes}
                                  >
                                    Export Safe batch
                                  </Button>
                                )}
                              {validatorMultiClaim.canCopyBatchJson &&
                                validatorClaimAllRequests.length > 1 && (
                                  <Button
                                    kind="tertiary"
                                    size="small"
                                    onClick={() =>
                                      void validatorMultiClaim.copyClaimBatchJson(
                                        validatorClaimAllRequests,
                                      )
                                    }
                                  >
                                    {validatorMultiClaim.copiedBatchJson
                                      ? "Copied"
                                      : "Copy tx JSON"}
                                  </Button>
                                )}
                              <Button
                                kind="primary"
                                onClick={() =>
                                  handleClaimAllValidator(
                                    validatorClaimAllRequests,
                                  )
                                }
                                disabled={
                                  validatorClaimAllRequests.length === 0 ||
                                  isValidatorClaimPending ||
                                  isValidatorClaimConfirming ||
                                  isRefreshingValidatorBribes
                                }
                              >
                                {hasBoostClaimableRewards
                                  ? "Claim all veBTC"
                                  : "Claim all"}
                              </Button>
                            </div>
                          )}
                      </div>
                    </div>

                    {boostMultiClaim.safeBatchError && (
                      <p className="mt-3 text-pretty text-xs text-[var(--negative)]">
                        {boostMultiClaim.safeBatchError.message}
                      </p>
                    )}
                    {validatorMultiClaim.safeBatchError && (
                      <p className="mt-3 text-pretty text-xs text-[var(--negative)]">
                        {validatorMultiClaim.safeBatchError.message}
                      </p>
                    )}

                    <MultiClaimProgress
                      asset="veMEZO"
                      claim={boostMultiClaim}
                      onClose={handleCloseMultiClaim}
                      onRetryFailed={handleRetryFailedClaims}
                    />

                    <MultiClaimProgress
                      asset="veBTC"
                      claim={validatorMultiClaim}
                      onClose={handleCloseValidatorMultiClaim}
                      onRetryFailed={handleRetryFailedValidatorClaims}
                    />
                  </div>
                  {/* Reward rows */}
                  {(hasClaimableRewards || hasFutureRewards) && (
                    <div className="px-7 py-1 pb-2">
                      {(() => {
                        // Claimable rows first, then pending-only rows, per asset
                        const orderByClaimable = (
                          tokenIds: bigint[],
                          bribesByTokenId: Map<string, ClaimableBribe[]>,
                        ) => [
                          ...tokenIds.filter((tokenId) =>
                            bribesByTokenId.has(tokenId.toString()),
                          ),
                          ...tokenIds.filter(
                            (tokenId) =>
                              !bribesByTokenId.has(tokenId.toString()),
                          ),
                        ]

                        const boostRows = orderByClaimable(
                          veMEZOTokenIds,
                          bribesGroupedByTokenId,
                        )
                        const validatorRows = orderByClaimable(
                          veBTCVotingTokenIds,
                          validatorBribesGroupedByTokenId,
                        )
                        const totalRows =
                          boostRows.length + validatorRows.length
                        let rowIndex = 0

                        return (
                          <>
                            {boostRows.map((tokenId) => {
                              const tokenIdStr = tokenId.toString()
                              rowIndex++
                              return (
                                <BoostRewardRows
                                  key={`boost-${tokenIdStr}`}
                                  tokenId={tokenId}
                                  bribes={bribesGroupedByTokenId.get(
                                    tokenIdStr,
                                  )}
                                  onClaim={() => handleClaimBribes(tokenId)}
                                  isPending={isClaimPending}
                                  isConfirming={isClaimConfirming}
                                  isClaimDisabled={boostMultiClaim.isInProgress}
                                  isLast={rowIndex === totalRows}
                                  claimableUSD={
                                    claimableUSDByTokenId.get(tokenIdStr) ?? 0
                                  }
                                  usedWeight={
                                    voteStateMap.get(tokenIdStr)?.usedWeight
                                  }
                                  allocations={
                                    allocationsByToken.get(tokenIdStr) ?? []
                                  }
                                  apyMap={apyMap}
                                  btcPrice={btcPrice}
                                  mezoPrice={mezoPrice}
                                />
                              )
                            })}

                            {validatorRows.map((tokenId) => {
                              const tokenIdStr = tokenId.toString()
                              rowIndex++
                              return (
                                <ValidatorRewardRows
                                  key={`validator-${tokenIdStr}`}
                                  tokenId={tokenId}
                                  bribes={validatorBribesGroupedByTokenId.get(
                                    tokenIdStr,
                                  )}
                                  onClaim={() =>
                                    handleClaimValidatorBribes(tokenId)
                                  }
                                  isPending={isValidatorClaimPending}
                                  isConfirming={isValidatorClaimConfirming}
                                  isClaimDisabled={
                                    validatorMultiClaim.isInProgress
                                  }
                                  isLast={rowIndex === totalRows}
                                  claimableUSD={
                                    validatorClaimableUSDByTokenId.get(
                                      tokenIdStr,
                                    ) ?? 0
                                  }
                                  usedWeight={validatorUsedWeightsByToken.get(
                                    tokenIdStr,
                                  )}
                                  allocations={
                                    validatorAllocationsByToken.get(
                                      tokenIdStr,
                                    ) ?? []
                                  }
                                  incentivesByGauge={validatorIncentivesByGauge}
                                  btcPrice={btcPrice}
                                  mezoPrice={mezoPrice}
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
                      <p className="text-2xs tracking-wider text-[var(--content-secondary)]">
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
                      <p className="text-2xs tracking-wider text-[var(--content-secondary)]">
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
                      <p className="text-2xs tracking-wider text-[var(--content-secondary)]">
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
                      <p className="text-2xs tracking-wider text-[var(--content-secondary)]">
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
                    {veMEZOLocks.map((lock, index) => {
                      const tokenIdKey = lock.tokenId.toString()
                      const voteState = voteStateMap.get(tokenIdKey)
                      const allocations =
                        allocationsByToken.get(tokenIdKey) ?? []

                      return (
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
                            usedWeight={voteState?.usedWeight}
                            canVoteInCurrentEpoch={
                              voteState?.canVoteInCurrentEpoch ?? false
                            }
                            allocations={allocations}
                            apyMap={apyMap}
                          />
                        </SpringIn>
                      )
                    })}
                  </div>
                )}
              </div>
            </SpringIn>

            <SpringIn
              delay={(showRewardsSection ? 6 : 5) + veMEZOLocks.length}
              variant="card"
            >
              <div>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-xl font-semibold text-[var(--content-primary)]">
                    Your veBTC Locks
                  </h2>
                  {canShowTransferButton && (
                    <div className="w-full sm:w-auto">
                      <Button
                        kind="secondary"
                        size="small"
                        onClick={() => setIsTransferModalOpen(true)}
                        overrides={{
                          BaseButton: {
                            style: {
                              width: "100%",
                            },
                          },
                        }}
                      >
                        Transfer Profile
                      </Button>
                    </div>
                  )}
                </div>
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
                    {veBTCLocks.map((lock, index) => {
                      const tokenIdKey = lock.tokenId.toString()
                      const cardData =
                        veBTCGaugeCardData.get(tokenIdKey) ?? null

                      return (
                        <SpringIn
                          key={lock.tokenId.toString()}
                          delay={
                            (showRewardsSection ? 7 : 6) +
                            veMEZOLocks.length +
                            index
                          }
                          variant="card"
                        >
                          <VeBTCLockCard
                            lock={lock}
                            hasGauge={cardData?.hasGauge ?? false}
                            gaugeAddress={cardData?.gaugeAddress}
                            boostMultiplier={cardData?.boostMultiplier ?? 1}
                            profile={cardData?.profile ?? null}
                            apy={cardData?.apy ?? null}
                            isLoadingAPY={
                              isLoadingAPY || isLoadingBatchGaugeData
                            }
                            validatorClaimableUSD={
                              validatorClaimableUSDByTokenId.get(tokenIdKey) ??
                              0
                            }
                            validatorAllocations={
                              validatorAllocationsByToken.get(tokenIdKey) ?? []
                            }
                            validatorUsedWeight={validatorUsedWeightsByToken.get(
                              tokenIdKey,
                            )}
                            validatorIncentivesByGauge={
                              validatorIncentivesByGauge
                            }
                          />
                        </SpringIn>
                      )
                    })}
                  </div>
                )}
              </div>
            </SpringIn>
          </>
        )}
      </div>
      <SpringIn
        delay={
          (showRewardsSection ? 8 : 7) + veMEZOLocks.length + veBTCLocks.length
        }
        variant="card-subtle"
      >
        <div className="mt-6">
          <h2 className="mb-4 text-xl font-semibold text-[var(--content-primary)]">
            All Gauges
          </h2>
          {isLoadingGauges ? (
            <Skeleton width="100%" height="200px" animation />
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-4">
                <p className="text-xs text-[var(--content-secondary)]">
                  {filteredAndSortedGauges.length} gauge
                  {filteredAndSortedGauges.length !== 1 ? "s" : ""}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--content-secondary)]">
                    Filter:
                  </span>
                  <Tag
                    closeable={false}
                    onClick={() => setGaugeStatusFilter("all")}
                    color={gaugeStatusFilter === "all" ? "blue" : "gray"}
                  >
                    All
                  </Tag>
                  <Tag
                    closeable={false}
                    onClick={() => setGaugeStatusFilter("active")}
                    color={gaugeStatusFilter === "active" ? "green" : "gray"}
                  >
                    Active
                  </Tag>
                  <Tag
                    closeable={false}
                    onClick={() => setGaugeStatusFilter("inactive")}
                    color={gaugeStatusFilter === "inactive" ? "red" : "gray"}
                  >
                    Inactive
                  </Tag>
                  {watchedGaugeAddresses.size > 0 && (
                    <Tag
                      closeable={false}
                      onClick={() => setGaugeStatusFilter("watching")}
                      color={
                        gaugeStatusFilter === "watching" ? "yellow" : "gray"
                      }
                    >
                      ★ Watching
                    </Tag>
                  )}
                </div>

                <div>
                  <Input
                    value={gaugeSearchQuery}
                    onChange={(e) => setGaugeSearchQuery(e.target.value)}
                    placeholder="Search gauges..."
                    size="small"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--content-secondary)]">
                    Sort:
                  </span>
                  {(
                    [
                      { id: "incentives", label: "Incentives" },
                      { id: "apy", label: "APY" },
                      { id: "veMEZOWeight", label: "veMEZO Weight" },
                      { id: "veBTCWeight", label: "veBTC Weight" },
                      { id: "boost", label: "Boost" },
                      { id: "optimalVeMEZO", label: "Optimal veMEZO" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleGaugeSort(option.id)}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${
                        gaugeSortColumn === option.id
                          ? "border-[var(--content-primary)] text-[var(--content-primary)]"
                          : "border-[var(--border)] text-[var(--content-secondary)]"
                      }`}
                    >
                      {option.label}
                      {getGaugeSortIndicator(option.id)}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-pressed={showNeedsBoostOnly}
                    onClick={() => setShowNeedsBoostOnly((value) => !value)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors ${
                      showNeedsBoostOnly
                        ? "border-[rgba(247,147,26,0.35)] bg-[rgba(247,147,26,0.12)] text-[#F7931A]"
                        : "border-[var(--border)] text-[var(--content-secondary)] hover:border-[var(--content-tertiary)] hover:text-[var(--content-primary)]"
                    }`}
                  >
                    <span
                      className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border text-[9px] leading-none ${
                        showNeedsBoostOnly
                          ? "border-[#F7931A] bg-[#F7931A] text-white"
                          : "border-[var(--content-muted)] bg-transparent text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span>Needs Boost</span>
                  </button>
                </div>
              </div>

              {allGauges.length === 0 ? (
                <Card withBorder overrides={{}}>
                  <div className="py-8 text-center">
                    <ParagraphMedium color="var(--content-secondary)">
                      No gauges found
                    </ParagraphMedium>
                  </div>
                </Card>
              ) : filteredAndSortedGauges.length === 0 ? (
                <Card withBorder overrides={{}}>
                  <div className="py-8 text-center">
                    <ParagraphMedium color="var(--content-secondary)">
                      No gauges match your filters
                    </ParagraphMedium>
                  </div>
                </Card>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {paginatedGauges.map((gauge, idx) =>
                      hasAnimatedGaugeCards ? (
                        <GaugeCard
                          key={gauge.address}
                          gauge={gauge}
                          profile={
                            allGaugeProfiles.get(gauge.address.toLowerCase()) ??
                            null
                          }
                          apyData={apyMap.get(gauge.address.toLowerCase())}
                          isLoadingAPY={isLoadingAPY}
                        />
                      ) : (
                        <SpringIn
                          key={gauge.address}
                          delay={idx}
                          variant="card-subtle"
                        >
                          <GaugeCard
                            gauge={gauge}
                            profile={
                              allGaugeProfiles.get(
                                gauge.address.toLowerCase(),
                              ) ?? null
                            }
                            apyData={apyMap.get(gauge.address.toLowerCase())}
                            isLoadingAPY={isLoadingAPY}
                          />
                        </SpringIn>
                      ),
                    )}
                  </div>
                  <PaginationControls
                    currentPage={currentGaugePage}
                    totalPages={totalGaugePages}
                    pageStart={paginatedGaugeStart}
                    pageEnd={paginatedGaugeEnd}
                    totalItems={filteredAndSortedGauges.length}
                    itemLabel="gauge"
                    onPrevious={goToPreviousGaugePage}
                    onNext={goToNextGaugePage}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </SpringIn>
      {isTransferModalOpen && (
        <TransferProfileModal
          isOpen={isTransferModalOpen}
          onClose={() => setIsTransferModalOpen(false)}
          ownedGauges={ownedGauges}
          onTransferComplete={refetchProfiles}
        />
      )}
    </>
  )
}
