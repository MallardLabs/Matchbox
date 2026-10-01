# Matchbox MCP

Shared, transport-independent contracts and tools for Stuart Query and future
Matchbox MCP clients.

## What is implemented

- Zod contracts with generated JSON Schema input and output schemas.
- A stateless MCP 2026-07-28 HTTP transport.
- Wallet context for connected, watched, and one-off inspected addresses.
- Live, explicitly linked Mezo Wormhole journeys from Wormholescan.
- Live gauge ranking and ruthless personal-return optimization across every
  eligible veMEZO and veBTC lock.
- Simulated, content-hashed, wallet-bound unsigned voting proposals with live
  refresh and structured material-change diffs.
- Direct single-sided MUSD Savings deposits with exact approval when required.
- Explicitly unavailable dual-deposit LP zaps until an approved router exists.
- Labeled fixture fallback for the prototype wallet only when enabled by the
  host application.

The tool layer never signs or broadcasts transactions. `prepare_vote`,
`prepare_zap`, and `refresh_proposal` only return expiring, simulated, unsigned
proposals. The browser wallet submits each call after explicit review.

## Tools

| Tool | Purpose | Current data source |
| --- | --- | --- |
| `get_wallet_context` | Resolve wallet mode and permissions | Request context |
| `search_transactions` | Find linked bridge journeys involving Mezo | Live Wormholescan |
| `rank_gauges` | Rank deposited incentives or funded-epoch rate over the last 8 completed epochs | Live indexer + Mezo RPC |
| `optimize_votes` | Maximize projected personal incentive return across all eligible locks | Live indexer + Mezo RPC |
| `prepare_vote` | Validate, simulate, and prepare independent unsigned ballots | Live indexer + Mezo RPC |
| `prepare_zap` | Prepare direct MUSD Savings or refuse an unapproved dual-deposit LP zap | Mezo mainnet contracts |
| `refresh_proposal` | Re-read live state and return a replacement proposal plus material diff | Live indexer + Mezo RPC |

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
