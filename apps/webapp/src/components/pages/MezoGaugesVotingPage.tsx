import { LockCarouselSelector } from "@/components/LockCarouselSelector"
import MezoGaugeVotingCard from "@/components/MezoGaugeVotingCard"
import RewardOptimizerPanel, {
  type RewardOptimizerFeedback,
} from "@/components/RewardOptimizerPanel"
import { getContractConfig } from "@/config/contracts"
import { useNetwork } from "@/contexts/NetworkContext"
import { useVeMEZOLocks } from "@/hooks/useLocks"
import useMezoGaugeVoting from "@/hooks/useMezoGaugeVoting"
import useMezoGauges, { type MezoGaugeRow } from "@/hooks/useMezoGauges"
import { useMezoPrice } from "@/hooks/useMezoPrice"
import {
  type RewardOptimizerResult,
  calculateAnnualizedReturnBasisPoints,
  optimizeRewardAllocations,
} from "@/utils/rewardOptimizer"
import { decimalToScaledBigInt } from "@/utils/validatorApy"
import {
  aggregateSelectedVoteBasisPoints,
  allocationTotalBasisPoints,
  basisPointsToPercentage,
  calculateProjectedValidatorWeight,
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
import { useEffect, useMemo, useRef, useState } from "react"
import { useAccount, useReadContract, useReadContracts } from "wagmi"

function formatBasisPoints(value: bigint): string {
  const whole = value / 100n
  const fraction = (value % 100n).toString().padStart(2, "0")
  return `${whole}.${fraction}`
}

type MezoGaugeCartRowProps = {
  row: MezoGaugeRow
  allocation: string
  readOnly: boolean
  onAllocationChange: (value: string) => void
  onRemove: () => void
}

function MezoGaugeCartRow({
  row,
  allocation,
  readOnly,
  onAllocationChange,
  onRemove,
}: MezoGaugeCartRowProps): JSX.Element {
  return (
    <li className="rounded-lg border border-[var(--border)] p-3">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--content-primary)]">
            {row.identity.name}
          </p>
          <p className="truncate text-2xs text-[var(--content-tertiary)]">
            {row.identity.protocol} · {row.identity.network}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label
            htmlFor={`cart-mezo-gauge-${row.gauge}`}
            className="whitespace-nowrap text-xs text-[var(--content-secondary)]"
          >
            Vote %
          </label>
          <Input
            id={`cart-mezo-gauge-${row.gauge}`}
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={allocation}
            onChange={(event) => onAllocationChange(event.target.value)}
            placeholder="0"
            size="small"
            disabled={readOnly}
            positive={allocation.trim() !== "" && allocation !== "0"}
            overrides={{ Root: { style: { width: "90px" } } }}
          />
          <Button
            kind="secondary"
            size="small"
            onClick={onRemove}
            disabled={readOnly}
          >
            <span className="sr-only">
              Remove {row.identity.name} from cart
            </span>
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

export default function MezoGaugesVotingPage(): JSX.Element {
  const { chainId } = useNetwork()
  const { isConnected } = useAccount()
  const contracts = getContractConfig(chainId)
  const { locks, isLoading: isLoadingLocks } = useVeMEZOLocks()
  const { price: mezoPrice } = useMezoPrice()
  const {
    rows,
    totalWeight,
    maxVotingNum,
    isLoading: isLoadingGauges,
    isError,
    refetch: refetchGauges,
  } = useMezoGauges()
  const [selectedLockIndexes, setSelectedLockIndexes] = useState<Set<number>>(
    new Set(),
  )
  const [selectedGaugeAddresses, setSelectedGaugeAddresses] = useState<
    Set<string>
  >(new Set())
  const [allocations, setAllocations] = useState<Record<string, string>>({})
  const [cartOpen, setCartOpen] = useState(false)
  const [optimizerFeedback, setOptimizerFeedback] =
    useState<RewardOptimizerFeedback | null>(null)
  const multiVote = useMezoGaugeVoting()
  const restoredLockKey = useRef("")

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
  const { data: epochStart, isLoading: isLoadingEpochStart } = useReadContract({
    ...contracts.thirdPartyVoter,
    functionName: "epochStart",
    args: [currentEpochTimestamp],
  })
  const { data: epochNext } = useReadContract({
    ...contracts.thirdPartyVoter,
    functionName: "epochNext",
    args: [currentEpochTimestamp],
  })
  const currentTime = BigInt(Math.floor(Date.now() / 1000))
  const epochVoteStart =
    epochStart !== undefined ? epochStart + 3600n : undefined
  const epochVoteEnd = epochNext !== undefined ? epochNext - 3600n : undefined
  const isInVotingWindow =
    epochVoteStart !== undefined && epochVoteEnd !== undefined
      ? currentTime > epochVoteStart && currentTime <= epochVoteEnd
      : true

  const { data: lastVotedResults, isLoading: isLoadingLastVoted } =
    useReadContracts({
      contracts: selectedLocks.map((lock) => ({
        ...contracts.thirdPartyVoter,
        functionName: "lastVoted" as const,
        args: [lock.tokenId] as const,
      })),
      query: { enabled: selectedLocks.length > 0 },
    })
  const selectedLockStates = selectedLocks.map((lock, index) => {
    const lastVoted = lastVotedResults?.[index]?.result
    const votedThisEpoch =
      epochStart !== undefined &&
      lastVoted !== undefined &&
      lastVoted >= epochStart
    return {
      lock,
      votedThisEpoch,
      eligible: votedThisEpoch === false && isInVotingWindow,
    }
  })
  const eligibleLocks = selectedLockStates.flatMap((state) =>
    state.eligible ? [state.lock] : [],
  )
  const alreadyVotedCount = selectedLockStates.filter(
    (state) => state.votedThisEpoch,
  ).length
  const allocationsReadOnly =
    selectedLocks.length > 0 && alreadyVotedCount === selectedLocks.length

  const {
    data: selectedUsedWeightResults,
    isLoading: isLoadingSelectedUsedWeights,
  } = useReadContracts({
    contracts: selectedLocks.map((lock) => ({
      ...contracts.thirdPartyVoter,
      functionName: "usedWeights" as const,
      args: [lock.tokenId] as const,
    })),
    query: { enabled: selectedLocks.length > 0 },
  })
  const aliveRows = rows ?? []
  const { data: selectedVoteResults, isLoading: isLoadingSelectedVotes } =
    useReadContracts({
      contracts: selectedLocks.flatMap((lock) =>
        aliveRows.map((row) => ({
          ...contracts.thirdPartyVoter,
          functionName: "votes" as const,
          args: [lock.tokenId, row.gauge] as const,
        })),
      ),
      query: {
        enabled: selectedLocks.length > 0 && aliveRows.length > 0,
      },
    })
  const isLoadingSelectedGaugeState =
    selectedLocks.length > 0 &&
    (isLoadingEpochStart ||
      isLoadingLastVoted ||
      isLoadingSelectedUsedWeights ||
      isLoadingSelectedVotes)

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
    aliveRows.forEach((row, rowIndex) => {
      result.set(
        row.gauge.toLowerCase(),
        selectedLockStates.map((state, lockIndex) => ({
          vote:
            selectedVoteResults?.[lockIndex * aliveRows.length + rowIndex]
              ?.result ?? 0n,
          usedWeight: selectedUsedWeightResults?.[lockIndex]?.result ?? 0n,
          votingPower: state.lock.votingPower,
          eligible: state.eligible,
        })),
      )
    })
    return result
  }, [
    aliveRows,
    selectedLockStates,
    selectedUsedWeightResults,
    selectedVoteResults,
  ])

  const currentAllocations = useMemo(
    () =>
      new Map(
        aliveRows.map((row) => {
          const votes = selectedVotesByGauge.get(row.gauge.toLowerCase()) ?? []
          return [
            row.gauge.toLowerCase(),
            aggregateSelectedVoteBasisPoints(votes),
          ] as const
        }),
      ),
    [aliveRows, selectedVotesByGauge],
  )

  const selectedLockKey = selectedLocks
    .map((lock) => lock.tokenId.toString())
    .join(",")

  useEffect(() => {
    if (isLoadingSelectedGaugeState || !rows) return
    if (selectedLockKey === restoredLockKey.current) return
    restoredLockKey.current = selectedLockKey
    if (selectedLockKey === "") return
    const nextAllocations: Record<string, string> = {}
    const nextSelected = new Set<string>()
    for (const row of rows) {
      const basisPoints = currentAllocations.get(row.gauge.toLowerCase()) ?? 0n
      if (basisPoints === 0n) continue
      nextAllocations[row.gauge] = basisPointsToPercentage(basisPoints)
      nextSelected.add(row.gauge)
    }
    setAllocations(nextAllocations)
    setSelectedGaugeAddresses(nextSelected)
  }, [currentAllocations, isLoadingSelectedGaugeState, rows, selectedLockKey])

  const optimizerData = useMemo(() => {
    let unpricedIncentiveCount = 0
    const optimizerGauges = aliveRows.map((row) => {
      unpricedIncentiveCount += row.unpricedIncentiveCount
      return {
        id: row.gauge.toLowerCase(),
        existingWeight: calculateProjectedValidatorWeight(
          row.weight,
          selectedVotesByGauge.get(row.gauge.toLowerCase()) ?? [],
          0n,
        ),
        incentiveValueMicroUsd: row.incentivesMicroUsd,
      }
    })
    return { optimizerGauges, unpricedIncentiveCount }
  }, [aliveRows, selectedVotesByGauge])

  const optimizerInputFingerprint = useMemo(
    () =>
      [
        ...eligibleLocks.map(
          (lock) => `${lock.tokenId.toString()}:${lock.votingPower.toString()}`,
        ),
        ...optimizerData.optimizerGauges.map(
          (gauge) =>
            `${gauge.id}:${gauge.existingWeight.toString()}:${gauge.incentiveValueMicroUsd.toString()}`,
        ),
        mezoPrice === null ? "unpriced" : String(mezoPrice),
      ].join("|"),
    [eligibleLocks, mezoPrice, optimizerData],
  )

  useEffect(() => {
    void optimizerInputFingerprint
    setOptimizerFeedback(null)
  }, [optimizerInputFingerprint])

  const selectedRows = useMemo(
    () => aliveRows.filter((row) => selectedGaugeAddresses.has(row.gauge)),
    [aliveRows, selectedGaugeAddresses],
  )
  const allocationValues = selectedRows.map(
    (row) => allocations[row.gauge] ?? "",
  )
  const allocationTotal = allocationTotalBasisPoints(allocationValues)
  const allocationEntries = selectedRows.flatMap((row) => {
    const raw = allocations[row.gauge] ?? ""
    const basisPoints = percentageToBasisPoints(raw)
    return basisPoints && basisPoints > 0n ? [{ row, raw, basisPoints }] : []
  })
  const isAllocationValid = allocationTotal === 10_000n
  const exceedsMaxVotingNum =
    maxVotingNum !== undefined && BigInt(selectedRows.length) > maxVotingNum
  const canVote =
    isConnected &&
    eligibleLocks.length > 0 &&
    isInVotingWindow &&
    allocationEntries.length === selectedRows.length &&
    allocationEntries.length > 0 &&
    isAllocationValid &&
    !exceedsMaxVotingNum &&
    !allocationsReadOnly &&
    !multiVote.isInProgress

  useEffect(() => {
    if (selectedGaugeAddresses.size === 0) setCartOpen(false)
  }, [selectedGaugeAddresses.size])

  function toggleLock(index: number) {
    setOptimizerFeedback(null)
    setSelectedLockIndexes((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function updateAllocation(gaugeAddress: string, value: string) {
    if (allocationsReadOnly) return
    setOptimizerFeedback(null)
    setAllocations((current) => ({ ...current, [gaugeAddress]: value }))
  }

  function toggleGauge(row: MezoGaugeRow) {
    if (allocationsReadOnly) return
    setOptimizerFeedback(null)
    setSelectedGaugeAddresses((current) => {
      const next = new Set(current)
      if (next.has(row.gauge)) {
        next.delete(row.gauge)
        setAllocations((currentAllocations) => {
          const nextAllocations = { ...currentAllocations }
          delete nextAllocations[row.gauge]
          return nextAllocations
        })
      } else {
        const parsed = percentageToBasisPoints(allocations[row.gauge] ?? "")
        if (parsed && parsed > 0n) next.add(row.gauge)
      }
      return next
    })
  }

  function clearCart() {
    setOptimizerFeedback(null)
    setSelectedGaugeAddresses(new Set())
    setAllocations({})
    multiVote.clear()
  }

  function voteEquallyAcrossAll() {
    if (allocationsReadOnly || aliveRows.length === 0) return
    setOptimizerFeedback(null)
    const weights = equalVoteBasisPoints(aliveRows.length)
    const nextAllocations: Record<string, string> = {}
    const nextSelected = new Set<string>()
    aliveRows.forEach((row, index) => {
      const weight = weights[index]
      if (weight === undefined || weight === 0n) return
      nextSelected.add(row.gauge)
      nextAllocations[row.gauge] = basisPointsToPercentage(weight)
    })
    setAllocations(nextAllocations)
    setSelectedGaugeAddresses(nextSelected)
  }

  function applyOptimizedAllocation(result: RewardOptimizerResult) {
    const rowByGauge = new Map(
      aliveRows.map((row) => [row.gauge.toLowerCase(), row]),
    )
    const nextAllocations: Record<string, string> = {}
    const nextSelected = new Set<string>()
    for (const allocation of result.allocations) {
      const row = rowByGauge.get(allocation.id)
      if (!row) continue
      nextSelected.add(row.gauge)
      nextAllocations[row.gauge] = basisPointsToPercentage(
        allocation.basisPoints,
      )
    }
    setAllocations(nextAllocations)
    setSelectedGaugeAddresses(nextSelected)
  }

  function optimizeAllocation() {
    const votingPowers = eligibleLocks.map((lock) => lock.votingPower)
    const result = optimizeRewardAllocations({
      gauges: optimizerData.optimizerGauges,
      votingPowers,
    })
    if (!result) {
      setOptimizerFeedback({
        result: null,
        annualizedReturnBasisPoints: null,
        message:
          "No active MEZO gauge currently has both priced incentives and eligible selected voting power.",
      })
      return
    }

    applyOptimizedAllocation(result)
    const assetPriceMicroUsd =
      mezoPrice === null ? 0n : decimalToScaledBigInt(String(mezoPrice), 6)
    setOptimizerFeedback({
      result,
      annualizedReturnBasisPoints: calculateAnnualizedReturnBasisPoints({
        epochRewardMicroUsd: result.projectedRewardMicroUsd,
        votingPowers,
        assetPriceMicroUsd,
      }),
      message: null,
    })
  }

  async function submitVote() {
    if (!canVote) return
    const result = await multiVote.voteAll(
      eligibleLocks.map((lock) => lock.tokenId),
      allocationEntries.map((entry) => entry.row.gauge),
      allocationEntries.map((entry) => entry.basisPoints),
    )
    if (result.successCount > 0) refetchGauges()
    if (result.errorCount === 0) {
      setCartOpen(false)
      setSelectedGaugeAddresses(new Set())
      setAllocations({})
      setOptimizerFeedback(null)
    }
  }

  if (isLoadingGauges || (isConnected && isLoadingLocks)) {
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
          <span className="text-[#F7931A]">$</span> mezo-gauges --vote
        </h1>
        <p className="mt-1 text-pretty text-sm text-[var(--content-secondary)]">
          Voting with veMEZO directs MEZO emissions to these remote gauges
          (Aerodrome, Uniswap, Curve). This is independent of Boost Gauges. Each
          protocol distributes according to its own rules. Distribution date is
          when this epoch&apos;s emissions land.
        </p>
      </header>

      {!isConnected ? (
        <Card withBorder overrides={{}}>
          <div className="p-6 text-center">
            <h2 className="text-balance text-lg font-semibold text-[var(--content-primary)]">
              Connect your wallet to vote
            </h2>
            <p className="mt-2 text-pretty text-sm text-[var(--content-secondary)]">
              The MEZO gauge catalog is public. Connect to select veMEZO NFTs
              and submit a ballot.
            </p>
          </div>
        </Card>
      ) : locks.length === 0 ? (
        <Card withBorder overrides={{}}>
          <div className="p-10 text-center">
            <p className="text-sm text-[var(--content-secondary)]">
              You do not own a veMEZO NFT yet.
            </p>
            <a
              href="https://mezo.org/earn/lock"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-sm text-[#F7931A]"
            >
              Lock MEZO on Mezo Earn
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
              lockType="veMEZO"
              label="Select veMEZO NFTs"
            />
          </div>
        </Card>
      )}

      {!isInVotingWindow && (
        <p className="rounded-lg border border-[var(--warning)] p-3 text-pretty text-xs text-[var(--warning)]">
          Voting is closed during the first and last hour of the epoch. You can
          still compose a ballot, but it cannot be submitted until the window
          reopens.
        </p>
      )}

      {alreadyVotedCount > 0 && (
        <p className="rounded-lg border border-[var(--warning)] p-3 text-pretty text-xs text-[var(--warning)]">
          {alreadyVotedCount} selected NFT
          {alreadyVotedCount === 1 ? " has" : "s have"} already voted this epoch
          and will be skipped until reset or the next epoch.
        </p>
      )}

      {isError ? (
        <p className="rounded-lg border border-[var(--negative)] p-3 text-sm text-[var(--negative)]">
          Failed to load MEZO gauges.
        </p>
      ) : (
        <Card title="Allocate Voting Power" withBorder overrides={{}}>
          <div className="py-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-[var(--content-secondary)]">
                  {aliveRows.length} MEZO gauge
                  {aliveRows.length === 1 ? "" : "s"}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={`font-mono text-xs tabular-nums ${
                      selectedRows.length > 0 && !isAllocationValid
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
                    disabled={aliveRows.length === 0 || allocationsReadOnly}
                    onClick={voteEquallyAcrossAll}
                  >
                    Vote equally across all
                  </Button>
                </div>
              </div>

              <RewardOptimizerPanel
                assetLabel="veMEZO"
                disabled={eligibleLocks.length === 0 || allocationsReadOnly}
                disabledMessage={
                  selectedLocks.length === 0
                    ? "Select at least one veMEZO NFT to calculate an optimized ballot."
                    : isLoadingSelectedGaugeState
                      ? "Loading the selected NFTs and their prior allocations."
                      : allocationsReadOnly
                        ? "Every selected veMEZO NFT has already voted this epoch."
                        : "None of the selected veMEZO NFTs are eligible to vote in this epoch."
                }
                isLoading={isLoadingSelectedGaugeState}
                unpricedIncentiveCount={optimizerData.unpricedIncentiveCount}
                feedback={optimizerFeedback}
                onOptimize={optimizeAllocation}
              />

              {exceedsMaxVotingNum && (
                <p className="text-pretty text-xs text-[var(--negative)]">
                  This voter accepts at most {maxVotingNum.toString()} gauge
                  {maxVotingNum === 1n ? "" : "s"} per ballot.
                </p>
              )}

              {aliveRows.length === 0 ? (
                <p className="text-sm text-[var(--content-secondary)]">
                  No MEZO gauges are currently available to vote on.
                </p>
              ) : (
                <fieldset>
                  <legend className="sr-only">
                    MEZO gauge vote allocation
                  </legend>
                  <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {aliveRows.map((row) => (
                      <li key={row.gauge} className="min-w-0">
                        <MezoGaugeVotingCard
                          row={row}
                          totalWeight={totalWeight ?? 0n}
                          allocation={allocations[row.gauge] ?? ""}
                          currentAllocation={
                            currentAllocations.get(row.gauge.toLowerCase()) ??
                            0n
                          }
                          isSelected={selectedGaugeAddresses.has(row.gauge)}
                          readOnly={allocationsReadOnly}
                          isLoadingIncentives={false}
                          onAllocationChange={(value) =>
                            updateAllocation(row.gauge, value)
                          }
                          onToggleSelection={() => toggleGauge(row)}
                        />
                      </li>
                    ))}
                  </ol>
                </fieldset>
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
                  MEZO gauge vote allocations
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <Tag closeable={false} color="blue">
                  {selectedRows.length} selected
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
                eligible veMEZO NFT{eligibleLocks.length === 1 ? "" : "s"}.
              </p>
              <Button
                kind="secondary"
                size="small"
                disabled={allocationsReadOnly}
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
                {selectedRows.map((row) => (
                  <MezoGaugeCartRow
                    key={row.gauge}
                    row={row}
                    allocation={allocations[row.gauge] ?? ""}
                    readOnly={allocationsReadOnly}
                    onAllocationChange={(value) =>
                      updateAllocation(row.gauge, value)
                    }
                    onRemove={() => toggleGauge(row)}
                  />
                ))}
              </ol>
            </fieldset>

            {!isAllocationValid && selectedRows.length > 0 && (
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
                        veMEZO #{state.tokenId.toString()}
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
                        allocationEntries.map((entry) => entry.row.gauge),
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
                        allocationEntries.map((entry) => entry.row.gauge),
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
                        allocationEntries.map((entry) => entry.row.gauge),
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
                Select veMEZO NFTs above to finalize your vote
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
