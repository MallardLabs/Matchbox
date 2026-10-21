import type {
  Answer,
  Evidence,
  Fact,
  FactValue,
  Followup,
  Intent,
  Proposal,
  TraceItem,
  UiBlock,
  ValueStatus,
  Why,
} from "../../features/query/contract"

// What every Stuart tool returns. A tool is self-presenting: it emits the
// facts, evidence, trusted blocks, unsigned proposals and a deterministic
// template answer, plus a compact view for Claude. The orchestrator merges
// outcomes and decides which answer text is shown.

export type ToolStatus = "ok" | "empty" | "unavailable" | "error" | "clarify"

export type ModelRow = Record<string, string | null>

export type ModelView = {
  // Structured display strings (numbers allowed in a model answer come only
  // from here and from fact displays).
  rows: ModelRow[]
  notes: string[]
}

export type ToolOutcome = {
  tool: string
  intent: Intent
  status: ToolStatus
  title: string
  snapshot: { blockNumber: bigint | null; epoch: number | null; label: string }
  answer: Omit<Answer, "origin" | "evidenceRefs">
  why: Why | null
  facts: Fact[]
  evidence: Evidence[]
  blocks: UiBlock[]
  proposals: Proposal[]
  followups: Followup[]
  trace: TraceItem[]
  model: ModelView
  surface: "rail" | "canvas"
}

// Row keys whose values are untrusted user text (profile names, symbols).
// Their digits never count as sourced numbers.
export const UNTRUSTED_MODEL_KEYS = new Set(["name", "label", "symbol"])

/** Scopes fact/evidence/block ids to one tool call so outcomes merge cleanly. */
export class IdScope {
  readonly prefix: string

  constructor(prefix: string) {
    this.prefix = prefix
  }

  id(local: string): string {
    return `${this.prefix}.${local}`.slice(0, 40)
  }
}

export function makeFact(input: {
  scope: IdScope
  key: string
  label: string
  value: FactValue
  display: string
  status: ValueStatus
  evidenceRefs: string[]
}): Fact {
  return {
    id: input.scope.id(input.key),
    label: input.label.slice(0, 60),
    value: input.value,
    display: input.display.slice(0, 60),
    status: input.status,
    evidenceRefs: input.evidenceRefs,
  }
}

export function makeEvidence(
  input: Omit<Evidence, "id"> & { scope: IdScope; key: string },
): Evidence {
  const { scope, key, ...rest } = input
  return {
    ...rest,
    id: scope.id(`e.${key}`),
    label: rest.label.slice(0, 60),
    source: rest.source.slice(0, 120),
  }
}

export function traceItem(input: {
  scope: IdScope
  key: string
  label: string
  detail?: string | null
  tool: string | null
  startedAt?: number
  now?: number
  status?: TraceItem["status"]
}): TraceItem {
  return {
    id: input.scope.id(`t.${input.key}`),
    label: input.label.slice(0, 120),
    detail: input.detail ? input.detail.slice(0, 160) : null,
    tool: input.tool,
    durationMs:
      input.startedAt !== undefined && input.now !== undefined
        ? Math.max(0, Math.round(input.now - input.startedAt))
        : null,
    status: input.status ?? "ok",
  }
}

export function emptyModelView(notes: string[] = []): ModelView {
  return { rows: [], notes }
}
