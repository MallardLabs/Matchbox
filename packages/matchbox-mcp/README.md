# Matchbox MCP

Shared, transport-independent contracts and tools for Stuart Query and future
Matchbox MCP clients.

## What is implemented

- Zod contracts with generated JSON Schema input and output schemas.
- A stateless MCP 2026-07-28 HTTP transport.
- Wallet context for connected, watched, and one-off inspected addresses.
- Live, explicitly linked Mezo Wormhole journeys from Wormholescan.
- Deterministic prototype vote optimization, unsigned voting proposals, and
  unsigned MEZO/MUSD Earn zap proposals.
- Labeled fixture fallback for the prototype wallet only when enabled by the
  host application.

The tool layer never signs or broadcasts transactions. `prepare_vote` and
`prepare_zap` only return expiring, simulated, unsigned proposals.

## Tools

| Tool | Purpose | Current data source |
| --- | --- | --- |
| `get_wallet_context` | Resolve wallet mode and permissions | Request context |
| `search_transactions` | Find linked bridge journeys involving Mezo | Live Wormholescan |
| `optimize_votes` | Maximize projected personal incentive return | Prototype optimizer fixture |
| `prepare_vote` | Validate and prepare an unsigned vote | Deterministic prototype |
| `prepare_zap` | Prepare an unsigned Earn zap | Deterministic prototype |

`search_transactions` currently has live coverage for Wormhole only. A request
for all bridge providers includes a visible partial-coverage notice until native
and additional bridge adapters are connected.

## Transport contract

The Next.js host exposes the package at `POST /api/mcp`. Requests use the
stateless MCP 2026-07-28 envelope and mirrored HTTP headers:

```http
POST /api/mcp
Content-Type: application/json
Accept: application/json
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/list
```

```json
{
  "jsonrpc": "2.0",
  "id": "tools-1",
  "method": "tools/list",
  "params": {
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": {
        "name": "matchbox-example",
        "version": "0.1.0"
      },
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

There are no protocol sessions or server-sent event streams. Browser origins
are checked by the host endpoint. Production authentication and per-user policy
enforcement remain an integration task.
