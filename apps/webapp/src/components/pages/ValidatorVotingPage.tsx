import { LockCarouselSelector } from "@/components/LockCarouselSelector"
import { getContractConfig } from "@/config/contracts"
import { useNetwork } from "@/contexts/NetworkContext"
import { useVeBTCLocks } from "@/hooks/useLocks"
import useMultiValidatorVoting from "@/hooks/useMultiValidatorVoting"
import useValidators from "@/hooks/useValidators"
import {
  allocationTotalBasisPoints,
  percentageToBasisPoints,
} from "@/utils/validatorVoting"
import {
  Button,
  Card,
  Input,
  Modal,
  ModalBody,
  ModalHeader,
  Skeleton,
  Tag,
} from "@mezo-org/mezo-clay"
import Link from "next/link"
import { useMemo, useState } from "react"
import { formatUnits } from "viem"
import { useAccount, useReadContract, useReadContracts } from "wagmi"

function formatWeight(value: bigint): string {
  const formatted = formatUnits(value, 18)
  const [whole, fraction = ""] = formatted.split(".")
  const trimmed = fraction.slice(0, 4).replace(/0+$/, "")
  return trimmed ? `${whole ?? "0"}.${trimmed}` : (whole ?? "0")
}

function formatBasisPoints(value: bigint): string {
  const whole = value / 100n
  const fraction = (value % 100n).toString().padStart(2, "0")
  return `${whole}.${fraction}`
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
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set())
  const [allocations, setAllocations] = useState<Record<string, string>>({})
  const [search, setSearch] = useState("")
  const [sortMode, setSortMode] = useState<"weight" | "name">("weight")
  const [reviewOpen, setReviewOpen] = useState(false)
  const multiVote = useMultiValidatorVoting()

  const selectedLocks = useMemo(
    () =>
      Array.from(selectedIndexes)
        .sort((a, b) => a - b)
        .flatMap((index) => (locks[index] ? [locks[index]] : [])),
    [locks, selectedIndexes],
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
  const eligibleLocks = selectedLocks.filter((_, index) => {
    const lastVoted = lastVotedResults?.[index]?.result as bigint | undefined
    return (
      epochStart === undefined ||
      lastVoted === undefined ||
      lastVoted < epochStart
    )
  })
  const primaryLock = selectedLocks[0]
  const { data: primaryUsedWeight } = useReadContract({
    ...contracts.validatorsVoter,
    functionName: "usedWeights",
    args: primaryLock ? [primaryLock.tokenId] : undefined,
    query: { enabled: !!primaryLock },
  })
  const { data: primaryVoteResults } = useReadContracts({
    contracts: votableValidators.map((validator) => ({
      ...contracts.validatorsVoter,
      functionName: "votes" as const,
      args: [primaryLock?.tokenId ?? 0n, validator.gauge] as const,
    })),
    query: { enabled: !!primaryLock && votableValidators.length > 0 },
  })

  const filteredValidators = useMemo(() => {
    const query = search.trim().toLowerCase()
    return [...votableValidators]
      .filter(
        (validator) =>
          !query ||
          validator.moniker.toLowerCase().includes(query) ||
          validator.operator.toLowerCase().includes(query) ||
          validator.gauge.toLowerCase().includes(query),
      )
      .sort((a, b) => {
        if (sortMode === "name") {
          return (a.moniker || a.operator).localeCompare(
            b.moniker || b.operator,
          )
        }
        const weightOrder = BigInt(b.weight) - BigInt(a.weight)
        if (weightOrder > 0n) return 1
        if (weightOrder < 0n) return -1
        return (a.moniker || a.operator).localeCompare(b.moniker || b.operator)
      })
  }, [search, sortMode, votableValidators])
  const primaryCurrentAllocations = useMemo(() => {
    const used = primaryUsedWeight as bigint | undefined
    if (!used || used === 0n) return new Map<string, bigint>()
    return new Map(
      votableValidators.flatMap((validator, index) => {
        const vote = primaryVoteResults?.[index]?.result as bigint | undefined
        return vote && vote > 0n
          ? [[validator.gauge, (vote * 10_000n) / used] as const]
          : []
      }),
    )
  }, [primaryUsedWeight, primaryVoteResults, votableValidators])
  const allocationEntries = votableValidators.flatMap((validator) => {
    const raw = allocations[validator.gauge] ?? ""
    const basisPoints = percentageToBasisPoints(raw)
    return basisPoints && basisPoints > 0n
      ? [{ validator, raw, basisPoints }]
      : []
  })
  const allocationTotal = allocationTotalBasisPoints(Object.values(allocations))
  const isAllocationValid = allocationTotal === 10_000n
  const canVote =
    isConnected &&
    eligibleLocks.length > 0 &&
    allocationEntries.length > 0 &&
    isAllocationValid &&
    !multiVote.isInProgress

  function toggleLock(index: number) {
    setSelectedIndexes((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  async function submitVote() {
    if (!canVote) return
    const result = await multiVote.voteAll(
      eligibleLocks.map((lock) => lock.tokenId),
      allocationEntries.map((entry) => entry.validator.gauge),
      allocationEntries.map((entry) => entry.basisPoints),
    )
    if (result.successCount > 0) await refetchValidators()
  }

  if (isLoadingValidators || (isConnected && isLoadingLocks)) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton width="100%" height="180px" animation />
        <Skeleton width="100%" height="360px" animation />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-balance text-2xl font-semibold text-[var(--content-primary)]">
          <span className="text-[#F7931A]">$</span> validators --vote
        </h1>
        <p className="mt-1 text-pretty text-sm text-[var(--content-secondary)]">
          Direct veBTC voting power to Mezo validators. One ballot is applied to
          every eligible selected NFT.
        </p>
      </header>

      {!isConnected ? (
        <Card withBorder overrides={{}}>
          <div className="p-6 text-center">
            <h2 className="text-balance text-lg font-semibold text-[var(--content-primary)]">
              Connect your wallet to vote
            </h2>
            <p className="mt-2 text-pretty text-sm text-[var(--content-secondary)]">
              The validator directory remains public. Connect to select veBTC
              NFTs and submit a ballot.
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
              href="https://mezo.org/earn"
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
              selectedIndexes={selectedIndexes}
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
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card withBorder overrides={{}}>
            <div className="flex flex-col gap-4 py-4">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
                <Input
                  id="validator-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search validators, operators, or gauges"
                />
                <label className="sr-only" htmlFor="validator-sort">
                  Sort validators
                </label>
                <select
                  id="validator-sort"
                  value={sortMode}
                  onChange={(event) =>
                    setSortMode(
                      event.target.value === "name" ? "name" : "weight",
                    )
                  }
                  className="min-h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--content-primary)]"
                >
                  <option value="weight">Highest weight</option>
                  <option value="name">Name</option>
                </select>
              </div>
              <fieldset>
                <legend className="sr-only">Validator vote allocation</legend>
                <ol className="flex flex-col gap-2">
                  {filteredValidators.map((validator) => {
                    const weight = BigInt(validator.weight)
                    const shareBasisPoints =
                      totalWeight > 0n ? (weight * 10_000n) / totalWeight : 0n
                    return (
                      <li
                        key={validator.gauge}
                        className="rounded-lg border border-[var(--border)] p-3"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={`/validator-gauges/${validator.gauge}`}
                                className="truncate text-sm font-semibold text-[var(--content-primary)] no-underline"
                              >
                                {validator.moniker || validator.operator}
                              </Link>
                              <Tag color="green" closeable={false}>
                                Live
                              </Tag>
                            </div>
                            <p className="mt-1 line-clamp-2 text-pretty text-xs text-[var(--content-secondary)]">
                              {validator.details || "Mezo validator"}
                            </p>
                            <p className="mt-1 font-mono text-2xs tabular-nums text-[var(--content-tertiary)]">
                              {formatWeight(weight)} veBTC ·{" "}
                              {formatBasisPoints(shareBasisPoints)}%
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {primaryCurrentAllocations.has(validator.gauge) && (
                              <span className="whitespace-nowrap font-mono text-2xs text-[var(--content-tertiary)]">
                                Current #{primaryLock?.tokenId.toString()}:{" "}
                                {formatBasisPoints(
                                  primaryCurrentAllocations.get(
                                    validator.gauge,
                                  ) ?? 0n,
                                )}
                                %
                              </span>
                            )}
                            <label
                              htmlFor={`validator-weight-${validator.gauge}`}
                              className="text-xs text-[var(--content-secondary)]"
                            >
                              Vote %
                            </label>
                            <Input
                              id={`validator-weight-${validator.gauge}`}
                              type="number"
                              min={0}
                              max={100}
                              step={0.01}
                              value={allocations[validator.gauge] ?? ""}
                              onChange={(event) =>
                                setAllocations((current) => ({
                                  ...current,
                                  [validator.gauge]: event.target.value,
                                }))
                              }
                              placeholder="0"
                              size="small"
                              overrides={{ Root: { style: { width: "96px" } } }}
                            />
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </fieldset>
            </div>
          </Card>

          <aside className="self-start rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 xl:sticky xl:top-24">
            <h2 className="text-balance text-base font-semibold text-[var(--content-primary)]">
              Ballot
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-[var(--content-tertiary)]">veBTC NFTs</dt>
                <dd className="font-mono tabular-nums text-[var(--content-primary)]">
                  {eligibleLocks.length}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--content-tertiary)]">Allocation</dt>
                <dd className="font-mono tabular-nums text-[var(--content-primary)]">
                  {allocationTotal === null
                    ? "Invalid"
                    : `${formatBasisPoints(allocationTotal)}%`}
                </dd>
              </div>
            </dl>
            <ol className="mt-4 flex max-h-52 flex-col gap-2 overflow-y-auto">
              {allocationEntries.map((entry) => (
                <li
                  key={entry.validator.gauge}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="truncate text-[var(--content-secondary)]">
                    {entry.validator.moniker || entry.validator.operator}
                  </span>
                  <span className="font-mono tabular-nums text-[var(--content-primary)]">
                    {entry.raw}%
                  </span>
                </li>
              ))}
            </ol>
            {!isAllocationValid && allocationEntries.length > 0 && (
              <p className="mt-3 text-pretty text-xs text-[var(--negative)]">
                Allocation must equal exactly 100%.
              </p>
            )}
            <div className="mt-4 flex flex-col gap-2">
              <Button
                kind="primary"
                disabled={!canVote}
                onClick={() => setReviewOpen(true)}
              >
                Review validator vote
              </Button>
              <div className="grid grid-cols-2 gap-2">
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
            </div>
          </aside>
        </div>
      )}

      <Modal isOpen={reviewOpen} onClose={() => setReviewOpen(false)}>
        <ModalHeader>Review validator vote</ModalHeader>
        <ModalBody>
          <div className="flex flex-col gap-4">
            <p className="text-pretty text-sm text-[var(--content-secondary)]">
              This 100% ballot will replace the validator allocation for each
              eligible selected veBTC NFT.
            </p>
            {multiVote.lockStates.length > 0 && (
              <ol className="flex flex-col gap-2">
                {multiVote.lockStates.map((state) => (
                  <li
                    key={state.tokenId.toString()}
                    className="flex justify-between text-xs"
                  >
                    <span className="font-mono">
                      veBTC #{state.tokenId.toString()}
                    </span>
                    <span
                      className={
                        state.status === "error"
                          ? "text-[var(--negative)]"
                          : "text-[var(--content-secondary)]"
                      }
                    >
                      {state.status}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {multiVote.error && (
              <p className="text-pretty text-xs text-[var(--negative)]">
                {multiVote.error.message}
              </p>
            )}
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
              <Button kind="tertiary" onClick={() => setReviewOpen(false)}>
                Cancel
              </Button>
              <Button
                kind="primary"
                disabled={!canVote}
                isLoading={multiVote.isInProgress}
                onClick={() => void submitVote()}
              >
                Sign vote
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
        </ModalBody>
      </Modal>
    </div>
  )
}
