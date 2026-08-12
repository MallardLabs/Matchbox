import { toJsonSchema, toolDefinitions } from "@repo/matchbox-mcp"
import { z } from "zod"

export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b"

const toolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
})

const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          role: z.literal("assistant"),
          content: z.string().nullable().optional(),
          tool_calls: z.array(toolCallSchema).optional(),
        }),
      }),
    )
    .min(1),
})

type GroqMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant"
      content: string | null
      tool_calls?: z.infer<typeof toolCallSchema>[]
    }
  | { role: "tool"; tool_call_id: string; name: string; content: string }

export class GroqRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter: string | null,
  ) {
    super(message)
    this.name = "GroqRequestError"
  }
}

async function complete(options: {
  apiKey: string
  model: string
  messages: GroqMessage[]
  includeTools: boolean
  fetch?: typeof globalThis.fetch
}): Promise<z.infer<typeof completionSchema>["choices"][number]["message"]> {
  const fetchImplementation = options.fetch ?? globalThis.fetch
  const response = await fetchImplementation(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: 0,
        max_completion_tokens: 700,
        ...(options.includeTools
          ? {
              tools: toolDefinitions.map((tool) => ({
                type: "function",
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: toJsonSchema(tool.inputSchema),
                },
              })),
              tool_choice: "auto",
            }
          : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    },
  )

  if (!response.ok) {
    const text = await response.text()
    throw new GroqRequestError(
      `Groq returned HTTP ${response.status}: ${text.slice(0, 240)}`,
      response.status,
      response.headers.get("retry-after"),
    )
  }
  return completionSchema.parse(await response.json()).choices[0]
    ?.message as z.infer<typeof completionSchema>["choices"][number]["message"]
}

export type GroqToolSelection = {
  toolCall: z.infer<typeof toolCallSchema> | null
  finalAnswer: string | null
}

const systemPrompt = `You are Stuart, the friendly but restrained Mezo agent inside Matchbox Query.
Use Matchbox tools for wallet data, financial facts, rankings, and transaction proposals.
Never invent transactions, balances, returns, gauges, quotes, or contract calls.
Never claim an unsigned proposal was signed or submitted.
Bridge searches must remain limited to provider-linked journeys involving Mezo; do not infer cross-chain activity from a matching address.
For ambiguous "best gauges", do not call a tool; the host returns approved objective cards. Use optimize_votes only when the user explicitly chooses best personal return. "Most incentives deposited" is a distinct gross ranking.
Use rank_gauges for "most incentives deposited" or "most consistently funded". Never label gross ranking "Highest incentives".
For Earn, preserve the requested vault and asset. A direct single-sided MUSD Savings deposit is distinct from a dual-deposit LP zap. Never rewrite an LP request to Savings. If the destination is unclear, do not call a tool; the host returns clarification cards.
If a request maps to a tool, call exactly one best first tool. Keep prose concise.`

export async function selectGroqTool(options: {
  apiKey: string
  model?: string
  query: string
  walletAddress: string
  walletMode: "connected" | "watching" | "inspecting"
  fetch?: typeof globalThis.fetch
}): Promise<GroqToolSelection> {
  const messages: GroqMessage[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Active wallet: ${options.walletAddress}\nWallet mode: ${options.walletMode}\nRequest: ${options.query}`,
    },
  ]
  const first = await complete({
    apiKey: options.apiKey,
    model: options.model ?? DEFAULT_GROQ_MODEL,
    messages,
    includeTools: true,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  })
  const toolCall = first.tool_calls?.[0] ?? null
  return { toolCall, finalAnswer: toolCall ? null : (first.content ?? null) }
}
