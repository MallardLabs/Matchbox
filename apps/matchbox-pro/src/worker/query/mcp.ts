import { getAddress } from "viem"
import { z } from "zod"
import { addressSchema } from "../../features/query/contract"
import type { StuartRuntime } from "./orchestrator"
import { IdScope, type ToolOutcome } from "./outcome"
import { STUART_TOOLS } from "./tools/registry"
import { type ToolJsonSchema, toolJsonSchema } from "./tools/tool"

// Stateless MCP (2026-07-28) over Stuart's deterministic tools. No Claude,
// no signing: prepare tools return unsigned, read-only proposals because an
// MCP caller is never the connected wallet.

export const MCP_PROTOCOL_VERSION = "2026-07-28"

// Support drafts belong to a user's Query session, not to external agents.
const MCP_TOOLS = STUART_TOOLS.filter(
  (tool) => tool.name !== "draft_support_report",
)

const requestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.string().max(64),
  params: z
    .object({
      _meta: z.object({
        "io.modelcontextprotocol/protocolVersion": z.string(),
        "io.modelcontextprotocol/clientInfo": z.object({
          name: z.string().max(120),
          version: z.string().max(40),
        }),
        "io.modelcontextprotocol/clientCapabilities": z.record(
          z.string(),
          z.unknown(),
        ),
      }),
      name: z.string().max(64).optional(),
      arguments: z.record(z.string(), z.unknown()).optional(),
    })
    .loose(),
})

const walletArgumentSchema = z
  .object({ walletAddress: addressSchema.nullable().optional() })
  .loose()

export type McpResponse = { status: number; body: Record<string, unknown> }

type JsonRpcId = string | number | null

function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  }
}

function withWallet(schema: ToolJsonSchema): ToolJsonSchema {
  const properties =
    schema.properties &&
    typeof schema.properties === "object" &&
    !Array.isArray(schema.properties)
      ? schema.properties
      : {}
  return {
    ...schema,
    properties: {
      ...properties,
      walletAddress: {
        anyOf: [{ type: "string" }, { type: "null" }],
        description:
          "Public address to read (0x…). Read only: proposals are never signable here.",
      },
    },
    required: [...Object.keys(properties), "walletAddress"],
  }
}

let toolList: Array<Record<string, unknown>> | null = null

function listTools(): Array<Record<string, unknown>> {
  toolList ??= MCP_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: {
      type: "object",
      ...withWallet(toolJsonSchema(tool.inputSchema)),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }))
  return toolList
}

function headerError(
  request: z.infer<typeof requestSchema>,
  headers: Headers,
): { code: number; message: string; data?: unknown } | null {
  const version =
    request.params._meta["io.modelcontextprotocol/protocolVersion"]
  if (headers.get("mcp-protocol-version") !== version) {
    return {
      code: -32020,
      message: "MCP-Protocol-Version header does not match request metadata",
    }
  }
  if (version !== MCP_PROTOCOL_VERSION) {
    return {
      code: -32019,
      message: `Unsupported protocol version ${version}`,
      data: { supported: [MCP_PROTOCOL_VERSION] },
    }
  }
  if (headers.get("mcp-method") !== request.method) {
    return {
      code: -32020,
      message: "Mcp-Method header does not match the request method",
    }
  }
  if (
    request.method === "tools/call" &&
    headers.get("mcp-name") !== request.params.name
  ) {
    return {
      code: -32020,
      message: "Mcp-Name header does not match the requested tool",
    }
  }
  return null
}

function structured(outcome: ToolOutcome): Record<string, unknown> {
  return {
    status: outcome.status,
    title: outcome.title,
    snapshotBlock:
      outcome.snapshot.blockNumber === null
        ? null
        : outcome.snapshot.blockNumber.toString(),
    answer: { ...outcome.answer, origin: "template" },
    why: outcome.why,
    facts: outcome.facts,
    evidence: outcome.evidence,
    blocks: outcome.blocks,
    proposals: outcome.proposals,
    followups: outcome.followups,
  }
}

export async function handleMcpRequest(input: {
  body: unknown
  headers: Headers
  runtime: StuartRuntime
}): Promise<McpResponse> {
  const parsed = requestSchema.safeParse(input.body)
  if (!parsed.success) {
    return { status: 400, body: rpcError(null, -32600, "Invalid Request") }
  }
  const request = parsed.data
  const invalid = headerError(request, input.headers)
  if (invalid) {
    return {
      status: 400,
      body: rpcError(request.id, invalid.code, invalid.message, invalid.data),
    }
  }
  if (request.method === "tools/list") {
    return {
      status: 200,
      body: {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          resultType: "complete",
          tools: listTools(),
          ttlMs: 300_000,
          cacheScope: "public",
        },
      },
    }
  }
  if (request.method !== "tools/call") {
    return {
      status: 404,
      body: rpcError(request.id, -32601, "Method not found"),
    }
  }
  const tool = MCP_TOOLS.find(
    (candidate) => candidate.name === request.params.name,
  )
  if (!tool) {
    return { status: 400, body: rpcError(request.id, -32602, "Unknown tool") }
  }
  const args = walletArgumentSchema.safeParse(request.params.arguments ?? {})
  if (!args.success) {
    return {
      status: 400,
      body: rpcError(request.id, -32602, "walletAddress is not an address"),
    }
  }
  const { walletAddress, ...toolArguments } = args.data
  const outcome = await tool.execute(
    {
      providers: input.runtime.providers,
      wallet: {
        address: walletAddress
          ? getAddress(walletAddress)
          : "0x0000000000000000000000000000000000000000",
        mode: "inspecting",
        label: "MCP",
      },
      query: "",
      choice: null,
      now: input.runtime.now,
      secret: input.runtime.secret,
      scope: new IdScope("m1"),
    },
    toolArguments,
  )
  if ("invalid" in outcome) {
    return {
      status: 200,
      body: {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          resultType: "complete",
          content: [
            { type: "text", text: `Invalid arguments: ${outcome.invalid}` },
          ],
          isError: true,
        },
      },
    }
  }
  input.runtime.log({
    message: "stuart.mcp_call",
    tool: tool.name,
    status: outcome.status,
  })
  return {
    status: 200,
    body: {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        resultType: "complete",
        content: [{ type: "text", text: outcome.answer.text }],
        structuredContent: structured(outcome),
        isError: outcome.status === "error",
      },
    },
  }
}
