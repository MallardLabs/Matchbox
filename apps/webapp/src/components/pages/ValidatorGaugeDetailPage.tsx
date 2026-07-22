import AddValidatorIncentiveModal from "@/components/AddValidatorIncentiveModal"
import { ClickableAddress } from "@/components/ClickableAddress"
import { TokenIcon } from "@/components/TokenIcon"
import ValidatorProfileEditor from "@/components/ValidatorProfileEditor"
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

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-2xs uppercase tracking-wider text-[var(--content-tertiary)]">
        {label}
      </p>
      <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-[var(--content-primary)]">
        {value}
      </p>
    </div>
  )
}

function ExternalLinkIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden="true"
    >
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  )
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
        <Skeleton width="100%" height="300px" animation />
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
          className="mt-4 inline-block text-[#F7931A]"
        >
          Back to validator voting
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
  const earned = gaugeState.earned ?? 0n

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link
          href="/incentives?view=vote"
          className="mb-4 inline-block text-xs text-[var(--content-secondary)] no-underline hover:text-[#F7931A]"
        >
          &larr; All validators
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            {profileState.profile?.profile_picture_url ? (
              <Image
                src={profileState.profile.profile_picture_url}
                alt=""
                width={72}
                height={72}
                unoptimized
                className="size-[72px] rounded-full border border-[var(--border)] object-cover"
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
                  {validator.isAlive ? "Live" : "Inactive"}
                </Tag>
              </div>
              {description && (
                <p className="mt-1 max-w-3xl text-pretty text-sm text-[var(--content-secondary)]">
                  {description}
                </p>
              )}
              {(profileState.profile?.website_url ||
                validator.website ||
                profileState.profile?.social_links) && (
                <nav aria-label="Validator links" className="mt-3">
                  <ul className="flex flex-wrap gap-x-4 gap-y-2">
                    {(profileState.profile?.website_url ||
                      validator.website) && (
                      <li>
                        <a
                          href={
                            profileState.profile?.website_url ||
                            validator.website
                          }
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-[#F7931A]"
                        >
                          Website
                        </a>
                      </li>
                    )}
                    {Object.entries(
                      profileState.profile?.social_links ?? {},
                    ).map(([network, url]) =>
                      url ? (
                        <li key={network}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs capitalize text-[#F7931A]"
                          >
                            {network}
                          </a>
                        </li>
                      ) : null,
                    )}
                  </ul>
                </nav>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {(isOperator || isBeneficiary) && (
              <Button kind="secondary" onClick={() => setEditingProfile(true)}>
                Edit Profile
              </Button>
            )}
            <Button onClick={() => setAddOpen(true)}>Add Incentives</Button>
          </div>
        </div>
      </header>

      {editingProfile && connectedAddress && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
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
        </section>
      )}

      <section
        aria-label="Gauge statistics"
        className="grid gap-3 sm:grid-cols-3"
      >
        <Stat
          label="BTC Weight"
          value={`${formatTokenAmount(weight, 18)} veBTC`}
        />
        <Stat label="Share" value={share} />
        <Stat label="APY" value={formatValidatorApy(apy)} />
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--content-primary)]">
                External bribes
              </h2>
              <p className="mt-1 text-xs text-[var(--content-secondary)]">
                Current and pre-posted validator voter incentives.
              </p>
            </div>
            <p className="font-mono text-sm tabular-nums text-[#F7931A]">
              {currentIncentives.length === 0
                ? "—"
                : incentivePricing.allPriced
                  ? formatMicroUsd(incentivePricing.totalMicroUsd)
                  : "Price unavailable"}
            </p>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--content-tertiary)]">
                Current epoch
              </h3>
              {currentIncentives.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--content-secondary)]">
                  No incentives
                </p>
              ) : (
                <ol className="mt-3 flex flex-col gap-2">
                  {currentIncentives.map((item) => (
                    <li
                      key={item.tokenAddress}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <TokenIcon symbol={item.symbol} size={20} />
                        {item.symbol}
                      </span>
                      <span className="font-mono text-sm tabular-nums">
                        {formatTokenAmount(item.amount, item.decimals)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--content-tertiary)]">
                Next epoch
              </h3>
              {incentivesState.nextEpochIncentives.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--content-secondary)]">
                  No incentives
                </p>
              ) : (
                <ol className="mt-3 flex flex-col gap-2">
                  {incentivesState.nextEpochIncentives.map((item) => (
                    <li
                      key={item.tokenAddress}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <TokenIcon symbol={item.symbol} size={20} />
                        {item.symbol}
                      </span>
                      <span className="font-mono text-sm tabular-nums">
                        {formatTokenAmount(item.amount, item.decimals)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </section>

        <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <summary className="cursor-pointer text-lg font-semibold text-[var(--content-primary)]">
            More info
          </summary>
          <p className="mt-1 text-pretty text-xs text-[var(--content-secondary)]">
            Contract addresses and ownership.
          </p>
          <dl className="mt-4 flex flex-col gap-3">
            {[
              ["Gauge", gaugeAddress],
              ["Bribe", validator.bribe],
              ["PoA operator", validator.operator],
              ["Rewards beneficiary", beneficiary],
            ].map(([label, value]) =>
              value ? (
                <div key={label}>
                  <dt className="text-2xs uppercase tracking-wide text-[var(--content-tertiary)]">
                    {label}
                  </dt>
                  <dd className="mt-1">
                    <ClickableAddress address={value as Address} />
                  </dd>
                </div>
              ) : null,
            )}
          </dl>
        </details>
      </div>

      <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <summary className="cursor-pointer text-lg font-semibold text-[var(--content-primary)]">
          PoA registry metadata
        </summary>
        <div className="mt-4">
          <Tag color="gray" closeable={false}>
            Immutable on Matchbox
          </Tag>
        </div>
        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          {[
            ["Moniker", validator.moniker],
            ["Identity", validator.identity],
            ["Consensus public key", validator.consensusPublicKey],
            ["Security contact", validator.securityContact],
          ].map(([label, value]) => (
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

      {(profileState.profile?.incentive_strategy ||
        profileState.profile?.voting_strategy ||
        profileState.profile?.tags?.length) && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold text-[var(--content-primary)]">
            Profile strategy
          </h2>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            {profileState.profile.incentive_strategy && (
              <div>
                <h3 className="text-xs uppercase tracking-wide text-[var(--content-tertiary)]">
                  Incentive strategy
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-pretty text-sm">
                  {profileState.profile.incentive_strategy}
                </p>
              </div>
            )}
            {profileState.profile.voting_strategy && (
              <div>
                <h3 className="text-xs uppercase tracking-wide text-[var(--content-tertiary)]">
                  Voting strategy
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-pretty text-sm">
                  {profileState.profile.voting_strategy}
                </p>
              </div>
            )}
          </div>
          {profileState.profile.tags?.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {profileState.profile.tags.map((tag) => (
                <Tag key={tag} color="blue" closeable={false}>
                  {tag}
                </Tag>
              ))}
            </div>
          ) : null}
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold text-[var(--content-primary)]">
            Unclaimed MEZO rewards
          </h2>
          <p className="mt-4 font-mono text-2xl font-semibold tabular-nums text-[#F7931A]">
            {formatTokenAmount(earned, 18)} MEZO
          </p>
          {isBeneficiary && (
            <div className="mt-4">
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
            </div>
          )}
          {claim.error && (
            <p className="mt-3 text-pretty text-xs text-[var(--negative)]">
              {claim.error.message}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold text-[var(--content-primary)]">
            Distribution history
          </h2>
          {rewardHistory.items.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--content-secondary)]">
              No indexed reward distributions.
            </p>
          ) : (
            <ol className="mt-4 flex flex-col divide-y divide-[var(--border)]">
              {rewardHistory.items.map((item) => (
                <li
                  key={item.id}
                  className="relative flex items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-sm">
                      {new Date(item.timestamp * 1000).toLocaleDateString()}
                    </p>
                    <p className="font-mono text-xs text-[var(--content-secondary)]">
                      {item.amount
                        ? formatTokenAmount(BigInt(item.amount), 18)
                        : "—"}{" "}
                      MEZO
                    </p>
                  </div>
                  {item.explorerUrl && (
                    <a
                      href={item.explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open reward distribution in explorer"
                      className="absolute inset-0 flex items-center justify-end text-[#F7931A]"
                    >
                      <span className="sr-only">
                        Open reward distribution in explorer
                      </span>
                      <ExternalLinkIcon />
                    </a>
                  )}
                </li>
              ))}
            </ol>
          )}
          {rewardHistory.hasNextPage && (
            <div className="mt-3">
              <Button
                kind="secondary"
                onClick={() => void rewardHistory.fetchNextPage()}
                disabled={rewardHistory.isFetchingNextPage}
              >
                {rewardHistory.isFetchingNextPage ? "Loading..." : "Load More"}
              </Button>
            </div>
          )}
        </div>
      </section>

      {isBeneficiary && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold text-[var(--content-primary)]">
            Rewards beneficiary
          </h2>
          <p className="mt-1 text-pretty text-sm text-[var(--content-secondary)]">
            Only the current rewards beneficiary can assign the next
            beneficiary. Profile and claim permissions update from the live
            gauge value after confirmation.
          </p>
          <div className="mt-4 flex max-w-2xl flex-col gap-2 sm:flex-row">
            <Input
              aria-label="New rewards beneficiary"
              value={beneficiaryInput}
              onChange={(event) => setBeneficiaryInput(event.target.value)}
              placeholder="0x..."
            />
            <Button
              onClick={() =>
                walletOnSelectedNetwork
                  ? setSwitchConfirmOpen(true)
                  : switchNetwork()
              }
              disabled={walletOnSelectedNetwork && !validNextBeneficiary}
            >
              {walletOnSelectedNetwork
                ? "Switch Beneficiary"
                : "Switch Network"}
            </Button>
          </div>
          {beneficiaryInput && !validNextBeneficiary && (
            <p className="mt-2 text-xs text-[var(--negative)]">
              Enter a valid, nonzero address different from the current
              beneficiary.
            </p>
          )}
          {beneficiarySwitch.error && (
            <p className="mt-2 text-pretty text-xs text-[var(--negative)]">
              {beneficiarySwitch.error.message}
            </p>
          )}
        </section>
      )}

      <AddValidatorIncentiveModal
        gauge={gaugeAddress}
        weight={weight}
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={incentivesState.refetch}
      />

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
            {earned > 0n && (
              <p className="rounded-lg border border-[var(--warning)] p-3 text-pretty text-xs text-[var(--warning)]">
                {formatTokenAmount(earned, 18)} MEZO remains claimable. It stays
                associated with the previous beneficiary and must be claimed
                separately.
              </p>
            )}
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
