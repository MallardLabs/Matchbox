# Matchbox ID (`id.matchbox.markets`)

OIDC provider with SIWE (EIP-4361) wallet sign-in, consent, connected apps and
session management
([ARCHITECTURE §7](../../docs/developer-platform/ARCHITECTURE.md)). Hono
Worker + Vite SPA (TanStack Router) served through `ASSETS`. Worker
`matchbox-id`, custom domain `id.matchbox.markets`, issuer
`https://id.matchbox.markets`.

Rollout, secrets, key rotation, smoke tests and emergency controls:
[docs/developer-platform.md](../../docs/developer-platform.md).

## Commands

```sh
pnpm dev             # vite + Worker via @cloudflare/vite-plugin, http://localhost:5180
pnpm build           # vite build
pnpm test
pnpm lint            # lint:fix to apply fixes
pnpm typecheck
pnpm keys:generate   # prints a fresh OIDC_SIGNING_KEYS value
pnpm run deploy      # vite build && wrangler deploy
```

## Local development

```sh
cp .dev.vars.example .dev.vars
pnpm --silent keys:generate   # paste the output into OIDC_SIGNING_KEYS
pnpm dev
```

`.dev.vars.example` sets `PLATFORM_STORE=memory`, both flags on and
`ISSUER=http://localhost:5180`. Memory mode is refused when
`ENVIRONMENT=production`. Seed (`src/worker/store/memory-store.ts`):

- Test client `mbx_test_ExampleTestClient0000001` (public; redirects
  `http://localhost:5174/callback`, `http://127.0.0.1:5174/callback`).
- Live client `mbx_live_ExampleLiveClient0000001` (confidential; redirect
  `https://localhost:5174/callback`; dev secret in the seed file; Discord
  scopes optional).
- Wallet `0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266` (Hardhat account #0)
  with a linked Discord. No dev sign-in: SIWE needs a wallet signature.

## Configuration

Vars (`wrangler.jsonc`): `ENVIRONMENT`, `ISSUER`, `MATCHBOX_ID_ENABLED`,
`DISCORD_CLAIMS_ENABLED` (both `"true"` in the checked-in config).

- `MATCHBOX_ID_ENABLED=false`: `/api/*`, `/oauth/*`, `/.well-known/*` return
  503 `service_disabled`; config is not validated.
- `DISCORD_CLAIMS_ENABLED=false`: `discord:*` scopes are dropped from
  discovery and omitted from tokens and userinfo; at authorize, optional
  ones are ignored and required ones fail with `invalid_scope`.

## Scopes and consent

- Unknown `scope` values are ignored (OIDC Core §3.1.2.1); `openid` is
  required. Known scopes the environment is not approved for fail with
  `invalid_scope`.
- Each environment marks some requested scopes optional
  (`optionalScopes`, developer console; `openid` is always required). The
  consent screen shows a switch for each optional scope; declining one still
  signs the user in.
- A grant stores the granted scopes and the declined optional ones. Codes,
  tokens (`scope`), the ID token and userinfo carry granted scopes only.
  Declined scopes are not asked for again until the app sends
  `prompt=consent`; a scope the grant has never decided (a new one) brings
  the consent screen back with a "New" chip. An optional scope that cannot be
  granted right now (Discord not linked) is neither granted nor declined, so
  it is asked for once it becomes available.
- `POST /api/authorization-requests/{id}/decision` takes `declinedScopes`
  (omitted: keep the grant's earlier choices). Declining a required scope, or
  a required scope being unavailable, answers the client with
  `access_denied` (`required-scope-declined`, `discord-not-linked` or
  `scope-unavailable`).
- `GET /api/authorization-requests/{id}/summary` (no session) gives the app
  name and logo for "Continue to <app>" on the sign-in page.

## Pages

`/sign-in` (wallet, then the exact EIP-4361 message to sign), `/authorize`
(consent), `/` (connected apps with revoke and ended grants; sessions on
`/?tab=sessions`; `/apps` redirects here), `/error?code=`.

Secrets (`wrangler secret put`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SESSION_PEPPER`, `CLIENT_SECRET_PEPPER` (same value as the developer
console), `OIDC_SIGNING_KEYS` (JSON array of private ES256 JWKs with `kid`;
index 0 signs, all are published), optional `MEZO_MAINNET_RPC_URL` /
`MEZO_TESTNET_RPC_URL` (defaults in `src/worker/config.ts`).

Bindings: Durable Object `RATE_LIMITER` (`RateLimiter`), `ASSETS`. Cron
`17 * * * *` purges expired rows (`mbx_id_purge_expired`).
