import { z } from "zod"
import { executeMatchboxTool, toJsonSchema, toolDefinitions } from "./tools"

export const MCP_PROTOCOL_VERSION = "2026-07-28"

const requestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z
    .object({
      _meta: z.object({
        "io.modelcontextprotocol/protocolVersion": z.string(),
        "io.modelcontextprotocol/clientInfo": z.object({
          name: z.string(),
          version: z.string(),
        }),
        "io.modelcontextprotocol/clientCapabilities": z.record(
          z.string(),
          z.unknown(),
        ),
      }),
    })
    .loose(),
})

type JsonRpcId = string | number | null

export type McpTransportResponse = {
  status: number
  body: Record<string, unknown>
}

function jsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  }
}

function headerValue(headers: Headers, name: string): string | null {
  return headers.get(name)
}

function validateHeaders(
  request: z.infer<typeof requestSchema>,
  headers: Headers,
): string | null {
  const bodyVersion =
    request.params._meta["io.modelcontextprotocol/protocolVersion"]
  const headerVersion = headerValue(headers, "MCP-Protocol-Version")
  if (headerVersion !== bodyVersion) {
    return "MCP-Protocol-Version header does not match request metadata"
  }
  if (bodyVersion !== MCP_PROTOCOL_VERSION) {
    return `Unsupported protocol version ${bodyVersion}`
  }
  if (headerValue(headers, "Mcp-Method") !== request.method) {
    return "Mcp-Method header does not match the request method"
  }
  if (request.method === "tools/call") {
    const params = request.params as Record<string, unknown>
    if (headerValue(headers, "Mcp-Name") !== params.name) {
      return "Mcp-Name header does not match the requested tool"
    }
  }
  return null
}

export async function handleStatelessMcpRequest(options: {
  body: unknown
  headers: Headers
  fetch?: typeof globalThis.fetch
  allowDemoFallback?: boolean
  dataBaseUrl?: string
  rpcUrls?: string[]
}): Promise<McpTransportResponse> {
  const parsed = requestSchema.safeParse(options.body)
  if (!parsed.success) {
    return {
      status: 400,
      body: jsonRpcError(null, -32600, "Invalid Request", parsed.error.issues),
    }
  }

  const request = parsed.data
  const headerError = validateHeaders(request, options.headers)
  if (headerError) {
    const unsupported = headerError.startsWith("Unsupported protocol version")
    return {
      status: 400,
      body: jsonRpcError(
        request.id,
        unsupported ? -32019 : -32020,
        headerError,
        unsupported ? { supported: [MCP_PROTOCOL_VERSION] } : undefined,
      ),
    }
  }

  if (request.method === "tools/list") {
    const tools = toolDefinitions.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: toJsonSchema(tool.inputSchema),
      outputSchema: toJsonSchema(tool.outputSchema),
      annotations: tool.annotations,
    }))
    return {
      status: 200,
      body: {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          resultType: "complete",
          tools,
          ttlMs: 300_000,
          cacheScope: "public",
        },
      },
    }
  }

  if (request.method === "tools/call") {
    const params = request.params as Record<string, unknown>
    if (typeof params.name !== "string") {
      return {
        status: 400,
        body: jsonRpcError(request.id, -32602, "Tool name is required"),
      }
    }
    try {
      const structuredContent = await executeMatchboxTool(
        params.name,
        params.arguments ?? {},
        {
          ...(options.fetch ? { fetch: options.fetch } : {}),
          ...(options.allowDemoFallback === undefined
            ? {}
            : { allowDemoFallback: options.allowDemoFallback }),
          ...(options.dataBaseUrl ? { dataBaseUrl: options.dataBaseUrl } : {}),
          ...(options.rpcUrls ? { rpcUrls: options.rpcUrls } : {}),
        },
      )
      return {
        status: 200,
        body: {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            resultType: "complete",
            content: [
              { type: "text", text: JSON.stringify(structuredContent) },
            ],
            structuredContent,
            isError: false,
          },
        },
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Matchbox tool failed"
      return {
        status: 200,
        body: {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            resultType: "complete",
            content: [{ type: "text", text: message }],
            isError: true,
          },
        },
      }
    }
  }

  return {
    status: 404,
    body: jsonRpcError(request.id, -32601, "Method not found"),
  }
}
