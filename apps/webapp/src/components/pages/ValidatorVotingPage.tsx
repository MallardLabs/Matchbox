import { LockCarouselSelector } from "@/components/LockCarouselSelector"
import PaginationControls from "@/components/PaginationControls"
import ValidatorGaugeVotingCard from "@/components/ValidatorGaugeVotingCard"
import { getContractConfig } from "@/config/contracts"
import { useNetwork } from "@/contexts/NetworkContext"
import { useVeBTCLocks } from "@/hooks/useLocks"
import useMultiValidatorVoting from "@/hooks/useMultiValidatorVoting"
import { usePagination } from "@/hooks/usePagination"
import { useValidatorMetrics } from "@/hooks/useValidatorMetrics"
import { useValidatorProfile } from "@/hooks/useValidatorProfiles"
import useValidators from "@/hooks/useValidators"
import type { Validator } from "@/lib/validators"
import { calculateValidatorApyBasisPoints } from "@/utils/validatorApy"
import {
  type ValidatorSortEntry,
  type ValidatorSortMode,
  aggregateSelectedVoteBasisPoints,
  allocationTotalBasisPoints,
  basisPointsToPercentage,
  calculateProjectedValidatorWeight,
  compareValidatorSortEntries,
  equalVoteBasisPoints,
  percentageToBasisPoints,
} from "@/utils/validatorVoting"
import {
  Button,
  Card,
  Input,
  Modal,
  ModalBody,
  Skeleton,
  Tag,
} from "@mezo-org/mezo-clay"
import Link from "next/link"
import { useDeferredValue, useEffect, useMemo, useState } from "react"
import { useAccount, useReadContract, useReadContracts } from "wagmi"

type SortDirection = "asc" | "desc"

const VALIDATORS_PER_PAGE = 9

function formatBasisPoints(value: bigint): string {
  const whole = value / 100n
  const fraction = (value % 100n).toString().padStart(2, "0")
  return `${whole}.${fraction}`
}

type ValidatorCartRowProps = {
  validator: Validator
  allocation: string
  onAllocationChange: (value: string) => void
  onRemove: () => void
}

function ValidatorCartRow({
  validator,
  allocation,
  onAllocationChange,
  onRemove,
}: ValidatorCartRowProps): JSX.Element {
  const { profile } = useValidatorProfile(validator.gauge)
  const displayName =
    profile?.display_name || validator.moniker || validator.operator

  return (
    <li className="rounded-lg border border-[var(--border)] p-3">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-secondary)]">
            {profile?.profile_picture_url ? (
              <img
                src={profile.profile_picture_url}
                alt={`${displayName} profile`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="font-mono text-xs font-semibold text-[var(--content-secondary)]">
                {displayName.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <Link
              href={`/validator-gauges/${validator.gauge}`}
              className="block truncate text-sm font-semibold text-[var(--content-primary)] no-underline"
            >
              {displayName}
            </Link>
            <p className="truncate font-mono text-2xs text-[var(--content-tertiary)]">
              {validator.gauge.slice(0, 8)}…{validator.gauge.slice(-6)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label
            htmlFor={`cart-validator-${validator.gauge}`}
            className="whitespace-nowrap text-xs text-[var(--content-secondary)]"
          >
            Vote %
          </label>
          <Input
            id={`cart-validator-${validator.gauge}`}
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={allocation}
            onChange={(event) => onAllocationChange(event.target.value)}
            placeholder="0"
            size="small"
            positive={allocation.trim() !== "" && allocation !== "0"}
            overrides={{ Root: { style: { width: "90px" } } }}
          />
          <Button kind="secondary" size="small" onClick={onRemove}>
            <span className="sr-only">Remove {displayName} from cart</span>
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
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </Button>
        </div>
      </div>
    </li>
  )
}

export default function ValidatorVotingPage(): JSX.Element {
  const { chainId } = useNetwork()
  const { isConnected } = useAccount()
  const contracts = getContractConfig(chainId)
  const { locks, isLoading: isLoadingLocks } = useVeBTCLocks()
  const {
    votableValidators,
    totalWeight,
    isLoading: isLoadingValidators,
    error: validatorsError,
    refetch: refetchValidators,
  } = useValidators()
  const {
    map: validatorMetrics,
    btcPriceUsd,
    isLoading: isLoadingValidatorMetrics,
  } = useValidatorMetrics(votableValidators)
  const [selectedLockIndexes, setSelectedLockIndexes] = useState<Set<number>>(
    new Set(),
  )
  const [selectedGaugeAddresses, setSelectedGaugeAddresses] = useState<
    Set<string>
  >(new Set())
  const [allocations, setAllocations] = useState<Record<string, string>>({})
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search)
  const [sortMode, setSortMode] = useState<ValidatorSortMode>("incentives")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [cartOpen, setCartOpen] = useState(false)
  const multiVote = useMultiValidatorVoting()

  const selectedLocks = useMemo(
    () =>
      Array.from(selectedLockIndexes)
        .sort((a, b) => a - b)
        .flatMap((index) => (locks[index] ? [locks[index]] : [])),
    [locks, selectedLockIndexes],
  )
  const currentEpochTimestamp = useMemo(
    () => BigInt(Math.floor(Date.now() / 60_000) * 60),
    [],
  )
  const { data: epochStart } = useReadContract({
    ...contracts.validatorsVoter,
    functionName: "epochStart",
    args: [currentEpochTimestamp],
  })
  const { data: lastVotedResults } = useReadContracts({
    contracts: selectedLocks.map((lock) => ({
      ...contracts.validatorsVoter,
      functionName: "lastVoted" as const,
      args: [lock.tokenId] as const,
    })),
    query: { enabled: selectedLocks.length > 0 },
  })
  const selectedLockStates = selectedLocks.map((lock, index) => {
    const lastVoted = lastVotedResults?.[index]?.result as bigint | undefined
    return {
      lock,
      eligible:
        epochStart === undefined ||
        lastVoted === undefined ||
        lastVoted < epochStart,
    }
  })
  const eligibleLocks = selectedLockStates.flatMap((state) =>
    state.eligible ? [state.lock] : [],
  )
  const { data: selectedUsedWeightResults } = useReadContracts({
    contracts: selectedLocks.map((lock) => ({
      ...contracts.validatorsVoter,
      functionName: "usedWeights" as const,
      args: [lock.tokenId] as const,
    })),
    query: { enabled: selectedLocks.length > 0 },
  })
  const { data: selectedVoteResults } = useReadContracts({
    contracts: selectedLocks.flatMap((lock) =>
      votableValidators.map((validator) => ({
        ...contracts.validatorsVoter,
        functionName: "votes" as const,
        args: [lock.tokenId, validator.gauge] as const,
      })),
    ),
    query: {
      enabled: selectedLocks.length > 0 && votableValidators.length > 0,
    },
  })

  const selectedVotesByGauge = useMemo(() => {
    const result = new Map<
      string,
      {
        vote: bigint
        usedWeight: bigint
        votingPower: bigint
        eligible: boolean
      }[]
    >()
    votableValidators.forEach((validator, validatorIndex) => {
      result.set(
        validator.gauge.toLowerCase(),
        selectedLockStates.map((state, lockIndex) => ({
          vote:
            (selectedVoteResults?.[
              lockIndex * votableValidators.length + validatorIndex
            ]?.result as bigint | undefined) ?? 0n,
          usedWeight:
            (selectedUsedWeightResults?.[lockIndex]?.result as
              | bigint
              | undefined) ?? 0n,
          votingPower: state.lock.votingPower,
          eligible: state.eligible,
        })),
      )
    })
    return result
  }, [
    selectedLockStates,
    selectedUsedWeightResults,
    selectedVoteResults,
    votableValidators,
  ])

  const currentAllocations = useMemo(
    () =>
      new Map(
        votableValidators.map((validator) => {
          const votes =
            selectedVotesByGauge.get(validator.gauge.toLowerCase()) ?? []
          return [
            validator.gauge.toLowerCase(),
            aggregateSelectedVoteBasisPoints(votes),
          ] as const
        }),
      ),
    [selectedVotesByGauge, votableValidators],
  )

  const filteredValidators = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()
    const result = votableValidators.filter((validator) => {
      return (
        !query ||
        validator.moniker.toLowerCase().includes(query) ||
        validator.details.toLowerCase().includes(query) ||
        validator.operator.toLowerCase().includes(query) ||
        validator.gauge.toLowerCase().includes(query)
      )
    })

    const toSortEntry = (validator: Validator): ValidatorSortEntry => {
      const weight = BigInt(validator.weight)
      const metric = validatorMetrics.get(validator.gauge.toLowerCase())
      return {
        gauge: validator.gauge,
        name: validator.moniker || validator.operator,
        weight,
        shareBasisPoints:
          totalWeight > 0n ? (weight * 10_000n) / totalWeight : 0n,
        incentivesMicroUsd: metric?.totalIncentivesMicroUsd ?? null,
        apyBasisPoints: metric?.apyBasisPoints ?? null,
      }
    }
    return [...result].sort((a, b) =>
      compareValidatorSortEntries(
        toSortEntry(a),
        toSortEntry(b),
        sortMode,
        sortDirection,
      ),
    )
  }, [
    deferredSearch,
    sortDirection,
    sortMode,
    totalWeight,
    validatorMetrics,
    votableValidators,
  ])

  const {
    currentPage,
    totalPages,
    pageStart,
    pageEnd,
    paginatedItems,
    goToPreviousPage,
    goToNextPage,
  } = usePagination(filteredValidators, {
    pageSize: VALIDATORS_PER_PAGE,
    resetDeps: [deferredSearch, sortMode, sortDirection],
  })

  const selectedValidators = useMemo(
    () =>
      votableValidators.filter((validator) =>
        selectedGaugeAddresses.has(validator.gauge),
      ),
    [selectedGaugeAddresses, votableValidators],
  )
  const allocationValues = selectedValidators.map(
    (validator) => allocations[validator.gauge] ?? "",
  )
  const allocationTotal = allocationTotalBasisPoints(allocationValues)
  const allocationEntries = selectedValidators.flatMap((validator) => {
    const raw = allocations[validator.gauge] ?? ""
    const basisPoints = percentageToBasisPoints(raw)
    return basisPoints && basisPoints > 0n
      ? [{ validator, raw, basisPoints }]
      : []
  })
  const isAllocationValid = allocationTotal === 10_000n
  const canVote =
    isConnected &&
    eligibleLocks.length > 0 &&
    allocationEntries.length === selectedValidators.length &&
    allocationEntries.length > 0 &&
    isAllocationValid &&
    !multiVote.isInProgress

  useEffect(() => {
    if (selectedGaugeAddresses.size === 0) setCartOpen(false)
  }, [selectedGaugeAddresses.size])

  function toggleLock(index: number) {
    setSelectedLockIndexes((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function updateAllocation(gaugeAddress: string, value: string) {
    setAllocations((current) => ({ ...current, [gaugeAddress]: value }))
  }

  function toggleGauge(validator: Validator) {
    setSelectedGaugeAddresses((current) => {
      const next = new Set(current)
      if (next.has(validator.gauge)) {
        next.delete(validator.gauge)
        setAllocations((currentAllocations) => {
          const nextAllocations = { ...currentAllocations }
          delete nextAllocations[validator.gauge]
          return nextAllocations
        })
      } else {
        const parsed = percentageToBasisPoints(
          allocations[validator.gauge] ?? "",
        )
        if (parsed && parsed > 0n) next.add(validator.gauge)
      }
      return next
    })
  }

  function clearCart() {
    setSelectedGaugeAddresses(new Set())
    setAllocations({})
    multiVote.clear()
  }

  function voteEquallyAcrossAll() {
    const weights = equalVoteBasisPoints(votableValidators.length)
    const nextAllocations: Record<string, string> = {}
    const nextSelected = new Set<string>()
    votableValidators.forEach((validator, index) => {
      const weight = weights[index]
      if (weight === undefined || weight === 0n) return
      nextSelected.add(validator.gauge)
      nextAllocations[validator.gauge] = basisPointsToPercentage(weight)
    })
    setAllocations(nextAllocations)
    setSelectedGaugeAddresses(nextSelected)
  }

  function handleSort(nextSort: ValidatorSortMode) {
    if (sortMode === nextSort) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSortMode(nextSort)
    setSortDirection(nextSort === "name" ? "asc" : "desc")
  }

  async function submitVote() {
    if (!canVote) return
    const result = await multiVote.voteAll(
      eligibleLocks.map((lock) => lock.tokenId),
      allocationEntries.map((entry) => entry.validator.gauge),
      allocationEntries.map((entry) => entry.basisPoints),
    )
    if (result.successCount > 0) await refetchValidators()
    if (result.errorCount === 0) {
      setCartOpen(false)
      setSelectedGaugeAddresses(new Set())
      setAllocations({})
    }
  }

  if (isLoadingValidators || (isConnected && isLoadingLocks)) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton width="100%" height="180px" animation />
        <Skeleton width="100%" height="540px" animation />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 pb-24">
      <header>
        <h1 className="text-balance text-2xl font-semibold text-[var(--content-primary)]">
          <span className="text-[#F7931A]">$</span> validators --vote
        </h1>
        <p className="mt-1 text-pretty text-sm text-[var(--content-secondary)]">
          Direct veBTC voting power to Mezo validator gauges. Build one ballot
          and apply it to every eligible selected NFT.
        </p>
      </header>

      {!isConnected ? (
        <Card withBorder overrides={{}}>
          <div className="p-6 text-center">
            <h2 className="text-balance text-lg font-semibold text-[var(--content-primary)]">
              Connect your wallet to vote
            </h2>
            <p className="mt-2 text-pretty text-sm text-[var(--content-secondary)]">
              The validator directory is public. Connect to select veBTC NFTs
              and submit a ballot.
            </p>
          </div>
        </Card>
      ) : locks.length === 0 ? (
        <Card withBorder overrides={{}}>
          <div className="p-10 text-center">
            <p className="text-sm text-[var(--content-secondary)]">
              You do not own a veBTC NFT yet.
            </p>
            <a
              href="https://mezo.org/earn/lock"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-sm text-[#F7931A]"
            >
              Lock BTC on Mezo Earn
            </a>
          </div>
        </Card>
      ) : (
        <Card withBorder overrides={{}}>
          <div className="py-4">
            <LockCarouselSelector
              locks={locks}
              selectedIndex={undefined}
              multiSelect
              selectedIndexes={selectedLockIndexes}
              onToggle={toggleLock}
              lockType="veBTC"
              label="Select veBTC NFTs"
            />
          </div>
        </Card>
      )}

      {selectedLocks.length > eligibleLocks.length && (
        <p className="rounded-lg border border-[var(--warning)] p-3 text-pretty text-xs text-[var(--warning)]">
          {selectedLocks.length - eligibleLocks.length} selected NFT
          {selectedLocks.length - eligibleLocks.length === 1
            ? " has"
            : "s have"}
          already voted this epoch and will be skipped until reset or the next
          epoch.
        </p>
      )}

      {validatorsError ? (
        <p className="rounded-lg border border-[var(--negative)] p-3 text-sm text-[var(--negative)]">
          {validatorsError.message}
        </p>
      ) : (
        <Card title="Allocate Voting Power" withBorder overrides={{}}>
          <div className="py-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-[var(--content-secondary)]">
                  {filteredValidators.length} validator gauge
                  {filteredValidators.length === 1 ? "" : "s"}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={`font-mono text-xs tabular-nums ${
                      selectedValidators.length > 0 && !isAllocationValid
                        ? "text-[var(--negative)]"
                        : "text-[var(--content-secondary)]"
                    }`}
                  >
                    Total:{" "}
                    {allocationTotal === null
                      ? "Invalid"
                      : `${formatBasisPoints(allocationTotal)}%`}
                  </p>
                  <Button
                    kind="secondary"
                    size="small"
                    disabled={votableValidators.length === 0}
                    onClick={voteEquallyAcrossAll}
                  >
                    Vote equally across all
                  </Button>
                </div>
              </div>

              <Input
                id="validator-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search validator gauges..."
                size="small"
              />

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[var(--content-secondary)]">
                  Sort:
                </span>
                {(
                  [
                    { id: "incentives", label: "Incentives" },
                    { id: "apy", label: "APY" },
                    { id: "share", label: "Share" },
                    { id: "weight", label: "BTC Weight" },
                    { id: "name", label: "Name" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleSort(option.id)}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${
                      sortMode === option.id
                        ? "border-[var(--content-primary)] text-[var(--content-primary)]"
                        : "border-[var(--border)] text-[var(--content-secondary)]"
                    }`}
                  >
                    {option.label}
                    {sortMode === option.id &&
                      (sortDirection === "asc" ? " ↑" : " ↓")}
                  </button>
                ))}
              </div>

              {votableValidators.length === 0 ? (
                <p className="text-sm text-[var(--content-secondary)]">
                  No validator gauges are currently available to vote on.
                </p>
              ) : filteredValidators.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center">
                  <p className="text-sm text-[var(--content-secondary)]">
                    No validator gauges match your filters.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <fieldset>
                    <legend className="sr-only">
                      Validator vote allocation
                    </legend>
                    <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {paginatedItems.map((validator) => (
                        <li key={validator.gauge} className="min-w-0">
                          <ValidatorGaugeVotingCard
                            validator={validator}
                            totalWeight={totalWeight}
                            metric={validatorMetrics.get(
                              validator.gauge.toLowerCase(),
                            )}
                            isLoadingMetrics={isLoadingValidatorMetrics}
                            allocation={allocations[validator.gauge] ?? ""}
                            currentAllocation={
                              currentAllocations.get(
                                validator.gauge.toLowerCase(),
                              ) ?? 0n
                            }
                            projectedApyBasisPoints={(() => {
                              const metric = validatorMetrics.get(
                                validator.gauge.toLowerCase(),
                              )
                              const allocationBasisPoints =
                                percentageToBasisPoints(
                                  allocations[validator.gauge] ?? "",
                                )
                              if (
                                metric?.totalIncentivesMicroUsd === null ||
                                metric?.totalIncentivesMicroUsd === undefined ||
                                btcPriceUsd === null ||
                                allocationBasisPoints === null
                              ) {
                                return metric?.apyBasisPoints ?? null
                              }
                              return calculateValidatorApyBasisPoints(
                                metric.totalIncentivesMicroUsd,
                                calculateProjectedValidatorWeight(
                                  BigInt(validator.weight),
                                  selectedVotesByGauge.get(
                                    validator.gauge.toLowerCase(),
                                  ) ?? [],
                                  allocationBasisPoints,
                                ),
                                btcPriceUsd,
                              )
                            })()}
                            isSelected={selectedGaugeAddresses.has(
                              validator.gauge,
                            )}
                            onAllocationChange={(value) =>
                              updateAllocation(validator.gauge, value)
                            }
                            onToggleSelection={() => toggleGauge(validator)}
                          />
                        </li>
                      ))}
                    </ol>
                  </fieldset>
                  <PaginationControls
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageStart={pageStart}
                    pageEnd={pageEnd}
                    totalItems={filteredValidators.length}
                    itemLabel="validator gauge"
                    onPrevious={goToPreviousPage}
                    onNext={goToNextPage}
                  />
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <Modal
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        overrides={{
          Dialog: {
            style: {
              maxWidth: "720px",
              width: "100%",
              padding: "0",
              position: "fixed",
              bottom: "0",
              left: "0",
              right: "0",
              margin: "0 auto",
              borderTopLeftRadius: "16px",
              borderTopRightRadius: "16px",
            },
          },
          Close: { style: { top: "12px", right: "12px" } },
        }}
      >
        <ModalBody $style={{ padding: "16px" }}>
          <div className="flex flex-col gap-4">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-[var(--content-tertiary)]">
                  Shopping cart
                </p>
                <h2 className="text-balance text-lg font-semibold text-[var(--content-primary)]">
                  Validator vote allocations
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <Tag closeable={false} color="blue">
                  {selectedValidators.length} selected
                </Tag>
                <Tag
                  closeable={false}
                  color={isAllocationValid ? "green" : "yellow"}
                >
                  Total{" "}
                  {allocationTotal === null
                    ? "Invalid"
                    : `${formatBasisPoints(allocationTotal)}%`}
                </Tag>
              </div>
            </header>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-pretty text-xs text-[var(--content-secondary)]">
                This shared ballot will be applied to {eligibleLocks.length}{" "}
                eligible veBTC NFT{eligibleLocks.length === 1 ? "" : "s"}.
              </p>
              <Button
                kind="secondary"
                size="small"
                onClick={voteEquallyAcrossAll}
              >
                Equal vote
              </Button>
            </div>

            <fieldset className="rounded-lg border border-[var(--border)] p-4">
              <legend className="px-2 text-xs uppercase tracking-wider text-[var(--content-tertiary)]">
                Vote weights
              </legend>
              <ol className="mt-4 flex max-h-[42vh] flex-col gap-3 overflow-y-auto pr-1">
                {selectedValidators.map((validator) => (
                  <ValidatorCartRow
                    key={validator.gauge}
                    validator={validator}
                    allocation={allocations[validator.gauge] ?? ""}
                    onAllocationChange={(value) =>
                      updateAllocation(validator.gauge, value)
                    }
                    onRemove={() => toggleGauge(validator)}
                  />
                ))}
              </ol>
            </fieldset>

            {!isAllocationValid && selectedValidators.length > 0 && (
              <p className="text-pretty text-xs text-[var(--negative)]">
                Allocation must equal exactly 100% before voting.
              </p>
            )}

            {multiVote.lockStates.length > 0 && (
              <div className="rounded-lg border border-[var(--border)] p-3">
                <p className="mb-3 text-xs font-semibold text-[var(--content-primary)]">
                  {multiVote.isInProgress
                    ? multiVote.executionMode === "batched"
                      ? "Confirm batch in wallet"
                      : "Signing transactions"
                    : "Transaction results"}
                </p>
                <ol className="flex flex-col gap-2">
                  {multiVote.lockStates.map((state) => (
                    <li
                      key={state.tokenId.toString()}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="font-mono text-[var(--content-primary)]">
                        veBTC #{state.tokenId.toString()}
                      </span>
                      <span
                        className={
                          state.status === "error"
                            ? "text-[var(--negative)]"
                            : state.status === "success"
                              ? "text-[var(--positive)]"
                              : "text-[var(--content-secondary)]"
                        }
                      >
                        {state.status}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {multiVote.error && (
              <p className="text-pretty text-xs text-[var(--negative)]">
                {multiVote.error.message}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Button
                  kind="secondary"
                  size="small"
                  disabled={
                    selectedLocks.length === 0 || multiVote.isInProgress
                  }
                  onClick={() =>
                    void multiVote.pokeAll(
                      selectedLocks.map((lock) => lock.tokenId),
                    )
                  }
                >
                  Poke selected
                </Button>
                <Button
                  kind="secondary"
                  size="small"
                  disabled={
                    selectedLocks.length === 0 || multiVote.isInProgress
                  }
                  onClick={() =>
                    void multiVote.resetAll(
                      selectedLocks.map((lock) => lock.tokenId),
                    )
                  }
                >
                  Reset selected
                </Button>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {multiVote.canExportSafeBatch && eligibleLocks.length > 1 && (
                  <Button
                    kind="secondary"
                    onClick={() =>
                      void multiVote.exportVoteBatch(
                        eligibleLocks.map((lock) => lock.tokenId),
                        allocationEntries.map((entry) => entry.validator.gauge),
                        allocationEntries.map((entry) => entry.basisPoints),
                      )
                    }
                  >
                    Export Safe batch
                  </Button>
                )}
                {multiVote.canCopyBatchJson && eligibleLocks.length > 1 && (
                  <Button
                    kind="tertiary"
                    onClick={() =>
                      void multiVote.copyVoteBatchJson(
                        eligibleLocks.map((lock) => lock.tokenId),
                        allocationEntries.map((entry) => entry.validator.gauge),
                        allocationEntries.map((entry) => entry.basisPoints),
                      )
                    }
                  >
                    {multiVote.copiedBatchJson ? "Copied" : "Copy tx JSON"}
                  </Button>
                )}
                <Button kind="tertiary" onClick={() => setCartOpen(false)}>
                  Cancel
                </Button>
                <Button
                  kind="primary"
                  disabled={!canVote}
                  isLoading={multiVote.isInProgress}
                  onClick={() => void submitVote()}
                >
                  Vote
                </Button>
                {multiVote.lockStates.some(
                  (state) => state.status === "error",
                ) && (
                  <Button
                    kind="secondary"
                    disabled={!isAllocationValid || multiVote.isInProgress}
                    onClick={() =>
                      void multiVote.voteAll(
                        multiVote.lockStates
                          .filter((state) => state.status === "error")
                          .map((state) => state.tokenId),
                        allocationEntries.map((entry) => entry.validator.gauge),
                        allocationEntries.map((entry) => entry.basisPoints),
                      )
                    }
                  >
                    Retry failed
                  </Button>
                )}
              </div>
            </div>
          </div>
        </ModalBody>
      </Modal>

      {selectedGaugeAddresses.size > 0 && (
        <div className="fixed bottom-3 left-0 right-0 z-40 px-3 sm:bottom-4 sm:px-4">
          <div className="mx-auto flex w-full max-w-3xl flex-col items-stretch gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-lg">
            {selectedLocks.length === 0 && (
              <p className="text-xs font-medium text-[#F7931A]">
                Select veBTC NFTs above to finalize your vote
              </p>
            )}
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-[var(--content-secondary)]">
                  Selections
                </span>
                <span className="font-mono text-sm font-semibold tabular-nums text-[var(--content-primary)]">
                  {selectedGaugeAddresses.size}
                </span>
                <span className="text-xs text-[var(--content-secondary)]">
                  Total
                </span>
                <span
                  className={`font-mono text-sm font-semibold tabular-nums ${
                    isAllocationValid
                      ? "text-[var(--positive)]"
                      : "text-[var(--content-primary)]"
                  }`}
                >
                  {allocationTotal === null
                    ? "Invalid"
                    : `${formatBasisPoints(allocationTotal)}%`}
                </span>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button
                  kind="secondary"
                  size="small"
                  onClick={clearCart}
                  overrides={{ BaseButton: { style: { flex: 1 } } }}
                >
                  Clear
                </Button>
                <Button
                  kind="primary"
                  size="small"
                  onClick={() => setCartOpen(true)}
                  disabled={selectedLocks.length === 0}
                  overrides={{ BaseButton: { style: { flex: 1 } } }}
                >
                  Checkout
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
