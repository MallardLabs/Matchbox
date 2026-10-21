import { describe, expect, it } from "vitest"
import { z } from "zod"
import { handleApiRequest } from "../index"
import { NOW, WALLET, fakeProviders } from "./fakes"
import { MCP_PROTOCOL_VERSION, handleMcpRequest } from "./mcp"
import type { StuartRuntime } from "./orchestrator"

const META = {
  "io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL_VERSION,
  "io.modelcontextprotocol/clientInfo": {
    name: "test-agent",
    version: "1.0.0",
  },
  "io.modelcontextprotocol/clientCapabilities": {},
}

function rpc(method: string, params: Record<string, unknown> = {}) {
  return { jsonrpc: "2.0", id: 1, method, params: { _meta: META, ...params } }
}

function headers(method: string, name?: string): Headers {
  return new Headers({
    "content-type": "application/json",
    "mcp-protocol-version": MCP_PROTOCOL_VERSION,
    "mcp-method": method,
    ...(name ? { "mcp-name": name } : {}),
  })
}

const runtime: StuartRuntime = {
  providers: fakeProviders(),
  secret: "test-secret",
  now: () => NOW,
  claude: null,
  log: () => undefined,
}

const listSchema = z.object({
  result: z.object({
    tools: z.array(
      z.object({
        name: z.string(),
        inputSchema: z.object({
          properties: z.record(z.string(), z.unknown()),
          required: z.array(z.string()),
          additionalProperties: z.literal(false),
        }),
        annotations: z.object({ readOnlyHint: z.literal(true) }),
      }),
    ),
  }),
})

const callSchema = z.object({
  result: z.object({
    isError: z.boolean(),
    content: z.array(z.object({ type: z.literal("text"), text: z.string() })),
    structuredContent: z
      .object({
        answer: z.object({ text: z.string() }),
        proposals: z.array(
          z.object({
            canSign: z.boolean(),
            status: z.string(),
            blockedReason: z.string().nullable(),
          }),
        ),
      })
      .optional(),
  }),
})

const errorSchema = z.object({ error: z.object({ code: z.number() }) })

function mcpRequest(body: unknown, init: Headers): Request {
  return new Request("http://matchbox-pro.local/api/mcp", {
    method: "POST",
    headers: init,
    body: JSON.stringify(body),
  })
}

describe("POST /api/mcp", () => {
  it("is off unless MCP_ENABLED is true", async () => {
    const response = await handleApiRequest(
      mcpRequest(rpc("tools/list"), headers("tools/list")),
    )
    expect(response?.status).toBe(404)
  })

  it("lists the deterministic tools with strict, read-only schemas", async () => {
    const env = { BASE_RPC_URL: undefined, MCP_ENABLED: "true" }
    const response = await handleApiRequest(
      mcpRequest(rpc("tools/list"), headers("tools/list")),
      env,
    )
    expect(response?.status).toBe(200)
    expect(response?.headers.get("mcp-protocol-version")).toBe(
      MCP_PROTOCOL_VERSION,
    )
    const body = listSchema.parse(await response?.json())
    const names = body.result.tools.map((tool) => tool.name)
    expect(names).toContain("explain_gauge")
    expect(names).toContain("prepare_vote")
    expect(names).not.toContain("draft_support_report")
    expect(names).not.toContain("respond")
    for (const tool of body.result.tools) {
      expect(tool.inputSchema.required).toContain("walletAddress")
      expect(Object.keys(tool.inputSchema.properties)).toEqual(
        tool.inputSchema.required,
      )
    }
  })

  it("applies the strict per-IP limiter", async () => {
    const env = {
      BASE_RPC_URL: undefined,
      MCP_ENABLED: "true",
      MCP_LIMITER: { limit: async () => ({ success: false }) },
    }
    const response = await handleApiRequest(
      mcpRequest(rpc("tools/list"), headers("tools/list")),
      env,
    )
    expect(response?.status).toBe(429)
  })

  it("rejects mismatched routing headers and unknown protocol versions", async () => {
    const mismatch = await handleMcpRequest({
      body: rpc("tools/list"),
      headers: headers("tools/call"),
      runtime,
    })
    expect(mismatch.status).toBe(400)
    expect(errorSchema.parse(mismatch.body).error.code).toBe(-32020)
    const old = await handleMcpRequest({
      body: {
        ...rpc("tools/list"),
        params: {
          _meta: {
            ...META,
            "io.modelcontextprotocol/protocolVersion": "2025-06-18",
          },
        },
      },
      headers: new Headers({
        "mcp-protocol-version": "2025-06-18",
        "mcp-method": "tools/list",
      }),
      runtime,
    })
    expect(errorSchema.parse(old.body).error.code).toBe(-32019)
  })

  it("runs a tool deterministically and never returns a signable proposal", async () => {
    const result = await handleMcpRequest({
      body: rpc("tools/call", {
        name: "optimize_votes",
        arguments: { branch: null, lockIds: null, walletAddress: WALLET },
      }),
      headers: headers("tools/call", "optimize_votes"),
      runtime,
    })
    expect(result.status).toBe(200)
    const body = callSchema.parse(result.body)
    expect(body.result.isError).toBe(false)
    expect(body.result.content[0]?.text).toMatch(/^Projected this epoch: \$/)
    expect(body.result.structuredContent?.proposals[0]).toMatchObject({
      canSign: false,
      status: "read_only",
      blockedReason: "connect_this_wallet",
    })
  })

  it("refuses tools outside the MCP surface", async () => {
    for (const name of ["draft_support_report", "respond", "nope"]) {
      const result = await handleMcpRequest({
        body: rpc("tools/call", { name, arguments: {} }),
        headers: headers("tools/call", name),
        runtime,
      })
      expect(errorSchema.parse(result.body).error.code).toBe(-32602)
    }
  })
})
