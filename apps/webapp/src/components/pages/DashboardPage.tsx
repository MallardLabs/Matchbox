import { Layout } from "@/components/Layout"
import { SpringIn } from "@/components/SpringIn"
import { useBoostGaugeForToken, useBoostInfo, useGaugeWeight } from "@/hooks/useGauges"
import { useGaugeProfile } from "@/hooks/useGaugeProfiles"
import { useVeBTCLocks, useVeMEZOLocks } from "@/hooks/useLocks"
import {
  type ClaimableBribe,
  useClaimableBribes,
  useClaimBribes,
  useVoteState,
} from "@/hooks/useVoting"
import { useGaugeAPY, formatAPY, useVotingAPY } from "@/hooks/useAPY"
import { useBtcPrice } from "@/hooks/useBtcPrice"
import {
  Button,
  Card,
  HeadingLarge,
  HeadingMedium,
  LabelLarge,
  LabelMedium,
  LabelSmall,
  ParagraphMedium,
  ParagraphSmall,
  Skeleton,
  Tag,
  useStyletron,
} from "@mezo-org/mezo-clay"
import Link from "next/link"
import { useEffect, useMemo } from "react"
import { type Address, formatUnits } from "viem"
import { useAccount } from "wagmi"

// Price constants
const MEZO_PRICE = 0.22
const MEZO_TOKEN_ADDRESS = "0x7b7c000000000000000000000000000000000001".toLowerCase()

// Format token values with appropriate precision based on magnitude
function formatTokenValue(amount: bigint, decimals: number): string {
  const value = Number(formatUnits(amount, decimals))
  if (value === 0) return "0"
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
  if (value >= 0.0001) return value.toLocaleString(undefined, { maximumFractionDigits: 6 })
  // For very small values (like satoshis), show up to 8 decimals
  return value.toLocaleString(undefined, { maximumFractionDigits: 8, minimumSignificantDigits: 1 })
}

// Token icon mapping
const TOKEN_ICONS: Record<string, string> = {
  BTC: "/token icons/Bitcoin.svg",
  WBTC: "/token icons/Bitcoin.svg",
  tBTC: "/token icons/Bitcoin.svg",
  MEZO: "/token icons/Mezo.svg",
}

function TokenIcon({ symbol, size = 16 }: { symbol: string; size?: number }) {
  const iconPath = TOKEN_ICONS[symbol.toUpperCase()]
  if (!iconPath) return null
  
  return (
    <img
      src={iconPath}
      alt={symbol}
      width={size}
      height={size}
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
      }}
    />
  )
}

function VeBTCLockCard({
  lock,
}: { lock: ReturnType<typeof useVeBTCLocks>["locks"][0] }) {
  const [css, theme] = useStyletron()
  const { hasGauge, gaugeAddress } = useBoostGaugeForToken(lock.tokenId)
  const { boostMultiplier } = useBoostInfo(lock.tokenId)
  const { profile } = useGaugeProfile(gaugeAddress)
  const { weight: gaugeWeight } = useGaugeWeight(gaugeAddress)
  const { apy, isLoading: isLoadingAPY } = useGaugeAPY(gaugeAddress, gaugeWeight)

  const unlockDate = new Date(Number(lock.end) * 1000)
  const isExpired = unlockDate < new Date()

  return (
    <Card withBorder overrides={{}}>
      <div className={css({ padding: "8px 0" })}>
        {/* Header with Profile Picture, Name, and Status */}
        <div
          className={css({
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "16px",
          })}
        >
          <div
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "12px",
            })}
          >
            {/* Profile Picture */}
            <div
              className={css({
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                backgroundColor: theme.colors.backgroundSecondary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                flexShrink: 0,
                border: `1px solid ${theme.colors.borderOpaque}`,
              })}
            >
              {profile?.profile_picture_url ? (
                <img
                  src={profile.profile_picture_url}
                  alt={`veBTC #${lock.tokenId.toString()}`}
                  className={css({
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  })}
                />
              ) : (
                <LabelSmall
                  color={theme.colors.contentSecondary}
                  overrides={{
                    Block: {
                      style: { fontSize: "12px" },
                    },
                  }}
                >
                  #{lock.tokenId.toString()}
                </LabelSmall>
              )}
            </div>
            {/* Name and Description */}
            <div
              className={css({
                display: "flex",
                flexDirection: "column",
                gap: "2px",
                minWidth: 0,
              })}
            >
              <div
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  flexWrap: "wrap",
                })}
              >
                <LabelMedium
                  color={
                    profile?.display_name || profile?.description || profile?.profile_picture_url
                      ? theme.colors.positive
                      : theme.colors.negative
                  }
                >
                  {profile?.display_name || `veBTC #${lock.tokenId.toString()}`}
                </LabelMedium>
                {profile?.display_name && (
                  <span
                    className={css({
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      backgroundColor: "rgba(247, 147, 26, 0.15)",
                      border: "1px solid rgba(247, 147, 26, 0.3)",
                      fontSize: "10px",
                      fontWeight: 600,
                      color: "#F7931A",
                      fontFamily: "monospace",
                      letterSpacing: "0.5px",
                    })}
                  >
                    #{lock.tokenId.toString()}
                  </span>
                )}
              </div>
              {profile?.description && (
                <ParagraphSmall
                  color={theme.colors.contentSecondary}
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

        <div
          className={css({
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "16px",
            "@media (max-width: 480px)": {
              gap: "12px",
            },
          })}
        >
          <div>
            <LabelSmall color={theme.colors.contentSecondary}>
              Locked Amount
            </LabelSmall>
            <div
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "6px",
              })}
            >
              <TokenIcon symbol="BTC" size={18} />
              <LabelMedium>
                {formatTokenValue(lock.amount, 18)} BTC
              </LabelMedium>
            </div>
          </div>
          <div>
            <LabelSmall color={theme.colors.contentSecondary}>
              Voting Power
            </LabelSmall>
            <LabelMedium>
              {formatTokenValue(lock.votingPower, 18)}
            </LabelMedium>
          </div>
          <div>
            <LabelSmall color={theme.colors.contentSecondary}>
              Current Boost
            </LabelSmall>
            <LabelMedium
              color={
                boostMultiplier > 1
                  ? theme.colors.positive
                  : theme.colors.contentPrimary
              }
            >
              {boostMultiplier.toFixed(2)}x
            </LabelMedium>
          </div>
          <div>
            <LabelSmall color={theme.colors.contentSecondary}>
              Gauge{" "}
              {hasGauge && !isLoadingAPY && apy !== null && (
                <span className={css({ color: theme.colors.positive })}>
                  ({formatAPY(apy)} APY)
                </span>
              )}
            </LabelSmall>
            {hasGauge && gaugeAddress ? (
              <Link
                href={`/gauges/${gaugeAddress}`}
                className={css({
                  textDecoration: "none",
                  color: theme.colors.accent,
                  ":hover": {
                    textDecoration: "underline",
                  },
                })}
              >
                <LabelMedium color={theme.colors.accent}>
                  View Gauge →
                </LabelMedium>
              </Link>
            ) : (
              <LabelMedium color={theme.colors.contentSecondary}>
                No Gauge
              </LabelMedium>
            )}
          </div>
        </div>

        {!lock.isPermanent && !isExpired && (
          <div
            className={css({
              marginTop: "16px",
              paddingTop: "16px",
              borderTop: `1px solid ${theme.colors.borderOpaque}`,
            })}
          >
            <LabelSmall color={theme.colors.contentSecondary}>
              Unlocks: {unlockDate.toLocaleDateString()}
            </LabelSmall>
          </div>
        )}
      </div>
    </Card>
  )
}

function VeMEZOLockCard({
  lock,
  claimableUSD,
}: {
  lock: ReturnType<typeof useVeMEZOLocks>["locks"][0]
  claimableUSD: number
}) {
  const [css, theme] = useStyletron()
  const { usedWeight, canVoteInCurrentEpoch } = useVoteState(lock.tokenId)
  const { apy } = useVotingAPY(claimableUSD, usedWeight)

  const unlockDate = new Date(Number(lock.end) * 1000)
  const isExpired = unlockDate < new Date()

  return (
    <Card withBorder overrides={{}}>
      <div className={css({ padding: "8px 0" })}>
        <div
          className={css({
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "16px",
          })}
        >
          <div>
            <LabelMedium>veMEZO #{lock.tokenId.toString()}</LabelMedium>
            {apy !== null && apy > 0 && (
              <LabelSmall color={theme.colors.positive}>
                {formatAPY(apy)} APY
              </LabelSmall>
            )}
          </div>
          <Tag
            color={lock.isPermanent ? "green" : isExpired ? "red" : "yellow"}
          >
            {lock.isPermanent ? "Permanent" : isExpired ? "Expired" : "Active"}
          </Tag>
        </div>

        <div
          className={css({
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "16px",
          })}
        >
          <div>
            <LabelSmall color={theme.colors.contentSecondary}>
              Locked Amount
            </LabelSmall>
            <div
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "6px",
              })}
            >
              <TokenIcon symbol="MEZO" size={18} />
              <LabelMedium>
                {formatTokenValue(lock.amount, 18)} MEZO
              </LabelMedium>
            </div>
          </div>
          <div>
            <LabelSmall color={theme.colors.contentSecondary}>
              Voting Power
            </LabelSmall>
            <LabelMedium>
              {formatTokenValue(lock.votingPower, 18)}
            </LabelMedium>
          </div>
          <div>
            <LabelSmall color={theme.colors.contentSecondary}>
              Used Weight
            </LabelSmall>
            <LabelMedium>
              {usedWeight ? formatTokenValue(usedWeight, 18) : "0"}
            </LabelMedium>
          </div>
          <div>
            <LabelSmall color={theme.colors.contentSecondary}>
              Can Vote
            </LabelSmall>
            <LabelMedium
              color={
                canVoteInCurrentEpoch
                  ? theme.colors.positive
                  : theme.colors.warning
              }
            >
              {canVoteInCurrentEpoch ? "Yes" : "Next Epoch"}
            </LabelMedium>
          </div>
        </div>

        {!lock.isPermanent && !isExpired && (
          <div
            className={css({
              marginTop: "16px",
              paddingTop: "16px",
              borderTop: `1px solid ${theme.colors.borderOpaque}`,
            })}
          >
            <LabelSmall color={theme.colors.contentSecondary}>
              Unlocks: {unlockDate.toLocaleDateString()}
            </LabelSmall>
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
}: {
  tokenId: bigint
  bribes: ClaimableBribe[]
  onClaim: () => void
  isPending: boolean
  isConfirming: boolean
  isLast: boolean
}) {
  const [css, theme] = useStyletron()

  // Group rewards by token across all bribes for this tokenId
  const rewardsByToken = useMemo(() => {
    const map = new Map<
      string,
      { symbol: string; decimals: number; amount: bigint }
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
          })
        }
      }
    }
    return Array.from(map.values())
  }, [bribes])

  const hasRewards = rewardsByToken.length > 0

  if (!hasRewards) {
    return null
  }

  return (
    <div
      className={css({
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        padding: "20px 0",
        borderBottom: isLast ? "none" : `1px solid ${theme.colors.borderOpaque}`,
        "@media (max-width: 600px)": {
          flexDirection: "column",
          alignItems: "stretch",
          gap: "16px",
        },
      })}
    >
      {/* Left side: Token ID badge */}
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "12px",
          minWidth: "140px",
        })}
      >
        <div
          className={css({
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            background: theme.colors.backgroundTertiary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `1px solid ${theme.colors.borderOpaque}`,
          })}
        >
          <LabelSmall color={theme.colors.contentSecondary}>
            #{tokenId.toString()}
          </LabelSmall>
        </div>
        <LabelSmall color={theme.colors.contentSecondary}>veMEZO</LabelSmall>
      </div>

      {/* Center: Rewards */}
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "20px",
          flex: 1,
          justifyContent: "center",
          flexWrap: "wrap",
          "@media (max-width: 600px)": {
            justifyContent: "flex-start",
          },
        })}
      >
        {rewardsByToken.map((reward) => (
          <div
            key={reward.symbol}
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "6px",
            })}
          >
            <TokenIcon symbol={reward.symbol} size={20} />
            <LabelLarge
              overrides={{
                Block: {
                  style: {
                    fontVariantNumeric: "tabular-nums",
                  },
                },
              }}
            >
              {formatTokenValue(reward.amount, reward.decimals)}
            </LabelLarge>
            <LabelSmall color={theme.colors.contentSecondary}>
              {reward.symbol}
            </LabelSmall>
          </div>
        ))}
      </div>

      {/* Right side: Claim button */}
      <Button
        onClick={onClaim}
        size="compact"
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
  )
}

export default function DashboardPage() {
  const [css, theme] = useStyletron()
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
    isLoading: isLoadingBribes,
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
        const tokenAmount = Number(reward.earned) / Math.pow(10, reward.decimals)
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
  const { apy: totalAPY } = useVotingAPY(totalClaimableUSD, totalVeMEZOVotingPower)

  const hasClaimableRewards = claimableBribes.length > 0

  return (
    <Layout>
      <div
        className={css({
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        })}
      >
        <div>
          <HeadingLarge marginBottom="scale300">Dashboard</HeadingLarge>
          <ParagraphMedium color={theme.colors.contentSecondary}>
            Track your veBTC and veMEZO positions
          </ParagraphMedium>
        </div>

        {!isConnected ? (
          <SpringIn delay={0} variant="card">
            <Card withBorder overrides={{}}>
              <div
                className={css({
                  padding: "48px",
                  textAlign: "center",
                })}
              >
                <ParagraphMedium color={theme.colors.contentSecondary}>
                  Connect your wallet to view your dashboard
                </ParagraphMedium>
              </div>
            </Card>
          </SpringIn>
        ) : isLoading ? (
          <div
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            })}
          >
            <Skeleton width="100%" height="100px" animation />
            <Skeleton width="100%" height="200px" animation />
            <Skeleton width="100%" height="200px" animation />
          </div>
        ) : (
          <>
            <div
              className={css({
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "16px",
                "@media (max-width: 1024px)": {
                  gridTemplateColumns: "repeat(2, 1fr)",
                },
                "@media (max-width: 480px)": {
                  gridTemplateColumns: "1fr",
                  gap: "12px",
                },
              })}
            >
              <SpringIn delay={0} variant="card">
                <Card withBorder overrides={{}}>
                  <div className={css({ padding: "8px 0" })}>
                    <div
                      className={css({
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginBottom: "4px",
                      })}
                    >
                      <TokenIcon symbol="MEZO" size={14} />
                      <LabelSmall color={theme.colors.contentSecondary}>
                        Your veMEZO Locks
                      </LabelSmall>
                    </div>
                    <HeadingMedium>{veMEZOLocks.length}</HeadingMedium>
                  </div>
                </Card>
              </SpringIn>

              <SpringIn delay={1} variant="card">
                <Card withBorder overrides={{}}>
                  <div className={css({ padding: "8px 0" })}>
                    <div
                      className={css({
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginBottom: "4px",
                      })}
                    >
                      <TokenIcon symbol="MEZO" size={14} />
                      <LabelSmall color={theme.colors.contentSecondary}>
                        Your veMEZO Power
                      </LabelSmall>
                    </div>
                    <HeadingMedium>
                      {formatTokenValue(totalVeMEZOVotingPower, 18)}
                    </HeadingMedium>
                  </div>
                </Card>
              </SpringIn>

              <SpringIn delay={2} variant="card">
                <Card withBorder overrides={{}}>
                  <div className={css({ padding: "8px 0" })}>
                    <div
                      className={css({
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginBottom: "4px",
                      })}
                    >
                      <TokenIcon symbol="BTC" size={14} />
                      <LabelSmall color={theme.colors.contentSecondary}>
                        Your veBTC Locks
                      </LabelSmall>
                    </div>
                    <HeadingMedium>{veBTCLocks.length}</HeadingMedium>
                  </div>
                </Card>
              </SpringIn>

              <SpringIn delay={3} variant="card">
                <Card withBorder overrides={{}}>
                  <div className={css({ padding: "8px 0" })}>
                    <div
                      className={css({
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginBottom: "4px",
                      })}
                    >
                      <TokenIcon symbol="BTC" size={14} />
                      <LabelSmall color={theme.colors.contentSecondary}>
                        Your veBTC Power
                      </LabelSmall>
                    </div>
                    <HeadingMedium>
                      {formatTokenValue(totalVeBTCVotingPower, 18)}
                    </HeadingMedium>
                  </div>
                </Card>
              </SpringIn>
            </div>

            {/* Claimable Rewards Section */}
            {hasClaimableRewards && (
              <SpringIn delay={4} variant="card">
                <div
                  className={css({
                    borderRadius: "16px",
                    overflow: "hidden",
                    border: `1px solid ${theme.colors.borderOpaque}`,
                    background: theme.colors.backgroundPrimary,
                  })}
                >
                  {/* Header with total rewards */}
                  <div
                    className={css({
                      padding: "24px 28px",
                      background: theme.colors.backgroundPrimary,
                      borderBottom: `1px solid ${theme.colors.borderOpaque}`,
                    })}
                  >
                    <div
                      className={css({
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: "24px",
                        "@media (max-width: 600px)": {
                          flexDirection: "column",
                          gap: "20px",
                        },
                      })}
                    >
                      <div>
                        <div
                          className={css({
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            marginBottom: "8px",
                          })}
                        >
                          <LabelSmall
                            color={theme.colors.contentSecondary}
                            overrides={{
                              Block: {
                                style: {
                                  textTransform: "uppercase",
                                  letterSpacing: "0.05em",
                                },
                              },
                            }}
                          >
                            Total Claimable
                          </LabelSmall>
                          {totalAPY !== null && totalAPY > 0 && (
                            <span
                              className={css({
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "2px 8px",
                                borderRadius: "4px",
                                backgroundColor: `${theme.colors.positive}20`,
                                border: `1px solid ${theme.colors.positive}40`,
                                fontSize: "12px",
                                fontWeight: 600,
                                color: theme.colors.positive,
                              })}
                            >
                              {formatAPY(totalAPY)} APY
                            </span>
                          )}
                        </div>
                        <div
                          className={css({
                            display: "flex",
                            alignItems: "baseline",
                            gap: "16px",
                            flexWrap: "wrap",
                          })}
                        >
                          {Array.from(totalClaimable.entries()).map(
                            ([tokenAddr, info]) => (
                              <div
                                key={tokenAddr}
                                className={css({
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                })}
                              >
                                <TokenIcon symbol={info.symbol} size={28} />
                                <HeadingLarge
                                  overrides={{
                                    Block: {
                                      style: {
                                        fontVariantNumeric: "tabular-nums",
                                      },
                                    },
                                  }}
                                >
                                  {formatTokenValue(info.amount, info.decimals)}
                                </HeadingLarge>
                                <LabelMedium color={theme.colors.contentSecondary}>
                                  {info.symbol}
                                </LabelMedium>
                              </div>
                            ),
                          )}
                        </div>
                        {totalClaimableUSD > 0 && (
                          <LabelSmall
                            color={theme.colors.contentSecondary}
                            overrides={{
                              Block: {
                                style: { marginTop: "8px" },
                              },
                            }}
                          >
                            ≈ ${totalClaimableUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </LabelSmall>
                        )}
                      </div>

                      <div
                        className={css({
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "8px 14px",
                          borderRadius: "20px",
                          background: `${theme.colors.positive}15`,
                          border: `1px solid ${theme.colors.positive}30`,
                        })}
                      >
                        <div
                          className={css({
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            backgroundColor: theme.colors.positive,
                            boxShadow: `0 0 8px ${theme.colors.positive}`,
                          })}
                        />
                        <LabelSmall color={theme.colors.positive}>
                          {bribesGroupedByTokenId.size} {bribesGroupedByTokenId.size === 1 ? "position" : "positions"} ready
                        </LabelSmall>
                      </div>
                    </div>
                  </div>

                  {/* Reward rows */}
                  <div className={css({ padding: "4px 28px 8px" })}>
                    {Array.from(bribesGroupedByTokenId.entries()).map(
                      ([tokenIdStr, bribes], index, arr) => (
                        <ClaimableRewardRow
                          key={tokenIdStr}
                          tokenId={BigInt(tokenIdStr)}
                          bribes={bribes}
                          onClaim={() => handleClaimBribes(BigInt(tokenIdStr))}
                          isPending={isClaimPending}
                          isConfirming={isClaimConfirming}
                          isLast={index === arr.length - 1}
                        />
                      ),
                    )}
                  </div>
                </div>
              </SpringIn>
            )}

            <SpringIn delay={hasClaimableRewards ? 5 : 4} variant="card">
              <div>
                <HeadingMedium marginBottom="scale500">
                  Your veMEZO Locks
                </HeadingMedium>
                {veMEZOLocks.length === 0 ? (
                  <Card withBorder overrides={{}}>
                    <div
                      className={css({
                        padding: "32px",
                        textAlign: "center",
                      })}
                    >
                      <ParagraphMedium color={theme.colors.contentSecondary}>
                        No veMEZO locks found
                      </ParagraphMedium>
                    </div>
                  </Card>
                ) : (
                  <div
                    className={css({
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(350px, 1fr))",
                      gap: "16px",
                      "@media (max-width: 480px)": {
                        gridTemplateColumns: "1fr",
                        gap: "12px",
                      },
                    })}
                  >
                    {veMEZOLocks.map((lock, index) => (
                      <SpringIn key={lock.tokenId.toString()} delay={(hasClaimableRewards ? 6 : 5) + index} variant="card">
                        <VeMEZOLockCard 
                          lock={lock} 
                          claimableUSD={claimableUSDByTokenId.get(lock.tokenId.toString()) ?? 0}
                        />
                      </SpringIn>
                    ))}
                  </div>
                )}
              </div>
            </SpringIn>

            <SpringIn delay={(hasClaimableRewards ? 6 : 5) + veMEZOLocks.length} variant="card">
              <div>
                <HeadingMedium marginBottom="scale500">
                  Your veBTC Locks
                </HeadingMedium>
                {veBTCLocks.length === 0 ? (
                  <Card withBorder overrides={{}}>
                    <div
                      className={css({
                        padding: "32px",
                        textAlign: "center",
                      })}
                    >
                      <ParagraphMedium color={theme.colors.contentSecondary}>
                        No veBTC locks found
                      </ParagraphMedium>
                    </div>
                  </Card>
                ) : (
                  <div
                    className={css({
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(350px, 1fr))",
                      gap: "16px",
                      "@media (max-width: 480px)": {
                        gridTemplateColumns: "1fr",
                        gap: "12px",
                      },
                    })}
                  >
                    {veBTCLocks.map((lock, index) => (
                      <SpringIn key={lock.tokenId.toString()} delay={(hasClaimableRewards ? 7 : 6) + veMEZOLocks.length + index} variant="card">
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
