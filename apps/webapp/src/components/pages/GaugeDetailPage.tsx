import { AddressLink } from "@/components/AddressLink"
import { Layout } from "@/components/Layout"
import { SpringIn } from "@/components/SpringIn"
import { getContractConfig } from "@/config/contracts"
import { useBoostInfo } from "@/hooks/useGauges"
import { useGaugeProfile } from "@/hooks/useGaugeProfiles"
import { useBribeAddress, useBribeIncentives } from "@/hooks/useVoting"
import { useGaugeAPY, formatAPY } from "@/hooks/useAPY"
import { formatFixedPoint, formatMultiplier } from "@/utils/format"
import { CHAIN_ID, NON_STAKING_GAUGE_ABI } from "@repo/shared/contracts"
import {
  Button,
  Card,
  HeadingLarge,
  HeadingMedium,
  LabelMedium,
  LabelSmall,
  ParagraphLarge,
  ParagraphMedium,
  Skeleton,
  Tag,
  useStyletron,
} from "@mezo-org/mezo-clay"
import Link from "next/link"
import { useRouter } from "next/router"
import type { Address } from "viem"
import { formatUnits } from "viem"
import { useReadContract, useReadContracts } from "wagmi"

const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL || "https://explorer.test.mezo.org"

export default function GaugeDetailPage() {
  const [css, theme] = useStyletron()
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

  // Get the first token ID owned by beneficiary
  const { data: tokenId } = useReadContract({
    ...contracts.veBTC,
    functionName: "ownerToNFTokenIdList",
    args: beneficiary && veBTCBalance ? [beneficiary, 0n] : undefined,
    query: {
      enabled: !!beneficiary && !!veBTCBalance && veBTCBalance > 0n,
    },
  })

  // Check if this token maps to our gauge
  const { data: mappedGauge } = useReadContract({
    ...contracts.boostVoter,
    functionName: "boostableTokenIdToGauge",
    args: tokenId ? [tokenId] : undefined,
    query: {
      enabled: !!tokenId,
    },
  })

  const veBTCTokenId =
    mappedGauge?.toLowerCase() === gaugeAddress?.toLowerCase() ? tokenId : undefined

  // Get boost info
  const { boostMultiplier, isLoading: isLoadingBoost } = useBoostInfo(veBTCTokenId)

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
  const { apy, totalIncentivesUSD, isLoading: isLoadingAPY } = useGaugeAPY(
    gaugeAddress,
    totalWeight
  )

  const isLoading = isLoadingGauge || isLoadingProfile || isLoadingBoost

  if (!gaugeAddress) {
    return (
      <Layout>
        <div className={css({ padding: "48px", textAlign: "center" })}>
          <ParagraphMedium color={theme.colors.contentSecondary}>
            Invalid gauge address
          </ParagraphMedium>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div
        className={css({
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        })}
      >
        {/* Back button */}
        <Link href="/gauges" passHref legacyBehavior>
          <Button kind="tertiary" size="small" $as="a">
            ← Back to Gauges
          </Button>
        </Link>

        {isLoading ? (
          <div
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            })}
          >
            <Skeleton width="100%" height="200px" animation />
            <Skeleton width="100%" height="150px" animation />
          </div>
        ) : (
          <>
            {/* Profile Header */}
            <SpringIn delay={0} variant="card">
              <Card withBorder overrides={{}}>
                <div
                  className={css({
                    display: "flex",
                    gap: "24px",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    "@media (max-width: 640px)": {
                      flexDirection: "column",
                      alignItems: "center",
                      textAlign: "center",
                    },
                  })}
                >
                  {/* Profile Picture */}
                  <div
                    className={css({
                      width: "120px",
                      height: "120px",
                      borderRadius: "50%",
                      backgroundColor: theme.colors.backgroundSecondary,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      flexShrink: 0,
                      border: `3px solid ${theme.colors.borderOpaque}`,
                    })}
                  >
                    {profile?.profile_picture_url ? (
                      <img
                        src={profile.profile_picture_url}
                        alt={`Gauge ${veBTCTokenId?.toString() ?? gaugeAddress}`}
                        className={css({
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        })}
                      />
                    ) : (
                      <HeadingMedium color={theme.colors.contentSecondary}>
                        #{veBTCTokenId?.toString() ?? "?"}
                      </HeadingMedium>
                    )}
                  </div>

                  {/* Gauge Info */}
                  <div
                    className={css({
                      flex: 1,
                      minWidth: 0,
                    })}
                  >
                    <div
                      className={css({
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        marginBottom: "8px",
                        flexWrap: "wrap",
                      })}
                    >
                      <HeadingLarge
                        color={
                          profile?.display_name || profile?.description || profile?.profile_picture_url
                            ? theme.colors.positive
                            : theme.colors.negative
                        }
                      >
                        {profile?.display_name || `veBTC #${veBTCTokenId?.toString() ?? "Unknown"}`}
                      </HeadingLarge>
                      {profile?.display_name && (
                        <span
                          className={css({
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "4px 10px",
                            borderRadius: "6px",
                            backgroundColor: "rgba(247, 147, 26, 0.15)",
                            border: "1px solid rgba(247, 147, 26, 0.3)",
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "#F7931A",
                            fontFamily: "monospace",
                            letterSpacing: "0.5px",
                          })}
                        >
                          #{veBTCTokenId?.toString() ?? "?"}
                        </span>
                      )}
                      <Tag color={isAlive ? "green" : "red"} closeable={false}>
                        {isAlive ? "Active" : "Inactive"}
                      </Tag>
                    </div>

                    <div className={css({ marginBottom: "16px" })}>
                      <AddressLink address={gaugeAddress} />
                    </div>

                    {profile?.description ? (
                      <ParagraphLarge
                        color={theme.colors.contentPrimary}
                        overrides={{
                          Block: {
                            style: {
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            },
                          },
                        }}
                      >
                        {profile.description}
                      </ParagraphLarge>
                    ) : (
                      <ParagraphMedium color={theme.colors.contentSecondary}>
                        No description provided
                      </ParagraphMedium>
                    )}
                  </div>
                </div>
              </Card>
            </SpringIn>

            {/* Stats Grid */}
            <div
              className={css({
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: "16px",
                alignItems: "stretch",
                "@media (max-width: 1024px)": {
                  gridTemplateColumns: "repeat(3, 1fr)",
                },
                "@media (max-width: 768px)": {
                  gridTemplateColumns: "repeat(2, 1fr)",
                },
                "@media (max-width: 480px)": {
                  gridTemplateColumns: "1fr",
                  gap: "12px",
                },
              })}
            >
              <SpringIn delay={1} variant="card">
                <Card withBorder overrides={{}}>
                  <div
                    className={css({
                      padding: "8px 0",
                      display: "flex",
                      flexDirection: "column",
                      height: "100%",
                    })}
                  >
                    <LabelSmall color={theme.colors.contentSecondary}>
                      veBTC Weight
                    </LabelSmall>
                    <HeadingMedium>
                      {veBTCVotingPower
                        ? formatUnits(veBTCVotingPower, 18).slice(0, 10)
                        : "-"}
                    </HeadingMedium>
                  </div>
                </Card>
              </SpringIn>

              <SpringIn delay={2} variant="card">
                <Card withBorder overrides={{}}>
                  <div
                    className={css({
                      padding: "8px 0",
                      display: "flex",
                      flexDirection: "column",
                      height: "100%",
                    })}
                  >
                    <LabelSmall color={theme.colors.contentSecondary}>
                      veMEZO Weight
                    </LabelSmall>
                    <HeadingMedium>
                      {formatUnits(totalWeight, 18).slice(0, 10)}
                    </HeadingMedium>
                  </div>
                </Card>
              </SpringIn>

              <SpringIn delay={3} variant="card">
                <Card withBorder overrides={{}}>
                  <div
                    className={css({
                      padding: "8px 0",
                      display: "flex",
                      flexDirection: "column",
                      height: "100%",
                    })}
                  >
                    <LabelSmall color={theme.colors.contentSecondary}>
                      Current Boost
                    </LabelSmall>
                    <HeadingMedium>
                      {formatMultiplier(boostMultiplier)}
                    </HeadingMedium>
                  </div>
                </Card>
              </SpringIn>

              <SpringIn delay={4} variant="card">
                <Card withBorder overrides={{}}>
                  <div
                    className={css({
                      padding: "8px 0",
                      display: "flex",
                      flexDirection: "column",
                      height: "100%",
                    })}
                  >
                    <LabelSmall color={theme.colors.contentSecondary}>
                      Voting APY
                    </LabelSmall>
                    <HeadingMedium
                      color={
                        apy && apy > 0
                          ? theme.colors.positive
                          : theme.colors.contentPrimary
                      }
                    >
                      {isLoadingAPY ? "..." : formatAPY(apy)}
                    </HeadingMedium>
                    {totalIncentivesUSD > 0 && (
                      <LabelSmall color={theme.colors.contentSecondary}>
                        ${totalIncentivesUSD.toFixed(2)}/week
                      </LabelSmall>
                    )}
                  </div>
                </Card>
              </SpringIn>

              <SpringIn delay={5} variant="card">
                <Card withBorder overrides={{}}>
                  <div
                    className={css({
                      padding: "8px 0",
                      display: "flex",
                      flexDirection: "column",
                      height: "100%",
                    })}
                  >
                    <LabelSmall color={theme.colors.contentSecondary}>
                      Manager
                    </LabelSmall>
                    {beneficiary ? (
                      <HeadingMedium>
                        <a
                          href={`${EXPLORER_URL}/address/${beneficiary}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={css({
                            color: theme.colors.accent,
                            textDecoration: "none",
                            ":hover": {
                              textDecoration: "underline",
                            },
                          })}
                        >
                          {beneficiary.slice(0, 6)}...{beneficiary.slice(-4)}
                        </a>
                      </HeadingMedium>
                    ) : (
                      <HeadingMedium color={theme.colors.contentSecondary}>
                        -
                      </HeadingMedium>
                    )}
                  </div>
                </Card>
              </SpringIn>
            </div>

            {/* Incentives */}
            <SpringIn delay={6} variant="card">
              <Card title="Current Epoch Incentives" withBorder overrides={{}}>
                <div className={css({ padding: "16px 0" })}>
                  {isLoadingIncentives ? (
                    <Skeleton width="100%" height="60px" animation />
                  ) : !hasBribe || incentives.length === 0 ? (
                    <ParagraphMedium color={theme.colors.contentSecondary}>
                      No incentives available for this epoch
                    </ParagraphMedium>
                  ) : (
                    <div
                      className={css({
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                        gap: "16px",
                      })}
                    >
                      {incentives.map((incentive) => (
                        <div
                          key={incentive.tokenAddress}
                          className={css({
                            padding: "16px",
                            backgroundColor: theme.colors.backgroundSecondary,
                            borderRadius: "8px",
                          })}
                        >
                          <LabelSmall
                            color={theme.colors.contentSecondary}
                            marginBottom="scale200"
                          >
                            {incentive.symbol}
                          </LabelSmall>
                          <LabelMedium>
                            {formatFixedPoint(
                              incentive.amount,
                              BigInt(incentive.decimals),
                            )}
                          </LabelMedium>
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

