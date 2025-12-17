import { Layout } from "@/components/Layout"
import { SpringIn } from "@/components/SpringIn"
import { TokenSelector } from "@/components/TokenSelector"
import {
  useGaugeProfile,
  useUploadProfilePicture,
  useUpsertGaugeProfile,
} from "@/hooks/useGaugeProfiles"
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
  Input,
  ParagraphMedium,
  ParagraphSmall,
  Select,
  Skeleton,
  Textarea,
} from "@mezo-org/mezo-clay"
import { useCallback, useEffect, useRef, useState } from "react"
import { formatUnits, parseUnits } from "viem"
import { useAccount } from "wagmi"

const EXPLORER_URL =
  process.env.NEXT_PUBLIC_EXPLORER_URL || "https://explorer.test.mezo.org"

export default function IncentivesPage(): JSX.Element {
  const { isConnected, address: walletAddress } = useAccount()
  const { locks: veBTCLocks, isLoading: isLoadingLocks } = useVeBTCLocks()

  const [selectedLockIndex, setSelectedLockIndex] = useState<
    number | undefined
  >()
  const [incentiveToken, setIncentiveToken] = useState<Token | undefined>()
  const [incentiveAmount, setIncentiveAmount] = useState("")

  // Gauge profile state
  const [profileDisplayName, setProfileDisplayName] = useState("")
  const [profileDescription, setProfileDescription] = useState("")
  const [profilePicturePreview, setProfilePicturePreview] = useState<
    string | null
  >(null)
  const [pendingPictureFile, setPendingPictureFile] = useState<File | null>(
    null,
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedLock =
    selectedLockIndex !== undefined ? veBTCLocks[selectedLockIndex] : undefined

  const {
    gaugeAddress,
    hasGauge,
    isLoading: isLoadingGauge,
    refetch: refetchGauge,
  } = useBoostGaugeForToken(selectedLock?.tokenId)
  const { boostMultiplier } = useBoostInfo(selectedLock?.tokenId)

  // Fetch existing gauge profile
  const {
    profile: gaugeProfile,
    isLoading: isLoadingProfile,
    refetch: refetchProfile,
  } = useGaugeProfile(gaugeAddress)

  const { upsertProfile, isLoading: isSavingProfile } = useUpsertGaugeProfile()
  const { uploadPicture, isLoading: isUploadingPicture } =
    useUploadProfilePicture()

  // Sync profile data when loaded
  useEffect(() => {
    if (gaugeProfile) {
      setProfileDisplayName(gaugeProfile.display_name ?? "")
      setProfileDescription(gaugeProfile.description ?? "")
      setProfilePicturePreview(gaugeProfile.profile_picture_url)
      setPendingPictureFile(null)
    } else {
      setProfileDisplayName("")
      setProfileDescription("")
      setProfilePicturePreview(null)
      setPendingPictureFile(null)
    }
  }, [gaugeProfile])

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

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (file) {
        setPendingPictureFile(file)
        const reader = new FileReader()
        reader.onloadend = () => {
          setProfilePicturePreview(reader.result as string)
        }
        reader.readAsDataURL(file)
      }
    },
    [],
  )

  const handleSaveProfile = async () => {
    if (!gaugeAddress || !selectedLock || !walletAddress) return

    let pictureUrl = gaugeProfile?.profile_picture_url ?? null

    // Upload picture if there's a pending file
    if (pendingPictureFile) {
      const uploadedUrl = await uploadPicture(gaugeAddress, pendingPictureFile)
      if (uploadedUrl) {
        pictureUrl = uploadedUrl
      }
    }

    const result = await upsertProfile({
      gaugeAddress,
      veBTCTokenId: selectedLock.tokenId,
      ownerAddress: walletAddress,
      profilePictureUrl: pictureUrl,
      description: profileDescription || null,
      displayName: profileDisplayName || null,
    })

    if (result) {
      setPendingPictureFile(null)
      refetchProfile()
    }
  }

  const isLoading = isLoadingLocks

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Page Header */}
        <header>
          <h1 className="mb-2 text-2xl font-semibold text-[var(--content-primary)]">
            <span className="text-[#F7931A]">$</span> incentives --manage
          </h1>
          <p className="text-sm text-[var(--content-secondary)]">
            Create a boost gauge for your veBTC and add incentives to attract
            veMEZO votes
          </p>
        </header>

        {!isConnected ? (
          <SpringIn delay={0} variant="card">
            <Card withBorder overrides={{}}>
              <div className="p-12 text-center">
                <ParagraphMedium color="var(--content-secondary)">
                  Connect your wallet to manage incentives
                </ParagraphMedium>
              </div>
            </Card>
          </SpringIn>
        ) : isLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton width="100%" height="150px" animation />
            <Skeleton width="100%" height="150px" animation />
          </div>
        ) : veBTCLocks.length === 0 ? (
          <SpringIn delay={0} variant="card">
            <Card withBorder overrides={{}}>
              <div className="p-12 text-center">
                <ParagraphMedium color="var(--content-secondary)">
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
                <div className="py-4">
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
                    <div className="mt-4 rounded-lg bg-[var(--surface-secondary)] p-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
                        <div>
                          <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                            Locked Amount
                          </p>
                          <p className="font-mono text-sm font-medium tabular-nums text-[var(--content-primary)]">
                            {formatUnits(selectedLock.amount, 18).slice(0, 10)}{" "}
                            BTC
                          </p>
                        </div>
                        <div>
                          <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                            Voting Power
                          </p>
                          <p className="font-mono text-sm font-medium tabular-nums text-[var(--content-primary)]">
                            {formatUnits(selectedLock.votingPower, 18).slice(
                              0,
                              10,
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                            Current Boost
                          </p>
                          <p className="font-mono text-sm font-medium tabular-nums text-[var(--content-primary)]">
                            {boostMultiplier.toFixed(2)}x
                          </p>
                        </div>
                        <div>
                          <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                            Gauge
                          </p>
                          {hasGauge && gaugeAddress ? (
                            <a
                              href={`${EXPLORER_URL}/address/${gaugeAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-sm text-[var(--accent)] no-underline hover:underline"
                            >
                              {gaugeAddress.slice(0, 6)}...
                              {gaugeAddress.slice(-4)}
                            </a>
                          ) : (
                            <p className="text-sm text-[var(--content-secondary)]">
                              None
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Current Epoch Incentives */}
                      {hasGauge &&
                        !isLoadingIncentives &&
                        incentives.length > 0 && (
                          <div className="mt-4">
                            <p className="mb-2 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                              Current Epoch Incentives
                            </p>
                            <div className="flex flex-col gap-2">
                              {incentives.map((incentive) => (
                                <div
                                  key={incentive.tokenAddress}
                                  className="flex items-center justify-between"
                                >
                                  <span className="text-sm font-medium text-[var(--content-primary)]">
                                    {incentive.symbol}
                                  </span>
                                  <span className="font-mono text-sm font-medium tabular-nums text-[var(--content-primary)]">
                                    {formatUnits(
                                      incentive.amount,
                                      incentive.decimals,
                                    ).slice(0, 10)}
                                  </span>
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
                    <div className="py-4">
                      <ParagraphMedium
                        color="var(--content-secondary)"
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
                          color="var(--negative)"
                          marginTop="scale300"
                        >
                          Error: {createError.message}
                        </ParagraphSmall>
                      )}
                    </div>
                  </Card>
                </SpringIn>
              ) : (
                <>
                  {/* Gauge Profile Card */}
                  <SpringIn delay={1} variant="card">
                    <Card title="Gauge Profile" withBorder overrides={{}}>
                      <div className="flex flex-col gap-4 py-4">
                        <ParagraphMedium color="var(--content-secondary)">
                          Customize your gauge&apos;s profile to help veMEZO
                          voters identify your gauge.
                        </ParagraphMedium>

                        {isLoadingProfile ? (
                          <Skeleton width="100%" height="200px" animation />
                        ) : (
                          <>
                            {/* Profile Picture */}
                            <div>
                              <p className="mb-2 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                                Profile Picture
                              </p>
                              <div className="flex items-center gap-4">
                                <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--border)] bg-[var(--surface-secondary)]">
                                  {profilePicturePreview ? (
                                    <img
                                      src={profilePicturePreview}
                                      alt="Gauge profile"
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <span className="text-xs text-[var(--content-secondary)]">
                                      No image
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <input
                                    type="file"
                                    ref={fileInputRef}
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                  />
                                  <Button
                                    kind="secondary"
                                    size="small"
                                    onClick={() =>
                                      fileInputRef.current?.click()
                                    }
                                  >
                                    {profilePicturePreview
                                      ? "Change Picture"
                                      : "Upload Picture"}
                                  </Button>
                                  <ParagraphSmall
                                    color="var(--content-secondary)"
                                    marginTop="scale200"
                                  >
                                    Recommended: Square image, at least
                                    200x200px
                                  </ParagraphSmall>
                                </div>
                              </div>
                            </div>

                            {/* Display Name */}
                            <div>
                              <label
                                htmlFor="gauge-display-name"
                                className="mb-1 block text-2xs uppercase tracking-wider text-[var(--content-tertiary)]"
                              >
                                Display Name
                              </label>
                              <Input
                                id="gauge-display-name"
                                value={profileDisplayName}
                                onChange={(e) =>
                                  setProfileDisplayName(e.target.value)
                                }
                                placeholder={`veBTC #${selectedLock?.tokenId?.toString() ?? ""}`}
                              />
                              <ParagraphSmall
                                color="var(--content-secondary)"
                                marginTop="scale100"
                              >
                                Leave empty to use the default name (veBTC #
                                {selectedLock?.tokenId?.toString()})
                              </ParagraphSmall>
                            </div>

                            {/* Description */}
                            <div>
                              <label
                                htmlFor="gauge-description"
                                className="mb-1 block text-2xs uppercase tracking-wider text-[var(--content-tertiary)]"
                              >
                                Description
                              </label>
                              <Textarea
                                id="gauge-description"
                                value={profileDescription}
                                onChange={(e) =>
                                  setProfileDescription(e.target.value)
                                }
                                placeholder="Tell voters about your gauge. What makes it special? What are your goals?"
                                overrides={{
                                  Root: {
                                    style: {
                                      minHeight: "100px",
                                    },
                                  },
                                }}
                              />
                            </div>

                            {/* Save Button */}
                            <Button
                              kind="primary"
                              onClick={handleSaveProfile}
                              isLoading={isSavingProfile || isUploadingPicture}
                              disabled={
                                !profileDisplayName &&
                                !profileDescription &&
                                !pendingPictureFile
                              }
                            >
                              Save Profile
                            </Button>
                          </>
                        )}
                      </div>
                    </Card>
                  </SpringIn>

                  {/* Add Incentives Card */}
                  <SpringIn delay={2} variant="card">
                    <Card title="Add Incentives" withBorder overrides={{}}>
                      <div className="flex flex-col gap-4 py-4">
                        <ParagraphMedium color="var(--content-secondary)">
                          Add token incentives to attract veMEZO holders to vote
                          for your gauge.
                        </ParagraphMedium>

                        <TokenSelector
                          label="Incentive Token"
                          value={incentiveToken}
                          onChange={setIncentiveToken}
                          placeholder="Select a token"
                        />
                        {incentiveToken && isTokenAllowlisted === false && (
                          <ParagraphSmall color="var(--negative)">
                            This token is not allowlisted for incentives. Only
                            allowlisted tokens can be used as bribes.
                          </ParagraphSmall>
                        )}
                        <div>
                          <label
                            htmlFor="incentive-amount"
                            className="mb-1 block text-2xs uppercase tracking-wider text-[var(--content-tertiary)]"
                          >
                            Amount
                            {incentiveToken && ` (${incentiveToken.symbol})`}
                          </label>
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
                            isLoading={
                              isAddingIncentives || isConfirmingIncentives
                            }
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
                            color="var(--negative)"
                            marginTop="scale300"
                          >
                            Error: {addIncentivesError.message}
                          </ParagraphSmall>
                        )}
                      </div>
                    </Card>
                  </SpringIn>
                </>
              ))}
          </>
        )}
      </div>
    </Layout>
  )
}
