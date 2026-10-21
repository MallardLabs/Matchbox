import type { Address } from "viem"
import {
  type Answer,
  type Evidence,
  type Followup,
  type ParsedStuartRequest,
  type StuartResponse,
  type TraceItem,
  type UiBlock,
  stuartResponseSchema,
} from "../../features/query/contract"
import { clarificationCard, resolveCard } from "./cards"
import {
  type MessageCreator,
  type RespondInput,
  claudeBreakerOpen,
  estimateCostMicroUsd,
  runClaudeTurn,
} from "./claude"
import type { StuartContext, StuartProviders, StuartWallet } from "./context"
import { sha256Hex } from "./crypto"
import { IdScope, type ToolOutcome } from "./outcome"
import { type RouterDecision, extractSlots, routeQuery } from "./router"
import {
  type SourcedSet,
  addAddresses,
  addFacts,
  addModelView,
  checkModelAnswer,
  emptySourcedSet,
  numberTokens,
  sourcedViolations,
} from "./sourced"
import { toolByName } from "./tools/registry"

export type StuartRuntime = {
  providers: StuartProviders
  secret: string
  now: () => Date
  // null = deterministic only (no key, kill switch, or tests).
  claude: { create: MessageCreator; model: string } | null
  log: (event: Record<string, unknown>) => void
}

const ZERO = "0x0000000000000000000000000000000000000000"

const NOTICES = {
  unavailable: "Stuart reasoning is unavailable; Matchbox tools answered.",
  rateLimited: "Stuart is rate-limited; Matchbox tools answered.",
  failed: "Stuart reasoning failed; Matchbox tools answered.",
} as const

type ServiceState = StuartResponse["service"]

function resolveWallet(request: ParsedStuartRequest): StuartWallet {
  if (!request.wallet) {
    return { address: ZERO, mode: "inspecting", label: "No wallet selected" }
  }
  const address = request.wallet.address
  const checksummed: Address = `0x${address.slice(2)}`
  return {
    address: checksummed,
    mode: request.wallet.mode,
    label:
      request.wallet.label ??
      (request.wallet.mode === "connected"
        ? "Connected wallet"
        : request.wallet.mode === "watching"
          ? "Watched wallet"
          : "Inspected wallet"),
  }
}

function suggestions(scope: IdScope): Followup[] {
  return [
    {
      id: scope.id("f.optimize"),
      label: "Optimize my votes",
      action: { kind: "query", query: "optimize my votes" },
    },
    {
      id: scope.id("f.rewards"),
      label: "Claimable rewards",
      action: { kind: "query", query: "show my claimable rewards" },
    },
    {
      id: scope.id("f.trove"),
      label: "My mUSD trove",
      action: { kind: "query", query: "how healthy is my mUSD trove?" },
    },
  ]
}

type Draft = {
  intent: StuartResponse["intent"]
  title: string
  snapshot: { blockNumber: bigint | null; epoch: number | null; label: string }
  answer: Answer
  why: StuartResponse["why"]
  outcomes: ToolOutcome[]
  extraBlocks: UiBlock[]
  followups: Followup[]
  extraTrace: TraceItem[]
  surface: "rail" | "canvas"
  // Block ids in the order Claude asked for; empty = tool order.
  blockOrder: string[]
}

function unsupportedDraft(
  scope: IdScope,
  text: string,
  templateId: string,
): Draft {
  return {
    intent: "unsupported",
    title: "Stuart",
    snapshot: {
      blockNumber: null,
      epoch: null,
      label: "No financial tool called",
    },
    answer: {
      kind: "unsupported",
      origin: "template",
      templateId,
      text,
      factRefs: [],
      evidenceRefs: [],
    },
    why: null,
    outcomes: [],
    extraBlocks: [],
    followups: suggestions(scope),
    extraTrace: [],
    surface: "rail",
    blockOrder: [],
  }
}

function clarifyDraft(
  scope: IdScope,
  cardId: Parameters<typeof clarificationCard>[1],
  query: string,
): Draft {
  const card = clarificationCard(scope, cardId, extractSlots(query))
  if (!card) {
    return unsupportedDraft(
      scope,
      "Stuart needs a more specific question.",
      "clarify.unknown.v1",
    )
  }
  return {
    intent: "clarify",
    title: card.prompt,
    snapshot: {
      blockNumber: null,
      epoch: null,
      label: "No financial tool called yet",
    },
    answer: {
      kind: "clarification",
      origin: "template",
      templateId: `clarify.${cardId}.v1`,
      text: card.prompt,
      factRefs: [],
      evidenceRefs: [],
    },
    why: null,
    outcomes: [],
    extraBlocks: [card],
    followups: [],
    extraTrace: [],
    surface: "rail",
    blockOrder: [],
  }
}

function primaryOf(outcomes: readonly ToolOutcome[]): ToolOutcome | null {
  const meaningful = outcomes.filter(
    (outcome) =>
      outcome.tool !== "resolve_entity" &&
      outcome.tool !== "get_wallet_context",
  )
  return meaningful.at(-1) ?? outcomes.at(-1) ?? null
}

function outcomeDraft(outcomes: ToolOutcome[]): Draft | null {
  const primary = primaryOf(outcomes)
  if (!primary) return null
  if (primary.status === "clarify") {
    return {
      intent: "clarify",
      title: primary.title,
      snapshot: {
        blockNumber: null,
        epoch: null,
        label: "No financial tool called yet",
      },
      answer: {
        ...primary.answer,
        origin: "template",
        evidenceRefs: [],
      },
      why: null,
      outcomes: [primary],
      extraBlocks: [],
      followups: primary.followups,
      extraTrace: [],
      surface: "rail",
      blockOrder: [],
    }
  }
  return {
    intent: primary.intent,
    title: primary.title,
    snapshot: primary.snapshot,
    answer: {
      ...primary.answer,
      origin: "template",
      evidenceRefs: primary.evidence.map((item) => item.id),
    },
    why: primary.why,
    outcomes,
    extraBlocks: [],
    followups: outcomes.flatMap((outcome) => outcome.followups),
    extraTrace: [],
    surface: outcomes.some((outcome) => outcome.surface === "canvas")
      ? "canvas"
      : "rail",
    blockOrder: [],
  }
}

export function sourcedSetFor(
  outcomes: readonly ToolOutcome[],
  wallet: string,
): SourcedSet {
  const set = emptySourcedSet()
  for (const outcome of outcomes) {
    addFacts(set, outcome.facts)
    addModelView(set, outcome.model)
  }
  addAddresses(set, [wallet])
  return set
}

function sanitizeFollowups(
  scope: IdScope,
  texts: readonly string[],
): Followup[] {
  return texts
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(
      (text) =>
        text.length > 0 &&
        text.length <= 80 &&
        !/\d/.test(text) &&
        !/0x/i.test(text) &&
        checkModelAnswer(text, emptySourcedSet()).ok,
    )
    .slice(0, 3)
    .map((text, index) => ({
      id: scope.id(`f.model.${index}`),
      label: text,
      action: { kind: "query" as const, query: text },
    }))
}

/** Admits Claude's sentence only if every number in it is sourced. */
function applyModelAnswer(input: {
  draft: Draft
  respond: RespondInput
  scope: IdScope
  wallet: string
  log: (event: Record<string, unknown>) => void
}): Draft {
  const { draft, respond } = input
  const sourced = sourcedSetFor(draft.outcomes, input.wallet)
  const check = checkModelAnswer(respond.answer, sourced)
  if (!check.ok) {
    input.log({
      message: "stuart.model_answer_rejected",
      reason: check.reason,
      detail: check.detail.slice(0, 5),
    })
    return draft
  }
  const evidenceByCall = new Map(
    draft.outcomes.map((outcome) => [
      outcome.evidence[0]?.id.split(".")[0] ?? "",
      outcome.evidence.map((item) => item.id),
    ]),
  )
  const evidenceRefs = respond.evidence.flatMap(
    (callId) => evidenceByCall.get(callId) ?? [],
  )
  const allEvidence = draft.outcomes.flatMap((outcome) =>
    outcome.evidence.map((item) => item.id),
  )
  const tokens = new Set(numberTokens(respond.answer))
  const factRefs = draft.outcomes
    .flatMap((outcome) => outcome.facts)
    .filter((fact) =>
      numberTokens(fact.display).some((token) => tokens.has(token)),
    )
    .map((fact) => fact.id)
  const blockIds = new Set(
    draft.outcomes.flatMap((outcome) =>
      outcome.blocks.map((block) => block.id),
    ),
  )
  const order = respond.blocks.filter((id) => blockIds.has(id))
  const modelFollowups = sanitizeFollowups(input.scope, respond.followups)
  return {
    ...draft,
    answer: {
      kind: draft.answer.kind,
      origin: "model",
      templateId: "claude.respond.v1",
      text: respond.answer.trim(),
      factRefs,
      evidenceRefs: evidenceRefs.length
        ? [...new Set(evidenceRefs)]
        : allEvidence,
    },
    extraBlocks: [],
    followups: modelFollowups.length ? modelFollowups : draft.followups,
    blockOrder: order,
  }
}

function assemble(input: {
  draft: Draft
  requestId: string
  request: ParsedStuartRequest
  wallet: StuartWallet
  service: ServiceState
  now: Date
}): StuartResponse {
  const { draft } = input
  const evidence: Evidence[] = []
  const seen = new Set<string>()
  for (const item of draft.outcomes.flatMap((outcome) => outcome.evidence)) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    evidence.push(item)
  }
  const allBlocks = [
    ...draft.extraBlocks,
    ...draft.outcomes.flatMap((outcome) => outcome.blocks),
  ].filter((block) => block.type !== "source_cluster")
  const ordered = draft.blockOrder.length
    ? [
        ...draft.blockOrder.flatMap((id) =>
          allBlocks.filter((block) => block.id === id),
        ),
        ...allBlocks.filter((block) => !draft.blockOrder.includes(block.id)),
      ]
    : allBlocks
  const trace = [
    ...draft.outcomes.flatMap((outcome) => outcome.trace),
    ...draft.extraTrace,
  ].slice(0, 16)
  const scope = new IdScope("r")
  const blocks: UiBlock[] = ordered.slice(0, 10)
  if (evidence.length > 0) {
    blocks.push({
      type: "source_cluster",
      version: 1,
      id: scope.id("b.sources"),
      evidenceRefs: evidence.slice(0, 24).map((item) => item.id),
    })
  }
  if (trace.length > 0) {
    blocks.push({
      type: "activity_trace",
      version: 1,
      id: scope.id("b.trace"),
      evidenceRefs: [],
      items: trace,
    })
  }
  const proposals = draft.outcomes
    .flatMap((outcome) => outcome.proposals)
    .slice(0, 4)
  const rankingRows = blocks.reduce(
    (count, block) =>
      block.type === "gauge_ranking" ? count + block.rows.length : count,
    0,
  )
  return {
    version: 1,
    responseId: `q_${input.requestId}`,
    requestId: input.requestId,
    intent: draft.intent,
    title: draft.title.slice(0, 120),
    generatedAt: input.now.toISOString(),
    snapshot: {
      chainId: input.request.chainId,
      blockNumber:
        draft.snapshot.blockNumber === null
          ? null
          : draft.snapshot.blockNumber.toString(),
      epoch: draft.snapshot.epoch,
      label: draft.snapshot.label || "Live",
    },
    wallet: {
      address: input.wallet.address,
      mode: input.wallet.mode,
      label: input.wallet.label.slice(0, 80),
      network:
        input.request.chainId === 31_612 ? "Mezo Mainnet" : "Mezo Testnet",
    },
    answer: draft.answer,
    why: draft.why,
    facts: draft.outcomes.flatMap((outcome) => outcome.facts).slice(0, 64),
    evidence: evidence.slice(0, 24),
    uiBlocks: blocks.slice(0, 12),
    proposedActions: proposals,
    followups: draft.followups.slice(0, 4),
    presentation: {
      surface:
        draft.surface === "canvas" || proposals.length > 0 ? "canvas" : "rail",
      openCanvas:
        proposals.length > 0 || rankingRows >= 6 || draft.surface === "canvas",
    },
    service: input.service,
  }
}

async function executeDecision(
  decision: Extract<RouterDecision, { kind: "tool" }>,
  context: StuartContext,
): Promise<ToolOutcome[]> {
  const tool = toolByName(decision.tool)
  if (!tool) return []
  const outcome = await tool.execute(
    { ...context, scope: new IdScope("c1") },
    decision.input,
  )
  return "invalid" in outcome ? [] : [outcome]
}

export async function runStuartQuery(
  request: ParsedStuartRequest,
  runtime: StuartRuntime,
): Promise<StuartResponse> {
  const started = Date.now()
  const requestId = crypto.randomUUID()
  const wallet = resolveWallet(request)
  const scope = new IdScope("s")
  const context: StuartContext = {
    providers: runtime.providers,
    wallet,
    query: request.query,
    choice: null,
    now: runtime.now,
    secret: runtime.secret,
  }
  let service: ServiceState = {
    runtime: "deterministic",
    model: null,
    degraded: false,
    notice: null,
    rateLimited: false,
  }
  let draft: Draft
  let toolsCalled: string[] = []
  let usageLog: Record<string, unknown> | null = null

  if (request.chainId !== 31_612) {
    draft = unsupportedDraft(
      scope,
      "Stuart answers on Mezo mainnet only. Switch network to continue.",
      "network_unsupported.v1",
    )
  } else {
    let decision: RouterDecision | null
    const clarification = request.context.clarification
    if (clarification?.cardId === "entity-disambiguation") {
      context.choice = clarification.optionId.toLowerCase()
      decision = routeQuery(request.query)
    } else if (clarification) {
      decision = resolveCard(
        clarification.cardId,
        clarification.optionId,
        extractSlots(request.query),
      )
    } else {
      decision = routeQuery(request.query)
    }

    if (decision === null) {
      draft = unsupportedDraft(
        scope,
        "That option is no longer available.",
        "clarify.invalid_option.v1",
      )
    } else if (decision.kind === "navigate") {
      draft = {
        ...unsupportedDraft(scope, `Open ${decision.label}.`, "navigate.v1"),
        intent: "navigate",
        title: decision.label,
        answer: {
          kind: "empty",
          origin: "template",
          templateId: "navigate.v1",
          text: `Open ${decision.label}.`,
          factRefs: [],
          evidenceRefs: [],
        },
        followups: [
          {
            id: scope.id("f.nav"),
            label: decision.label,
            action: { kind: "navigate", to: decision.to },
          },
        ],
      }
    } else if (decision.kind === "clarify") {
      draft = clarifyDraft(scope, decision.cardId, request.query)
    } else if (decision.kind === "tool") {
      const outcomes = await executeDecision(decision, context)
      toolsCalled = outcomes.map((outcome) => outcome.tool)
      draft =
        outcomeDraft(outcomes) ??
        unsupportedDraft(
          scope,
          "Data unavailable right now. Try again shortly.",
          "tool.failed.v1",
        )
    } else if (runtime.claude && !claudeBreakerOpen(runtime.now().getTime())) {
      const turn = await runClaudeTurn({
        create: runtime.claude.create,
        model: runtime.claude.model,
        context: { ...context, scope },
        query: request.query,
        page: request.context.page?.route ?? null,
        previousIntent: request.context.previous?.intent ?? null,
        nowMs: () => runtime.now().getTime(),
      })
      toolsCalled = turn.outcomes.map((outcome) => outcome.tool)
      const cost = estimateCostMicroUsd(runtime.claude.model, turn.usage)
      usageLog = {
        ...turn.usage,
        costMicroUsd: cost === null ? null : cost.toString(),
      }
      if (turn.kind === "clarify") {
        service = { ...service, runtime: "claude", model: runtime.claude.model }
        draft = clarifyDraft(scope, turn.cardId, request.query)
      } else if (turn.kind === "respond") {
        service = { ...service, runtime: "claude", model: runtime.claude.model }
        const base = outcomeDraft(turn.outcomes)
        if (!base) {
          draft = unsupportedDraft(
            scope,
            "Stuart covers Matchbox voting, rewards, loans and Savings.",
            "unsupported.v1",
          )
        } else {
          draft =
            turn.respond && base.intent !== "clarify"
              ? applyModelAnswer({
                  draft: base,
                  respond: turn.respond,
                  scope,
                  wallet: wallet.address,
                  log: runtime.log,
                })
              : base
        }
      } else {
        service = {
          ...service,
          degraded: true,
          rateLimited: turn.reason === "rate_limited",
          notice:
            turn.reason === "rate_limited"
              ? NOTICES.rateLimited
              : NOTICES.failed,
        }
        draft =
          outcomeDraft(turn.outcomes) ??
          unsupportedDraft(
            scope,
            "Stuart covers Matchbox voting, rewards, loans and Savings.",
            "unsupported.v1",
          )
      }
    } else {
      service = {
        ...service,
        degraded: true,
        rateLimited: runtime.claude !== null,
        notice: runtime.claude ? NOTICES.rateLimited : NOTICES.unavailable,
      }
      draft = unsupportedDraft(
        scope,
        "Stuart covers Matchbox voting, rewards, loans and Savings. Try one of these.",
        "unsupported.v1",
      )
    }
  }

  let response = assemble({
    draft,
    requestId,
    request,
    wallet,
    service,
    now: runtime.now(),
  })
  const turnSet = sourcedSetFor(draft.outcomes, wallet.address)
  const violations = sourcedViolations(response, turnSet)
  if (violations.length > 0) {
    runtime.log({
      message: "stuart.unsourced_answer",
      requestId,
      violations: violations.slice(0, 5),
    })
    response = {
      ...response,
      answer: {
        kind: "unsupported",
        origin: "template",
        templateId: "unsourced.v1",
        text: "Stuart could not source an answer for this. Details are below.",
        factRefs: [],
        evidenceRefs: [],
      },
      why: null,
    }
  }
  const checked = stuartResponseSchema.safeParse(response)
  runtime.log({
    message: "stuart.query",
    requestId,
    queryHash: (await sha256Hex(request.query)).slice(0, 16),
    intent: response.intent,
    tools: toolsCalled,
    runtime: response.service.runtime,
    degraded: response.service.degraded,
    answerOrigin: response.answer.origin,
    usage: usageLog,
    durationMs: Date.now() - started,
    schemaValid: checked.success,
  })
  if (!checked.success) {
    runtime.log({
      message: "stuart.schema_violation",
      requestId,
      issues: checked.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    })
    const fallback = assemble({
      draft: unsupportedDraft(
        scope,
        "Data unavailable right now. Try again shortly.",
        "schema.v1",
      ),
      requestId,
      request,
      wallet,
      service,
      now: runtime.now(),
    })
    return fallback
  }
  return checked.data
}
