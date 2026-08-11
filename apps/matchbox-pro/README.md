# Matchbox Pro — Stuart Query prototype

Stuart Query is the `Command-K` entry point for navigating Matchbox, asking
Mezo questions, inspecting wallet activity, and preparing user-confirmed
transactions with generative UI.

## Run locally

From the repository root:

```bash
pnpm install --filter @repo/matchbox-pro... --filter @repo/matchbox-mcp...
Copy-Item apps/matchbox-pro/.env.example apps/matchbox-pro/.env.local
pnpm --filter @repo/matchbox-pro dev
```

Set `GROQ_API_KEY` in `.env.local`. It is read only by server modules; never use
a `NEXT_PUBLIC_` prefix. The default model is `openai/gpt-oss-120b` and can be
changed with `GROQ_MODEL`.

For production wallet connection, set `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`
to a project ID from WalletConnect Cloud. Injected browser wallets work during
local development without it, but QR and mobile-wallet discovery require a real
project ID.

Open <http://localhost:3002> and press `Command-K` or `Control-K`.

## Service endpoints

- `POST /api/query` — Stuart orchestration for the first-party UI.
- `POST /api/mcp` — stateless MCP 2026-07-28 tools endpoint.
- `GET /api/health` — non-secret runtime readiness metadata.

Stuart uses one Groq completion to select a bounded Matchbox tool, or to answer
a support question directly when no tool is needed. All tool-backed financial
copy, values, and UI blocks are produced from validated tool results, not
free-form model output. If Groq is unavailable or rate limited, the same
allowlisted tools remain available through deterministic intent routing.

## Current live and safety boundaries

- Live: Groq orchestration, arbitrary public wallet context, explicitly linked
  Wormhole journeys, indexed gauge incentives/history, on-chain weights,
  wallet ve positions, and ruthless personal-return optimization.
- The wallet selector supports injected, WalletConnect, and saved watched
  addresses. The selected identity is sent with every Query; watched addresses
  are stored in the browser and remain read-only.
- Vote proposals are chain-aware, ABI-encoded, simulated against Mezo Mainnet,
  and returned as unsigned wallet requests. They are never submitted by Stuart.
- Direct MUSD Savings deposits check the live MUSD balance and allowance. An
  exact approval is prepared only when required.
- Multi-asset MEZO/MUSD zaps remain unavailable until an approved Matchbox
  router and vault are added to the contract registry; Stuart does not invent
  a plausible-looking route.
- Fixture fallback is visibly labeled and controlled by
  `STUART_DEMO_FALLBACK`; it is intended for prototype demonstrations.
- Watched and inspected wallets are read-only. Transaction proposals require
  the matching wallet to be connected, and every proposal still requires user
  review and wallet confirmation.
- Cross-chain search follows only provider-linked bridge journeys. Stuart does
  not infer ownership by scanning the same address across unrelated chains.

## Environment variables

| Variable | Required | Visibility | Purpose |
| --- | --- | --- | --- |
| `GROQ_API_KEY` | Yes for natural-language routing | Server only | Groq API authentication |
| `GROQ_MODEL` | No | Server only | Defaults to `openai/gpt-oss-120b` |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | Recommended | Browser | WalletConnect QR and mobile-wallet discovery |
| `MATCHBOX_DATA_BASE_URL` | No | Server only | Override the Matchbox data/indexer origin |
| `MEZO_RPC_URLS` | No | Server only | Comma-separated Mezo RPC fallback list |
| `STUART_DEMO_FALLBACK` | No | Server only | Enables visibly labeled bridge fixtures |
| `MATCHBOX_MCP_ALLOWED_ORIGINS` | Production MCP browser access only | Server only | Comma-separated CORS allowlist for `/api/mcp` |

## Verification

```bash
pnpm --filter @repo/matchbox-mcp lint
pnpm --filter @repo/matchbox-mcp typecheck
pnpm --filter @repo/matchbox-mcp test
pnpm --filter @repo/matchbox-pro lint
pnpm --filter @repo/matchbox-pro typecheck
pnpm --filter @repo/matchbox-pro test
pnpm --filter @repo/matchbox-pro build
```
