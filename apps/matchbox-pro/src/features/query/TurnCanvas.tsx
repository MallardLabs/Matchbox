import { TABLET_UP_QUERY, useMediaQuery } from "@/hooks/useMediaQuery"
import { cn } from "@repo/ui/cn"
import * as Skeleton from "@repo/ui/skeleton"
import { shortenAddress } from "@repo/ui/wallet-address"
import { Link, useNavigate } from "@tanstack/react-router"
import { Check, LoaderCircle } from "lucide-react"
import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import { findBlock } from "./ProposalDrawer"
import { type AskOptions, useStuart } from "./StuartProvider"
import { type AnswerAction, answerActions, visibleFollowups } from "./actions"
import { AllocationDiff } from "./blocks/AllocationDiff"
import { BridgeRecords } from "./blocks/BridgeRecords"
import { ClaimReview } from "./blocks/ClaimReview"
import { Clarification } from "./blocks/Clarification"
import { GaugeExplain } from "./blocks/GaugeExplain"
import { LoanPosition, ScenarioModel } from "./blocks/LoanBlocks"
import {
  GaugeRanking,
  MetricSummary,
  VoteBallots,
} from "./blocks/RankingBlocks"
import { SupportReport } from "./blocks/SupportReport"
import { ZapRoute } from "./blocks/ZapRoute"
import type {
  ActivityTraceBlock,
  ClarificationCardBlock,
  Proposal,
  StuartResponse,
  UiBlock,
} from "./contract"
import {
  CanvasHeader,
  Composer,
  SourceChips,
  WhyPanel,
  WhyToggle,
  largePrimary,
  largeSecondary,
  primaryAction,
  secondaryAction,
} from "./parts"
import type { StuartTurn } from "./session"
import useNow from "./useNow"

const RICH_BLOCKS = new Set<UiBlock["type"]>([
  "metric_summary",
  "gauge_ranking",
  "loan_position",
  "liquidation_scenario",
  "claim_review",
  "zap_route",
  "support_report_preview",
  "clarification_card",
  "bridge_records",
])

const COMPOSER_PLACEHOLDER = "Ask a follow-up, or type a gauge, lock, or epoch…"

export function walletKicker(response: StuartResponse | null): string {
  if (!response) return "Query"
  const { wallet, snapshot } = response
  const zero = /^0x0{40}$/i.test(wallet.address)
  const parts = ["Query"]
  parts.push(
    zero ? "no wallet" : `${wallet.mode} ${shortenAddress(wallet.address)}`,
  )
  if (snapshot.epoch !== null) parts.push(`epoch ${snapshot.epoch}`)
  else if (snapshot.label) parts.push(snapshot.label)
  return parts.join(" · ")
}

function pendingKicker(viewerLabel: string): string {
  return `Query · ${viewerLabel}`
}

/** Compact trace while waiting: only what this browser knows to be true. */
function PendingTrace({
  turn,
  viewerLabel,
}: {
  turn: StuartTurn
  viewerLabel: string
}): ReactElement {
  const now = useNow(true)
  const seconds = Math.max(0, Math.floor((now - turn.askedAt) / 1000))
  return (
    <ol
      aria-label="Activity"
      className="m-0 flex list-none flex-col gap-1.5 p-0 text-label text-secondary"
    >
      <li className="flex items-center gap-2">
        <Check
          aria-hidden="true"
          size={13}
          strokeWidth={2.5}
          className="text-pos"
        />
        Question sent
      </li>
      <li className="flex items-center gap-2">
        <Check
          aria-hidden="true"
          size={13}
          strokeWidth={2.5}
          className="text-pos"
        />
        {viewerLabel}
      </li>
      <li className="flex items-center gap-2 text-ink">
        <LoaderCircle
          aria-hidden="true"
          size={13}
          strokeWidth={2}
          className="animate-spin text-muted motion-reduce:animate-none"
        />
        Running Matchbox tools
        <span className="tabular-nums text-muted">{seconds}s</span>
      </li>
    </ol>
  )
}

function FinishedTrace({
  block,
}: {
  block: ActivityTraceBlock
}): ReactElement | null {
  const items = block.items
  if (items.length === 0) return null
  const total = items.reduce((sum, item) => sum + (item.durationMs ?? 0), 0)
  return (
    <details className="group text-label text-muted">
      <summary className="w-fit cursor-pointer list-none hover:text-ink [&::-webkit-details-marker]:hidden">
        Checked · {items.length} {items.length === 1 ? "step" : "steps"}
        {total > 0 ? ` · ${(total / 1000).toFixed(1)}s` : ""}
        <span aria-hidden="true" className="pl-1 group-open:hidden">
          +
        </span>
      </summary>
      <ol className="m-0 mt-1.5 flex list-none flex-col gap-1 p-0">
        {items.map((item) => (
          <li key={item.id} className="flex gap-2">
            <span
              className={cn(
                item.status === "ok" && "text-pos",
                item.status === "error" && "text-neg",
              )}
              aria-hidden="true"
            >
              {item.status === "ok" ? "✓" : item.status === "error" ? "✕" : "–"}
            </span>
            <span className="text-secondary">
              {item.label}
              {item.detail ? ` · ${item.detail}` : ""}
            </span>
          </li>
        ))}
      </ol>
    </details>
  )
}

export function viewerSummary(
  mode: "disconnected" | "connected" | "watching",
  address: string | undefined,
): string {
  if (mode === "disconnected" || !address) return "No wallet · read-only"
  return `${mode === "connected" ? "Connected" : "Watching"} ${shortenAddress(address)}`
}

type CanvasProps = {
  turn: StuartTurn | null
  viewerLabel: string
  onAsk: (text: string, options?: Partial<AskOptions>) => void
}

/** Frame 32 and its siblings (36–41): one answer, full width. */
export default function TurnCanvas({
  turn,
  viewerLabel,
  onAsk,
}: CanvasProps): ReactElement {
  const { review, retryTurn } = useStuart()
  const wide = useMediaQuery(TABLET_UP_QUERY)
  const titleId = useId()
  const diff =
    turn &&
    review.state?.phase === "diff" &&
    review.state.turnId === turn.id &&
    review.state.proposal.kind === "vote" &&
    !review.state.drawerOpen &&
    review.state.refresh
      ? review.state
      : null

  const composer = (
    <Composer
      label="Ask Stuart"
      placeholder={
        !turn ? "Ask Stuart…" : wide ? COMPOSER_PLACEHOLDER : "Follow up…"
      }
      onSubmit={(text) => onAsk(text, { surface: "composer" })}
    />
  )

  if (diff?.refresh?.diff) {
    return (
      <article aria-labelledby={titleId} className="flex flex-col gap-4">
        <CanvasHeader
          titleId={titleId}
          kicker="Query · pre-sign refresh"
          title="Recommendation changed before sign"
        />
        <AllocationDiff
          diff={diff.refresh.diff}
          error={diff.error}
          actions={
            <>
              <button
                type="button"
                className={largePrimary}
                disabled={diff.phase !== "diff"}
                onClick={() => void review.acknowledge("new_optimum")}
              >
                Acknowledge new optimum
              </button>
              <button
                type="button"
                className={largeSecondary}
                disabled={diff.phase !== "diff"}
                onClick={() => void review.acknowledge("keep_mine")}
              >
                Keep my allocation
              </button>
            </>
          }
        />
        {composer}
      </article>
    )
  }

  if (!turn) {
    return (
      <article aria-labelledby={titleId} className="flex flex-col gap-4">
        <CanvasHeader titleId={titleId} kicker="Query" title="Ask Stuart" />
        {composer}
      </article>
    )
  }

  if (turn.status === "pending") {
    return (
      <article
        aria-labelledby={titleId}
        aria-busy="true"
        className="flex flex-col gap-4"
      >
        <CanvasHeader
          titleId={titleId}
          kicker={pendingKicker(viewerLabel)}
          title={turn.query}
        />
        <PendingTrace turn={turn} viewerLabel={viewerLabel} />
        <div className="flex flex-col gap-3 border-b border-line py-4">
          <Skeleton.Root className="w-28" />
          <Skeleton.Root shape="block" className="h-8 w-64 max-w-full" />
          <Skeleton.Root className="w-3/4" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton.Root className="w-full" />
          <Skeleton.Root className="w-full" />
          <Skeleton.Root className="w-2/3" />
        </div>
        {composer}
      </article>
    )
  }

  if (turn.status === "error" || !turn.response) {
    return (
      <article aria-labelledby={titleId} className="flex flex-col gap-4">
        <CanvasHeader
          titleId={titleId}
          kicker={pendingKicker(viewerLabel)}
          title={turn.query}
        />
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="m-0 text-body-sm text-neg">
            {turn.error?.message ?? "No answer."}
          </p>
          <button
            type="button"
            className={secondaryAction}
            onClick={() => retryTurn(turn.id)}
          >
            Retry
          </button>
        </div>
        {composer}
      </article>
    )
  }

  return (
    <Answer
      turn={turn}
      response={turn.response}
      titleId={titleId}
      composer={composer}
      onAsk={onAsk}
    />
  )
}

function Answer({
  turn,
  response,
  titleId,
  composer,
  onAsk,
}: {
  turn: StuartTurn
  response: StuartResponse
  titleId: string
  composer: ReactNode
  onAsk: CanvasProps["onAsk"]
}): ReactElement {
  const { review, session, markReport } = useStuart()
  const navigate = useNavigate()
  const [whyOpen, setWhyOpen] = useState(false)
  const [cancelled, setCancelled] = useState<ReadonlySet<string>>(new Set())
  const whyId = useId()
  const blocks = response.uiBlocks
  const evidence = response.evidence
  const proposals = response.proposedActions
  const proposalFor = (id: string | null): Proposal | null =>
    id === null
      ? null
      : (review.latest[id] ??
        proposals.find((proposal) => proposal.proposalId === id) ??
        null)
  const showText = !blocks.some((block) => RICH_BLOCKS.has(block.type))
  const later = session.turns.filter((item) => item.askedAt > turn.askedAt)

  // Frame 43: a repayment answer opens its review drawer once.
  const autoOpened = useRef<string | null>(null)
  useEffect(() => {
    if (autoOpened.current === response.responseId) return
    autoOpened.current = response.responseId
    const tx = blocks.find((block) => block.type === "repay_review")
    if (!tx || tx.type !== "repay_review") return
    const proposal = proposals.find((item) => item.proposalId === tx.proposalId)
    if (proposal && !review.state) review.open(turn.id, proposal)
  }, [blocks, proposals, response.responseId, review, turn.id])

  function chosenOption(cardId: string): string | null {
    const answer = later.find((item) => item.clarification?.cardId === cardId)
    return answer?.clarification?.optionId ?? null
  }

  const actions = answerActions({
    blocks,
    proposals,
    proposalFor,
    cancelled,
    hasWhy: response.why !== null,
    now: Date.now(),
  })
  const followups = visibleFollowups(response.followups, actions)

  function run(action: AnswerAction): void {
    switch (action.kind) {
      case "review":
        review.open(
          turn.id,
          action.proposal,
          action.edit ? { edit: true } : undefined,
        )
        return
      case "ask":
        onAsk(action.query, { surface: "canvas" })
        return
      case "navigate":
        void navigate({ to: action.to })
        return
      case "requote":
        void review.requote(turn.id, action.proposal)
        return
      case "cancel_quote":
        setCancelled((current) => new Set(current).add(action.proposalId))
        return
      case "why":
        setWhyOpen((open) => !open)
        return
      case "note":
        return
    }
  }

  return (
    <article aria-labelledby={titleId} className="flex flex-col gap-4">
      <CanvasHeader
        titleId={titleId}
        kicker={walletKicker(response)}
        title={response.title || turn.query}
        aside={
          response.why ? (
            <WhyToggle
              expanded={whyOpen}
              controls={whyId}
              onToggle={() => setWhyOpen((open) => !open)}
            />
          ) : null
        }
      />
      {whyOpen && response.why ? (
        <WhyPanel id={whyId} items={response.why.items} />
      ) : null}
      {response.service.notice ? (
        <p className="m-0 text-label text-warn">{response.service.notice}</p>
      ) : null}
      {showText ? (
        <p className="m-0 max-w-[72ch] text-lead font-500 text-ink">
          {response.answer.text}
        </p>
      ) : null}

      {blocks.map((block) => (
        <BlockView
          key={block.id}
          block={block}
          response={response}
          proposalFor={proposalFor}
          chosen={
            block.type === "clarification_card"
              ? chosenOption(block.cardId)
              : null
          }
          onChoose={(cardId, optionId) =>
            onAsk(turn.query, {
              surface: "canvas",
              clarification: { cardId, optionId },
              followUp: false,
            })
          }
          reportStatus={
            block.type === "support_report_preview"
              ? session.reports[block.draft.draftId]
              : undefined
          }
          onReportStatus={markReport}
          onSlippage={async (proposal, bps) =>
            review.requote(turn.id, proposal, bps)
          }
        />
      ))}

      <SourceChips evidence={evidence} />
      {actions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((action) =>
            action.kind === "note" ? (
              <p key={action.key} className="m-0 text-label text-muted">
                {action.label}
              </p>
            ) : (
              <button
                key={action.key}
                type="button"
                className={
                  action.tone === "primary"
                    ? cn(
                        primaryAction,
                        "h-10 w-full rounded-lg sm:h-9 sm:w-auto sm:rounded-md",
                      )
                    : action.tone === "secondary"
                      ? cn(secondaryAction, "hidden sm:inline-flex")
                      : secondaryAction
                }
                aria-expanded={action.kind === "why" ? whyOpen : undefined}
                aria-controls={action.kind === "why" ? whyId : undefined}
                onClick={() => run(action)}
              >
                {action.label}
              </button>
            ),
          )}
        </div>
      ) : null}
      {followups.length > 0 ? (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {followups.map((followup) => (
            <li key={followup.id}>
              {followup.action.kind === "navigate" ? (
                <Link
                  to={followup.action.to}
                  className="inline-flex h-7 items-center rounded-md bg-inset px-2.5 text-label text-ink-2 hover:text-ink"
                >
                  {followup.label}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const action = followup.action
                    if (action.kind === "query") {
                      onAsk(action.query, { surface: "canvas" })
                    } else if (action.kind === "clarification") {
                      onAsk(turn.query, {
                        surface: "canvas",
                        clarification: {
                          cardId: action.cardId,
                          optionId: action.optionId,
                        },
                        followUp: false,
                      })
                    }
                  }}
                  className="inline-flex h-7 items-center rounded-md bg-inset px-2.5 text-label text-ink-2 hover:text-ink"
                >
                  {followup.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {composer}
      {blocks.map((block) =>
        block.type === "activity_trace" ? (
          <FinishedTrace key={block.id} block={block} />
        ) : null,
      )}
    </article>
  )
}

function BlockView({
  block,
  response,
  proposalFor,
  chosen,
  onChoose,
  reportStatus,
  onReportStatus,
  onSlippage,
}: {
  block: UiBlock
  response: StuartResponse
  proposalFor: (id: string | null) => Proposal | null
  chosen: string | null
  onChoose: (cardId: ClarificationCardBlock["cardId"], optionId: string) => void
  reportStatus: string | undefined
  onReportStatus: (draftId: string, value: string) => void
  onSlippage: (proposal: Proposal, bps: number) => Promise<string | null>
}): ReactElement | null {
  switch (block.type) {
    case "metric_summary":
      return <MetricSummary block={block} />
    case "gauge_ranking":
      return <GaugeRanking block={block} />
    case "vote_composer":
      return findBlock(response.uiBlocks, "gauge_ranking", [
        block.proposalId,
      ]) ? null : (
        <VoteBallots block={block} />
      )
    case "loan_position":
      return <LoanPosition block={block} evidence={response.evidence} />
    case "liquidation_scenario":
      return <ScenarioModel block={block} />
    case "zap_route": {
      const proposal = proposalFor(block.proposalId)
      return (
        <ZapRoute
          block={block}
          proposal={proposal}
          onSlippage={proposal ? (bps) => onSlippage(proposal, bps) : null}
        />
      )
    }
    case "support_report_preview":
      return (
        <SupportReport
          block={block}
          status={reportStatus}
          onStatus={(value) => onReportStatus(block.draft.draftId, value)}
        />
      )
    case "clarification_card":
      return (
        <Clarification
          block={block}
          chosen={chosen}
          disabled={chosen !== null}
          promptVisible={block.prompt !== response.title}
          onChoose={(optionId) => onChoose(block.cardId, optionId)}
        />
      )
    case "bridge_records":
      return <BridgeRecords block={block} />
    case "gauge_explain":
      return <GaugeExplain block={block} />
    case "allocation_diff":
      return <AllocationDiff diff={block} actions={null} />
    case "claim_review":
      // A surplus claim under its loan is already stated by the loan block.
      return block.rows.every((row) => row.source === "collateral_surplus") &&
        response.uiBlocks.some(
          (item) => item.type === "loan_position",
        ) ? null : (
        <ClaimReview block={block} />
      )
    case "source_cluster":
    case "repay_review":
    case "activity_trace":
      return null
    default: {
      // A block type this build doesn't know renders nothing.
      const unknown: never = block
      return unknown
    }
  }
}
