import { z } from "zod"
import type {
  SupportReportDraft,
  SupportReportItem,
} from "../../../features/query/contract"
import { canonicalJson, hmacHex } from "../crypto"
import { clipName, shortAddress } from "../format"
import { type ToolOutcome, makeEvidence, traceItem } from "../outcome"
import {
  CLAIM_CALC_VERSION,
  LOAN_CALC_VERSION,
  OPTIMIZER_CALC_VERSION,
  ZAP_CALC_VERSION,
} from "../versions"
import { ZERO_WALLET } from "./common"
import { defineTool } from "./tool"

const reportKindSchema = z.enum([
  "claim",
  "vote",
  "loan",
  "zap",
  "bridge",
  "data",
  "other",
])

export function draftTokenMessage(
  draft: Omit<SupportReportDraft, "draftToken">,
): string {
  return `support-draft|${canonicalJson(draft)}`
}

function guessKind(text: string): SupportReportDraft["kind"] {
  const lower = text.toLowerCase()
  if (/\bclaim/.test(lower)) return "claim"
  if (/\bvot/.test(lower)) return "vote"
  if (/\b(trove|loan|repay|liquidat)/.test(lower)) return "loan"
  if (/\b(zap|vault|savings|deposit|swap)/.test(lower)) return "zap"
  if (/\b(bridge|wormhole)/.test(lower)) return "bridge"
  if (/\b(wrong|missing|stale|data|number)/.test(lower)) return "data"
  return "other"
}

export const draftSupportReportTool = defineTool({
  name: "draft_support_report",
  family: "support",
  description:
    "Draft a support report preview when Stuart cannot reconcile or answer an issue. Nothing is sent: the user reviews, edits and presses Submit report.",
  input: z.object({
    problem: z.string().min(1).max(2_000).describe("The user's own words."),
    kind: reportKindSchema.nullable(),
  }),
  async run(context, input) {
    const { scope, wallet } = context
    const items: SupportReportItem[] = [
      {
        itemId: "message",
        kind: "message",
        label: "This message",
        value: context.query.slice(0, 400),
        removable: true,
      },
    ]
    if (wallet.address !== ZERO_WALLET) {
      items.push({
        itemId: "wallet",
        kind: "wallet",
        label: `Wallet ${shortAddress(wallet.address)} · Mezo mainnet`,
        value: wallet.address,
        removable: true,
      })
    }
    items.push({
      itemId: "versions",
      kind: "indexer_status",
      label: `Calc versions · optimizer ${OPTIMIZER_CALC_VERSION} · loans ${LOAN_CALC_VERSION}`,
      value: `optimizer=${OPTIMIZER_CALC_VERSION};loans=${LOAN_CALC_VERSION};zap=${ZAP_CALC_VERSION};claims=${CLAIM_CALC_VERSION}`,
      removable: true,
    })
    const unsigned: Omit<SupportReportDraft, "draftToken"> = {
      draftId: `draft_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      createdAt: context.now().toISOString(),
      chainId: 31_612,
      kind: input.kind ?? guessKind(input.problem),
      title: clipName(input.problem, 120),
      problemStatement: input.problem.slice(0, 2_000),
      included: items,
    }
    const draft: SupportReportDraft = {
      ...unsigned,
      draftToken: await hmacHex(context.secret, draftTokenMessage(unsigned)),
    }
    return {
      tool: "draft_support_report",
      intent: "support_report",
      status: "ok",
      title: draft.title,
      snapshot: {
        blockNumber: null,
        epoch: null,
        label: "Support report preview · nothing sent yet",
      },
      answer: {
        kind: "result",
        templateId: "draft_support_report.lead.v1",
        text: "Nothing has been sent. Preview is the report.",
        factRefs: [],
      },
      why: null,
      facts: [],
      evidence: [
        makeEvidence({
          scope,
          key: "draft",
          kind: "calculation",
          label: "Report draft · not sent",
          source: "Matchbox support draft",
          fetchedAt: context.now().toISOString(),
          status: "deterministic",
        }),
      ],
      blocks: [
        {
          type: "support_report_preview",
          version: 1,
          id: scope.id("b.report"),
          evidenceRefs: [scope.id("e.draft")],
          draft,
          excludedSummary: "history_watchlist_rpc",
          sent: false,
          contactMethods: ["thread_only", "email"],
        },
      ],
      proposals: [],
      followups: [],
      trace: [
        traceItem({
          scope,
          key: "draft",
          label: "Drafted a support report preview",
          tool: "draft_support_report",
        }),
      ],
      model: {
        rows: [],
        notes: ["Draft only. The user must press Submit report."],
      },
      surface: "canvas",
    } satisfies ToolOutcome
  },
})
