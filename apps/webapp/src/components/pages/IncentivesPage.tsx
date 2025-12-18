import { Layout } from "@/components/Layout"
import { SpringIn } from "@/components/SpringIn"
import { TokenIcon } from "@/components/TokenIcon"
import { TokenSelector } from "@/components/TokenSelector"
import type { SocialLinks } from "@/config/supabase"
import { formatAPY, useGaugeAPY } from "@/hooks/useAPY"
import { useBtcPrice } from "@/hooks/useBtcPrice"
import {
  useGaugeProfile,
  useUploadProfilePicture,
  useUpsertGaugeProfile,
} from "@/hooks/useGaugeProfiles"
import { useBoostGaugeForToken, useBoostInfo } from "@/hooks/useGauges"
import { useVeBTCLocks } from "@/hooks/useLocks"
import type { Token } from "@/hooks/useTokenList"
import {
  type BribeIncentive,
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
  Tag,
  Textarea,
} from "@mezo-org/mezo-clay"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { formatUnits, parseUnits } from "viem"
import { useAccount } from "wagmi"

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

function ExternalLinkIcon({ size = 14 }: { size?: number }) {
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

// Manage page tabs
type ManageTab = "profile" | "incentives" | "analytics"

export default function IncentivesPage(): JSX.Element {
  const { isConnected, address: walletAddress } = useAccount()
  const { locks: veBTCLocks, isLoading: isLoadingLocks } = useVeBTCLocks()

  const [selectedLockIndex, setSelectedLockIndex] = useState<
    number | undefined
  >()
  const [activeTab, setActiveTab] = useState<ManageTab>("profile")

  // Incentive form state
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
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [twitterUrl, setTwitterUrl] = useState("")
  const [discordUrl, setDiscordUrl] = useState("")
  const [telegramUrl, setTelegramUrl] = useState("")
  const [githubUrl, setGithubUrl] = useState("")
  const [incentiveStrategy, setIncentiveStrategy] = useState("")
  const [votingStrategy, setVotingStrategy] = useState("")
  const [selectedTags, setSelectedTags] = useState<string[]>([])

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
      setWebsiteUrl(gaugeProfile.website_url ?? "")
      setTwitterUrl(gaugeProfile.social_links?.twitter ?? "")
      setDiscordUrl(gaugeProfile.social_links?.discord ?? "")
      setTelegramUrl(gaugeProfile.social_links?.telegram ?? "")
      setGithubUrl(gaugeProfile.social_links?.github ?? "")
      setIncentiveStrategy(gaugeProfile.incentive_strategy ?? "")
      setVotingStrategy(gaugeProfile.voting_strategy ?? "")
      setSelectedTags(gaugeProfile.tags ?? [])
    } else {
      setProfileDisplayName("")
      setProfileDescription("")
      setProfilePicturePreview(null)
      setPendingPictureFile(null)
      setWebsiteUrl("")
      setTwitterUrl("")
      setDiscordUrl("")
      setTelegramUrl("")
      setGithubUrl("")
      setIncentiveStrategy("")
      setVotingStrategy("")
      setSelectedTags([])
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
  const { price: btcPrice } = useBtcPrice()
  const incentivesWithUSD: IncentiveWithUSD[] = useMemo(
    () =>
      incentives.map((incentive) => ({
        ...incentive,
        usdValue: getIncentiveUsdValue(incentive, btcPrice),
      })),
    [btcPrice, incentives],
  )

  // Calculate total incentives USD
  const totalIncentivesUSD = useMemo(
    () => incentivesWithUSD.reduce((sum, inc) => sum + (inc.usdValue ?? 0), 0),
    [incentivesWithUSD],
  )

  // Get APY data for the gauge
  const { apy } = useGaugeAPY(
    gaugeAddress,
    0n, // We don't need totalWeight for just showing the APY
  )

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

    const socialLinks: SocialLinks = {}
    if (twitterUrl) socialLinks.twitter = twitterUrl
    if (discordUrl) socialLinks.discord = discordUrl
    if (telegramUrl) socialLinks.telegram = telegramUrl
    if (githubUrl) socialLinks.github = githubUrl

    const result = await upsertProfile({
      gaugeAddress,
      veBTCTokenId: selectedLock.tokenId,
      ownerAddress: walletAddress,
      profilePictureUrl: pictureUrl,
      description: profileDescription || null,
      displayName: profileDisplayName || null,
      websiteUrl: websiteUrl || null,
      socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : null,
      incentiveStrategy: incentiveStrategy || null,
      votingStrategy: votingStrategy || null,
      tags: selectedTags.length > 0 ? selectedTags : null,
    })

    if (result) {
      setPendingPictureFile(null)
      refetchProfile()
    }
  }

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  const availableTags = [
    "DeFi",
    "NFT",
    "Gaming",
    "Infrastructure",
    "DAO",
    "Yield",
    "Staking",
    "Bridge",
    "DEX",
    "Lending",
  ]

  const isLoading = isLoadingLocks

  // Check if profile has unsaved changes
  const hasProfileChanges = useMemo(() => {
    if (!gaugeProfile) {
      return (
        profileDisplayName ||
        profileDescription ||
        pendingPictureFile ||
        websiteUrl ||
        twitterUrl ||
        discordUrl ||
        telegramUrl ||
        githubUrl ||
        incentiveStrategy ||
        votingStrategy ||
        selectedTags.length > 0
      )
    }
    return (
      profileDisplayName !== (gaugeProfile.display_name ?? "") ||
      profileDescription !== (gaugeProfile.description ?? "") ||
      pendingPictureFile !== null ||
      websiteUrl !== (gaugeProfile.website_url ?? "") ||
      twitterUrl !== (gaugeProfile.social_links?.twitter ?? "") ||
      discordUrl !== (gaugeProfile.social_links?.discord ?? "") ||
      telegramUrl !== (gaugeProfile.social_links?.telegram ?? "") ||
      githubUrl !== (gaugeProfile.social_links?.github ?? "") ||
      incentiveStrategy !== (gaugeProfile.incentive_strategy ?? "") ||
      votingStrategy !== (gaugeProfile.voting_strategy ?? "") ||
      JSON.stringify(selectedTags) !== JSON.stringify(gaugeProfile.tags ?? [])
    )
  }, [
    gaugeProfile,
    profileDisplayName,
    profileDescription,
    pendingPictureFile,
    websiteUrl,
    twitterUrl,
    discordUrl,
    telegramUrl,
    githubUrl,
    incentiveStrategy,
    votingStrategy,
    selectedTags,
  ])

  return (
    <Layout>
      <div className="flex flex-col gap-6">
        {/* Page Header */}
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="mb-1 text-2xl font-semibold text-[var(--content-primary)]">
              <span className="text-[#F7931A]">$</span> gauge --manage
            </h1>
            <p className="text-sm text-[var(--content-secondary)]">
              Manage your gauge profile, social links, and incentive strategy
            </p>
          </div>
          {gaugeAddress && (
            <Link href={`/gauges/${gaugeAddress}`}>
              <Button kind="secondary" size="small">
                <span className="flex items-center gap-1.5">
                  View Public Page
                  <ExternalLinkIcon size={14} />
                </span>
              </Button>
            </Link>
          )}
        </header>

        {!isConnected ? (
          <SpringIn delay={0} variant="card">
            <Card withBorder overrides={{}}>
              <div className="p-12 text-center">
                <ParagraphMedium color="var(--content-secondary)">
                  Connect your wallet to manage your gauge
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
                  create a gauge.
                </ParagraphMedium>
              </div>
            </Card>
          </SpringIn>
        ) : (
          <>
            {/* veBTC Lock Selector */}
            <SpringIn delay={0} variant="card">
              <Card withBorder overrides={{}}>
                <div className="py-4">
                  <div className="mb-4 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-[#F7931A]" />
                    <span className="text-xs font-medium uppercase tracking-wider text-[var(--content-tertiary)]">
                      Select Gauge
                    </span>
                  </div>
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
                    placeholder="Select your veBTC lock to manage"
                  />

                  {selectedLock && (
                    <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-[var(--surface-secondary)] p-4 sm:grid-cols-4">
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
                          Gauge Status
                        </p>
                        {hasGauge ? (
                          <Tag color="green" closeable={false}>
                            Active
                          </Tag>
                        ) : (
                          <Tag color="yellow" closeable={false}>
                            Not Created
                          </Tag>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </SpringIn>

            {selectedLock &&
              (!hasGauge && !isLoadingGauge ? (
                <SpringIn delay={1} variant="card">
                  <Card withBorder overrides={{}}>
                    <div className="py-8 text-center">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(247,147,26,0.1)]">
                        <span className="text-2xl">🔥</span>
                      </div>
                      <h3 className="mb-2 text-lg font-semibold text-[var(--content-primary)]">
                        Create Your Gauge
                      </h3>
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
                  {/* Tab Navigation */}
                  <SpringIn delay={1} variant="card">
                    <div className="flex gap-1 rounded-lg bg-[var(--surface-secondary)] p-1">
                      {(
                        [
                          { id: "profile", label: "Profile & Links" },
                          { id: "incentives", label: "Incentives" },
                          { id: "analytics", label: "Analytics" },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveTab(tab.id)}
                          className={`flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-all ${
                            activeTab === tab.id
                              ? "bg-[var(--surface)] text-[var(--content-primary)] shadow-sm"
                              : "text-[var(--content-secondary)] hover:text-[var(--content-primary)]"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </SpringIn>

                  {/* Profile Tab */}
                  {activeTab === "profile" && (
                    <SpringIn delay={2} variant="card">
                      <Card withBorder overrides={{}}>
                        <div className="flex flex-col gap-6 py-4">
                          {/* Basic Info Section */}
                          <div>
                            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--content-primary)]">
                              <span className="flex h-6 w-6 items-center justify-center rounded bg-[rgba(247,147,26,0.15)] text-xs text-[#F7931A]">
                                1
                              </span>
                              Basic Information
                            </h3>

                            {isLoadingProfile ? (
                              <Skeleton width="100%" height="200px" animation />
                            ) : (
                              <div className="grid gap-4 md:grid-cols-2">
                                {/* Profile Picture */}
                                <div className="md:col-span-2">
                                  <p className="mb-2 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                                    Profile Picture
                                  </p>
                                  <div className="flex items-center gap-4">
                                    <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--border)] bg-[var(--surface-secondary)]">
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
                                        Square image, at least 200x200px
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
                                </div>

                                {/* Website */}
                                <div>
                                  <label
                                    htmlFor="gauge-website"
                                    className="mb-1 block text-2xs uppercase tracking-wider text-[var(--content-tertiary)]"
                                  >
                                    Website URL
                                  </label>
                                  <Input
                                    id="gauge-website"
                                    value={websiteUrl}
                                    onChange={(e) =>
                                      setWebsiteUrl(e.target.value)
                                    }
                                    placeholder="https://yourproject.com"
                                  />
                                </div>

                                {/* Description */}
                                <div className="md:col-span-2">
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
                                    placeholder="Tell voters about your gauge. What makes it special?"
                                    overrides={{
                                      Root: {
                                        style: {
                                          minHeight: "80px",
                                        },
                                      },
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Social Links Section */}
                          <div>
                            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--content-primary)]">
                              <span className="flex h-6 w-6 items-center justify-center rounded bg-[rgba(247,147,26,0.15)] text-xs text-[#F7931A]">
                                2
                              </span>
                              Social Links
                            </h3>

                            <div className="grid gap-4 sm:grid-cols-2">
                              <div>
                                <label className="mb-1 flex items-center gap-2 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                                  <TwitterIcon size={14} />
                                  Twitter / X
                                </label>
                                <Input
                                  value={twitterUrl}
                                  onChange={(e) =>
                                    setTwitterUrl(e.target.value)
                                  }
                                  placeholder="https://twitter.com/yourproject"
                                />
                              </div>

                              <div>
                                <label className="mb-1 flex items-center gap-2 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                                  <DiscordIcon size={14} />
                                  Discord
                                </label>
                                <Input
                                  value={discordUrl}
                                  onChange={(e) =>
                                    setDiscordUrl(e.target.value)
                                  }
                                  placeholder="https://discord.gg/invite"
                                />
                              </div>

                              <div>
                                <label className="mb-1 flex items-center gap-2 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                                  <TelegramIcon size={14} />
                                  Telegram
                                </label>
                                <Input
                                  value={telegramUrl}
                                  onChange={(e) =>
                                    setTelegramUrl(e.target.value)
                                  }
                                  placeholder="https://t.me/yourproject"
                                />
                              </div>

                              <div>
                                <label className="mb-1 flex items-center gap-2 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                                  <GithubIcon size={14} />
                                  GitHub
                                </label>
                                <Input
                                  value={githubUrl}
                                  onChange={(e) => setGithubUrl(e.target.value)}
                                  placeholder="https://github.com/yourproject"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Strategy Section */}
                          <div>
                            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--content-primary)]">
                              <span className="flex h-6 w-6 items-center justify-center rounded bg-[rgba(247,147,26,0.15)] text-xs text-[#F7931A]">
                                3
                              </span>
                              Strategy & Goals
                            </h3>

                            <div className="grid gap-4">
                              <div>
                                <label
                                  htmlFor="incentive-strategy"
                                  className="mb-1 block text-2xs uppercase tracking-wider text-[var(--content-tertiary)]"
                                >
                                  Incentive Strategy
                                </label>
                                <Textarea
                                  id="incentive-strategy"
                                  value={incentiveStrategy}
                                  onChange={(e) =>
                                    setIncentiveStrategy(e.target.value)
                                  }
                                  placeholder="Describe how you plan to incentivize voters. What rewards do you offer? How often? What's your target APY?"
                                  overrides={{
                                    Root: { style: { minHeight: "100px" } },
                                  }}
                                />
                              </div>

                              <div>
                                <label
                                  htmlFor="voting-strategy"
                                  className="mb-1 block text-2xs uppercase tracking-wider text-[var(--content-tertiary)]"
                                >
                                  Voting Strategy & Goals
                                </label>
                                <Textarea
                                  id="voting-strategy"
                                  value={votingStrategy}
                                  onChange={(e) =>
                                    setVotingStrategy(e.target.value)
                                  }
                                  placeholder="Explain your voting goals. What boost level are you targeting? How will you use the boosted voting power?"
                                  overrides={{
                                    Root: { style: { minHeight: "100px" } },
                                  }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Tags Section */}
                          <div>
                            <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--content-primary)]">
                              <span className="flex h-6 w-6 items-center justify-center rounded bg-[rgba(247,147,26,0.15)] text-xs text-[#F7931A]">
                                4
                              </span>
                              Tags
                            </h3>

                            <p className="mb-3 text-xs text-[var(--content-secondary)]">
                              Select tags that describe your project
                            </p>

                            <div className="flex flex-wrap gap-2">
                              {availableTags.map((tag) => (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => toggleTag(tag)}
                                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                                    selectedTags.includes(tag)
                                      ? "border-[#F7931A] bg-[rgba(247,147,26,0.15)] text-[#F7931A]"
                                      : "border-[var(--border)] text-[var(--content-secondary)] hover:border-[var(--content-tertiary)]"
                                  }`}
                                >
                                  {tag}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Save Button */}
                          <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
                            <div>
                              {hasProfileChanges && (
                                <span className="text-xs text-[var(--warning)]">
                                  You have unsaved changes
                                </span>
                              )}
                            </div>
                            <Button
                              kind="primary"
                              onClick={handleSaveProfile}
                              isLoading={isSavingProfile || isUploadingPicture}
                              disabled={!hasProfileChanges}
                            >
                              Save Profile
                            </Button>
                          </div>
                        </div>
                      </Card>
                    </SpringIn>
                  )}

                  {/* Incentives Tab */}
                  {activeTab === "incentives" && (
                    <>
                      {/* Current Incentives Overview */}
                      <SpringIn delay={2} variant="card">
                        <Card
                          title="Current Epoch Incentives"
                          withBorder
                          overrides={{}}
                        >
                          <div className="py-4">
                            {isLoadingIncentives ? (
                              <Skeleton width="100%" height="100px" animation />
                            ) : incentives.length === 0 ? (
                              <div className="rounded-lg bg-[var(--surface-secondary)] p-6 text-center">
                                <p className="mb-2 text-sm text-[var(--content-secondary)]">
                                  No incentives added for this epoch yet
                                </p>
                                <p className="text-xs text-[var(--content-tertiary)]">
                                  Add incentives below to attract veMEZO voters
                                </p>
                              </div>
                            ) : (
                              <>
                                <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                                  <div className="rounded-lg bg-[var(--surface-secondary)] p-4">
                                    <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                                      Total Value
                                    </p>
                                    <p className="font-mono text-lg font-semibold text-[var(--content-primary)]">
                                      ${totalIncentivesUSD.toFixed(2)}
                                    </p>
                                  </div>
                                  <div className="rounded-lg bg-[var(--surface-secondary)] p-4">
                                    <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                                      Tokens
                                    </p>
                                    <p className="font-mono text-lg font-semibold text-[var(--content-primary)]">
                                      {incentives.length}
                                    </p>
                                  </div>
                                  <div className="rounded-lg bg-[var(--surface-secondary)] p-4">
                                    <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                                      Est. APY
                                    </p>
                                    <p
                                      className={`font-mono text-lg font-semibold ${
                                        apy && apy > 0
                                          ? "text-[var(--positive)]"
                                          : "text-[var(--content-primary)]"
                                      }`}
                                    >
                                      {formatAPY(apy)}
                                    </p>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  {incentivesWithUSD.map((incentive) => (
                                    <div
                                      key={incentive.tokenAddress}
                                      className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3"
                                    >
                                      <div className="flex items-center gap-3">
                                        <TokenIcon
                                          symbol={incentive.symbol}
                                          size={28}
                                        />
                                        <div>
                                          <p className="text-sm font-medium text-[var(--content-primary)]">
                                            {incentive.symbol}
                                          </p>
                                          <p className="text-2xs text-[var(--content-secondary)]">
                                            {formatUsdValue(incentive.usdValue)}
                                          </p>
                                        </div>
                                      </div>
                                      <p className="font-mono text-sm font-medium tabular-nums text-[var(--content-primary)]">
                                        {formatUnits(
                                          incentive.amount,
                                          incentive.decimals,
                                        ).slice(0, 12)}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        </Card>
                      </SpringIn>

                      {/* Add Incentives Form */}
                      <SpringIn delay={3} variant="card">
                        <Card title="Add Incentives" withBorder overrides={{}}>
                          <div className="flex flex-col gap-4 py-4">
                            <p className="text-sm text-[var(--content-secondary)]">
                              Add token incentives to attract veMEZO holders to
                              vote for your gauge.
                            </p>

                            <TokenSelector
                              label="Incentive Token"
                              value={incentiveToken}
                              onChange={setIncentiveToken}
                              placeholder="Select a token"
                            />
                            {incentiveToken && isTokenAllowlisted === false && (
                              <div className="rounded-lg border border-[var(--negative)] bg-[rgba(239,68,68,0.1)] p-3">
                                <ParagraphSmall color="var(--negative)">
                                  This token is not allowlisted for incentives.
                                  Only allowlisted tokens can be used as bribes.
                                </ParagraphSmall>
                              </div>
                            )}
                            <div>
                              <label
                                htmlFor="incentive-amount"
                                className="mb-1 block text-2xs uppercase tracking-wider text-[var(--content-tertiary)]"
                              >
                                Amount
                                {incentiveToken &&
                                  ` (${incentiveToken.symbol})`}
                              </label>
                              <Input
                                id="incentive-amount"
                                value={incentiveAmount}
                                onChange={(e) =>
                                  setIncentiveAmount(e.target.value)
                                }
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
                  )}

                  {/* Analytics Tab */}
                  {activeTab === "analytics" && (
                    <SpringIn delay={2} variant="card">
                      <Card title="Gauge Analytics" withBorder overrides={{}}>
                        <div className="py-8 text-center">
                          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-secondary)]">
                            <span className="text-2xl">📊</span>
                          </div>
                          <h3 className="mb-2 text-lg font-semibold text-[var(--content-primary)]">
                            Historical Analytics Coming Soon
                          </h3>
                          <p className="mx-auto max-w-md text-sm text-[var(--content-secondary)]">
                            Track your gauge&apos;s performance over time,
                            including vote trends, boost history, and incentive
                            efficiency.
                          </p>
                          <div className="mx-auto mt-6 grid max-w-lg grid-cols-3 gap-4">
                            <div className="rounded-lg bg-[var(--surface-secondary)] p-4">
                              <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                                Current Boost
                              </p>
                              <p className="font-mono text-xl font-semibold text-[var(--content-primary)]">
                                {boostMultiplier.toFixed(2)}x
                              </p>
                            </div>
                            <div className="rounded-lg bg-[var(--surface-secondary)] p-4">
                              <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                                Incentives
                              </p>
                              <p className="font-mono text-xl font-semibold text-[var(--content-primary)]">
                                ${totalIncentivesUSD.toFixed(0)}
                              </p>
                            </div>
                            <div className="rounded-lg bg-[var(--surface-secondary)] p-4">
                              <p className="mb-1 text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
                                APY
                              </p>
                              <p
                                className={`font-mono text-xl font-semibold ${
                                  apy && apy > 0
                                    ? "text-[var(--positive)]"
                                    : "text-[var(--content-primary)]"
                                }`}
                              >
                                {formatAPY(apy)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </Card>
                    </SpringIn>
                  )}
                </>
              ))}
          </>
        )}
      </div>
    </Layout>
  )
}
