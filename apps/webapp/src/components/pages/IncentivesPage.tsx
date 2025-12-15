import { Layout } from "@/components/Layout"
import { SpringIn } from "@/components/SpringIn"
import { TokenSelector } from "@/components/TokenSelector"
import { useBoostGaugeForToken, useBoostInfo } from "@/hooks/useGauges"
import { useVeBTCLocks } from "@/hooks/useLocks"
import type { Token } from "@/hooks/useTokenList"
import {
  useAddIncentives,
  useApproveToken,
  useBoostVoterAddress,
  useBribeAddress,
  useBribeIncentives,
  useCreateBoostGauge,
  useIsAllowlistedToken,
  useTokenAllowance,
} from "@/hooks/useVoting"
import {
  Button,
  Card,
  HeadingLarge,
  Input,
  LabelMedium,
  LabelSmall,
  ParagraphMedium,
  ParagraphSmall,
  Select,
  Skeleton,
  useStyletron,
} from "@mezo-org/mezo-clay"
import { useEffect, useState } from "react"
import { formatUnits, parseUnits } from "viem"
import { useAccount } from "wagmi"

const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL || "https://explorer.test.mezo.org"

export default function IncentivesPage() {
  const [css, theme] = useStyletron()
  const { isConnected } = useAccount()
  const { locks: veBTCLocks, isLoading: isLoadingLocks } = useVeBTCLocks()

  const [selectedLockIndex, setSelectedLockIndex] = useState<
    number | undefined
  >()
  const [incentiveToken, setIncentiveToken] = useState<Token | undefined>()
  const [incentiveAmount, setIncentiveAmount] = useState("")

  const selectedLock =
    selectedLockIndex !== undefined ? veBTCLocks[selectedLockIndex] : undefined

  const {
    gaugeAddress,
    hasGauge,
    isLoading: isLoadingGauge,
    refetch: refetchGauge,
  } = useBoostGaugeForToken(selectedLock?.tokenId)
  const { boostMultiplier } = useBoostInfo(selectedLock?.tokenId)

  const {
    createGauge,
    isPending: isCreating,
    isConfirming: isConfirmingCreate,
    isSuccess: isCreateSuccess,
    error: createError,
  } = useCreateBoostGauge()
  const {
    addIncentives,
    isPending: isAddingIncentives,
    isConfirming: isConfirmingIncentives,
    isSuccess: isAddIncentivesSuccess,
    error: addIncentivesError,
  } = useAddIncentives()

  // Get bribe address and incentives for the gauge
  const { bribeAddress } = useBribeAddress(gaugeAddress)
  const {
    incentives,
    isLoading: isLoadingIncentives,
    refetch: refetchIncentives,
  } = useBribeIncentives(bribeAddress)

  // Get boostVoter address for approval (addBribes transfers tokens via boostVoter)
  const boostVoterAddress = useBoostVoterAddress()

  // Check if the selected token is allowlisted for bribes
  const { isAllowlisted: isTokenAllowlisted } = useIsAllowlistedToken(
    incentiveToken?.address,
  )

  // Check token allowance for boostVoter contract
  const parsedAmount = incentiveToken
    ? parseUnits(incentiveAmount || "0", incentiveToken.decimals)
    : 0n

  const { allowance, refetch: refetchAllowance } = useTokenAllowance(
    incentiveToken?.address,
    boostVoterAddress,
  )

  const needsApproval =
    allowance !== undefined && boostVoterAddress && parsedAmount > allowance

  const {
    approve,
    isPending: isApproving,
    isConfirming: isConfirmingApproval,
    isSuccess: isApprovalSuccess,
    reset: resetApproval,
  } = useApproveToken()

  useEffect(() => {
    if (isCreateSuccess) {
      refetchGauge()
    }
  }, [isCreateSuccess, refetchGauge])

  useEffect(() => {
    if (isApprovalSuccess) {
      refetchAllowance().then(() => {
        setTimeout(() => {
          resetApproval()
        }, 100)
      })
    }
  }, [isApprovalSuccess, refetchAllowance, resetApproval])

  useEffect(() => {
    if (isAddIncentivesSuccess) {
      refetchIncentives()
      setIncentiveAmount("")
    }
  }, [isAddIncentivesSuccess, refetchIncentives])

  const handleCreateGauge = () => {
    if (!selectedLock) return
    createGauge(selectedLock.tokenId)
  }

  const handleApprove = () => {
    if (!incentiveToken || !boostVoterAddress) return
    approve(incentiveToken.address, boostVoterAddress)
  }

  const handleAddIncentives = () => {
    if (!gaugeAddress || !incentiveToken || !incentiveAmount) return

    const amount = parseUnits(incentiveAmount, incentiveToken.decimals)
    addIncentives(gaugeAddress, [incentiveToken.address], [amount])
  }

  const isLoading = isLoadingLocks

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
          <HeadingLarge marginBottom="scale300">Manage Incentives</HeadingLarge>
          <ParagraphMedium color={theme.colors.contentSecondary}>
            Create a boost gauge for your veBTC and add incentives to attract
            veMEZO votes
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
                  Connect your wallet to manage incentives
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
            <Skeleton width="100%" height="150px" animation />
            <Skeleton width="100%" height="150px" animation />
          </div>
        ) : veBTCLocks.length === 0 ? (
          <SpringIn delay={0} variant="card">
            <Card withBorder overrides={{}}>
              <div
                className={css({
                  padding: "48px",
                  textAlign: "center",
                })}
              >
                <ParagraphMedium color={theme.colors.contentSecondary}>
                  You don&apos;t have any veBTC locks. Lock BTC to get veBTC and
                  create a boost gauge.
                </ParagraphMedium>
              </div>
            </Card>
          </SpringIn>
        ) : (
          <>
            <SpringIn delay={0} variant="card">
              <Card title="Select veBTC Lock" withBorder overrides={{}}>
              <div className={css({ padding: "16px 0" })}>
                <Select
                  options={veBTCLocks.map((lock, i) => ({
                    label: `veBTC #${lock.tokenId.toString()} - ${formatUnits(lock.amount, 18).slice(0, 8)} BTC locked`,
                    id: i.toString(),
                  }))}
                  value={
                    selectedLockIndex !== undefined
                      ? [{ id: selectedLockIndex.toString() }]
                      : []
                  }
                  onChange={(params) => {
                    const selected = params.value[0]
                    setSelectedLockIndex(
                      selected ? Number(selected.id) : undefined,
                    )
                  }}
                  placeholder="Select your veBTC lock"
                />

                {selectedLock && (
                  <div
                    className={css({
                      marginTop: "16px",
                      padding: "16px",
                      backgroundColor: theme.colors.backgroundSecondary,
                      borderRadius: "8px",
                    })}
                  >
                    <div
                      className={css({
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: "16px",
                      })}
                    >
                      <div>
                        <LabelSmall color={theme.colors.contentSecondary}>
                          Locked Amount
                        </LabelSmall>
                        <LabelMedium>
                          {formatUnits(selectedLock.amount, 18).slice(0, 10)}{" "}
                          BTC
                        </LabelMedium>
                      </div>
                      <div>
                        <LabelSmall color={theme.colors.contentSecondary}>
                          Voting Power
                        </LabelSmall>
                        <LabelMedium>
                          {formatUnits(selectedLock.votingPower, 18).slice(
                            0,
                            10,
                          )}
                        </LabelMedium>
                      </div>
                      <div>
                        <LabelSmall color={theme.colors.contentSecondary}>
                          Current Boost
                        </LabelSmall>
                        <LabelMedium>{boostMultiplier.toFixed(2)}x</LabelMedium>
                      </div>
                      <div>
                        <LabelSmall color={theme.colors.contentSecondary}>
                          Gauge
                        </LabelSmall>
                        {hasGauge && gaugeAddress ? (
                          <a
                            href={`${EXPLORER_URL}/address/${gaugeAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={css({
                              fontFamily: "monospace",
                              fontSize: "14px",
                              color: theme.colors.accent,
                              textDecoration: "none",
                              ":hover": {
                                textDecoration: "underline",
                              },
                            })}
                          >
                            {gaugeAddress.slice(0, 6)}...
                            {gaugeAddress.slice(-4)}
                          </a>
                        ) : (
                          <LabelMedium color={theme.colors.contentSecondary}>
                            None
                          </LabelMedium>
                        )}
                      </div>
                    </div>

                    {/* Current Epoch Incentives */}
                    {hasGauge &&
                      !isLoadingIncentives &&
                      incentives.length > 0 && (
                        <div className={css({ marginTop: "16px" })}>
                          <LabelSmall
                            color={theme.colors.contentSecondary}
                            marginBottom="scale200"
                          >
                            Current Epoch Incentives
                          </LabelSmall>
                          <div
                            className={css({
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                            })}
                          >
                            {incentives.map((incentive) => (
                              <div
                                key={incentive.tokenAddress}
                                className={css({
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                })}
                              >
                                <LabelMedium>{incentive.symbol}</LabelMedium>
                                <LabelMedium>
                                  {formatUnits(
                                    incentive.amount,
                                    incentive.decimals,
                                  ).slice(0, 10)}
                                </LabelMedium>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </div>
            </Card>
            </SpringIn>

            {selectedLock &&
              (!hasGauge && !isLoadingGauge ? (
                <SpringIn delay={1} variant="card">
                  <Card title="Create Boost Gauge" withBorder overrides={{}}>
                  <div
                    className={css({
                      padding: "16px 0",
                    })}
                  >
                    <ParagraphMedium
                      color={theme.colors.contentSecondary}
                      marginBottom="scale500"
                    >
                      Create a boost gauge for this veBTC lock to start
                      receiving veMEZO votes and boost your voting power.
                    </ParagraphMedium>
                    <Button
                      kind="primary"
                      onClick={handleCreateGauge}
                      isLoading={isCreating || isConfirmingCreate}
                    >
                      Create Boost Gauge
                    </Button>
                    {createError && (
                      <ParagraphSmall
                        color={theme.colors.negative}
                        marginTop="scale300"
                      >
                        Error: {createError.message}
                      </ParagraphSmall>
                    )}
                  </div>
                </Card>
                </SpringIn>
              ) : (
                <SpringIn delay={1} variant="card">
                  <Card title="Add Incentives" withBorder overrides={{}}>
                  <div
                    className={css({
                      padding: "16px 0",
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                    })}
                  >
                    <ParagraphMedium color={theme.colors.contentSecondary}>
                      Add token incentives to attract veMEZO holders to vote for
                      your gauge.
                    </ParagraphMedium>

                    <TokenSelector
                      label="Incentive Token"
                      value={incentiveToken}
                      onChange={setIncentiveToken}
                      placeholder="Select a token"
                    />
                    {incentiveToken && isTokenAllowlisted === false && (
                      <ParagraphSmall color={theme.colors.negative}>
                        This token is not allowlisted for incentives. Only
                        allowlisted tokens can be used as bribes.
                      </ParagraphSmall>
                    )}
                    <div>
                      <LabelSmall
                        color={theme.colors.contentSecondary}
                        marginBottom="scale100"
                        as="label"
                        htmlFor="incentive-amount"
                      >
                        Amount
                        {incentiveToken && ` (${incentiveToken.symbol})`}
                      </LabelSmall>
                      <Input
                        id="incentive-amount"
                        value={incentiveAmount}
                        onChange={(e) => setIncentiveAmount(e.target.value)}
                        placeholder="0.0"
                        type="number"
                      />
                    </div>
                    {needsApproval ? (
                      <Button
                        kind="primary"
                        onClick={handleApprove}
                        isLoading={isApproving || isConfirmingApproval}
                        disabled={
                          !incentiveToken ||
                          !incentiveAmount ||
                          !boostVoterAddress ||
                          isTokenAllowlisted === false
                        }
                      >
                        Approve {incentiveToken?.symbol}
                      </Button>
                    ) : (
                      <Button
                        kind="primary"
                        onClick={handleAddIncentives}
                        isLoading={isAddingIncentives || isConfirmingIncentives}
                        disabled={
                          !incentiveToken ||
                          !incentiveAmount ||
                          parsedAmount === 0n ||
                          isTokenAllowlisted === false
                        }
                      >
                        Add Incentives
                      </Button>
                    )}
                    {addIncentivesError && (
                      <ParagraphSmall
                        color={theme.colors.negative}
                        marginTop="scale300"
                      >
                        Error: {addIncentivesError.message}
                      </ParagraphSmall>
                    )}
                  </div>
                </Card>
                </SpringIn>
              ))}
          </>
        )}
      </div>
    </Layout>
  )
}
