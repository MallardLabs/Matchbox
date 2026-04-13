import { AddGaugeIncentiveModal } from "@/components/AddGaugeIncentiveModal"
import { AddressLink } from "@/components/AddressLink"
import OptimalVeMEZOProgress from "@/components/OptimalVeMEZOProgress"
import { SpringIn } from "@/components/SpringIn"
import { TokenIcon } from "@/components/TokenIcon"
import Tooltip from "@/components/Tooltip"
import { getContractConfig } from "@/config/contracts"
import { getExplorerAddressUrl } from "@/config/explorer"
import type { GaugeProfile } from "@/config/supabase"
import { useNetwork } from "@/contexts/NetworkContext"
import { formatAPY, useGaugeAPY } from "@/hooks/useAPY"
import {
  useGaugeHistory,
  useGaugeOwnershipCheck,
  useGaugeProfile,
} from "@/hooks/useGaugeProfiles"
import { useGaugeTopology } from "@/hooks/useGaugeTopology"
import { useBoostInfo } from "@/hooks/useGauges"
import { formatUsdValue } from "@/hooks/useTokenPrices"
import {
  formatFixedPoint,
  formatMultiplier,
  formatTokenAmount,
} from "@/utils/format"
import { calculateOptimalVeMEZO } from "@/utils/optimalVeMEZO"
import { Button, Card, Skeleton, Tag } from "@mezo-org/mezo-clay"
import { NON_STAKING_GAUGE_ABI } from "@repo/shared/contracts"
import Link from "next/link"
import { useRouter } from "next/router"
import { useEffect, useMemo, useState } from "react"
import type { Address } from "viem"
import { useReadContract, useReadContracts } from "wagmi"

type IncentiveWithUSD = {
  tokenAddress: string
  symbol: string
  decimals: number
  amount: bigint
  usdValue: number
}
type GaugeDetailPageProps = {
  address?: string
  initialProfile?: GaugeProfile | null
}

// Social link icons
function TwitterIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function DiscordIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}

function TelegramIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  )
}

function GithubIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

function GlobeIcon({ size = 18 }: { size?: number }) {
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
      focusable="false"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function ExternalLinkIcon({ size = 12 }: { size?: number }) {
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
      focusable="false"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

// Social link button component
function SocialLinkButton({
  href,
  icon,
  label,
}: {
  href: string
  icon: React.ReactNode
  label: string
}) {
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--content-secondary)] transition-all hover:border-[var(--content-tertiary)] hover:text-[var(--content-primary)]"
      title={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <ExternalLinkIcon size={12} />
    </a>
  )
}

export default function GaugeDetailPage({
  address: initialAddress,
  initialProfile = null,
}: GaugeDetailPageProps): JSX.Element {
  const router = useRouter()
  const routeAddress = router.query.address
  const gaugeAddress =
    typeof initialAddress === "string"
      ? (initialAddress as Address)
      : typeof routeAddress === "string"
        ? (routeAddress as Address)
        : undefined

  const { chainId } = useNetwork()
  const contracts = getContractConfig(chainId)
  const { profile, isLoading: isLoadingProfile } = useGaugeProfile(gaugeAddress)
  const resolvedProfile = profile ?? initialProfile

  // Fetch gauge data
  const { data: gaugeData, isLoading: isLoadingGauge } = useReadContracts({
    contracts: gaugeAddress
      ? [
          {
            ...contracts.boostVoter,
            functionName: "weights",
            args: [gaugeAddress],
          },
          {
            ...contracts.boostVoter,
            functionName: "isAlive",
            args: [gaugeAddress],
          },
          {
            address: gaugeAddress,
            abi: NON_STAKING_GAUGE_ABI,
            functionName: "rewardsBeneficiary",
          },
        ]
      : [],
    query: {
      enabled: !!gaugeAddress,
    },
  })

  // Keep as undefined when data is loading to avoid premature "infinite APY" display
  const totalWeight = gaugeData?.[0]?.result as bigint | undefined
  const isAlive = (gaugeData?.[1]?.result as boolean) ?? false
  const beneficiary = gaugeData?.[2]?.result as Address | undefined
  const resolvedBeneficiary =
    beneficiary ??
    (resolvedProfile?.owner_address
      ? (resolvedProfile.owner_address as Address)
      : undefined)

  // Get veBTC token ID for this gauge
  const { data: veBTCBalance } = useReadContract({
    ...contracts.veBTC,
    functionName: "balanceOf",
    args: beneficiary ? [beneficiary] : undefined,
    query: {
      enabled: !!beneficiary,
    },
  })

  const balance = Number(veBTCBalance ?? 0n)

  // Get ALL token IDs owned by beneficiary
  const { data: tokenIdsData } = useReadContracts({
    contracts:
      beneficiary && balance > 0
        ? Array.from({ length: balance }, (_, i) => ({
            ...contracts.veBTC,
            functionName: "ownerToNFTokenIdList",
            args: [beneficiary, BigInt(i)],
          }))
        : [],
    query: {
      enabled: !!beneficiary && balance > 0,
    },
  })

  const tokenIdList =
    tokenIdsData?.map((r) => r.result as bigint).filter(Boolean) ?? []

  // Check which token maps to our gauge
  const { data: mappedGaugesData } = useReadContracts({
    contracts: tokenIdList.map((tokenId) => ({
      ...contracts.boostVoter,
      functionName: "boostableTokenIdToGauge",
      args: [tokenId],
    })),
    query: {
      enabled: tokenIdList.length > 0,
    },
  })

  // Find the token that maps to this gauge
  const veBTCTokenId = useMemo(() => {
    if (!gaugeAddress || !mappedGaugesData) return undefined

    for (let i = 0; i < tokenIdList.length; i++) {
      const mappedGauge = mappedGaugesData[i]?.result as Address | undefined
      if (mappedGauge?.toLowerCase() === gaugeAddress.toLowerCase()) {
        return tokenIdList[i]
      }
    }
    return undefined
  }, [gaugeAddress, tokenIdList, mappedGaugesData])

  const profileVeBTCTokenId = useMemo(() => {
    if (!resolvedProfile?.vebtc_token_id) return undefined

    try {
      return BigInt(resolvedProfile.vebtc_token_id)
    } catch {
      return undefined
    }
  }, [resolvedProfile?.vebtc_token_id])

  // Prefer live on-chain discovery, but keep the saved profile as a fallback
  // so public gauge pages still show owner-derived metadata when follow-up
  // contract reads fail independently.
  const resolvedVeBTCTokenId = veBTCTokenId ?? profileVeBTCTokenId

  // Get boost info
  const {
    boost,
    boostMultiplier,
    isLoading: isLoadingBoost,
  } = useBoostInfo(resolvedVeBTCTokenId)

  // Show the boosted/effective veBTC weight on the page.
  const { data: veBTCVotingPower } = useReadContract({
    ...contracts.veBTC,
    functionName: "votingPowerOfNFT",
    args: resolvedVeBTCTokenId ? [resolvedVeBTCTokenId] : undefined,
    query: {
      enabled: !!resolvedVeBTCTokenId,
    },
  })

  // Unboosted veBTC voting power is the baseline used to compute the 5x
  // optimal veMEZO target (same basis as the Boost calculator).
  const { data: unboostedVeBTCVotingPower } = useReadContract({
    ...contracts.veBTC,
    functionName: "unboostedVotingPowerOfNFT",
    args: resolvedVeBTCTokenId ? [resolvedVeBTCTokenId] : undefined,
    query: {
      enabled: !!resolvedVeBTCTokenId,
    },
  })

  // System totals from escrow `supply()` — same source as Boost calculator.
  const { data: systemSupplies } = useReadContracts({
    contracts: [
      { ...contracts.veBTC, functionName: "supply" },
      { ...contracts.veMEZO, functionName: "supply" },
    ],
  })
  const veBTCTokenSupply = systemSupplies?.[0]?.result as bigint | undefined
  const veMEZOTokenSupply = systemSupplies?.[1]?.result as bigint | undefined

  const optimalVeMEZOData = useMemo(
    () =>
      calculateOptimalVeMEZO(
        unboostedVeBTCVotingPower as bigint | undefined,
        totalWeight ?? 0n,
        veBTCTokenSupply,
        veMEZOTokenSupply,
      ),
    [
      unboostedVeBTCVotingPower,
      totalWeight,
      veBTCTokenSupply,
      veMEZOTokenSupply,
    ],
  )

  // Check on-chain ownership
  const { isOwnershipValid } = useGaugeOwnershipCheck(
    resolvedProfile?.vebtc_token_id,
    resolvedProfile?.owner_address,
  )
  const ownershipMismatch = isOwnershipValid === false

  // Fetch gauge history
  const { history, isLoading: isLoadingHistory } = useGaugeHistory(gaugeAddress)
  const [isAddIncentiveModalOpen, setIsAddIncentiveModalOpen] = useState(false)
  const { refetch: refetchTopology } = useGaugeTopology({
    enabled: !!gaugeAddress,
  })

  const gaugeHasNoVotes = totalWeight !== undefined && totalWeight === 0n

  // Calculate APY for this gauge
  const {
    apy,
    incentivesByToken,
    totalIncentivesUSD,
    isLoading: isLoadingAPY,
  } = useGaugeAPY(gaugeAddress, totalWeight)

  const incentivesWithUSD: IncentiveWithUSD[] = useMemo(
    () =>
      incentivesByToken.map((incentive) => ({
        tokenAddress: incentive.tokenAddress,
        symbol: incentive.symbol,
        decimals: incentive.decimals,
        amount: incentive.amount,
        usdValue: incentive.usdValue,
      })),
    [incentivesByToken],
  )

  // Check if profile has meaningful content
  const hasProfileContent =
    resolvedProfile?.display_name ||
    resolvedProfile?.description ||
    resolvedProfile?.profile_picture_url

  // Check if there are social links
  const hasSocialLinks =
    resolvedProfile?.website_url ||
    resolvedProfile?.social_links?.twitter ||
    resolvedProfile?.social_links?.discord ||
    resolvedProfile?.social_links?.telegram ||
    resolvedProfile?.social_links?.github

  const isInitialLoading =
    !gaugeAddress || isLoadingGauge || (!resolvedProfile && isLoadingProfile)
  const [hasShownContent, setHasShownContent] = useState(false)

  useEffect(() => {
    if (!isInitialLoading) {
      setHasShownContent(true)
    }
  }, [isInitialLoading])

  if (!gaugeAddress && router.isReady) {
    return (
      <div className="p-12 text-center">
        <p className="text-sm text-[var(--content-secondary)]">
          Invalid gauge address
        </p>
      </div>
    )
  }

  if (!gaugeAddress) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton width="100%" height="200px" animation />
        <Skeleton width="100%" height="150px" animation />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {!hasShownContent ? (
        <div className="flex flex-col gap-4">
          <Skeleton width="100%" height="200px" animation />
          <Skeleton width="100%" height="150px" animation />
        </div>
      ) : (
        <>
          {/* Back navigation */}
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-sm text-[var(--content-secondary)] transition-colors hover:text-[var(--content-primary)]"
          >
            <svg
              width="16"
              height="16"
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
            Back
          </button>

          {/* Ownership mismatch banner */}
          {ownershipMismatch && (
            <div className="rounded-lg border border-[var(--warning-subtle)] bg-[var(--warning-subtle)] p-4">
              <p className="text-sm text-[var(--warning)]">
                This gauge&apos;s profile was reset due to an NFT ownership
                change.
              </p>
            </div>
          )}

          {/* Profile Header */}
          <SpringIn delay={0} variant="card">
            <Card withBorder overrides={{}}>
              <div className="flex flex-col gap-6 md:flex-row md:items-start">
                {/* Profile Picture */}
                <div className="flex flex-shrink-0 items-center justify-center md:items-start">
                  <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border-[3px] border-[var(--border)] bg-[var(--surface-secondary)] sm:h-[140px] sm:w-[140px]">
                    {resolvedProfile?.profile_picture_url ? (
                      <img
                        src={resolvedProfile.profile_picture_url}
                        alt={`Gauge ${resolvedVeBTCTokenId?.toString() ?? gaugeAddress}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-4xl font-bold text-[var(--content-tertiary)]">
                          #
                        </span>
                        <span className="text-lg font-semibold text-[var(--content-tertiary)]">
                          {resolvedVeBTCTokenId?.toString() ?? "?"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Gauge Info */}
                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2
                        className={`text-2xl font-semibold md:text-3xl ${
                          hasProfileContent
                            ? "text-[var(--content-primary)]"
                            : "text-[var(--content-secondary)]"
                        }`}
                      >
                        {resolvedProfile?.display_name ||
                          `veBTC #${resolvedVeBTCTokenId?.toString() ?? "Unknown"}`}
                      </h2>
                      {resolvedProfile?.display_name &&
                        resolvedVeBTCTokenId && (
                          <span className="inline-flex items-center rounded-md border border-[rgba(247,147,26,0.3)] bg-[rgba(247,147,26,0.15)] px-2.5 py-1 font-mono text-xs font-semibold tracking-wide text-[#F7931A]">
                            #{resolvedVeBTCTokenId.toString()}
                          </span>
                        )}
                      <Tag color={isAlive ? "green" : "red"} closeable={false}>
                        {isAlive ? "Active" : "Inactive"}
                      </Tag>
                      {resolvedProfile?.is_featured && (
                        <Tag color="blue" closeable={false}>
                          Featured
                        </Tag>
                      )}
                    </div>

                    {isAlive && (
                      <div className="w-full md:w-auto">
                        <Button
                          kind="secondary"
                          onClick={() => setIsAddIncentiveModalOpen(true)}
                          overrides={{
                            BaseButton: {
                              style: {
                                width: "100%",
                              },
                            },
                          }}
                        >
                          Add Incentives
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="mb-4">
                    <AddressLink address={gaugeAddress} />
                  </div>

                  {resolvedProfile?.description ? (
                    <p className="mb-4 whitespace-pre-wrap break-words text-sm text-[var(--content-secondary)] md:text-base">
                      {resolvedProfile.description}
                    </p>
                  ) : (
                    <p className="mb-4 text-sm italic text-[var(--content-tertiary)]">
                      No description provided
                    </p>
                  )}

                  {/* Tags */}
                  {resolvedProfile?.tags && resolvedProfile.tags.length > 0 && (
                    <div className="mb-4 flex flex-wrap gap-2">
                      {resolvedProfile.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-[var(--border)] bg-[var(--surface-secondary)] px-3 py-1 text-xs text-[var(--content-secondary)]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Social Links */}
                  {hasSocialLinks && (
                    <div className="flex flex-wrap gap-2">
                      {resolvedProfile?.website_url && (
                        <SocialLinkButton
                          href={resolvedProfile.website_url}
                          icon={<GlobeIcon size={16} />}
                          label="Website"
                        />
                      )}
                      {resolvedProfile?.social_links?.twitter && (
                        <SocialLinkButton
                          href={resolvedProfile.social_links.twitter}
                          icon={<TwitterIcon size={16} />}
                          label="Twitter"
                        />
                      )}
                      {resolvedProfile?.social_links?.discord && (
                        <SocialLinkButton
                          href={resolvedProfile.social_links.discord}
                          icon={<DiscordIcon size={16} />}
                          label="Discord"
                        />
                      )}
                      {resolvedProfile?.social_links?.telegram && (
                        <SocialLinkButton
                          href={resolvedProfile.social_links.telegram}
                          icon={<TelegramIcon size={16} />}
                          label="Telegram"
                        />
                      )}
                      {resolvedProfile?.social_links?.github && (
                        <SocialLinkButton
                          href={resolvedProfile.social_links.github}
                          icon={<GithubIcon size={16} />}
                          label="GitHub"
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </SpringIn>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 md:gap-4 lg:grid-cols-6">
            <SpringIn delay={1} variant="card">
              <Card
                withBorder
                overrides={{
                  Root: { style: { height: "100%" } },
                }}
              >
                <div className="py-2">
                  <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                    veBTC Weight
                  </p>
                  <h3 className="font-mono text-lg font-semibold tabular-nums text-[var(--content-primary)] md:text-xl">
                    {veBTCVotingPower !== undefined
                      ? formatTokenAmount(veBTCVotingPower, 18)
                      : "-"}
                  </h3>
                </div>
              </Card>
            </SpringIn>

            <SpringIn delay={2} variant="card">
              <Card
                withBorder
                overrides={{
                  Root: { style: { height: "100%" } },
                }}
              >
                <div className="py-2">
                  <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                    veMEZO Weight
                  </p>
                  <h3 className="font-mono text-lg font-semibold tabular-nums text-[var(--content-primary)] md:text-xl">
                    {formatTokenAmount(totalWeight ?? 0n, 18)}
                  </h3>
                </div>
              </Card>
            </SpringIn>

            <SpringIn delay={3} variant="card">
              <Card
                withBorder
                overrides={{
                  Root: { style: { height: "100%" } },
                }}
              >
                <div className="py-2">
                  <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                    Current Boost
                  </p>
                  <h3 className="font-mono text-lg font-semibold tabular-nums text-[var(--content-primary)] md:text-xl">
                    {isLoadingBoost && resolvedVeBTCTokenId !== undefined
                      ? "..."
                      : boost !== undefined
                        ? formatMultiplier(boostMultiplier)
                        : "-"}
                  </h3>
                </div>
              </Card>
            </SpringIn>

            <SpringIn delay={4} variant="card">
              <Card
                withBorder
                overrides={{
                  Root: { style: { height: "100%" } },
                }}
              >
                <div className="py-2">
                  <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                    Voting APY
                  </p>
                  <h3
                    className={`font-mono text-lg font-semibold tabular-nums md:text-xl ${
                      apy && apy > 0
                        ? "text-[var(--positive)]"
                        : "text-[var(--content-primary)]"
                    }`}
                  >
                    {isLoadingAPY ? "..." : formatAPY(apy)}
                  </h3>
                </div>
              </Card>
            </SpringIn>

            <SpringIn delay={5} variant="card">
              <Card
                withBorder
                overrides={{
                  Root: { style: { height: "100%" } },
                }}
              >
                <div className="py-2">
                  <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                    Incentives
                  </p>
                  <h3 className="font-mono text-lg font-semibold tabular-nums text-[var(--content-primary)] md:text-xl">
                    {isLoadingAPY ? "..." : `$${totalIncentivesUSD.toFixed(2)}`}
                  </h3>
                  <p className="mt-0.5 text-2xs text-[var(--content-tertiary)]">
                    per week
                  </p>
                </div>
              </Card>
            </SpringIn>

            <SpringIn delay={6} variant="card">
              <Card
                withBorder
                overrides={{
                  Root: { style: { height: "100%" } },
                }}
              >
                <div className="py-2">
                  <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                    Manager
                  </p>
                  {resolvedBeneficiary ? (
                    <a
                      href={getExplorerAddressUrl(chainId, resolvedBeneficiary)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm text-[var(--accent)] no-underline transition-opacity hover:opacity-80 hover:underline"
                    >
                      {resolvedBeneficiary.slice(0, 6)}...
                      {resolvedBeneficiary.slice(-4)}
                    </a>
                  ) : (
                    <span className="text-sm text-[var(--content-secondary)]">
                      -
                    </span>
                  )}
                </div>
              </Card>
            </SpringIn>
          </div>

          {/* Optimal veMEZO progress — surfaces the 5x boost target */}
          {optimalVeMEZOData && (
            <SpringIn delay={7} variant="card">
              <Card withBorder overrides={{}}>
                <div className="flex flex-col gap-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <p className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                        Optimal veMEZO
                      </p>
                      <Tooltip
                        id={`gd-optimal-${gaugeAddress}`}
                        content="veMEZO voting weight on this gauge that reaches maximum (5x) boost. System totals are veBTC and veMEZO supply() from escrow—the same bases as the Boost calculator. Below that, the bar fills in orange toward the goal. At the target the bar is green. If oversubscribed, a red layer grows over the green from 0% at 1× to 100% at 2× the optimal weight (full red); beyond 2× the bar stays full red—more veMEZO dilutes rewards per voter."
                      />
                    </div>
                  </div>
                  <OptimalVeMEZOProgress
                    optimalTarget={optimalVeMEZOData.optimalVeMEZO}
                    effectiveWeight={totalWeight ?? 0n}
                    size="md"
                  />
                </div>
              </Card>
            </SpringIn>
          )}

          {/* Strategy Section */}
          {(resolvedProfile?.incentive_strategy ||
            resolvedProfile?.voting_strategy) && (
            <SpringIn delay={7} variant="card">
              <Card title="Strategy & Goals" withBorder overrides={{}}>
                <div className="grid gap-6 py-4 md:grid-cols-2">
                  {resolvedProfile?.incentive_strategy && (
                    <div>
                      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--content-primary)]">
                        <span className="flex h-6 w-6 items-center justify-center rounded bg-[rgba(34,197,94,0.15)] text-xs">
                          💰
                        </span>
                        Incentive Strategy
                      </h4>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--content-secondary)]">
                        {resolvedProfile.incentive_strategy}
                      </p>
                    </div>
                  )}
                  {resolvedProfile?.voting_strategy && (
                    <div>
                      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--content-primary)]">
                        <span className="flex h-6 w-6 items-center justify-center rounded bg-[rgba(59,130,246,0.15)] text-xs">
                          🗳️
                        </span>
                        Voting Strategy
                      </h4>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--content-secondary)]">
                        {resolvedProfile.voting_strategy}
                      </p>
                    </div>
                  )}
                </div>
              </Card>
            </SpringIn>
          )}

          {/* Incentives */}
          <SpringIn delay={8} variant="card">
            <Card title="Current Epoch Incentives" withBorder overrides={{}}>
              <div className="py-4">
                {isLoadingAPY ? (
                  <Skeleton width="100%" height="60px" animation />
                ) : incentivesWithUSD.length === 0 ? (
                  <div className="rounded-lg bg-[var(--surface-secondary)] p-6 text-center">
                    <p className="text-sm text-[var(--content-secondary)]">
                      No incentives available for this epoch
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                    {incentivesWithUSD.map((incentive) => (
                      <div
                        key={incentive.tokenAddress}
                        className="rounded-lg border border-[var(--border)] bg-[var(--surface-secondary)] p-4"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <TokenIcon symbol={incentive.symbol} size={28} />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-[var(--content-primary)]">
                              {incentive.symbol}
                            </span>
                            <span className="text-2xs text-[var(--content-secondary)]">
                              {formatUsdValue(incentive.usdValue)}
                            </span>
                          </div>
                        </div>
                        <p className="font-mono text-base font-medium tabular-nums text-[var(--content-primary)]">
                          {formatFixedPoint(
                            incentive.amount,
                            BigInt(incentive.decimals),
                          )}{" "}
                          {incentive.symbol}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </SpringIn>

          {/* Historical Data */}
          <SpringIn delay={9} variant="card">
            <Card title="Historical Performance" withBorder overrides={{}}>
              <div className="py-4">
                {isLoadingHistory ? (
                  <Skeleton width="100%" height="200px" animation />
                ) : history.length === 0 ? (
                  <div className="rounded-lg bg-[var(--surface-secondary)] p-8 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface)]">
                      <span className="text-xl">📈</span>
                    </div>
                    <h4 className="mb-1 text-sm font-medium text-[var(--content-primary)]">
                      Historical Data Coming Soon
                    </h4>
                    <p className="text-xs text-[var(--content-secondary)]">
                      Track this gauge&apos;s performance over time including
                      vote trends, boost history, and APY changes.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Simple historical data table */}
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[600px]">
                        <thead>
                          <tr className="border-b border-[var(--border)]">
                            <th className="pb-2 text-left text-2xs font-medium uppercase tracking-wider text-[var(--content-tertiary)]">
                              Epoch
                            </th>
                            <th className="pb-2 text-right text-2xs font-medium uppercase tracking-wider text-[var(--content-tertiary)]">
                              veMEZO Votes
                            </th>
                            <th className="pb-2 text-right text-2xs font-medium uppercase tracking-wider text-[var(--content-tertiary)]">
                              Boost
                            </th>
                            <th className="pb-2 text-right text-2xs font-medium uppercase tracking-wider text-[var(--content-tertiary)]">
                              Incentives
                            </th>
                            <th className="pb-2 text-right text-2xs font-medium uppercase tracking-wider text-[var(--content-tertiary)]">
                              APY
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((record) => (
                            <tr
                              key={record.epoch_start}
                              className="border-b border-[var(--border)] last:border-0"
                            >
                              <td className="py-3 text-sm text-[var(--content-primary)]">
                                {new Date(
                                  record.epoch_start * 1000,
                                ).toLocaleDateString()}
                              </td>
                              <td className="py-3 text-right font-mono text-sm tabular-nums text-[var(--content-primary)]">
                                {record.vemezo_weight
                                  ? formatTokenAmount(
                                      BigInt(record.vemezo_weight),
                                      18,
                                    )
                                  : "-"}
                              </td>
                              <td className="py-3 text-right font-mono text-sm tabular-nums text-[var(--content-primary)]">
                                {record.boost_multiplier
                                  ? `${record.boost_multiplier.toFixed(2)}x`
                                  : "-"}
                              </td>
                              <td className="py-3 text-right font-mono text-sm tabular-nums text-[var(--content-primary)]">
                                {record.total_incentives_usd != null
                                  ? `$${record.total_incentives_usd.toFixed(2)}`
                                  : "-"}
                              </td>
                              <td
                                className={`py-3 text-right font-mono text-sm font-medium tabular-nums ${
                                  record.apy && record.apy > 0
                                    ? "text-[var(--positive)]"
                                    : "text-[var(--content-primary)]"
                                }`}
                              >
                                {record.apy ? formatAPY(record.apy) : "-"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </SpringIn>

          {/* Vote CTA */}
          <SpringIn delay={10} variant="card">
            <div className="rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-secondary)] p-6 text-center">
              <h3 className="mb-2 text-lg font-semibold text-[var(--content-primary)]">
                Want to support this gauge?
              </h3>
              <p className="mb-4 text-sm text-[var(--content-secondary)]">
                Vote with your veMEZO to boost this gauge and earn incentives
              </p>
              <Link href="/boost" passHref legacyBehavior>
                <Button kind="primary" $as="a">
                  Vote Now
                </Button>
              </Link>
            </div>
          </SpringIn>
        </>
      )}

      {gaugeAddress && (
        <AddGaugeIncentiveModal
          isOpen={isAddIncentiveModalOpen}
          onClose={() => setIsAddIncentiveModalOpen(false)}
          gaugeAddress={gaugeAddress}
          gaugeName={
            resolvedProfile?.display_name ||
            `veBTC #${resolvedVeBTCTokenId?.toString() ?? "Unknown"}`
          }
          gaugeTokenId={resolvedVeBTCTokenId}
          gaugeImageUrl={resolvedProfile?.profile_picture_url}
          totalIncentivesUsd={totalIncentivesUSD}
          gaugeHasNoVotes={gaugeHasNoVotes}
          onIncentivesAdded={() => {
            void refetchTopology()
          }}
        />
      )}
    </div>
  )
}
