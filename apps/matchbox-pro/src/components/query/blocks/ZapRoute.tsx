import {
  ArrowRightIcon,
  BoltIcon,
  CheckIcon,
  ShieldIcon,
} from "@/components/ui/Icons"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { TokenMark } from "@/components/ui/TokenMark"
import { refreshProposal as refreshPreparedProposal } from "@/lib/query/client"
import type { QueryBlock, WalletContext } from "@/lib/query/contracts"
import { useProposalDispatch } from "@/lib/wallet/useProposalDispatch"
import { useState } from "react"
import { AllocationDiff } from "./AllocationDiff"
import { ProposalCallStatus } from "./ProposalCallStatus"

type ZapBlock = Extract<QueryBlock, { type: "zap_route" }>

export function ZapRoute({
  block,
  wallet,
}: {
  block: ZapBlock
  wallet: WalletContext
}): JSX.Element {
  const [reviewing, setReviewing] = useState(false)
  const actionable = block.canSign && block.transactionRequests.length > 0
  const proposalDispatch = useProposalDispatch({
    wallet,
    requests: block.transactionRequests,
    refresh: async () => {
      const refreshed = await refreshPreparedProposal({
        kind: "savings",
        address: wallet.address,
        walletMode: wallet.mode,
        proposal: block,
      })
      if (refreshed.kind !== "savings") {
        throw new Error("Stuart returned the wrong refreshed proposal type")
      }
      if (!refreshed.proposal.canSign) {
        throw new Error(
          refreshed.proposal.simulation.reason ??
            "The refreshed deposit is not safe to sign",
        )
      }
      return {
        requests: refreshed.proposal.transactionRequests,
        diff: { type: "allocation_diff", ...refreshed.diff },
      }
    },
  })
  const readOnly = block.status === "read-only" || wallet.mode !== "connected"

  return (
    <section
      aria-labelledby="zap-route-title"
      className="border-t border-line pt-5"
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-medium uppercase text-positive">
            Verified Earn route
          </p>
          <h2
            className="text-balance text-lg font-medium text-ink"
            id="zap-route-title"
          >
            {block.fundingAsset} → {block.vault}
          </h2>
        </div>
        <StatusBadge status={block.status} />
      </div>

      <div className="grid overflow-hidden rounded-lg border border-line bg-panel lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,.8fr)]">
        <div className="border-b border-line p-5 lg:border-b-0 lg:border-r">
          <div className="mb-5 flex items-center gap-3">
            <TokenMark token={block.fundingAsset} />
            <div>
              <p className="font-mono text-2xl font-medium tabular-nums text-ink">
                {block.amount} {block.fundingAsset}
              </p>
              <p className="text-xs text-muted">
                {block.vaultAddress ?? "No approved vault address"}
              </p>
            </div>
          </div>

          <ol>
            {block.route.map((step, index) => (
              <li
                className="relative flex gap-3 pb-5 last:pb-0"
                key={`${step.label}-${index}`}
              >
                {index < block.route.length - 1 && (
                  <span className="absolute left-[15px] top-8 h-[calc(100%-24px)] w-px bg-line" />
                )}
                <span className="z-10 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-raised font-mono text-xs text-secondary">
                  {index + 1}
                </span>
                <div className="pt-0.5">
                  <p className="text-xs text-muted">{step.label}</p>
                  <p className="mt-0.5 text-sm font-medium text-ink">
                    {step.value}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-col justify-between p-5">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Wallet balance</dt>
              <dd className="font-mono tabular-nums text-ink">
                {block.balance ?? "Not checked"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Current allowance</dt>
              <dd className="font-mono tabular-nums text-ink">
                {block.allowance ?? "Not checked"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Unsigned calls</dt>
              <dd className="font-mono tabular-nums text-ink">
                {block.transactionRequests.length}
              </dd>
            </div>
            <div className="border-t border-line pt-3">
              <dt className="text-muted">Safety result</dt>
              <dd className="mt-1 text-pretty text-sm text-secondary">
                {block.simulation.reason ?? block.notice}
              </dd>
            </div>
          </dl>

          <button
            className="button-primary mt-6 w-full"
            disabled={!actionable}
            onClick={() => {
              setReviewing(true)
            }}
            type="button"
          >
            <BoltIcon className="size-4" />
            {readOnly
              ? "Connect this wallet to continue"
              : actionable
                ? "Review & deposit"
                : "No executable route"}
            <ArrowRightIcon className="size-4" />
          </button>
        </div>
      </div>

      {reviewing && (
        <div className="mt-4 border-l-2 border-accent bg-accent-soft p-4">
          <div className="flex items-start gap-3">
            <ShieldIcon className="mt-0.5 size-5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium text-ink">
                Review {block.transactionRequests.length} exact call
                {block.transactionRequests.length === 1 ? "" : "s"}
              </h3>
              <p className="mt-1 text-pretty text-sm text-secondary">
                {block.notice} Every call remains unsigned and requires your
                confirmation.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="button-primary"
                  disabled={
                    proposalDispatch.dispatching ||
                    !proposalDispatch.canDispatch
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
                        : "Confirm in wallet"}
                </button>
                <button
                  className="button-ghost"
                  onClick={() => setReviewing(false)}
                  type="button"
                >
                  Back to route
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
              <ProposalCallStatus calls={proposalDispatch.calls} />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
