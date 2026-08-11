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
import { presentQueryResponse } from "../lib/query/presenter"
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

function parseRequestedAllocations(query: string) {
  const matches = [
    ...query.matchAll(/(\d+(?:\.\d+)?)%\s+(?:to\s+)?([^\n,]+)/gi),
  ]
  if (matches.length === 0) return null
  const allocations = matches.map((match) => {
    const gaugeName = (match[2] ?? "").trim()
    return {
      gaugeId: gaugeName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      gaugeName,
      percentage: Number(match[1]),
    }
  })
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
} {
  const normalized = query.toLowerCase()
  if (normalized.includes("wormhole") || normalized.includes("portal")) {
    return {
      name: "search_transactions",
      arguments: {
        category: "bridge",
        provider: "Wormhole",
        ...(normalized.includes("into mezo") ? { direction: "in" } : {}),
        ...(normalized.includes("out of mezo") ? { direction: "out" } : {}),
      },
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
    }
  }
  if (normalized.includes("vote")) {
    const allocations = parseRequestedAllocations(query)
    return allocations
      ? { name: "prepare_vote", arguments: { allocations } }
      : {
          name: "optimize_votes",
          arguments: { objective: "best_personal_return" },
        }
  }
  if (
    normalized.includes("zap") ||
    normalized.includes("vault") ||
    normalized.includes("earn deposit")
  ) {
    const amount = normalized.match(/\$\s?(\d+(?:\.\d{1,2})?)/)?.[1]
    return {
      name: "prepare_zap",
      arguments: {
        amount: amount ?? "50",
        fundingAsset: "MUSD",
        vault: normalized.includes("savings")
          ? "MUSD Savings Vault"
          : "MEZO / MUSD Earn Vault",
      },
    }
  }
  return { name: null, arguments: {} }
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
