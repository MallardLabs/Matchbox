# Matchbox API (`api.matchbox.markets`)

Hono Worker serving the Gauge Profile API
([ARCHITECTURE §6](../../docs/developer-platform/ARCHITECTURE.md)). Worker
`matchbox-developer-api`, custom domain `api.matchbox.markets`. Rollout,
secrets, smoke tests and emergency controls:
[docs/developer-platform.md](../../docs/developer-platform.md).

## Routes

| Route                                             | Auth                                                |
| ------------------------------------------------- | --------------------------------------------------- |
| `GET /v1/health`                                  | none                                                |
| `GET /openapi.json`                               | none (from `@repo/platform-contracts/openapi.json`) |
| `GET /v1/networks`                                | API key                                             |
| `GET /v1/gauge-profiles?network=…`                | API key                                             |
| `GET /v1/gauge-profiles/{network}/{gaugeAddress}` | API key                                             |
| `GET /v1/vebtc/{network}/{tokenId}/gauge-profile` | API key                                             |

## Local development

```sh
cp .dev.vars.example .dev.vars
pnpm dev:memory     # http://localhost:8787, sample data + fixed dev keys, no Supabase
pnpm dev:seed-keys  # prints the memory-mode keys and their origins
pnpm dev            # Supabase-backed; needs .dev.vars secrets
```

Memory-mode publishable test keys accept origins `http://localhost:3000` and
`http://localhost:5173`.

Other scripts: `pnpm test`, `pnpm lint`, `pnpm typecheck`.

`PLATFORM_STORE=memory` is refused when `ENVIRONMENT=production` (the
checked-in default). Memory mode also logs the dev keys once per isolate.

## Deploy

```sh
pnpm turbo run build --filter=@repo/developer-api...   # from the repo root; builds @repo/shared
pnpm --filter @repo/developer-api run deploy           # `run`: `pnpm deploy` is a pnpm built-in
```

Secrets (`wrangler secret put`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`API_KEY_PEPPER` (same value as the developer console, ≥ 32 chars),
`MEZO_MAINNET_RPC_URL`, `MEZO_TESTNET_RPC_URL`. Missing or invalid bindings
make every request return 500 `internal_error` and log the problem names.

Vars: `ENVIRONMENT` (`production`), `API_VERSION`,
`GAUGE_PROFILE_API_ENABLED` (kill switch, default `"false"`: `/v1/*` except
`/v1/health` and `/openapi.json` returns 503 `service_disabled`),
`PUBLISHABLE_QUOTA_SHARE` (publishable keys' share of the environment quota,
`(0, 1]`, default `0.5`).

Durable Object `RATE_LIMITER` → `RateLimiter` from
`@repo/platform-server/rate-limiter`. Migration `v2` deletes the beta
`ApiQuotaLimiter` class and adds `RateLimiter`.

## Auth and limits

- Keys verified by prefix lookup + HMAC(`API_KEY_PEPPER`), cached per isolate
  for 15 s (revocation latency ≤ 15 s). Unknown keys are negatively cached.
- Missing/malformed keys and failed verification consume `ip:<prefix>`
  (`unauthenticated` policy). Cache misses consume `lookup:<prefix>`
  (120/min) before the DB read.
- Per environment: `env:<environmentId>:secret` with `rateLimitPolicies` +
  `mbx_dev_quota_overrides` (cached 60 s), and `env:<environmentId>:publishable`
  scaled by `PUBLISHABLE_QUOTA_SHARE`. Publishable keys also use
  `pk:<keyId>:<ipPrefix>`. Restricted apps get test limits. The limiter
  fails open if the Durable Object is unavailable.
- Live keys need `review_state = approved` with `gauge-profiles:read` in
  `approved_scopes` and an `active`/`restricted` app.
- `last_used_at` is written at most once per key per 5 min (`waitUntil`).

## Request log

Analytics Engine binding `REQUEST_LOG`, dataset `mbx_api_requests`. Layout:
`API_REQUEST_LOG_LAYOUT` in `@repo/platform-contracts/api-request-log`
(index1 environment id or `anonymous`; blob1–9 requestId, keyId,
routeTemplate, method, status, cacheStatus, colo, country, environmentKind;
double1 latencyMs, double2 statusCode).

## Cron

`*/10 * * * *` reconciles `mbx_api_gauge_chain_state` for every profile in
`mbx_api_gauge_profiles`: Multicall3 reads (`isAlive`, `rewardsBeneficiary`,
`boostableTokenIdToGauge`, veBTC `ownerOf`) pinned to one block per network,
40 gauges per batch, 3 batches in flight. A network without an RPC URL is
skipped. Failures are logged; the handler never throws. Test locally with
`wrangler dev --test-scheduled` and `curl /__scheduled`.
