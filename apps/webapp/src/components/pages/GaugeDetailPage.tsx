import { AddressLink } from "@/components/AddressLink"
import { Layout } from "@/components/Layout"
import { SpringIn } from "@/components/SpringIn"
import { TokenIcon } from "@/components/TokenIcon"
import { getContractConfig } from "@/config/contracts"
import { formatAPY, useGaugeAPY } from "@/hooks/useAPY"
import { useBtcPrice } from "@/hooks/useBtcPrice"
import { useGaugeHistory, useGaugeProfile } from "@/hooks/useGaugeProfiles"
import { useBoostInfo } from "@/hooks/useGauges"
import {
  type BribeIncentive,
  useBribeAddress,
  useBribeIncentives,
} from "@/hooks/useVoting"
import {
  formatFixedPoint,
  formatMultiplier,
  formatTokenAmount,
} from "@/utils/format"
import { Button, Card, Skeleton, Tag } from "@mezo-org/mezo-clay"
import { CHAIN_ID, NON_STAKING_GAUGE_ABI } from "@repo/shared/contracts"
import Link from "next/link"
import { useRouter } from "next/router"
import { useMemo } from "react"
import { type Address, formatUnits } from "viem"
import { useReadContract, useReadContracts } from "wagmi"

const MEZO_PRICE = 0.22
const MEZO_TOKEN_ADDRESS =
  "0x7b7c000000000000000000000000000000000001".toLowerCase()

type IncentiveWithUSD = BribeIncentive & { usdValue: number | null }

function formatUsdValue(value: number | null): string {
  if (!value || Number.isNaN(value)) return "~$0.00"
  return `~$${value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`
}

function getIncentiveUsdValue(
  incentive: BribeIncentive,
  btcPrice: number | null,
): number | null {
  const amount = Number.parseFloat(
    formatUnits(incentive.amount, incentive.decimals),
  )
  if (!Number.isFinite(amount)) return null

  const tokenKey = incentive.tokenAddress.toLowerCase()
  const price = tokenKey === MEZO_TOKEN_ADDRESS ? MEZO_PRICE : btcPrice
  if (!price) return null

  return amount * price
}

const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL || "https://explorer.test.mezo.org"

// Social link icons
function TwitterIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function DiscordIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}

function TelegramIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  )
}

function GithubIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
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

export default function GaugeDetailPage(): JSX.Element {
  const router = useRouter()
  const { address } = router.query
  const gaugeAddress = address as Address | undefined

  const contracts = getContractConfig(CHAIN_ID.testnet)

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

  const totalWeight = (gaugeData?.[0]?.result as bigint) ?? 0n
  const isAlive = (gaugeData?.[1]?.result as boolean) ?? false
  const beneficiary = gaugeData?.[2]?.result as Address | undefined

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

  // Get boost info
  const { boostMultiplier, isLoading: isLoadingBoost } =
    useBoostInfo(veBTCTokenId)

  // Get veBTC voting power
  const { data: veBTCVotingPower } = useReadContract({
    ...contracts.veBTC,
    functionName: "votingPowerOfNFT",
    args: veBTCTokenId ? [veBTCTokenId] : undefined,
    query: {
      enabled: !!veBTCTokenId,
    },
  })

  // Fetch gauge profile
  const { profile, isLoading: isLoadingProfile } = useGaugeProfile(gaugeAddress)

  // Fetch gauge history
  const { history, isLoading: isLoadingHistory } = useGaugeHistory(gaugeAddress)

  // Fetch bribes
  const { bribeAddress, hasBribe } = useBribeAddress(gaugeAddress)
  const { incentives, isLoading: isLoadingIncentives } =
    useBribeIncentives(bribeAddress)
  const { price: btcPrice } = useBtcPrice()

  const incentivesWithUSD: IncentiveWithUSD[] = useMemo(
    () =>
      incentives.map((incentive) => ({
        ...incentive,
        usdValue: getIncentiveUsdValue(incentive, btcPrice),
      })),
    [btcPrice, incentives],
  )

  // Calculate total incentives
  const totalIncentivesUSD = useMemo(
    () => incentivesWithUSD.reduce((sum, inc) => sum + (inc.usdValue ?? 0), 0),
    [incentivesWithUSD],
  )

  // Calculate APY for this gauge
  const { apy, isLoading: isLoadingAPY } = useGaugeAPY(
    gaugeAddress,
    totalWeight,
  )

  // Check if profile has meaningful content
  const hasProfileContent =
    profile?.display_name ||
    profile?.description ||
    profile?.profile_picture_url

  // Check if there are social links
  const hasSocialLinks =
    profile?.website_url ||
    profile?.social_links?.twitter ||
    profile?.social_links?.discord ||
    profile?.social_links?.telegram ||
    profile?.social_links?.github

  const isLoading = isLoadingGauge || isLoadingProfile || isLoadingBoost

  if (!gaugeAddress) {
    return (
      <Layout>
        <div className="p-12 text-center">
          <p className="text-sm text-[var(--content-secondary)]">
            Invalid gauge address
          </p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Back button */}
        <Link href="/gauges" passHref legacyBehavior>
          <Button kind="tertiary" size="small" $as="a">
            ← Back to Gauges
          </Button>
        </Link>

        {isLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton width="100%" height="200px" animation />
            <Skeleton width="100%" height="150px" animation />
          </div>
        ) : (
          <>
            {/* Profile Header */}
            <SpringIn delay={0} variant="card">
              <Card withBorder overrides={{}}>
                <div className="flex flex-col gap-6 md:flex-row md:items-start">
                  {/* Profile Picture */}
                  <div className="flex flex-shrink-0 items-center justify-center md:items-start">
                    <div className="flex h-[140px] w-[140px] items-center justify-center overflow-hidden rounded-2xl border-[3px] border-[var(--border)] bg-[var(--surface-secondary)]">
                      {profile?.profile_picture_url ? (
                        <img
                          src={profile.profile_picture_url}
                          alt={`Gauge ${veBTCTokenId?.toString() ?? gaugeAddress}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-4xl font-bold text-[var(--content-tertiary)]">
                            #
                          </span>
                          <span className="text-lg font-semibold text-[var(--content-tertiary)]">
                            {veBTCTokenId?.toString() ?? "?"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Gauge Info */}
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      <h2
                        className={`text-2xl font-semibold md:text-3xl ${
                          hasProfileContent
                            ? "text-[var(--content-primary)]"
                            : "text-[var(--content-secondary)]"
                        }`}
                      >
                        {profile?.display_name ||
                          `veBTC #${veBTCTokenId?.toString() ?? "Unknown"}`}
                      </h2>
                      {profile?.display_name && veBTCTokenId && (
                        <span className="inline-flex items-center rounded-md border border-[rgba(247,147,26,0.3)] bg-[rgba(247,147,26,0.15)] px-2.5 py-1 font-mono text-xs font-semibold tracking-wide text-[#F7931A]">
                          #{veBTCTokenId.toString()}
                        </span>
                      )}
                      <Tag color={isAlive ? "green" : "red"} closeable={false}>
                        {isAlive ? "Active" : "Inactive"}
                      </Tag>
                      {profile?.is_featured && (
                        <Tag color="blue" closeable={false}>
                          Featured
                        </Tag>
                      )}
                    </div>

                    <div className="mb-4">
                      <AddressLink address={gaugeAddress} />
                    </div>

                    {profile?.description ? (
                      <p className="mb-4 whitespace-pre-wrap break-words text-sm text-[var(--content-secondary)] md:text-base">
                        {profile.description}
                      </p>
                    ) : (
                      <p className="mb-4 text-sm italic text-[var(--content-tertiary)]">
                        No description provided
                      </p>
                    )}

                    {/* Tags */}
                    {profile?.tags && profile.tags.length > 0 && (
                      <div className="mb-4 flex flex-wrap gap-2">
                        {profile.tags.map((tag) => (
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
                        {profile?.website_url && (
                          <SocialLinkButton
                            href={profile.website_url}
                            icon={<GlobeIcon size={16} />}
                            label="Website"
                          />
                        )}
                        {profile?.social_links?.twitter && (
                          <SocialLinkButton
                            href={profile.social_links.twitter}
                            icon={<TwitterIcon size={16} />}
                            label="Twitter"
                          />
                        )}
                        {profile?.social_links?.discord && (
                          <SocialLinkButton
                            href={profile.social_links.discord}
                            icon={<DiscordIcon size={16} />}
                            label="Discord"
                          />
                        )}
                        {profile?.social_links?.telegram && (
                          <SocialLinkButton
                            href={profile.social_links.telegram}
                            icon={<TelegramIcon size={16} />}
                            label="Telegram"
                          />
                        )}
                        {profile?.social_links?.github && (
                          <SocialLinkButton
                            href={profile.social_links.github}
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
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-6">
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
                      {veBTCVotingPower
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
                      {formatTokenAmount(totalWeight, 18)}
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
                      {formatMultiplier(boostMultiplier)}
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
                      ${totalIncentivesUSD.toFixed(2)}
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
                    {beneficiary ? (
                      <a
                        href={`${EXPLORER_URL}/address/${beneficiary}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-sm text-[var(--accent)] no-underline transition-opacity hover:opacity-80 hover:underline"
                      >
                        {beneficiary.slice(0, 6)}...{beneficiary.slice(-4)}
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

            {/* Strategy Section */}
            {(profile?.incentive_strategy || profile?.voting_strategy) && (
              <SpringIn delay={7} variant="card">
                <Card title="Strategy & Goals" withBorder overrides={{}}>
                  <div className="grid gap-6 py-4 md:grid-cols-2">
                    {profile?.incentive_strategy && (
                      <div>
                        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--content-primary)]">
                          <span className="flex h-6 w-6 items-center justify-center rounded bg-[rgba(34,197,94,0.15)] text-xs">
                            💰
                          </span>
                          Incentive Strategy
                        </h4>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--content-secondary)]">
                          {profile.incentive_strategy}
                        </p>
                      </div>
                    )}
                    {profile?.voting_strategy && (
                      <div>
                        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--content-primary)]">
                          <span className="flex h-6 w-6 items-center justify-center rounded bg-[rgba(59,130,246,0.15)] text-xs">
                            🗳️
                          </span>
                          Voting Strategy
                        </h4>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--content-secondary)]">
                          {profile.voting_strategy}
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
                  {isLoadingIncentives ? (
                    <Skeleton width="100%" height="60px" animation />
                  ) : !hasBribe || incentives.length === 0 ? (
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
      </div>
    </Layout>
  )
}
