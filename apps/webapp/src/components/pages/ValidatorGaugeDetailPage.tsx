import AddValidatorIncentiveModal from "@/components/AddValidatorIncentiveModal"
import { ClickableAddress } from "@/components/ClickableAddress"
import { TokenIcon } from "@/components/TokenIcon"
import ValidatorProfileEditor from "@/components/ValidatorProfileEditor"
import WatchGaugeButton from "@/components/WatchGaugeButton"
import { useNetwork } from "@/contexts/NetworkContext"
import { useBtcPrice } from "@/hooks/useBtcPrice"
import { useMezoPrice } from "@/hooks/useMezoPrice"
import { usePoolBribeIncentives } from "@/hooks/usePoolIncentives"
import {
  useClaimValidatorRewards,
  useSwitchValidatorBeneficiary,
  useValidatorGaugeState,
  useValidatorRewardHistory,
} from "@/hooks/useValidatorGauge"
import { useValidatorProfile } from "@/hooks/useValidatorProfiles"
import { useValidatorByGauge } from "@/hooks/useValidators"
import { cn } from "@/utils/cn"
import {
  calculateValidatorApyBasisPoints,
  formatMicroUsd,
  formatValidatorApy,
  tokenUsdMicroValue,
} from "@/utils/validatorApy"
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalHeader,
  Skeleton,
  Tag,
} from "@mezo-org/mezo-clay"
import { getTokenUsdPrice } from "@repo/shared"
import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  type Address,
  formatUnits,
  getAddress,
  isAddress,
  zeroAddress,
} from "viem"
import { useAccount } from "wagmi"

type Props = { address: string }

type IncentiveRow = {
  tokenAddress: string
  symbol: string
  decimals: number
  amount: bigint
}

const DESCRIPTION_CLAMP_CHARS = 160

function sameAddress(
  left: string | undefined,
  right: string | undefined,
): boolean {
  return !!left && !!right && left.toLowerCase() === right.toLowerCase()
}

function formatTokenAmount(value: bigint, decimals: number): string {
  const [whole = "0", fraction = ""] = formatUnits(value, decimals).split(".")
  const trimmed = fraction.slice(0, 6).replace(/0+$/, "")
  return trimmed ? `${whole}.${trimmed}` : whole
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}): JSX.Element {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-mono text-xl font-semibold tabular-nums",
          accent ? "text-[#F7931A]" : "text-[var(--content-primary)]",
        )}
      >
        {value}
      </p>
    </div>
  )
}

function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}): JSX.Element {
  return (
    <section
      className={cn(
        "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-[var(--content-primary)]">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-pretty text-xs text-[var(--content-secondary)]">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function ExternalLinkIcon({ size = 16 }: { size?: number }): JSX.Element {
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
      className="shrink-0"
      aria-hidden="true"
    >
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  )
}

function TwitterIcon({ size = 16 }: { size?: number }): JSX.Element {
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

function DiscordIcon({ size = 16 }: { size?: number }): JSX.Element {
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

function TelegramIcon({ size = 16 }: { size?: number }): JSX.Element {
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

function GithubIcon({ size = 16 }: { size?: number }): JSX.Element {
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

function GlobeIcon({ size = 16 }: { size?: number }): JSX.Element {
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

function LinkIcon({ size = 16 }: { size?: number }): JSX.Element {
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
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function SocialLinkChip({
  href,
  icon,
  label,
}: {
  href: string
  icon: React.ReactNode
  label: string
}): JSX.Element {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--content-secondary)] no-underline transition-colors hover:border-[var(--content-tertiary)] hover:text-[var(--content-primary)]"
      title={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      <ExternalLinkIcon size={11} />
    </a>
  )
}

function IncentiveList({ items }: { items: IncentiveRow[] }): JSX.Element {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] px-3 py-5 text-center">
        <p className="text-sm text-[var(--content-secondary)]">No incentives</p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
      {items.map((item) => (
        <li
          key={item.tokenAddress}
          className="flex items-center justify-between gap-3 px-3 py-2.5"
        >
          <span className="flex min-w-0 items-center gap-2 text-sm text-[var(--content-primary)]">
            <TokenIcon symbol={item.symbol} size={20} />
            <span className="truncate">{item.symbol}</span>
          </span>
          <span className="shrink-0 font-mono text-sm tabular-nums text-[var(--content-primary)]">
            {formatTokenAmount(item.amount, item.decimals)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function socialIconForNetwork(network: string): React.ReactNode {
  switch (network) {
    case "twitter":
      return <TwitterIcon />
    case "discord":
      return <DiscordIcon />
    case "telegram":
      return <TelegramIcon />
    case "github":
      return <GithubIcon />
    default:
      return <LinkIcon />
  }
}

function socialLabelForNetwork(network: string): string {
  switch (network) {
    case "twitter":
      return "Twitter / X"
    case "discord":
      return "Discord"
    case "telegram":
      return "Telegram"
    case "github":
      return "GitHub"
    case "medium":
      return "Medium"
    case "other":
      return "Link"
    default:
      return network.charAt(0).toUpperCase() + network.slice(1)
  }
}

export default function ValidatorGaugeDetailPage({
  address,
}: Props): JSX.Element {
  const gaugeAddress = isAddress(address) ? getAddress(address) : undefined
  const { chainId, switchNetwork } = useNetwork()
  const { address: connectedAddress, chainId: walletChainId } = useAccount()
  const validatorState = useValidatorByGauge(gaugeAddress)
  const validator = validatorState.validator
  const profileState = useValidatorProfile(gaugeAddress)
  const [editingProfile, setEditingProfile] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [beneficiaryInput, setBeneficiaryInput] = useState("")
  const [switchConfirmOpen, setSwitchConfirmOpen] = useState(false)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)

  const registryBeneficiary = validator?.beneficiary
  const gaugeState = useValidatorGaugeState(gaugeAddress)
  const beneficiary = gaugeState.beneficiary ?? registryBeneficiary
  const isOperator = sameAddress(connectedAddress, validator?.operator)
  const isBeneficiary = sameAddress(connectedAddress, beneficiary)
  const rewardHistory = useValidatorRewardHistory(gaugeAddress, true)
  const claim = useClaimValidatorRewards()
  const beneficiarySwitch = useSwitchValidatorBeneficiary(gaugeAddress)
  const incentivesState = usePoolBribeIncentives(validator?.bribe)
  const { price: btcPrice } = useBtcPrice()
  const { price: mezoPrice } = useMezoPrice()

  useEffect(() => {
    if (claim.isSuccess) {
      void gaugeState.refetch().finally(claim.reset)
    }
  }, [claim.isSuccess, claim.reset, gaugeState.refetch])

  useEffect(() => {
    if (!beneficiarySwitch.isSuccess) return
    setBeneficiaryInput("")
    setSwitchConfirmOpen(false)
    setEditingProfile(false)
    void Promise.all([gaugeState.refetch(), validatorState.refetch()]).finally(
      beneficiarySwitch.reset,
    )
  }, [
    beneficiarySwitch.isSuccess,
    beneficiarySwitch.reset,
    gaugeState.refetch,
    validatorState.refetch,
  ])

  const currentIncentives = useMemo(
    () => incentivesState.incentives.filter((item) => item.amount > 0n),
    [incentivesState.incentives],
  )
  const nextIncentives = useMemo(
    () =>
      incentivesState.nextEpochIncentives.filter((item) => item.amount > 0n),
    [incentivesState.nextEpochIncentives],
  )
  const incentivePricing = useMemo(() => {
    let totalMicroUsd = 0n
    let allPriced = true
    for (const item of currentIncentives) {
      const price = getTokenUsdPrice(
        item.tokenAddress,
        item.symbol,
        btcPrice,
        mezoPrice,
      )
      if (price === null) {
        allPriced = false
        continue
      }
      totalMicroUsd += tokenUsdMicroValue(
        item.amount,
        item.decimals,
        String(price),
      )
    }
    return { totalMicroUsd, allPriced }
  }, [btcPrice, currentIncentives, mezoPrice])
  const weight = BigInt(validator?.weight ?? "0")
  const apy =
    currentIncentives.length > 0 && weight === 0n
      ? -1n
      : incentivePricing.allPriced && btcPrice !== null
        ? calculateValidatorApyBasisPoints(
            incentivePricing.totalMicroUsd,
            weight,
            String(btcPrice),
          )
        : null
  const shareBasisPoints =
    validatorState.totalWeight > 0n
      ? (weight * 10_000n) / validatorState.totalWeight
      : 0n
  const share = `${shareBasisPoints / 100n}.${(shareBasisPoints % 100n)
    .toString()
    .padStart(2, "0")}%`
  const nextBeneficiary = isAddress(beneficiaryInput)
    ? getAddress(beneficiaryInput)
    : undefined
  const validNextBeneficiary =
    !!nextBeneficiary &&
    nextBeneficiary !== zeroAddress &&
    !sameAddress(nextBeneficiary, beneficiary)
  const walletOnSelectedNetwork = walletChainId === chainId

  if (validatorState.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton width="100%" height="120px" animation />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton width="100%" height="88px" animation />
          <Skeleton width="100%" height="88px" animation />
          <Skeleton width="100%" height="88px" animation />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton width="100%" height="280px" animation />
          <Skeleton width="100%" height="280px" animation />
          <Skeleton width="100%" height="280px" animation />
        </div>
      </div>
    )
  }

  if (!gaugeAddress || !validator) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
        <p className="text-sm text-[var(--content-secondary)]">
          Validator gauge not found on the selected network.
        </p>
        <Link
          href="/incentives?view=vote"
          className="mt-4 inline-block text-sm text-[#F7931A] no-underline"
        >
          &larr; Back to validator voting
        </Link>
      </div>
    )
  }

  const displayName =
    profileState.profile?.display_name ||
    validator.moniker ||
    validator.operator
  const description =
    profileState.profile?.description || validator.details || null
  const descriptionIsLong =
    !!description && description.length > DESCRIPTION_CLAMP_CHARS
  const shownDescription =
    description && descriptionIsLong && !descriptionExpanded
      ? `${description.slice(0, DESCRIPTION_CLAMP_CHARS).trimEnd()}…`
      : description
  const earned = gaugeState.earned ?? 0n
  const websiteUrl = profileState.profile?.website_url || validator.website
  const socialLinks = profileState.profile?.social_links ?? {}
  const hasSocialLinks =
    !!websiteUrl || Object.values(socialLinks).some((url) => !!url)
  const hasAboutContent = !!(
    profileState.profile?.incentive_strategy ||
    profileState.profile?.voting_strategy ||
    profileState.profile?.tags?.length
  )
  const bribeTotalLabel =
    currentIncentives.length === 0
      ? "—"
      : incentivePricing.allPriced
        ? formatMicroUsd(incentivePricing.totalMicroUsd)
        : "Price unavailable"
  const apyAccent = apy !== null && apy !== 0n

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link
          href="/incentives?view=vote"
          className="mb-4 inline-flex items-center gap-1 text-xs text-[var(--content-secondary)] no-underline transition-colors hover:text-[#F7931A]"
        >
          &larr; All validators
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            {profileState.profile?.profile_picture_url ? (
              <Image
                src={profileState.profile.profile_picture_url}
                alt=""
                width={72}
                height={72}
                unoptimized
                className="size-[72px] shrink-0 rounded-full border border-[var(--border)] object-cover"
              />
            ) : (
              <div className="grid size-[72px] shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-xl font-semibold text-[#F7931A]">
                {displayName.slice(0, 2).toUpperCase()}
              </div>
            )}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold text-[var(--content-primary)]">
                  {displayName}
                </h1>
                <Tag
                  color={validator.isAlive ? "green" : "red"}
                  closeable={false}
                >
                  {validator.isAlive ? "Active" : "Inactive"}
                </Tag>
              </div>

              <div className="mt-1.5">
                <ClickableAddress address={gaugeAddress} />
              </div>

              {shownDescription ? (
                <div className="mt-2 max-w-3xl">
                  <p className="text-pretty text-sm text-[var(--content-secondary)]">
                    {shownDescription}
                  </p>
                  {descriptionIsLong ? (
                    <button
                      type="button"
                      onClick={() => setDescriptionExpanded((open) => !open)}
                      className="mt-1 text-xs font-medium text-[#F7931A]"
                    >
                      {descriptionExpanded ? "Show less" : "Show more"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {hasSocialLinks ? (
                <nav aria-label="Validator links" className="mt-3">
                  <ul className="flex flex-wrap gap-2">
                    {websiteUrl ? (
                      <li>
                        <SocialLinkChip
                          href={websiteUrl}
                          icon={<GlobeIcon />}
                          label="Website"
                        />
                      </li>
                    ) : null}
                    {Object.entries(socialLinks).map(([network, url]) =>
                      url ? (
                        <li key={network}>
                          <SocialLinkChip
                            href={url}
                            icon={socialIconForNetwork(network)}
                            label={socialLabelForNetwork(network)}
                          />
                        </li>
                      ) : null,
                    )}
                  </ul>
                </nav>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <WatchGaugeButton gaugeAddress={gaugeAddress} />
            {(isOperator || isBeneficiary) && (
              <Button kind="secondary" onClick={() => setEditingProfile(true)}>
                Edit Profile
              </Button>
            )}
            <Button onClick={() => setAddOpen(true)}>Add Incentives</Button>
          </div>
        </div>
      </header>

      <section
        aria-label="Gauge statistics"
        className="grid gap-3 sm:grid-cols-3"
      >
        <Stat
          label="BTC Weight"
          value={`${formatTokenAmount(weight, 18)} veBTC`}
        />
        <Stat label="Share" value={share} />
        <Stat label="APY" value={formatValidatorApy(apy)} accent={apyAccent} />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <SectionCard
            title="External bribes"
            description="Current and pre-posted validator voter incentives."
            action={
              <p className="font-mono text-sm tabular-nums text-[#F7931A]">
                {bribeTotalLabel}
              </p>
            }
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--content-tertiary)]">
                  Current epoch
                </h3>
                <IncentiveList items={currentIncentives} />
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--content-tertiary)]">
                  Next epoch
                </h3>
                <IncentiveList items={nextIncentives} />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Distribution history"
            description="Indexed MEZO reward distributions for this gauge."
          >
            {rewardHistory.items.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--border)] px-3 py-6 text-center">
                <p className="text-sm text-[var(--content-secondary)]">
                  No indexed reward distributions.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
                {rewardHistory.items.map((item) => (
                  <li key={item.id}>
                    {item.explorerUrl ? (
                      <a
                        href={item.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-3 px-3 py-3 text-inherit no-underline transition-colors hover:bg-[var(--surface-secondary)]"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-[var(--content-primary)]">
                            {new Date(
                              item.timestamp * 1000,
                            ).toLocaleDateString()}
                          </p>
                          <p className="font-mono text-xs text-[var(--content-secondary)]">
                            {item.amount
                              ? formatTokenAmount(BigInt(item.amount), 18)
                              : "—"}{" "}
                            MEZO
                          </p>
                        </div>
                        <span className="text-[#F7931A]">
                          <span className="sr-only">
                            Open reward distribution in explorer
                          </span>
                          <ExternalLinkIcon />
                        </span>
                      </a>
                    ) : (
                      <div className="flex items-center justify-between gap-3 px-3 py-3">
                        <div className="min-w-0">
                          <p className="text-sm text-[var(--content-primary)]">
                            {new Date(
                              item.timestamp * 1000,
                            ).toLocaleDateString()}
                          </p>
                          <p className="font-mono text-xs text-[var(--content-secondary)]">
                            {item.amount
                              ? formatTokenAmount(BigInt(item.amount), 18)
                              : "—"}{" "}
                            MEZO
                          </p>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {rewardHistory.hasNextPage ? (
              <div className="mt-3">
                <Button
                  kind="secondary"
                  onClick={() => void rewardHistory.fetchNextPage()}
                  disabled={rewardHistory.isFetchingNextPage}
                >
                  {rewardHistory.isFetchingNextPage
                    ? "Loading..."
                    : "Load More"}
                </Button>
              </div>
            ) : null}
          </SectionCard>
        </div>

        <aside className="flex flex-col gap-4">
          {hasAboutContent ? (
            <SectionCard
              title="About"
              description="Operator-published strategy for this gauge."
            >
              <div className="flex flex-col gap-4">
                {profileState.profile?.incentive_strategy ? (
                  <div>
                    <h3 className="text-xs uppercase tracking-wide text-[var(--content-tertiary)]">
                      Incentive strategy
                    </h3>
                    <p className="mt-1.5 whitespace-pre-wrap text-pretty text-sm text-[var(--content-secondary)]">
                      {profileState.profile.incentive_strategy}
                    </p>
                  </div>
                ) : null}
                {profileState.profile?.voting_strategy ? (
                  <div>
                    <h3 className="text-xs uppercase tracking-wide text-[var(--content-tertiary)]">
                      Voting strategy
                    </h3>
                    <p className="mt-1.5 whitespace-pre-wrap text-pretty text-sm text-[var(--content-secondary)]">
                      {profileState.profile.voting_strategy}
                    </p>
                  </div>
                ) : null}
                {profileState.profile?.tags?.length ? (
                  <ul className="flex flex-wrap gap-2">
                    {profileState.profile.tags.map((tag) => (
                      <li key={tag}>
                        <Tag color="blue" closeable={false}>
                          {tag}
                        </Tag>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </SectionCard>
          ) : null}

          <SectionCard
            title="Addresses"
            description="Contract addresses and ownership."
          >
            <dl className="flex flex-col gap-3">
              {(
                [
                  ["Gauge", gaugeAddress],
                  ["Bribe", validator.bribe],
                  ["PoA operator", validator.operator],
                  ["Rewards beneficiary", beneficiary],
                ] as const
              ).map(([label, value]) =>
                value ? (
                  <div
                    key={label}
                    className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2"
                  >
                    <dt className="text-2xs uppercase tracking-wide text-[var(--content-tertiary)]">
                      {label}
                    </dt>
                    <dd className="min-w-0">
                      <ClickableAddress address={value as Address} />
                    </dd>
                  </div>
                ) : null,
              )}
            </dl>
          </SectionCard>

          <SectionCard
            title="Rewards"
            description={
              isBeneficiary
                ? "Claim MEZO and manage the rewards beneficiary."
                : "Unclaimed MEZO currently held by this gauge."
            }
          >
            <p className="font-mono text-2xl font-semibold tabular-nums text-[#F7931A]">
              {formatTokenAmount(earned, 18)} MEZO
            </p>

            {isBeneficiary ? (
              <div className="mt-4 flex flex-col gap-4">
                <Button
                  onClick={() => claim.claim(gaugeAddress)}
                  disabled={
                    earned === 0n || claim.isPending || claim.isConfirming
                  }
                >
                  {claim.isPending || claim.isConfirming
                    ? "Claiming..."
                    : "Claim Rewards"}
                </Button>
                {claim.error ? (
                  <p className="text-pretty text-xs text-[var(--negative)]">
                    {claim.error.message}
                  </p>
                ) : null}

                <div className="border-t border-[var(--border)] pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--content-tertiary)]">
                    Switch beneficiary
                  </h3>
                  <p className="mt-1 text-pretty text-xs text-[var(--content-secondary)]">
                    Only the current rewards beneficiary can assign the next
                    one. Profile and claim permissions update after
                    confirmation.
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    <Input
                      aria-label="New rewards beneficiary"
                      value={beneficiaryInput}
                      onChange={(event) =>
                        setBeneficiaryInput(event.target.value)
                      }
                      placeholder="0x..."
                    />
                    <Button
                      kind="secondary"
                      onClick={() =>
                        walletOnSelectedNetwork
                          ? setSwitchConfirmOpen(true)
                          : switchNetwork()
                      }
                      disabled={
                        walletOnSelectedNetwork && !validNextBeneficiary
                      }
                    >
                      {walletOnSelectedNetwork
                        ? "Switch Beneficiary"
                        : "Switch Network"}
                    </Button>
                  </div>
                  {beneficiaryInput && !validNextBeneficiary ? (
                    <p className="mt-2 text-xs text-[var(--negative)]">
                      Enter a valid, nonzero address different from the current
                      beneficiary.
                    </p>
                  ) : null}
                  {beneficiarySwitch.error ? (
                    <p className="mt-2 text-pretty text-xs text-[var(--negative)]">
                      {beneficiarySwitch.error.message}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </SectionCard>
        </aside>
      </div>

      <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--content-primary)]">
          PoA registry metadata
        </summary>
        <p className="mt-1 text-xs text-[var(--content-secondary)]">
          Immutable on-chain registration data for this validator.
        </p>
        <div className="mt-3">
          <Tag color="gray" closeable={false}>
            Immutable on Matchbox
          </Tag>
        </div>
        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          {(
            [
              ["Moniker", validator.moniker],
              ["Identity", validator.identity],
              ["Consensus public key", validator.consensusPublicKey],
              ["Security contact", validator.securityContact],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-2xs uppercase tracking-wide text-[var(--content-tertiary)]">
                {label}
              </dt>
              <dd className="mt-1 break-all font-mono text-xs text-[var(--content-secondary)]">
                {value || "—"}
              </dd>
            </div>
          ))}
          <div className="md:col-span-2">
            <dt className="text-2xs uppercase tracking-wide text-[var(--content-tertiary)]">
              Registry details
            </dt>
            <dd className="mt-1 whitespace-pre-wrap text-pretty text-sm text-[var(--content-secondary)]">
              {validator.details || "—"}
            </dd>
          </div>
        </dl>
      </details>

      <AddValidatorIncentiveModal
        gauge={gaugeAddress}
        weight={weight}
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={incentivesState.refetch}
      />

      <Modal
        isOpen={editingProfile && !!connectedAddress}
        onClose={() => setEditingProfile(false)}
        size="default"
        overrides={{ Dialog: { style: { maxWidth: "720px" } } }}
      >
        <ModalHeader>Edit validator profile</ModalHeader>
        <ModalBody>
          {connectedAddress ? (
            <ValidatorProfileEditor
              gaugeAddress={gaugeAddress}
              operatorAddress={validator.operator}
              editorAddress={connectedAddress}
              profile={profileState.profile}
              onCancel={() => setEditingProfile(false)}
              onSaved={() => {
                setEditingProfile(false)
                void profileState.refetch()
              }}
            />
          ) : null}
        </ModalBody>
      </Modal>

      <Modal
        isOpen={switchConfirmOpen}
        onClose={() => setSwitchConfirmOpen(false)}
        size="default"
        overrides={{ Dialog: { style: { maxWidth: "520px" } } }}
      >
        <ModalHeader>Confirm beneficiary switch</ModalHeader>
        <ModalBody>
          <div className="flex flex-col gap-4">
            <p className="text-pretty text-sm text-[var(--content-secondary)]">
              The new beneficiary will receive claim and profile-edit
              permissions as soon as the transaction confirms.
            </p>
            {earned > 0n ? (
              <p className="rounded-lg border border-[var(--warning)] p-3 text-pretty text-xs text-[var(--warning)]">
                {formatTokenAmount(earned, 18)} MEZO remains claimable. It stays
                associated with the previous beneficiary and must be claimed
                separately.
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                kind="secondary"
                onClick={() => setSwitchConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (nextBeneficiary)
                    beneficiarySwitch.switchBeneficiary(nextBeneficiary)
                }}
                disabled={
                  !validNextBeneficiary ||
                  beneficiarySwitch.isPending ||
                  beneficiarySwitch.isConfirming
                }
              >
                {beneficiarySwitch.isPending || beneficiarySwitch.isConfirming
                  ? "Switching..."
                  : "Confirm Switch"}
              </Button>
            </div>
          </div>
        </ModalBody>
      </Modal>
    </div>
  )
}
