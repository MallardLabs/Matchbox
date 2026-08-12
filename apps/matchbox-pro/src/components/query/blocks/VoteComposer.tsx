import { CheckIcon, ShieldIcon, VoteIcon } from "@/components/ui/Icons"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { refreshProposal as refreshPreparedProposal } from "@/lib/query/client"
import type { QueryBlock, WalletContext } from "@/lib/query/contracts"
import { useProposalDispatch } from "@/lib/wallet/useProposalDispatch"
import { cn } from "@/utils/cn"
import { Money } from "@thesis-co/cent"
import { useMemo, useState } from "react"
import { AllocationDiff } from "./AllocationDiff"
import { ProposalCallStatus } from "./ProposalCallStatus"

type VoteBlock = Extract<QueryBlock, { type: "vote_composer" }>
type Ballot = VoteBlock["ballots"][number]

function ballotKey(ballot: Ballot): string {
  return `${ballot.votingContract}:${ballot.votingBucket}:${ballot.position.tokenId}`
}

export function VoteComposer({
  block,
  wallet,
}: {
  block: VoteBlock
  wallet: WalletContext
}): JSX.Element {
  const [reviewing, setReviewing] = useState(false)
  const [ballots, setBallots] = useState(block.ballots)
  const [selectedBallotKeys, setSelectedBallotKeys] = useState(
    () => new Set(block.ballots.map(ballotKey)),
  )
  const [manualOverride, setManualOverride] = useState(
    block.origin === "manual",
  )
  const [recommendedBallots, setRecommendedBallots] = useState<Ballot[] | null>(
    null,
  )
  const selectedBallots = useMemo(
    () => ballots.filter((ballot) => selectedBallotKeys.has(ballotKey(ballot))),
    [ballots, selectedBallotKeys],
  )
  const ballotsValid =
    selectedBallots.length > 0 &&
    selectedBallots.every(
      (ballot) =>
        ballot.allocations.reduce(
          (sum, allocation) => sum + allocation.basisPoints,
          0,
        ) === 10_000,
    )
  const proposalDispatch = useProposalDispatch({
    wallet,
    requests: block.transactionRequests,
    refresh: async () => {
      const refreshed = await refreshPreparedProposal({
        kind: "vote",
        address: wallet.address,
        walletMode: wallet.mode,
        proposal: block,
        ballots: selectedBallots,
        manualOverride,
        acceptNewOptimum: false,
      })
      if (refreshed.kind !== "vote") {
        throw new Error("Stuart returned the wrong refreshed proposal type")
      }
      if (!refreshed.proposal.canSign) {
        throw new Error(
          refreshed.proposal.simulation.reason ??
            "The refreshed vote is not safe to sign",
        )
      }
      setRecommendedBallots(refreshed.recommendedBallots)
      return {
        requests: refreshed.proposal.transactionRequests,
        diff: { type: "allocation_diff", ...refreshed.diff },
      }
    },
  })
  const needsConnection =
    wallet.mode !== "connected" || !proposalDispatch.canDispatch

  function markManualChange(): void {
    setManualOverride(true)
    setRecommendedBallots(null)
    proposalDispatch.resetReview()
  }

  function toggleBallot(ballot: Ballot): void {
    const key = ballotKey(ballot)
    setSelectedBallotKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    markManualChange()
  }

  function updateAllocation(
    ballot: Ballot,
    gaugeId: string,
    rawPercentage: string,
  ): void {
    if (!/^\d{1,3}$/.test(rawPercentage)) return
    const percentage = Number.parseInt(rawPercentage, 10)
    if (percentage < 1 || percentage > 100) return
    const key = ballotKey(ballot)
    setBallots((current) =>
      current.map((candidate) =>
        ballotKey(candidate) === key
          ? {
              ...candidate,
              allocations: candidate.allocations.map((allocation) =>
                allocation.gaugeId === gaugeId
                  ? {
                      ...allocation,
                      percentage,
                      basisPoints: percentage * 100,
                    }
                  : allocation,
              ),
            }
          : candidate,
      ),
    )
    markManualChange()
  }

  function useRefreshedOptimum(): void {
    if (!recommendedBallots) return
    setBallots(recommendedBallots)
    setSelectedBallotKeys(new Set(recommendedBallots.map(ballotKey)))
    setManualOverride(false)
    setRecommendedBallots(null)
    proposalDispatch.resetReview()
  }

  return (
    <section
      aria-labelledby="vote-composer-title"
      className="border-t border-line pt-5"
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-medium uppercase text-muted">
            Chain-aware unsigned proposal
          </p>
          <h2
            className="text-balance text-lg font-medium text-ink"
            id="vote-composer-title"
          >
            {ballots.length > 0
              ? `${selectedBallots.length} of ${ballots.length} eligible voting ${ballots.length === 1 ? "ballot" : "ballots"} selected`
              : "No executable ballot"}
          </h2>
        </div>
        <StatusBadge status={block.simulation.status} />
      </div>

      <div className="space-y-3">
        {ballots.map((ballot, ballotIndex) => {
          const totalBasisPoints = ballot.allocations.reduce(
            (sum, allocation) => sum + allocation.basisPoints,
            0,
          )
          const selected = selectedBallotKeys.has(ballotKey(ballot))
          const simulation = block.simulation.results[ballotIndex]
          return (
            <article
              className={cn(
                "overflow-hidden rounded-lg border border-line bg-panel",
                !selected && "opacity-60",
              )}
              key={ballotKey(ballot)}
            >
              <header className="flex flex-col gap-2 border-b border-line bg-raised px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    checked={selected}
                    className="mt-1 size-4 accent-accent"
                    onChange={() => toggleBallot(ballot)}
                    type="checkbox"
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink">
                      {ballot.governanceAsset} #{ballot.position.tokenId}
                    </span>
                    <span className="block font-mono text-xs text-muted">
                      {ballot.votingBucket} ·{" "}
                      {ballot.position.votingPowerFormatted} power
                    </span>
                  </span>
                </label>
                <span
                  className={cn(
                    "font-mono text-sm tabular-nums",
                    totalBasisPoints === 10_000
                      ? "text-positive"
                      : "text-warning",
                  )}
                >
                  {totalBasisPoints / 100}% allocated
                </span>
              </header>
              <fieldset disabled={!selected}>
                <legend className="sr-only">
                  Allocations for {ballot.governanceAsset} #
                  {ballot.position.tokenId}
                </legend>
                <ol className="divide-y divide-line">
                  {ballot.allocations.map((allocation) => (
                    <li
                      className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_120px_84px] sm:items-center"
                      key={allocation.gaugeId}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">
                          {allocation.gaugeName}
                        </span>
                        <span className="block text-xs text-muted">
                          {allocation.consistencyBps / 100}% funded epochs /
                          last 8
                        </span>
                      </span>
                      <span className="font-mono text-xs tabular-nums text-positive sm:text-right">
                        {Money(
                          `USD ${allocation.projectedReturnUsd}`,
                        ).toString()}{" "}
                        projected
                      </span>
                      <label className="flex items-center justify-end gap-1 rounded-md border border-line bg-raised px-2 py-1 font-mono text-sm tabular-nums text-ink">
                        <span className="sr-only">
                          Allocation percentage for {allocation.gaugeName}
                        </span>
                        <input
                          aria-label={`Allocation percentage for ${allocation.gaugeName} on ${ballot.governanceAsset} #${ballot.position.tokenId}`}
                          className="w-12 bg-transparent text-right outline-none"
                          inputMode="numeric"
                          max="100"
                          min="1"
                          onChange={(event) =>
                            updateAllocation(
                              ballot,
                              allocation.gaugeId,
                              event.target.value,
                            )
                          }
                          type="number"
                          value={allocation.percentage}
                        />
                        <span aria-hidden="true">%</span>
                      </label>
                    </li>
                  ))}
                </ol>
              </fieldset>
              <footer className="border-t border-line px-4 py-2 text-xs text-muted">
                {simulation
                  ? `${simulation.status} simulation${simulation.gasEstimate ? ` · ${simulation.gasEstimate} gas` : ""}`
                  : "Refresh will simulate this independent ballot."}
              </footer>
            </article>
          )
        })}
      </div>

      <div className="mt-3 flex flex-col gap-3 rounded-lg border border-line bg-panel p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-secondary">
            {selectedBallots.length} independent call
            {selectedBallots.length === 1 ? "" : "s"} · block{" "}
            {block.snapshotBlock}
          </p>
          <p className="mt-1 text-xs text-muted">
            {block.simulation.reason ??
              `${block.simulation.gasEstimate ?? "Unknown"} gas units estimated`}
          </p>
        </div>
        <button
          className="button-primary"
          disabled={
            !block.canSign ||
            block.transactionRequests.length === 0 ||
            !ballotsValid ||
            needsConnection
          }
          onClick={() => setReviewing(true)}
          type="button"
        >
          <VoteIcon className="size-4" />
          {needsConnection && block.status === "read-only"
            ? "Connect this wallet to continue"
            : "Review vote"}
        </button>
      </div>

      {!ballotsValid && selectedBallots.length > 0 && (
        <p className="mt-2 text-pretty text-sm text-warning" role="alert">
          Every selected ballot must total exactly 100% (10,000 basis points).
        </p>
      )}

      {reviewing && (
        <div className="mt-4 border-l-2 border-accent bg-accent-soft p-4">
          <div className="flex items-start gap-3">
            <ShieldIcon className="mt-0.5 size-5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium text-ink">
                Ready for wallet review
              </h3>
              <p className="mt-1 text-pretty text-sm text-secondary">
                {selectedBallots.length} exact Mezo Mainnet request
                {selectedBallots.length === 1 ? " is" : "s are"} refreshed and
                simulated before signing. Stuart cannot sign or submit them.
                Independent ballots are non-atomic; a later failure does not
                undo a confirmed ballot.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="button-primary"
                  disabled={
                    proposalDispatch.dispatching ||
                    !proposalDispatch.canDispatch ||
                    !ballotsValid
                  }
                  onClick={() =>
                    void (proposalDispatch.awaitingAcknowledgement
                      ? proposalDispatch.acknowledgeAndDispatch()
                      : proposalDispatch.dispatch())
                  }
                  type="button"
                >
                  <CheckIcon className="size-4" />
                  {proposalDispatch.dispatching
                    ? "Waiting for confirmations"
                    : proposalDispatch.awaitingAcknowledgement
                      ? "Acknowledge changes & continue"
                      : proposalDispatch.calls.some(
                            (call) => call.status === "failed",
                          )
                        ? "Retry failed call"
                        : "Refresh & confirm in wallet"}
                </button>
                <button
                  className="button-ghost"
                  onClick={() => setReviewing(false)}
                  type="button"
                >
                  Close review
                </button>
              </div>
              {proposalDispatch.error && (
                <p
                  className="mt-3 text-pretty text-sm text-warning"
                  role="alert"
                >
                  {proposalDispatch.error}
                </p>
              )}
              {proposalDispatch.diff?.material && (
                <AllocationDiff diff={proposalDispatch.diff} />
              )}
              {proposalDispatch.diff?.material &&
                recommendedBallots &&
                manualOverride && (
                  <button
                    className="button-secondary mt-3"
                    onClick={useRefreshedOptimum}
                    type="button"
                  >
                    Use refreshed optimum instead
                  </button>
                )}
              <ProposalCallStatus calls={proposalDispatch.calls} />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
