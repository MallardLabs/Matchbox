import type { Followup, Proposal, UiBlock } from "./contract"
import { secondsUntil } from "./format"

// The action row under an answer (frames 32, 36, 40, 41), derived from the
// trusted blocks and proposals. Pure, so ordering and de-duplication against
// follow-ups are testable.

type Base = {
  key: string
  label: string
  /** "secondary" buttons drop out on phones (M04 shows the primary only). */
  tone: "primary" | "secondary" | "secondary-always"
}

export type AnswerAction =
  | (Base & { kind: "review"; proposal: Proposal; edit: boolean })
  | (Base & { kind: "ask"; query: string })
  | (Base & { kind: "navigate"; to: string })
  | (Base & { kind: "requote"; proposal: Proposal })
  | (Base & { kind: "cancel_quote"; proposalId: string })
  | (Base & { kind: "why" })
  | (Base & { kind: "note" })

type Input = {
  blocks: readonly UiBlock[]
  proposals: readonly Proposal[]
  /** Latest (refreshed) proposal for an id from the answer. */
  proposalFor: (id: string | null) => Proposal | null
  cancelled: ReadonlySet<string>
  hasWhy: boolean
  now: number
}

export function answerActions(input: Input): AnswerAction[] {
  const out: AnswerAction[] = []
  const repay = input.proposals.find((proposal) => proposal.kind === "repay")
  const surplus = input.proposals.find(
    (proposal) => proposal.kind === "claim_surplus",
  )
  const repayAction = (key: string, tone: Base["tone"]): AnswerAction =>
    repay
      ? {
          key,
          label: "Review repayment",
          tone,
          kind: "review",
          proposal: repay,
          edit: false,
        }
      : {
          key,
          label: "Review repayment",
          tone,
          kind: "ask",
          query: "Repay my mUSD trove",
        }

  for (const block of input.blocks) {
    switch (block.type) {
      case "gauge_ranking": {
        const proposal = input.proposalFor(block.proposalId)
        if (proposal && block.actions.includes("review_vote")) {
          out.push({
            key: `${block.id}-review`,
            label: "Review vote",
            tone: "primary",
            kind: "review",
            proposal,
            edit: false,
          })
        }
        if (proposal && block.actions.includes("edit_allocation")) {
          out.push({
            key: `${block.id}-edit`,
            label: "Edit allocation",
            tone: "secondary",
            kind: "review",
            proposal,
            edit: true,
          })
        }
        if (block.actions.includes("open_vote_page")) {
          out.push({
            key: `${block.id}-vote`,
            label: "Open Vote",
            tone: "secondary",
            kind: "navigate",
            to: "/vote",
          })
        }
        break
      }
      case "vote_composer": {
        const ranked = input.blocks.some(
          (item) =>
            item.type === "gauge_ranking" &&
            item.proposalId === block.proposalId,
        )
        const proposal = input.proposalFor(block.proposalId)
        if (!ranked && proposal) {
          out.push({
            key: `${block.id}-review`,
            label: "Review vote",
            tone: "primary",
            kind: "review",
            proposal,
            edit: false,
          })
        }
        break
      }
      case "loan_position": {
        const claimable = block.actions.includes("claim_collateral_surplus")
        if (claimable) {
          out.push(
            surplus
              ? {
                  key: `${block.id}-surplus`,
                  label: "Claim BTC surplus",
                  tone: "primary",
                  kind: "review",
                  proposal: surplus,
                  edit: false,
                }
              : {
                  key: `${block.id}-surplus`,
                  label: "Claim BTC surplus",
                  tone: "primary",
                  kind: "ask",
                  query: "Claim my collateral surplus",
                },
          )
        }
        if (block.actions.includes("review_repayment")) {
          out.push(
            repayAction(
              `${block.id}-repay`,
              claimable ? "secondary" : "primary",
            ),
          )
        }
        if (block.actions.includes("run_scenario")) {
          out.push({
            key: `${block.id}-scenario`,
            label: "Run price scenario",
            tone: "secondary",
            kind: "ask",
            query: "Run a BTC price scenario on my trove",
          })
        }
        break
      }
      case "liquidation_scenario": {
        out.push(repayAction(`${block.id}-repay`, "primary"))
        if (input.hasWhy) {
          out.push({
            key: `${block.id}-why`,
            label: "Why?",
            tone: "secondary",
            kind: "why",
          })
        }
        break
      }
      case "zap_route": {
        const proposal = input.proposalFor(block.proposalId)
        if (
          !proposal ||
          block.status === "unavailable" ||
          block.status === "blocked"
        ) {
          break
        }
        if (input.cancelled.has(proposal.proposalId)) {
          out.push({
            key: `${block.id}-cancelled`,
            label: "Quote cancelled",
            tone: "secondary-always",
            kind: "note",
          })
          break
        }
        const expired =
          block.status === "expired" ||
          secondsUntil(
            proposal.quote?.expiresAt ?? proposal.expiresAt,
            input.now,
          ) === 0
        out.push(
          expired
            ? {
                key: `${block.id}-requote`,
                label: "Refresh quote",
                tone: "primary",
                kind: "requote",
                proposal,
              }
            : {
                key: `${block.id}-review`,
                label: "Review & deposit",
                tone: "primary",
                kind: "review",
                proposal,
                edit: false,
              },
          {
            key: `${block.id}-cancel`,
            label: "Cancel quote",
            tone: "secondary-always",
            kind: "cancel_quote",
            proposalId: proposal.proposalId,
          },
        )
        break
      }
      case "claim_review": {
        const proposal = input.proposalFor(block.proposalId)
        const surplusOfLoan =
          proposal?.kind === "claim_surplus" &&
          input.blocks.some(
            (item) =>
              item.type === "loan_position" &&
              item.actions.includes("claim_collateral_surplus"),
          )
        if (proposal && !surplusOfLoan) {
          out.push({
            key: `${block.id}-review`,
            label: "Review claim",
            tone: "primary",
            kind: "review",
            proposal,
            edit: false,
          })
        }
        break
      }
      default:
        break
    }
  }
  return out
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ")
}

/** Follow-ups never repeat an action already on screen (same label or page). */
export function visibleFollowups(
  followups: readonly Followup[],
  actions: readonly AnswerAction[],
): Followup[] {
  const labels = new Set(actions.map((action) => normalize(action.label)))
  const pages = new Set(
    actions.flatMap((action) =>
      action.kind === "navigate" ? [action.to] : [],
    ),
  )
  return followups.filter((followup) => {
    if (labels.has(normalize(followup.label))) return false
    if (followup.action.kind === "navigate") {
      const path = followup.action.to.split("?")[0] ?? ""
      if (pages.has(path)) return false
    }
    return true
  })
}
