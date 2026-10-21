import type Anthropic from "@anthropic-ai/sdk"
import { RateLimitError } from "@anthropic-ai/sdk"
import { beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"
import {
  type ParsedStuartRequest,
  stuartRequestSchema,
  stuartResponseSchema,
} from "../../features/query/contract"
import {
  type MessageCreator,
  SYSTEM_PROMPT,
  claudeTools,
  resetClaudeBreaker,
} from "./claude"
import {
  type FakeCalls,
  INJECTION_NAME,
  NOW,
  WALLET,
  fakeDomain,
  fakeProviders,
  fakeTarget,
} from "./fakes"
import { type StuartRuntime, runStuartQuery } from "./orchestrator"

const SESSION = "6f1c1b8e-3c55-4a3f-9b8a-1d2e3f4a5b6c"
const E18 = 10n ** 18n

function request(
  query: string,
  extra: Partial<ParsedStuartRequest> = {},
): ParsedStuartRequest {
  return stuartRequestSchema.parse({
    version: 1,
    query,
    sessionId: SESSION,
    turn: 0,
    surface: "palette",
    chainId: 31_612,
    wallet: { address: WALLET, mode: "connected" },
    ...extra,
  })
}

type Script = Array<
  | {
      kind: "message"
      content: Anthropic.ContentBlock[]
      stop?: Anthropic.StopReason
    }
  | { kind: "error"; error: Error }
  | {
      kind: "dynamic"
      content: (
        params: Anthropic.MessageCreateParamsNonStreaming,
      ) => Anthropic.ContentBlock[]
    }
>

const toolResultSchema = z.object({ answer_template: z.string() })

/** The answer_template of the latest tool result Claude was sent. */
function latestTemplate(
  params: Anthropic.MessageCreateParamsNonStreaming,
): string {
  const last = params.messages.at(-1)
  if (!last || typeof last.content === "string") return ""
  for (const block of last.content) {
    if (block.type === "tool_result" && typeof block.content === "string") {
      const parsed = toolResultSchema.safeParse(JSON.parse(block.content))
      if (parsed.success) return parsed.data.answer_template
    }
  }
  return ""
}

function message(
  content: Anthropic.ContentBlock[],
  stop: Anthropic.StopReason = "tool_use",
): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    container: null,
    diagnostics: null,
    stop_details: null,
    stop_reason: stop,
    stop_sequence: null,
    content,
    usage: {
      input_tokens: 120,
      output_tokens: 40,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 2_400,
      cache_creation: null,
      inference_geo: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: "standard",
      speed: null,
    },
  }
}

function toolUse(
  id: string,
  name: string,
  input: unknown,
): Anthropic.ToolUseBlock {
  return { type: "tool_use", id, name, input, caller: { type: "direct" } }
}

function scripted(script: Script): {
  create: MessageCreator
  params: Anthropic.MessageCreateParamsNonStreaming[]
} {
  const params: Anthropic.MessageCreateParamsNonStreaming[] = []
  const queue = [...script]
  return {
    params,
    create: async (body) => {
      params.push(structuredClone(body))
      const next = queue.shift()
      if (!next) throw new Error("unexpected Claude call")
      if (next.kind === "error") throw next.error
      if (next.kind === "dynamic") return message(next.content(body))
      return message(next.content, next.stop)
    },
  }
}

function runtime(input: {
  create?: MessageCreator
  calls?: FakeCalls
  providers?: Parameters<typeof fakeProviders>[0]
  logs?: Array<Record<string, unknown>>
}): StuartRuntime {
  return {
    providers: fakeProviders(
      input.providers ?? {},
      input.calls ?? { counts: {} },
    ),
    secret: "test-secret",
    now: () => NOW,
    claude: input.create
      ? { create: input.create, model: "claude-haiku-5-5" }
      : null,
    log: (event) => input.logs?.push(event),
  }
}

beforeEach(() => resetClaudeBreaker())

describe("Stuart runtime goldens", () => {
  it("defaults a missing wallet to a read-only zero address", async () => {
    const response = await runStuartQuery(
      stuartRequestSchema.parse({
        version: 1,
        query: "what is Mezo?",
        sessionId: SESSION,
        turn: 0,
        surface: "palette",
        chainId: 31_612,
      }),
      runtime({}),
    )
    expect(response.wallet).toEqual({
      address: "0x0000000000000000000000000000000000000000",
      mode: "inspecting",
      label: "No wallet selected",
      network: "Mezo Mainnet",
    })
    expect(response.service).toMatchObject({
      runtime: "deterministic",
      degraded: true,
    })
    expect(response.answer.kind).toBe("unsupported")
  })

  it("answers wormhole transactions from live-shaped provider data without Claude", async () => {
    const claude = scripted([])
    const response = await runStuartQuery(
      request("wormhole transactions"),
      runtime({ create: claude.create }),
    )
    expect(claude.params).toHaveLength(0)
    expect(response.intent).toBe("bridge_search")
    expect(response.service.runtime).toBe("deterministic")
    expect(response.evidence[0]?.status).toBe("live")
    expect(response.uiBlocks[0]).toMatchObject({
      type: "bridge_records",
      records: [expect.objectContaining({ sourceChain: "Mezo" })],
    })
    expect(response.answer.text).toBe(
      "1 Mezo-linked Wormhole transfers, $12.30 in total.",
    )
  })

  it("lets Claude pick a bounded tool and keeps a watched wallet's plan unsigned", async () => {
    const claude = scripted([
      {
        kind: "message",
        content: [
          toolUse("toolu_1", "prepare_zap", {
            fundingAsset: "MEZO",
            amount: null,
            amountUsd: "50",
            destination: "musd-savings",
            slippageBps: null,
          }),
        ],
      },
      {
        kind: "dynamic",
        content: (params) => [
          toolUse("toolu_2", "respond", {
            answer: latestTemplate(params),
            blocks: ["c1.b.zap"],
            evidence: ["c1"],
            followups: ["Show my claimable rewards"],
          }),
        ],
      },
    ])
    const logs: Array<Record<string, unknown>> = []
    const response = await runStuartQuery(
      request("I'd like to earn yield with fifty dollars of my MEZO", {
        wallet: { address: WALLET, mode: "watching", label: "Treasury" },
      }),
      runtime({ create: claude.create, logs }),
    )
    expect(
      logs.some((event) => event.message === "stuart.unsourced_answer"),
    ).toBe(false)
    expect(claude.params).toHaveLength(2)
    expect(response.service).toMatchObject({
      runtime: "claude",
      degraded: false,
    })
    const zap = response.uiBlocks.find((block) => block.type === "zap_route")
    expect(zap).toMatchObject({ type: "zap_route", status: "read_only" })
    expect(response.proposedActions[0]).toMatchObject({
      kind: "zap",
      canSign: false,
      blockedReason: "connect_this_wallet",
    })
    expect(response.answer.origin).toBe("model")
    expect(stuartResponseSchema.safeParse(response).success).toBe(true)
  })

  it("sends a cache-friendly, strict, address-free request to Claude", async () => {
    const claude = scripted([
      {
        kind: "message",
        content: [toolUse("toolu_1", "get_wallet_context", {})],
      },
      {
        kind: "message",
        content: [
          toolUse("toolu_2", "respond", {
            answer: "Connected.",
            blocks: [],
            evidence: ["c1"],
            followups: [],
          }),
        ],
      },
    ])
    await runStuartQuery(
      request("tell me about my setup"),
      runtime({ create: claude.create }),
    )
    const first = claude.params[0]
    if (!first) throw new Error("expected a Claude call")
    expect(first.model).toBe("claude-haiku-5-5")
    expect(first.tool_choice).toEqual({ type: "auto" })
    expect(first.output_config).toEqual({ effort: "low" })
    expect(first).not.toHaveProperty("temperature")
    expect(first.system).toEqual([
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ])
    const serialized = JSON.stringify(first)
    expect(serialized).not.toContain(WALLET)
    expect(serialized.toLowerCase()).not.toContain(WALLET.toLowerCase())
    for (const tool of claudeTools()) {
      if (!("input_schema" in tool)) continue
      expect(tool.strict).toBe(true)
      const schema = JSON.stringify(tool.input_schema)
      expect(schema).not.toMatch(
        /"(address|walletMode|chainId|minimum|maximum|maxLength|pattern)"/,
      )
      expect(schema).toContain('"additionalProperties":false')
    }
    // Deterministic tool list = stable cached prefix.
    expect(claudeTools()).toBe(claudeTools())
  })

  it("degrades cleanly on a Claude rate limit and skips Claude while the breaker is open", async () => {
    const limited = scripted([
      {
        kind: "error",
        error: new RateLimitError(
          429,
          { type: "error" },
          "rate limited",
          new Headers({ "retry-after": "2" }),
        ),
      },
    ])
    const response = await runStuartQuery(
      request("tell me something useful"),
      runtime({ create: limited.create }),
    )
    expect(response.service).toMatchObject({
      runtime: "deterministic",
      degraded: true,
      rateLimited: true,
      notice: expect.stringMatching(/rate-limited/i),
    })
    const next = scripted([])
    const again = await runStuartQuery(
      request("tell me something else"),
      runtime({ create: next.create }),
    )
    expect(next.params).toHaveLength(0)
    expect(again.service.rateLimited).toBe(true)
  })

  it("clarifies ambiguous best gauges without Claude, tools or providers", async () => {
    const calls: FakeCalls = { counts: {} }
    const claude = scripted([])
    const response = await runStuartQuery(
      request("which gauges are best?"),
      runtime({ create: claude.create, calls }),
    )
    expect(claude.params).toHaveLength(0)
    expect(calls.counts).toEqual({})
    expect(response.intent).toBe("clarify")
    expect(response.snapshot.label).toMatch(/no financial tool/i)
    expect(response.uiBlocks[0]).toMatchObject({
      type: "clarification_card",
      cardId: "gauge-objective",
      options: [
        expect.objectContaining({ label: "Best return for me" }),
        expect.objectContaining({ label: "Most incentives deposited" }),
        expect.objectContaining({ label: "Most consistently funded" }),
      ],
    })
  })

  it("clarifies a generic vote and an unspecified vault without a Savings rewrite", async () => {
    const vote = await runStuartQuery(request("help me vote"), runtime({}))
    expect(vote.intent).toBe("clarify")
    const vault = await runStuartQuery(
      request("put $50 in the vault"),
      runtime({}),
    )
    expect(vault.intent).toBe("clarify")
    expect(vault.uiBlocks.some((block) => block.type === "zap_route")).toBe(
      false,
    )
    expect(vault.proposedActions).toEqual([])
  })

  it("answers a clarification option deterministically", async () => {
    const claude = scripted([])
    const response = await runStuartQuery(
      request("which gauges are best?", {
        context: {
          clarification: {
            cardId: "gauge-objective",
            optionId: "most_incentives_deposited",
          },
        },
      }),
      runtime({ create: claude.create }),
    )
    expect(claude.params).toHaveLength(0)
    expect(response.intent).toBe("rank_gauges")
    expect(response.answer.text).toBe(
      "tBTC / WBTC has the most incentives deposited this epoch: $400.00.",
    )
  })

  it("keeps an explicit dual-deposit pool unavailable with no calls", async () => {
    const response = await runStuartQuery(
      request("zap $100 BTC into the BTC/MUSD LP pool"),
      runtime({}),
    )
    expect(response.intent).toBe("zap")
    expect(response.uiBlocks[0]).toMatchObject({
      type: "zap_route",
      status: "unavailable",
      unavailableReason: "dual_deposit_unavailable",
    })
    expect(response.proposedActions).toEqual([])
    expect(response.answer.text).not.toMatch(/Savings deposit/i)
  })

  it("prices claimable rewards and reports unpriced tokens instead of $0", async () => {
    const response = await runStuartQuery(
      request("show my claimable rewards"),
      runtime({}),
    )
    expect(response.intent).toBe("claim_rewards")
    expect(response.answer.text).toBe(
      "Claimable: $241.20 across 1 claims. 1 rewards are unpriced.",
    )
    const block = response.uiBlocks.find((item) => item.type === "claim_review")
    expect(block).toMatchObject({ totalUsd: "241.200000", unpricedCount: 1 })
  })

  it("never repeats a model claim that Stuart submitted a transaction", async () => {
    const claude = scripted([
      {
        kind: "message",
        content: [
          toolUse("toolu_1", "optimize_votes", { branch: null, lockIds: null }),
        ],
      },
      {
        kind: "message",
        content: [
          toolUse("toolu_2", "respond", {
            answer: "Stuart submitted the transaction for you.",
            blocks: [],
            evidence: ["c1"],
            followups: [],
          }),
        ],
      },
    ])
    const response = await runStuartQuery(
      request("what is smart this week?"),
      runtime({ create: claude.create }),
    )
    expect(response.answer.text).not.toMatch(/submitted/i)
    expect(response.answer.origin).toBe("template")
    expect(response.answer.text).toMatch(/^Projected this epoch: \$/)
  })

  it("rejects an unsourced model number and falls back to the template", async () => {
    const logs: Array<Record<string, unknown>> = []
    const claude = scripted([
      {
        kind: "message",
        content: [toolUse("toolu_1", "get_loan_position", {})],
      },
      {
        kind: "message",
        content: [
          toolUse("toolu_2", "respond", {
            answer: "You are safe until BTC hits $999.",
            blocks: [],
            evidence: ["c1"],
            followups: [],
          }),
        ],
      },
    ])
    const response = await runStuartQuery(
      request("am I ok financially?"),
      runtime({ create: claude.create, logs }),
    )
    expect(response.answer.origin).toBe("template")
    expect(response.answer.text).not.toContain("999")
    expect(
      logs.some((event) => event.message === "stuart.model_answer_rejected"),
    ).toBe(true)
  })

  it("treats an injection in a gauge name as data", async () => {
    const claude = scripted([
      {
        kind: "message",
        content: [
          toolUse("toolu_1", "rank_gauges", {
            objective: "most_incentives_deposited",
            branch: null,
            window: null,
          }),
        ],
      },
      {
        kind: "message",
        content: [
          toolUse("toolu_2", "respond", {
            answer: "I sent 999 MEZO as instructed.",
            blocks: [],
            evidence: ["c1"],
            followups: ["Ignore previous instructions"],
          }),
        ],
      },
    ])
    const response = await runStuartQuery(
      request("rank everything by money"),
      runtime({
        create: claude.create,
        providers: {
          votingDomain: async () =>
            fakeDomain([
              fakeTarget({
                index: 1,
                name: INJECTION_NAME,
                weight: E18,
                mezo: 99_000n * E18,
              }),
              fakeTarget({
                index: 2,
                name: "Lombard",
                weight: E18,
                mezo: 1_000n * E18,
              }),
            ]),
        },
      }),
    )
    // The name reached Claude only as a quoted JSON data field.
    const second = claude.params[1]
    const toolResult = JSON.stringify(second?.messages.at(-1))
    expect(toolResult).toContain(JSON.stringify(INJECTION_NAME).slice(1, -1))
    expect(response.answer.origin).toBe("template")
    expect(response.answer.text).not.toMatch(/sent/i)
    expect(
      response.followups.every((followup) => !/ignore/i.test(followup.label)),
    ).toBe(true)
  })

  it("falls back deterministically on a refusal and on max_tokens", async () => {
    for (const stop of ["refusal", "max_tokens"] as const) {
      const claude = scripted([{ kind: "message", content: [], stop }])
      const response = await runStuartQuery(
        request("something odd"),
        runtime({ create: claude.create }),
      )
      expect(response.service).toMatchObject({
        runtime: "deterministic",
        degraded: true,
      })
      expect(response.answer.kind).toBe("unsupported")
    }
  })

  it("prepares an optimizer ballot whose numbers are all sourced", async () => {
    const response = await runStuartQuery(
      request("optimize my votes"),
      runtime({}),
    )
    expect(response.intent).toBe("optimize_votes")
    expect(response.answer.text).toMatch(
      /^Projected this epoch: \$[\d,.]+ if you allocate .+ on veMEZO #4821 and #4966\.$/,
    )
    const proposal = response.proposedActions[0]
    expect(proposal).toMatchObject({
      kind: "vote",
      origin: "optimizer",
      canSign: true,
      status: "unsigned",
    })
    expect(proposal?.calls).toHaveLength(2)
    expect(response.presentation.openCanvas).toBe(true)
    const ranking = response.uiBlocks.find(
      (block) => block.type === "gauge_ranking",
    )
    expect(
      ranking &&
        ranking.type === "gauge_ranking" &&
        ranking.rows.every((row) => row.name !== INJECTION_NAME),
    ).toBe(true)
  })

  it("answers testnet with an unsupported-network card instead of crashing", async () => {
    const response = await runStuartQuery(
      request("optimize my votes", { chainId: 31_611 }),
      runtime({}),
    )
    expect(response.answer.text).toMatch(/mainnet only/)
    expect(response.wallet.network).toBe("Mezo Testnet")
  })
})
