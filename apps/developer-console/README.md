# Matchbox developer console (`developer.matchbox.markets`)

Passkey-authenticated console for organizations, apps, test/live
environments, API keys, client secrets, usage and docs, plus staff review at
`/admin` ([ARCHITECTURE §8](../../docs/developer-platform/ARCHITECTURE.md)).
Hono Worker + Vite SPA (TanStack Router) served through `ASSETS`. Worker
`matchbox-developer-console`, custom domain `developer.matchbox.markets`.

Rollout, secrets, staff bootstrap, smoke tests and emergency controls:
[docs/developer-platform.md](../../docs/developer-platform.md).

## Commands

```sh
pnpm dev          # vite + Worker via @cloudflare/vite-plugin, http://localhost:5175
pnpm build        # vite build
pnpm test
pnpm lint         # lint:fix to apply fixes
pnpm typecheck
pnpm run deploy   # vite build && wrangler deploy
```

## Local development

```sh
cp .dev.vars.example .dev.vars
pnpm dev
```

`.dev.vars.example` sets `PLATFORM_STORE=memory`,
`DEVELOPER_CONSOLE_ENABLED=true`, `WEBAUTHN_RP_ID=localhost` and
`WEBAUTHN_ORIGIN=http://localhost:5175`. Memory mode is refused when
`ENVIRONMENT=production`. Seed (`src/worker/store/seed.ts`): account
`dev@matchbox.local` (staff `reviewer`), org "Mallard Labs", an approved live
gauge-profile app, an app with an open `discord:profile` review and one
whose `discord:id` request came back with a reviewer note. Use the
dev sign-in button (`POST /api/auth/dev-sign-in`, memory mode outside
production only). Usage data is synthetic unless `CF_ACCOUNT_ID` and
`CF_ANALYTICS_TOKEN` are set.

## Configuration

Vars (`wrangler.jsonc`): `ENVIRONMENT`, `DEVELOPER_CONSOLE_ENABLED` (default
`"false"`: `/api/*` returns 503 `service_disabled`), `WEBAUTHN_RP_ID`,
`WEBAUTHN_ORIGIN`, `PUBLIC_API_ORIGIN`, `ID_ORIGIN`.

Secrets (`wrangler secret put`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`API_KEY_PEPPER` (same value as the developer API), `CLIENT_SECRET_PEPPER`
(same value as Matchbox ID), `SESSION_PEPPER`, `CF_ACCOUNT_ID`,
`CF_ANALYTICS_TOKEN` (read-only Analytics Engine SQL API token; without them
usage endpoints return 503). Invalid config returns 500 `internal_error` on
`/api/*` even while disabled.

Bindings: Durable Object `RATE_LIMITER` (`RateLimiter`), cross-script
`API_RATE_LIMITER` (the developer-api's `RateLimiter`, read-only quota
peeks for "Quota · today"; `script_name` `matchbox-developer-api`, staging
`matchbox-developer-api-staging`), `ASSETS`, `send_email` `EMAIL` (from
`no-reply@matchbox.markets`; the domain must be onboarded to Cloudflare
Email Sending).

Platform health (`GET /api/platform/health`, public) reads the
`mbx_platform_health` dataset with the same `CF_ACCOUNT_ID` /
`CF_ANALYTICS_TOKEN`; memory mode serves a fixed local fixture
(`source: "local"`). Without `API_RATE_LIMITER`, memory mode reads an empty
in-memory limiter (quota shows real zeros) and deployed consoles show "—".

Staff: insert into `mbx_dev_staff` (`account_id`, `role` = `reviewer` |
`operator`) by SQL; see the runbook.
