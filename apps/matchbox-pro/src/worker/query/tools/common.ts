import type {
  Evidence,
  Followup,
  Intent,
  UiBlock,
} from "../../../features/query/contract"
import { displayBlock, shortAddress } from "../format"
import {
  type IdScope,
  type ToolOutcome,
  emptyModelView,
  makeEvidence,
  traceItem,
} from "../outcome"
import type { PriceSnapshot } from "../providers/prices"
import { priceSourceLabel } from "../providers/prices"
import type { VoteTarget, VotingDomain } from "../providers/voting"
import { calcChip, epochNumberFor } from "../versions"
import type { ToolContext } from "./tool"

export const ZERO_WALLET = "0x0000000000000000000000000000000000000000"

// The ranking table's "Funded" column: completed epochs, of the last 8, in
// which the target had incentives.
export const FUNDED_WINDOW = 8

/**
 * Funded epochs for just the targets a table shows (a few reads per row, not
 * the whole voter). Null when history can't be read; the column then reads
 * "—" rather than a guess.
 */
export async function fundedForRows(
  context: Pick<ToolContext, "providers">,
  domain: VotingDomain,
  targets: readonly VoteTarget[],
): Promise<Map<string, number> | null> {
  if (targets.length === 0) return new Map()
  return context.providers
    .fundedEpochs({ ...domain, targets: [...targets] }, FUNDED_WINDOW)
    .catch(() => null)
}

export function domainLabel(domain: VotingDomain): string {
  if (domain.branch === "boost") return "Boost gauges"
  if (domain.branch === "validators") return "Validator gauges"
  return "Pools & vaults"
}

export function domainEvidence(scope: IdScope, domain: VotingDomain): Evidence {
  return makeEvidence({
    scope,
    key: "domain",
    kind: "chain",
    label: `${domainLabel(domain)} · live`,
    source: `${domain.source} ${shortAddress(domain.voter)}`,
    blockNumber: domain.blockNumber.toString(),
    ...(epochNumberFor(domain.epochStart) !== null
      ? { epoch: epochNumberFor(domain.epochStart) ?? 0 }
      : {}),
    fetchedAt: domain.fetchedAt,
    status: "live",
  })
}

export function priceEvidence(
  scope: IdScope,
  prices: PriceSnapshot,
  which: "btc" | "mezo" | "both",
): Evidence {
  const quotes =
    which === "both"
      ? [prices.mezo, prices.btc]
      : [which === "btc" ? prices.btc : prices.mezo]
  const stale = quotes.some((quote) => quote.priceUsd === null)
  return makeEvidence({
    scope,
    key: `price.${which}`,
    kind: "price",
    label: stale ? "Prices · partial" : "Prices · live",
    source: quotes.map(priceSourceLabel).join(" + "),
    fetchedAt: quotes[0]?.fetchedAt ?? new Date(0).toISOString(),
    status: stale ? "stale" : "live",
  })
}

export function calcEvidence(
  scope: IdScope,
  version: string,
  label: string,
  fetchedAt: string,
): Evidence {
  return makeEvidence({
    scope,
    key: "calc",
    kind: "calculation",
    label: calcChip(version),
    source: label,
    fetchedAt,
    status: "deterministic",
    calculationVersion: version,
  })
}

export function chainEvidence(input: {
  scope: IdScope
  key: string
  label: string
  source: string
  blockNumber: bigint
  fetchedAt: string
}): Evidence {
  return makeEvidence({
    scope: input.scope,
    key: input.key,
    kind: "chain",
    label: input.label,
    source: input.source,
    blockNumber: input.blockNumber.toString(),
    fetchedAt: input.fetchedAt,
    status: "live",
  })
}

export function sourceCluster(scope: IdScope, evidence: Evidence[]): UiBlock {
  return {
    type: "source_cluster",
    version: 1,
    id: scope.id("b.sources"),
    evidenceRefs: evidence.map((item) => item.id),
  }
}

export function snapshotLabel(input: {
  blockNumber: bigint | null
  epochStart: bigint | null
  extra?: string
}): string {
  const parts: string[] = []
  if (input.epochStart !== null) {
    const epoch = epochNumberFor(input.epochStart)
    if (epoch !== null) parts.push(`epoch ${epoch}`)
  }
  if (input.blockNumber !== null) {
    parts.push(`block ${displayBlock(input.blockNumber)}`)
  }
  if (input.extra) parts.push(input.extra)
  return parts.join(" · ").slice(0, 120)
}

export function queryFollowup(
  scope: IdScope,
  key: string,
  label: string,
  query: string,
): Followup {
  return {
    id: scope.id(`f.${key}`),
    label,
    action: { kind: "query", query },
  }
}

export function navigateFollowup(
  scope: IdScope,
  key: string,
  label: string,
  to: string,
): Followup {
  return { id: scope.id(`f.${key}`), label, action: { kind: "navigate", to } }
}

/** A no-number outcome for empty, unavailable or failed tool calls. */
export function plainOutcome(input: {
  scope: IdScope
  tool: string
  intent: Intent
  status: ToolOutcome["status"]
  title: string
  templateId: string
  text: string
  kind: ToolOutcome["answer"]["kind"]
  followups?: Followup[]
  blocks?: UiBlock[]
  evidence?: Evidence[]
  traceLabel: string
  traceStatus?: "ok" | "error" | "skipped"
  notes?: string[]
}): ToolOutcome {
  return {
    tool: input.tool,
    intent: input.intent,
    status: input.status,
    title: input.title,
    snapshot: { blockNumber: null, epoch: null, label: "" },
    answer: {
      kind: input.kind,
      templateId: input.templateId,
      text: input.text,
      factRefs: [],
    },
    why: null,
    facts: [],
    evidence: input.evidence ?? [],
    blocks: input.blocks ?? [],
    proposals: [],
    followups: input.followups ?? [],
    trace: [
      traceItem({
        scope: input.scope,
        key: "main",
        label: input.traceLabel,
        tool: input.tool,
        status: input.traceStatus ?? "ok",
      }),
    ],
    model: emptyModelView(input.notes ?? [input.text]),
    surface: "rail",
  }
}

export function errorOutcome(input: {
  scope: IdScope
  tool: string
  intent: Intent
  title: string
}): ToolOutcome {
  return plainOutcome({
    ...input,
    status: "error",
    templateId: `${input.tool}.error.v1`,
    text: "Data unavailable right now. Try again shortly.",
    kind: "unavailable",
    traceLabel: "Read failed",
    traceStatus: "error",
  })
}
