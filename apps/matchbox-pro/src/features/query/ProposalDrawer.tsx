import { useConnectDialog } from "@/app/ConnectDialog"
import { useNetwork } from "@/lib/network"
import { cn } from "@repo/ui/cn"
import * as Dialog from "@repo/ui/dialog"
import * as SigningSteps from "@repo/ui/signing-steps"
import { shortenAddress } from "@repo/ui/wallet-address"
import { Check, X } from "lucide-react"
import type { ReactElement, ReactNode } from "react"
import { useStuart } from "./StuartProvider"
import VoteReview from "./VoteReview"
import { diffReasons } from "./blocks/AllocationDiff"
import { CLAIM_SOURCE_COPY } from "./blocks/ClaimReview"
import { approvalsCopy, simulationCopy } from "./blocks/ZapRoute"
import type {
  ClaimReviewBlock,
  Proposal,
  ProposalRefreshResponse,
  RepayReviewBlock,
  UiBlock,
  ZapRouteBlock,
} from "./contract"
import {
  type BlockReason,
  blockCopy,
  dispatchOutcome,
  firstStoppedCall,
} from "./dispatch"
import { formatBlock, formatToken, formatUsd } from "./format"
import { DetailRow, largePrimary, largeSecondary } from "./parts"
import type { CallState } from "./session"

const EXPLORER =
  import.meta.env.VITE_EXPLORER_MAINNET_URL ?? "https://explorer.mezo.org"

type Kind = Proposal["kind"]

const NOUN: Record<Kind, string> = {
  repay: "Repayment",
  vote: "Vote",
  zap: "Deposit",
  earn_deposit: "Deposit",
  claim: "Claim",
  claim_surplus: "Claim",
}

const VERB: Record<Kind, string> = {
  repay: "repay",
  vote: "vote",
  zap: "deposit",
  earn_deposit: "deposit",
  claim: "claim",
  claim_surplus: "claim",
}

const CALL_VERB: Record<Proposal["calls"][number]["kind"], string> = {
  approve: "approval",
  vote: "vote",
  claim: "claim",
  deposit: "deposit",
  swap: "swap",
  repay: "repay",
}

const NOTE: Record<Kind, string> = {
  repay:
    "Repayment is not reversible once confirmed in the wallet. Collateral is not withdrawn.",
  claim: "Claims are final once confirmed in the wallet.",
  claim_surplus: "Claims are final once confirmed in the wallet.",
  zap: "Deposits can be withdrawn from the vault later.",
  earn_deposit: "Deposits can be withdrawn from the vault later.",
  vote: "One signature per lock. Ballots are independent.",
}

const BLOCKED_COPY: Record<NonNullable<Proposal["blockedReason"]>, string> = {
  connect_this_wallet: "Connect this wallet to sign.",
  insufficient_balance: "Balance is below the amount.",
  simulation_reverted: "Simulation reverted. Nothing to sign.",
  price_impact_too_high: "Price impact is above the limit.",
  oracle_stale: "BTC oracle is stale. Try again shortly.",
  exceeds_max_repay: "Above the max partial repay.",
  trove_not_active: "Trove is not active.",
  voting_window_closed: "Voting window is closed.",
  already_voted_this_epoch: "Already voted this epoch.",
  nothing_to_claim: "Nothing to claim.",
}

function isBlock<T extends UiBlock["type"]>(
  block: UiBlock,
  type: T,
): block is Extract<UiBlock, { type: T }> {
  return block.type === type
}

export function findBlock<T extends UiBlock["type"]>(
  blocks: readonly UiBlock[],
  type: T,
  proposalIds: readonly string[],
): Extract<UiBlock, { type: T }> | null {
  for (const block of blocks) {
    if (!isBlock(block, type)) continue
    const id = "proposalId" in block ? block.proposalId : null
    if (id === null || proposalIds.includes(id)) return block
  }
  return null
}

function stepStatus(call: CallState): SigningSteps.SigningStepStatus {
  switch (call.status) {
    case "mined":
      return "done"
    case "awaiting_wallet":
    case "submitted":
      return "active"
    case "reverted":
    case "rejected":
    case "failed":
      return "failed"
    case "not_sent":
      return "pending"
  }
}

function stepDetail(call: CallState): string | undefined {
  switch (call.status) {
    case "awaiting_wallet":
      return "Waiting for wallet"
    case "submitted":
      return "Your wallet sent it · confirming"
    case "mined":
      return undefined
    default:
      return call.error ?? undefined
  }
}

const STOP_WORD: Record<"reverted" | "rejected" | "failed", string> = {
  reverted: "reverted",
  rejected: "rejected",
  failed: "failed",
}

function stopWord(call: CallState | null): string {
  if (
    call?.status === "reverted" ||
    call?.status === "rejected" ||
    call?.status === "failed"
  ) {
    return STOP_WORD[call.status]
  }
  return "failed"
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function CallRow({
  call,
  only,
  failedIndex,
}: {
  call: CallState
  only: boolean
  failedIndex: number | null
}): ReactElement {
  const mined = call.status === "mined"
  const stopped =
    call.status === "reverted" ||
    call.status === "rejected" ||
    call.status === "failed"
  const meta = mined
    ? ["Mined", call.hash ? shortenAddress(call.hash) : null, "do not repeat"]
    : stopped
      ? [
          capitalize(stopWord(call)),
          only ? "Only call" : null,
          call.index === failedIndex
            ? only
              ? "retry this one"
              : "retry this call only"
            : null,
        ]
      : ["Not sent"]
  if (stopped && call.error && call.status !== "reverted") meta.push(call.error)
  return (
    <li className="flex items-center gap-2 py-2">
      <span
        aria-hidden="true"
        className={cn(
          "flex w-4 justify-center",
          mined ? "text-pos" : stopped ? "text-neg" : "text-muted",
        )}
      >
        {mined ? (
          <Check size={14} strokeWidth={2.5} />
        ) : stopped ? (
          <X size={14} strokeWidth={2.5} />
        ) : (
          "·"
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-body-sm text-ink">
          {call.index + 1} · {call.label}
        </span>
        <span className="text-caption text-muted">
          {mined && call.hash ? (
            <>
              Mined ·{" "}
              <a
                href={`${EXPLORER}/tx/${call.hash}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono hover:text-ink hover:underline"
              >
                {shortenAddress(call.hash)}
              </a>{" "}
              · do not repeat
            </>
          ) : (
            meta.filter(Boolean).join(" · ")
          )}
        </span>
      </span>
    </li>
  )
}

function GuardNotice({ reason }: { reason: BlockReason }): ReactElement {
  const { open } = useConnectDialog()
  const { switchNetwork, switchWalletToApp, isSwitching } = useNetwork()
  const action =
    reason === "disconnected" || reason === "watching" ? (
      <button type="button" className={largeSecondary} onClick={open}>
        Connect wallet
      </button>
    ) : reason === "testnet" ? (
      <button type="button" className={largeSecondary} onClick={switchNetwork}>
        Switch to mainnet
      </button>
    ) : reason === "wrong_network" ? (
      <button
        type="button"
        className={largeSecondary}
        disabled={isSwitching}
        onClick={() => void switchWalletToApp()}
      >
        {isSwitching ? "Switching…" : "Switch wallet to Mezo"}
      </button>
    ) : null
  return (
    <div className="flex flex-col gap-2 rounded-md bg-warn-soft p-2.5">
      <p className="m-0 text-label text-warn">{blockCopy(reason)}</p>
      {action}
    </div>
  )
}

/**
 * Right drawer for signing a Stuart proposal (frames 43 review, 44 failed,
 * 45 partial; bottom sheet on phones, M06–M08). Refreshes right before the
 * first wallet prompt; Matchbox never signs or sends on its own.
 */
export default function ProposalDrawer(): ReactElement | null {
  const { review, session } = useStuart()
  const state = review.state
  if (!state) return null
  const turn = session.turns.find((item) => item.id === state.turnId)
  const blocks = turn?.response?.uiBlocks ?? []
  const ids = [state.sourceProposalId, state.proposal.proposalId]
  const proposal = state.proposal
  const kind = proposal.kind
  const repay = findBlock(blocks, "repay_review", ids)
  const claim = findBlock(blocks, "claim_review", ids)
  const zap = findBlock(blocks, "zap_route", ids)
  const composer = findBlock(blocks, "vote_composer", ids)
  const calls = review.calls
  const outcome = dispatchOutcome(calls)
  const stopped = firstStoppedCall(calls)
  const guard = review.guardFor(proposal)
  const signing = state.phase === "signing" || outcome === "in_progress"
  const finished = state.phase === "done" || outcome === "success"

  const title =
    state.phase === "diff"
      ? "Changed before sign"
      : signing
        ? "Confirm in wallet"
        : outcome === "success"
          ? `${NOUN[kind]} confirmed`
          : outcome === "partial"
            ? "Partial success"
            : outcome === "failed"
              ? `${NOUN[kind]} failed`
              : (repay?.title ??
                (kind === "repay"
                  ? "Review repayment"
                  : `Review ${VERB[kind]}`))

  return (
    <Dialog.Root
      open={state.drawerOpen}
      onOpenChange={(next) => {
        if (!next) review.close()
      }}
    >
      <Dialog.Content
        placement="drawer"
        aria-describedby={undefined}
        onInteractOutside={(event) => {
          if (review.busy) event.preventDefault()
        }}
        onEscapeKeyDown={(event) => {
          if (review.busy) event.preventDefault()
        }}
      >
        <Dialog.Header>
          <Dialog.Title className="font-600">{title}</Dialog.Title>
        </Dialog.Header>

        <div className="flex flex-col gap-3 text-label">
          {outcome === "failed" && stopped && !signing ? (
            <div className="flex flex-col gap-1 rounded-md bg-warn-soft p-2.5">
              <p className="m-0 font-600 text-neg">Failed · not applied</p>
              <p className="m-0 text-secondary">
                {stopped.label}{" "}
                {stopped.status === "rejected"
                  ? "was rejected in the wallet."
                  : "reverted."}
              </p>
            </div>
          ) : null}
          {outcome === "partial" && !signing ? (
            <div className="flex flex-col gap-1 rounded-md bg-warn-soft p-2.5">
              <p className="m-0 font-600 text-warn">Partial · not atomic</p>
              <p className="m-0 text-secondary">
                {calls.filter((call) => call.status === "mined").length} of{" "}
                {calls.length} mined. Retry does not repeat them.
              </p>
            </div>
          ) : null}

          {signing ? (
            <SigningSteps.Root className="py-2">
              {calls.map((call) => (
                <SigningSteps.Step
                  key={call.index}
                  status={stepStatus(call)}
                  label={call.label}
                  detail={stepDetail(call)}
                />
              ))}
            </SigningSteps.Root>
          ) : calls.length > 0 && outcome !== "idle" ? (
            <ul className="m-0 list-none p-0" aria-live="polite">
              {calls.map((call) => (
                <CallRow
                  key={call.index}
                  call={call}
                  only={calls.length === 1}
                  failedIndex={stopped?.index ?? null}
                />
              ))}
            </ul>
          ) : null}

          {state.phase === "diff" && state.refresh ? (
            <Changes
              refresh={state.refresh}
              error={state.error}
              onAcknowledge={() => void review.acknowledge("new_optimum")}
              onCancel={review.close}
            />
          ) : (
            <Summary
              kind={kind}
              proposal={proposal}
              repay={repay}
              claim={claim}
              zap={zap}
              editable={composer?.editable ?? false}
              outcome={outcome}
              stopped={stopped}
              walletLabel={shortenAddress(proposal.from)}
            />
          )}

          {state.phase !== "diff" && !finished && !signing && !guard.ok ? (
            <GuardNotice reason={guard.reason} />
          ) : null}
          {state.phase !== "diff" &&
          !finished &&
          !signing &&
          guard.ok &&
          !proposal.canSign ? (
            <p className="m-0 rounded-md bg-warn-soft p-2.5 text-warn">
              {proposal.blockedReason
                ? BLOCKED_COPY[proposal.blockedReason]
                : "This proposal can't be signed."}
            </p>
          ) : null}
          {state.phase !== "diff" && state.error ? (
            <p className="m-0 text-neg" role="alert">
              {state.error}
            </p>
          ) : null}
        </div>

        {state.phase === "diff" ? null : (
          <Actions
            kind={kind}
            outcome={outcome}
            phase={state.phase}
            signing={signing}
            canSign={guard.ok && proposal.canSign}
            stopped={stopped}
            calls={calls}
            proposal={proposal}
            onSign={() => void review.sign()}
            onRetry={() => void review.retry()}
            onClose={review.close}
          />
        )}
      </Dialog.Content>
    </Dialog.Root>
  )
}

function Changes({
  refresh,
  error,
  onAcknowledge,
  onCancel,
}: {
  refresh: ProposalRefreshResponse
  error: string | null
  onAcknowledge: () => void
  onCancel: () => void
}): ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-body-sm text-warn" aria-live="polite">
        Refreshed at block {formatBlock(refresh.proposal.snapshotBlock)} ·{" "}
        {diffReasons(refresh.reasons)}
      </p>
      <dl className="m-0 flex flex-col">
        {refresh.changes.map((change) => (
          <DetailRow
            key={change.key}
            label={change.label}
            tone={change.material ? "warn" : "ink"}
          >
            {change.before} → {change.after}
          </DetailRow>
        ))}
      </dl>
      {error ? (
        <p className="m-0 text-neg" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          className={cn(largePrimary, "h-11 w-full")}
          onClick={onAcknowledge}
        >
          Acknowledge
        </button>
        <button
          type="button"
          className={cn(largeSecondary, "w-full")}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function primaryOf(
  proposal: Proposal,
  repay: RepayReviewBlock | null,
  zap: ZapRouteBlock | null,
): { label: string; amount: ReactNode } | null {
  const content = proposal.content
  switch (content.kind) {
    case "repay":
      return {
        label: "You repay",
        amount: formatToken(repay?.amount ?? content.amount),
      }
    case "zap":
      return {
        label: "You pay",
        amount: formatToken(proposal.quote?.amountIn ?? zap?.youPay ?? null),
      }
    case "earn_deposit":
      return { label: "You deposit", amount: formatToken(content.amount) }
    case "claim_surplus":
      return { label: "You claim", amount: formatToken(content.amount) }
    case "claim":
      return {
        label: "You claim",
        amount:
          content.totalUsd === null
            ? "Unpriced"
            : `${content.unpricedCount > 0 ? "≥ " : ""}${formatUsd(content.totalUsd)}`,
      }
    case "vote":
      return null
  }
}

function Summary({
  kind,
  proposal,
  repay,
  claim,
  zap,
  editable,
  outcome,
  stopped,
  walletLabel,
}: {
  kind: Kind
  proposal: Proposal
  repay: RepayReviewBlock | null
  claim: ClaimReviewBlock | null
  zap: ZapRouteBlock | null
  editable: boolean
  outcome: ReturnType<typeof dispatchOutcome>
  stopped: CallState | null
  walletLabel: string
}): ReactElement {
  const failed = outcome === "failed"
  const partial = outcome === "partial"
  const simulation = simulationCopy(proposal)
  const approvals = proposal.approvals
  const failedCall = stopped
    ? proposal.calls.find((call) => call.index === stopped.index)
    : undefined

  const kicker =
    kind === "repay"
      ? `Trove · ${walletLabel} · Mezo mainnet. Matchbox never signs.`
      : `${walletLabel} · Mezo mainnet. Matchbox never signs.`

  const primary = primaryOf(proposal, repay, zap)
  const primaryLabel = failed
    ? `Tried to ${VERB[kind]}`
    : partial
      ? `Still to ${VERB[kind]}`
      : (primary?.label ?? null)

  let warn: { text: string; tone: "warn" | "neg" } | null = null
  if (failed && stopped) {
    warn = {
      text:
        stopped.status === "rejected"
          ? "Rejected in the wallet. Nothing was sent."
          : stopped.status === "failed"
            ? `${stopped.label} failed before sending. Nothing left the wallet.`
            : `Reverted on ${stopped.label}. Nothing left the wallet.`,
      tone: "neg",
    }
  } else if (partial && stopped) {
    const mined = proposal.calls.filter(
      (call) => call.index !== stopped.index && call.index < stopped.index,
    )
    warn = {
      text: `${mined.map((call) => call.label).join(", ")} mined. ${
        failedCall?.label ?? stopped.label
      } ${stopWord(stopped)}. Calls were not atomic.`,
      tone: "warn",
    }
  } else if (approvals.length > 0) {
    warn = { text: "Exact amount. Unlimited approval is off.", tone: "warn" }
  } else if (kind === "repay") {
    warn = { text: "Exact amount. No approval needed.", tone: "warn" }
  }

  const atomic = proposal.calls.length <= 1 || proposal.atomicity === "single"
  const signatures = atomic
    ? failed
      ? "Wallet signed · chain reverted"
      : "1 · this call is atomic"
    : partial
      ? `${proposal.calls.length} independent · retry only ${
          failedCall ? CALL_VERB[failedCall.kind] : "the rest"
        }`
      : proposal.atomicity === "batchable"
        ? `${proposal.calls.length} · one if the wallet batches`
        : `${proposal.calls.length} independent`

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-muted">{kicker}</p>
      {proposal.content.kind === "vote" ? (
        <VoteReview
          id={proposal.proposalId}
          ballots={proposal.content.ballots}
          editable={editable}
        />
      ) : null}
      {primaryLabel && primary ? (
        <div className="flex flex-col gap-1">
          <p className="m-0 text-caption text-muted">{primaryLabel}</p>
          <p className="m-0 text-metric font-600 tabular-nums text-ink sm:text-title">
            {primary.amount}
          </p>
        </div>
      ) : null}
      {warn ? (
        <p
          className={cn("m-0", warn.tone === "neg" ? "text-neg" : "text-warn")}
        >
          {warn.text}
        </p>
      ) : null}
      {claim ? (
        <ul className="m-0 list-none p-0">
          {claim.rows.map((row) => (
            <li
              key={row.rowKey}
              className="flex items-baseline justify-between gap-3 border-b border-line py-2"
            >
              <span className="text-muted">
                {CLAIM_SOURCE_COPY[row.source]}
                {row.tokenId ? ` · #${row.tokenId}` : ""}
              </span>
              <span className="tabular-nums text-ink">
                {row.usd === null ? "Unpriced" : formatUsd(row.usd)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <dl className="m-0 flex flex-col">
        {repay?.effects.map((effect) => (
          <DetailRow key={effect.key} label={effect.label}>
            {failed || partial
              ? `${effect.before} · ${failed ? "unchanged" : "until it lands"}`
              : effect.unchanged || effect.after === null
                ? `${effect.before} · unchanged`
                : `${effect.before} → ${effect.after}`}
          </DetailRow>
        ))}
        {zap ? (
          <>
            <DetailRow label="Min received">
              {formatToken(proposal.quote?.minOut ?? zap.minReceived)}
              <span className="text-secondary"> · extra stays in wallet</span>
            </DetailRow>
            <DetailRow label="Vault shares" className="hidden sm:flex">
              {zap.shares ? formatToken(zap.shares) : "—"}
            </DetailRow>
          </>
        ) : null}
        <DetailRow label="Approval" className="hidden sm:flex">
          {approvalsCopy(approvals)}
        </DetailRow>
        <DetailRow
          label="Simulation"
          tone={failed || partial ? "neg" : simulation.tone}
        >
          {failed || partial
            ? partial && stopped
              ? `Call ${stopped.index + 1} ${stopWord(stopped)} · ${stopped.label}`
              : `${capitalize(stopWord(stopped))} · ${stopped?.label ?? ""}`
            : simulation.text}
        </DetailRow>
        <DetailRow label="Signatures" className="hidden sm:flex">
          {signatures}
        </DetailRow>
        <DetailRow label="Snapshot" className="hidden sm:flex">
          Block {formatBlock(proposal.snapshotBlock)} ·{" "}
          {proposal.calculationVersion}
        </DetailRow>
        <DetailRow label="Network" className="hidden sm:flex">
          Mezo mainnet
        </DetailRow>
      </dl>
      <p className="m-0 text-secondary">
        {failed
          ? "Nothing changed on-chain. Retry sends the same exact call."
          : partial
            ? "Mined calls are not repeated. Retry sends only the rest."
            : NOTE[kind]}
      </p>
    </div>
  )
}

function Actions({
  kind,
  outcome,
  phase,
  signing,
  canSign,
  stopped,
  calls,
  proposal,
  onSign,
  onRetry,
  onClose,
}: {
  kind: Kind
  outcome: ReturnType<typeof dispatchOutcome>
  phase: string
  signing: boolean
  canSign: boolean
  stopped: CallState | null
  calls: readonly CallState[]
  proposal: Proposal
  onSign: () => void
  onRetry: () => void
  onClose: () => void
}): ReactElement {
  const refreshing = phase === "refreshing"
  let primary: ReactNode = null
  let secondary = "Cancel"
  if (outcome === "success") {
    secondary = "Close"
  } else if (outcome === "failed" || outcome === "partial") {
    const call = stopped
      ? proposal.calls.find((item) => item.index === stopped.index)
      : undefined
    const verb = call ? CALL_VERB[call.kind] : VERB[kind]
    primary = (
      <button
        type="button"
        className={cn(largePrimary, "h-11 w-full")}
        onClick={onRetry}
        disabled={!canSign}
      >
        {outcome === "partial" ? `Retry ${verb} only` : `Retry ${verb}`}
      </button>
    )
    const approvalMined = calls.some(
      (item) =>
        item.status === "mined" &&
        proposal.calls.find((c) => c.index === item.index)?.kind === "approve",
    )
    secondary =
      outcome === "partial" && approvalMined
        ? "Leave approval in place"
        : "Close"
  } else if (!signing) {
    primary = (
      <button
        type="button"
        className={cn(largePrimary, "h-11 w-full")}
        onClick={onSign}
        disabled={!canSign || refreshing}
        aria-busy={refreshing || undefined}
      >
        {refreshing ? "Refreshing…" : `Review & ${VERB[kind]}`}
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-2 pt-1">
      {primary}
      {signing ? null : (
        <button
          type="button"
          className={cn(largeSecondary, "w-full")}
          onClick={onClose}
        >
          {secondary}
        </button>
      )}
      {outcome === "success" ? (
        <output className="text-center text-label text-pos">
          {calls.length} of {calls.length} confirmed by your wallet
        </output>
      ) : null}
    </div>
  )
}
