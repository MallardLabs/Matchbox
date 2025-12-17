import { AddressLink } from "@/components/AddressLink"
import { Layout } from "@/components/Layout"
import { SpringIn } from "@/components/SpringIn"
import { getContractConfig } from "@/config/contracts"
import { formatAPY, useGaugeAPY } from "@/hooks/useAPY"
import { useGaugeProfile } from "@/hooks/useGaugeProfiles"
import { useBoostInfo } from "@/hooks/useGauges"
import { useBribeAddress, useBribeIncentives } from "@/hooks/useVoting"
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
import type { Address } from "viem"
import { useReadContract, useReadContracts } from "wagmi"

const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL || "https://explorer.test.mezo.org"

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

  // Fetch bribes
  const { bribeAddress, hasBribe } = useBribeAddress(gaugeAddress)
  const { incentives, isLoading: isLoadingIncentives } =
    useBribeIncentives(bribeAddress)

  // Calculate APY for this gauge
  const {
    apy,
    totalIncentivesUSD,
    isLoading: isLoadingAPY,
  } = useGaugeAPY(gaugeAddress, totalWeight)

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
                <div className="flex flex-wrap items-start gap-6 sm:flex-col sm:items-center sm:text-center md:flex-row md:items-start md:text-left">
                  {/* Profile Picture */}
                  <div className="flex h-[120px] w-[120px] flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] border-[var(--border)] bg-[var(--surface-secondary)]">
                    {profile?.profile_picture_url ? (
                      <img
                        src={profile.profile_picture_url}
                        alt={`Gauge ${veBTCTokenId?.toString() ?? gaugeAddress}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <h3 className="text-2xl font-semibold text-[var(--content-secondary)]">
                        #{veBTCTokenId?.toString() ?? "?"}
                      </h3>
                    )}
                  </div>

                  {/* Gauge Info */}
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-3">
                      <h2
                        className={`text-3xl font-semibold ${
                          profile?.display_name ||
                          profile?.description ||
                          profile?.profile_picture_url
                            ? "text-[var(--positive)]"
                            : "text-[var(--negative)]"
                        }`}
                      >
                        {profile?.display_name ||
                          `veBTC #${veBTCTokenId?.toString() ?? "Unknown"}`}
                      </h2>
                      {profile?.display_name && (
                        <span className="inline-flex items-center rounded-md border border-[rgba(247,147,26,0.3)] bg-[rgba(247,147,26,0.15)] px-2.5 py-1 font-mono text-xs font-semibold tracking-wide text-[#F7931A]">
                          #{veBTCTokenId?.toString() ?? "?"}
                        </span>
                      )}
                      <Tag color={isAlive ? "green" : "red"} closeable={false}>
                        {isAlive ? "Active" : "Inactive"}
                      </Tag>
                    </div>

                    <div className="mb-4">
                      <AddressLink address={gaugeAddress} />
                    </div>

                    {profile?.description ? (
                      <p className="whitespace-pre-wrap break-words text-base text-[var(--content-primary)]">
                        {profile.description}
                      </p>
                    ) : (
                      <p className="text-sm text-[var(--content-secondary)]">
                        No description provided
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            </SpringIn>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-5">
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
                    <h3 className="font-mono text-2xl font-semibold tabular-nums text-[var(--content-primary)]">
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
                    <h3 className="font-mono text-2xl font-semibold tabular-nums text-[var(--content-primary)]">
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
                    <h3 className="font-mono text-2xl font-semibold tabular-nums text-[var(--content-primary)]">
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
                      className={`font-mono text-2xl font-semibold tabular-nums ${
                        apy && apy > 0
                          ? "text-[var(--positive)]"
                          : "text-[var(--content-primary)]"
                      }`}
                    >
                      {isLoadingAPY ? "..." : formatAPY(apy)}
                    </h3>
                    <p className="mt-1 text-2xs text-[var(--content-tertiary)]">
                      ${totalIncentivesUSD.toFixed(2)}/week
                    </p>
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
                      Manager
                    </p>
                    {beneficiary ? (
                      <h3 className="font-mono text-2xl font-semibold tabular-nums">
                        <a
                          href={`${EXPLORER_URL}/address/${beneficiary}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--accent)] no-underline transition-opacity hover:opacity-80 hover:underline"
                        >
                          {beneficiary.slice(0, 6)}...{beneficiary.slice(-4)}
                        </a>
                      </h3>
                    ) : (
                      <h3 className="font-mono text-2xl font-semibold tabular-nums text-[var(--content-secondary)]">
                        -
                      </h3>
                    )}
                  </div>
                </Card>
              </SpringIn>
            </div>

            {/* Incentives */}
            <SpringIn delay={6} variant="card">
              <Card title="Current Epoch Incentives" withBorder overrides={{}}>
                <div className="py-4">
                  {isLoadingIncentives ? (
                    <Skeleton width="100%" height="60px" animation />
                  ) : !hasBribe || incentives.length === 0 ? (
                    <p className="text-sm text-[var(--content-secondary)]">
                      No incentives available for this epoch
                    </p>
                  ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                      {incentives.map((incentive) => (
                        <div
                          key={incentive.tokenAddress}
                          className="rounded-lg bg-[var(--surface-secondary)] p-4"
                        >
                          <p className="mb-2 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                            {incentive.symbol}
                          </p>
                          <p className="font-mono text-base font-medium tabular-nums text-[var(--content-primary)]">
                            {formatFixedPoint(
                              incentive.amount,
                              BigInt(incentive.decimals),
                            )}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </SpringIn>
          </>
        )}
      </div>
    </Layout>
  )
}
