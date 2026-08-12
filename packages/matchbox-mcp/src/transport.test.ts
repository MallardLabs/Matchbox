import { describe, expect, it, vi } from "vitest"
import { MCP_PROTOCOL_VERSION, handleStatelessMcpRequest } from "./transport"

const meta = {
  "io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL_VERSION,
  "io.modelcontextprotocol/clientInfo": {
    name: "Matchbox transport test",
    version: "1.0.0",
  },
  "io.modelcontextprotocol/clientCapabilities": {},
}

function headers(method: string, name?: string): Headers {
  return new Headers({
    "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
    "Mcp-Method": method,
    ...(name ? { "Mcp-Name": name } : {}),
  })
}

describe("stateless MCP 2026-07-28 transport", () => {
  it("lists tools with deterministic schemas and cache hints", async () => {
    const response = await handleStatelessMcpRequest({
      body: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: { _meta: meta },
      },
      headers: headers("tools/list"),
    })

    expect(response.status).toBe(200)
    const result = response.body.result as Record<string, unknown>
    expect(result.resultType).toBe("complete")
    expect(result.cacheScope).toBe("public")
    expect(result.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "search_transactions" }),
        expect.objectContaining({ name: "prepare_zap" }),
        expect.objectContaining({ name: "refresh_proposal" }),
      ]),
    )
  })

  it("rejects mirrored header mismatches", async () => {
    const response = await handleStatelessMcpRequest({
      body: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: { _meta: meta },
      },
      headers: headers("tools/call"),
    })
    expect(response.status).toBe(400)
    expect(response.body.error).toEqual(
      expect.objectContaining({ code: -32020 }),
    )
  })

  it("executes each call independently without a session", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ operations: [] }), { status: 200 }),
    ) as unknown as typeof globalThis.fetch
    const response = await handleStatelessMcpRequest({
      body: {
        jsonrpc: "2.0",
        id: "call-1",
        method: "tools/call",
        params: {
          _meta: meta,
          name: "search_transactions",
          arguments: {
            address: "0x9A84c1E29361aD7f8a4d6e2E2a05C8B8e71E42F0",
            category: "bridge",
          },
        },
      },
      headers: headers("tools/call", "search_transactions"),
      fetch,
    })
    expect(response.status).toBe(200)
    expect(response.body.result).toEqual(
      expect.objectContaining({ isError: false, resultType: "complete" }),
    )
  })
})
