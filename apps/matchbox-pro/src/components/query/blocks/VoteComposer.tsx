import { CheckIcon, ShieldIcon, VoteIcon } from "@/components/ui/Icons"
import { StatusBadge } from "@/components/ui/StatusBadge"
import type { QueryBlock, WalletContext } from "@/lib/query/contracts"
import { useProposalDispatch } from "@/lib/wallet/useProposalDispatch"
import { Money } from "@thesis-co/cent"
import { useState } from "react"
import { ProposalCallStatus } from "./ProposalCallStatus"

type VoteBlock = Extract<QueryBlock, { type: "vote_composer" }>

export function VoteComposer({
  block,
  wallet,
}: {
  block: VoteBlock
  wallet: WalletContext
}): JSX.Element {
  const [reviewing, setReviewing] = useState(false)
  const proposalDispatch = useProposalDispatch({
    wallet,
    requests: block.transactionRequests,
  })
  const needsConnection =
    wallet.mode !== "connected" || !proposalDispatch.canDispatch

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
            {block.ballots.length > 0
              ? `${block.ballots.length} voting ${block.ballots.length === 1 ? "ballot" : "ballots"}`
              : "No executable ballot"}
          </h2>
        </div>
        <StatusBadge status={block.simulation.status} />
      </div>

      <div className="space-y-3">
        {block.ballots.map((ballot) => {
          const total = ballot.allocations.reduce(
            (sum, allocation) => sum + allocation.percentage,
            0,
          )
          return (
            <article
              className="overflow-hidden rounded-lg border border-line bg-panel"
              key={`${ballot.votingContract}-${ballot.position.tokenId}`}
            >
              <header className="flex flex-col gap-2 border-b border-line bg-raised px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-ink">
                    {ballot.governanceAsset} #{ballot.position.tokenId}
                  </p>
                  <p className="font-mono text-xs text-muted">
                    {ballot.votingBucket} ·{" "}
                    {ballot.position.votingPowerFormatted} power
                  </p>
                </div>
                <span className="font-mono text-sm tabular-nums text-positive">
                  {total}% allocated
                </span>
              </header>
              <div className="divide-y divide-line">
                {ballot.allocations.map((allocation) => (
                  <div
                    className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_120px_72px] sm:items-center"
                    key={allocation.gaugeId}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {allocation.gaugeName}
                      </p>
                      <p className="text-xs text-muted">
                        {allocation.consistencyBps / 100}% funded consistency
                      </p>
                    </div>
                    <span className="font-mono text-xs tabular-nums text-positive sm:text-right">
                      {Money(`USD ${allocation.projectedReturnUsd}`).toString()}{" "}
                      projected
                    </span>
                    <span className="rounded-md border border-line bg-raised px-2 py-1 text-right font-mono text-sm tabular-nums text-ink">
                      {allocation.percentage}%
                    </span>
                  </div>
                ))}
              </div>
            </article>
          )
        })}
      </div>

      <div className="mt-3 flex flex-col gap-3 rounded-lg border border-line bg-panel p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-secondary">
            {block.simulation.calls} call
            {block.simulation.calls === 1 ? "" : "s"} · block{" "}
            {block.snapshotBlock}
          </p>
          <p className="mt-1 text-xs text-muted">
            {block.simulation.reason ??
              `${block.simulation.gasEstimate ?? "Unknown"} gas units estimated`}
          </p>
        </div>
        <button
          className="button-primary"
          disabled={!block.canSign || block.transactionRequests.length === 0}
          onClick={() => {
            setReviewing(true)
          }}
          type="button"
        >
          <VoteIcon className="size-4" />
          {needsConnection && block.status === "read-only"
            ? "Connect this wallet to continue"
            : "Review vote"}
        </button>
      </div>

      {reviewing && (
        <div className="mt-4 border-l-2 border-accent bg-accent-soft p-4">
          <div className="flex items-start gap-3">
            <ShieldIcon className="mt-0.5 size-5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium text-ink">
                Ready for wallet review
              </h3>
              <p className="mt-1 text-pretty text-sm text-secondary">
                {block.transactionRequests.length} exact Mezo Mainnet request
                {block.transactionRequests.length === 1 ? " is" : "s are"}{" "}
                encoded and simulated. Stuart cannot sign or submit them.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="button-primary"
                  disabled={
                    proposalDispatch.dispatching ||
                    !proposalDispatch.canDispatch
                  }
                  onClick={() => void proposalDispatch.dispatch()}
                  type="button"
                >
                  <CheckIcon className="size-4" />
                  {proposalDispatch.dispatching
                    ? "Waiting for confirmations"
                    : proposalDispatch.calls.some(
                          (call) => call.status === "failed",
                        )
                      ? "Retry failed call"
                      : "Confirm in wallet"}
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
              <ProposalCallStatus calls={proposalDispatch.calls} />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
