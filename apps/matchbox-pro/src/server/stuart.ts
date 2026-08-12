import {
  type MatchboxToolName,
  type WalletContext,
  executeMatchboxTool,
  prepareVoteInputSchema,
  queryResponseSchema,
  toolNames,
  walletAddressSchema,
  walletContextSchema,
} from "@repo/matchbox-mcp"
import { z } from "zod"
import {
  type ClarificationKind,
  presentClarificationResponse,
  presentQueryResponse,
} from "../lib/query/presenter"
import { DEFAULT_GROQ_MODEL, selectGroqTool } from "./groq"

export const stuartQueryInputSchema = z.object({
  query: z.string().trim().min(1).max(4_000),
  wallet: z
    .object({
      address: walletAddressSchema,
      mode: z.enum(["connected", "watching", "inspecting"]),
      label: z.string().min(1).max(80).optional(),
    })
    .optional(),
})

export type StuartQueryInput = z.infer<typeof stuartQueryInputSchema>

export type StuartRuntimeOptions = {
  apiKey?: string
  model?: string
  allowDemoFallback?: boolean
  fetch?: typeof globalThis.fetch
  dataBaseUrl?: string
  rpcUrls?: string[]
}

const defaultWallet = walletContextSchema.parse({
  address: "0x0000000000000000000000000000000000000000",
  label: "No wallet selected",
  mode: "inspecting",
  network: "Mezo Mainnet",
})

function resolveWallet(input: StuartQueryInput): WalletContext {
  if (!input.wallet) return defaultWallet
  return walletContextSchema.parse({
    ...input.wallet,
    label:
      input.wallet.label ??
      (input.wallet.mode === "connected"
        ? "Connected wallet"
        : input.wallet.mode === "watching"
          ? "Watched wallet"
          : "Inspected wallet"),
    network: "Mezo Mainnet",
  })
}

function percentageFromText(value: string): number | null {
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(value)) return null
  const [whole = "0", fraction = ""] = value.split(".")
  const basisPoints = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))
  if (basisPoints > 10_000n) return null
  return Number.parseInt(basisPoints.toString(), 10) / 100
}

function parseRequestedAllocations(query: string) {
  const matches = [
    ...query.matchAll(/(\d+(?:\.\d+)?)%\s+(?:to\s+)?([^\n,]+)/gi),
  ]
  if (matches.length === 0) return null
  const allocations = matches.map((match) => {
    const gaugeName = (match[2] ?? "").trim()
    const percentage = percentageFromText(match[1] ?? "")
    return percentage === null
      ? null
      : {
          gaugeId: gaugeName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, ""),
          gaugeName,
          percentage,
        }
  })
  if (allocations.some((allocation) => allocation === null)) return null
  const parsed = prepareVoteInputSchema.shape.allocations.safeParse(allocations)
  if (!parsed.success) return null
  const total = parsed.data.reduce(
    (sum, allocation) => sum + allocation.percentage,
    0,
  )
  return Math.abs(total - 100) < 0.001 ? parsed.data : null
}

function deterministicSelection(query: string): {
  name: MatchboxToolName | null
  arguments: Record<string, unknown>
  clarification: ClarificationKind | null
  fixedAnswer: string | null
} {
  const normalized = query.toLowerCase()
  const noSelection = { clarification: null, fixedAnswer: null }
  if (/claimable rewards|claim rewards|rewards/i.test(normalized)) {
    return {
      name: null,
      arguments: {},
      clarification: null,
      fixedAnswer:
        "Claims are not in this prototype. Stuart did not query or invent a claimable USD amount.",
    }
  }
  if (normalized.includes("wormhole") || normalized.includes("portal")) {
    return {
      name: "search_transactions",
      arguments: {
        category: "bridge",
        provider: "Wormhole",
        ...(normalized.includes("into mezo") ? { direction: "in" } : {}),
        ...(normalized.includes("out of mezo") ? { direction: "out" } : {}),
      },
      ...noSelection,
    }
  }
  if (normalized.includes("bridge")) {
    return {
      name: "search_transactions",
      arguments: {
        category: "bridge",
        provider: "all",
        ...(normalized.includes("into mezo") ? { direction: "in" } : {}),
        ...(normalized.includes("out of mezo") ? { direction: "out" } : {}),
      },
      ...noSelection,
    }
  }
  if (
    normalized.includes("consistent") ||
    normalized.includes("most incentives") ||
    normalized.includes("highest incentives")
  ) {
    return {
      name: "rank_gauges",
      arguments: {
        objective: normalized.includes("consistent")
          ? "most_consistent"
          : "highest_incentives",
      },
      ...noSelection,
    }
  }
  if (
    normalized.includes("best") &&
    /\bgauges?\b/i.test(normalized) &&
    !/(?:for me|my (?:vote|return)|personal return|optimi[sz]e)/i.test(
      normalized,
    )
  ) {
    return {
      name: null,
      arguments: {},
      clarification: "gauge-objective",
      fixedAnswer: null,
    }
  }
  if (normalized.includes("vote")) {
    const allocations = parseRequestedAllocations(query)
    const requestsPersonalOptimum =
      /(?:for me|my (?:vote|return)|personal return|optimi[sz]e)/i.test(
        normalized,
      )
    if (!allocations && !requestsPersonalOptimum) {
      return {
        name: null,
        arguments: {},
        clarification: "gauge-objective",
        fixedAnswer: null,
      }
    }
    return allocations
      ? {
          name: "prepare_vote",
          arguments: { allocations },
          ...noSelection,
        }
      : {
          name: "optimize_votes",
          arguments: { objective: "best_personal_return" },
          ...noSelection,
        }
  }
  if (
    normalized.includes("zap") ||
    normalized.includes("vault") ||
    normalized.includes("earn deposit") ||
    normalized.includes("savings") ||
    normalized.includes("smusd")
  ) {
    const amount =
      normalized.match(/\$\s?(\d+(?:\.\d{1,2})?)/)?.[1] ??
      normalized.match(/(?:deposit|zap)\s+(\d+(?:\.\d{1,2})?)/)?.[1]
    const savings = /savings|smusd/i.test(normalized)
    const dualDeposit = /lp\s+pool|liquidity|(?:mezo|btc)\s*\/\s*musd/i.test(
      normalized,
    )
    if ((!savings && !dualDeposit) || (savings && dualDeposit) || !amount) {
      return {
        name: null,
        arguments: {},
        clarification: "earn-destination",
        fixedAnswer: null,
      }
    }
    const fundingAsset =
      normalized
        .match(
          /(?:deposit|zap)\s+(?:\$?\d+(?:\.\d{1,2})?\s+)?(btc|mezo|musd)/i,
        )?.[1]
        ?.toUpperCase() ?? "MUSD"
    return {
      name: "prepare_zap",
      arguments: {
        amount,
        fundingAsset,
        vault: savings
          ? "MUSD Savings Vault"
          : normalized.includes("btc/musd")
            ? "BTC / MUSD LP Pool"
            : "MEZO / MUSD LP Pool",
      },
      ...noSelection,
    }
  }
  return {
    name: null,
    arguments: {},
    clarification: null,
    fixedAnswer: null,
  }
}

function safeToolArguments(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw)
    return z.record(z.string(), z.unknown()).catch({}).parse(parsed)
  } catch {
    return {}
  }
}

async function executeSelection(options: {
  name: MatchboxToolName
  arguments: Record<string, unknown>
  wallet: WalletContext
  runtime: StuartRuntimeOptions
}): Promise<unknown> {
  return executeMatchboxTool(
    options.name,
    {
      ...options.arguments,
      address: options.wallet.address,
      walletMode: options.wallet.mode,
    },
    {
      ...(options.runtime.fetch ? { fetch: options.runtime.fetch } : {}),
      ...(options.runtime.allowDemoFallback === undefined
        ? {}
        : { allowDemoFallback: options.runtime.allowDemoFallback }),
      ...(options.runtime.dataBaseUrl
        ? { dataBaseUrl: options.runtime.dataBaseUrl }
        : {}),
      ...(options.runtime.rpcUrls ? { rpcUrls: options.runtime.rpcUrls } : {}),
    },
  )
}

export async function runStuartQuery(
  rawInput: unknown,
  runtime: StuartRuntimeOptions = {},
) {
  const input = stuartQueryInputSchema.parse(rawInput)
  const wallet = resolveWallet(input)
  const requestId = crypto.randomUUID()
  const model = runtime.model ?? DEFAULT_GROQ_MODEL
  const deterministic = deterministicSelection(input.query)

  if (deterministic.clarification) {
    return presentClarificationResponse({
      kind: deterministic.clarification,
      wallet,
      service: {
        runtime: "deterministic",
        model: null,
        degraded: false,
        notice: null,
        requestId,
      },
    })
  }

  if (deterministic.fixedAnswer) {
    return queryResponseSchema.parse(
      presentQueryResponse({
        query: input.query,
        toolName: null,
        toolResult: null,
        wallet,
        supportAnswer: deterministic.fixedAnswer,
        service: {
          runtime: "deterministic",
          model: null,
          degraded: false,
          notice: null,
          requestId,
        },
      }),
    )
  }

  if (!runtime.apiKey) {
    const toolResult = deterministic.name
      ? await executeSelection({
          name: deterministic.name,
          arguments: deterministic.arguments,
          wallet,
          runtime,
        })
      : null
    return queryResponseSchema.parse(
      presentQueryResponse({
        query: input.query,
        toolName: deterministic.name,
        toolResult,
        wallet,
        service: {
          runtime: "deterministic",
          model: null,
          degraded: true,
          notice:
            "Groq is not configured; deterministic Matchbox tools remain available.",
          requestId,
        },
      }),
    )
  }

  try {
    const selection = await selectGroqTool({
      apiKey: runtime.apiKey,
      model,
      query: input.query,
      walletAddress: wallet.address,
      walletMode: wallet.mode,
      ...(runtime.fetch ? { fetch: runtime.fetch } : {}),
    })
    const selectedName = selection.toolCall?.function.name
    const name = toolNames.includes(selectedName as MatchboxToolName)
      ? (selectedName as MatchboxToolName)
      : null

    if (!name) {
      return queryResponseSchema.parse(
        presentQueryResponse({
          query: input.query,
          toolName: null,
          toolResult: null,
          wallet,
          supportAnswer: selection.finalAnswer,
          service: {
            runtime: "groq",
            model,
            degraded: false,
            notice: null,
            requestId,
          },
        }),
      )
    }

    const modelArguments = safeToolArguments(
      selection.toolCall?.function.arguments ?? "{}",
    )
    const toolResult = await executeSelection({
      name,
      arguments: modelArguments,
      wallet,
      runtime,
    })

    return queryResponseSchema.parse(
      presentQueryResponse({
        query: input.query,
        toolName: name,
        toolResult,
        wallet,
        service: {
          runtime: "groq",
          model,
          degraded: false,
          notice: null,
          requestId,
        },
      }),
    )
  } catch (error) {
    const toolResult = deterministic.name
      ? await executeSelection({
          name: deterministic.name,
          arguments: deterministic.arguments,
          wallet,
          runtime,
        })
      : null
    const message =
      error instanceof Error && /429|rate limit/i.test(error.message)
        ? "Groq is rate-limited; deterministic Matchbox tools answered this request."
        : "Groq is temporarily unavailable; deterministic Matchbox tools answered this request."
    return queryResponseSchema.parse(
      presentQueryResponse({
        query: input.query,
        toolName: deterministic.name,
        toolResult,
        wallet,
        service: {
          runtime: "deterministic",
          model: null,
          degraded: true,
          notice: message,
          requestId,
        },
      }),
    )
  }
}
