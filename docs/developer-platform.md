# Matchbox Developer Platform v2 — operations runbook

Deploy, configure, operate and roll back the developer platform. Design and
as-built decisions live in
[developer-platform/ARCHITECTURE.md](developer-platform/ARCHITECTURE.md) (source
of truth). Per-app detail: [matchbox-id](../apps/matchbox-id/README.md),
[developer-console](../apps/developer-console/README.md),
[developer-api](../apps/developer-api/README.md),
[SDK](../packages/developer-sdk/README.md).

## 1. What exists

| Path                          | Package                    | Worker                       | Host                         | Role                                                                             |
| ----------------------------- | -------------------------- | ---------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| `apps/matchbox-id`            | `@repo/matchbox-id`        | `matchbox-id`                | `id.matchbox.markets`        | OIDC provider (SIWE wallet sign-in), consent, connected apps, sessions           |
| `apps/developer-console`      | `@repo/developer-console`  | `matchbox-developer-console` | `developer.matchbox.markets` | Passkey developer console: orgs, apps, environments, keys, usage; staff `/admin` |
| `apps/developer-api`          | `@repo/developer-api`      | `matchbox-developer-api`     | `api.matchbox.markets`       | Gauge Profile API (`/v1/*`), chain-state reconciliation cron                     |
| `packages/ui`                 | `@repo/ui`                 | —                            | —                            | React component + token library                                                  |
| `packages/platform-contracts` | `@repo/platform-contracts` | —                            | —                            | Zod schemas, OpenAPI document, scopes, rate-limit policies                       |
| `packages/platform-server`    | `@repo/platform-server`    | —                            | —                            | Worker helpers: Supabase admin, flags, crypto, middleware, `RateLimiter` DO      |
| `packages/logger`             | `@repo/logger`             | —                            | —                            | Structured logger                                                                |
| `packages/developer-sdk`      | `@matchbox-markets/sdk`    | —                            | —                            | API client + `./oidc` helpers (1.0.0-beta.1)                                     |

Migrations (apply in order; all additive):

1. `supabase/migrations/20260930000001_create_developer_platform_v2.sql` —
   `mbx_id_*`, `mbx_dev_*`, `mbx_platform_audit_events`,
   `mbx_api_gauge_chain_state`, view `mbx_api_gauge_profiles`, Discord grant
   invalidation trigger.
2. `supabase/migrations/20260930000002_developer_console_functions.sql` —
   console transactional functions, recovery-passkey step-up block.
3. `supabase/migrations/20260930000003_matchbox_id_functions.sql` — SIWE
   network binding, refresh-token families, purge function.

Each file has a manual rollback block in its header comment.

## 2. Topology

```text
id.matchbox.markets         → Worker matchbox-id                 Hono + Vite SPA, DO RateLimiter, cron
developer.matchbox.markets  → Worker matchbox-developer-console  Hono + Vite SPA, DO RateLimiter, send_email EMAIL
api.matchbox.markets        → Worker matchbox-developer-api      Hono, DO RateLimiter, Analytics Engine REQUEST_LOG, cron
                                  │
                                  └─ Supabase Postgres (service role over PostgREST; data store only)
```

- Custom domains are declared in each `wrangler.jsonc`
  (`"custom_domain": true`); the `matchbox.markets` zone is on Cloudflare.
- Supabase: service role only. RLS on every `mbx_*` relation, no
  anon/authenticated policies or privileges. No Supabase Auth.
- Analytics Engine: the API writes one data point per request to dataset
  `mbx_api_requests` (binding `REQUEST_LOG`); the console reads it through the
  Analytics Engine SQL API using `CF_ACCOUNT_ID` + `CF_ANALYTICS_TOKEN`.
- Email: console binding `EMAIL` (`send_email`), sender
  `no-reply@matchbox.markets` (sign-up/recovery codes, invitations, review
  notices). A missing binding in production is logged as an error.
- Cron triggers:
  - `matchbox-id` `17 * * * *` — purges expired nonces, authorization
    requests, codes, tokens and empty token families (`mbx_id_purge_expired`).
  - `matchbox-developer-api` `*/10 * * * *` — reconciles
    `mbx_api_gauge_chain_state` (Multicall3, one block per network).
- `workers_dev: true` is set for the console and API; `matchbox-id` does not
  set it.
- Existing tables v2 reads: `gauge_profiles`, `validator_profiles` (via the
  view), `discord_wallet_links` (Discord claims; the trigger is created only if
  the table exists).

## 3. Feature flags and rollout order

Flags are Worker `vars` (`"true"`/`"false"`); all are `"false"` in the
checked-in wrangler files.

| Flag                        | Worker                     | Off behaviour                                                                                            |
| --------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `DEVELOPER_CONSOLE_ENABLED` | matchbox-developer-console | `/api/*` → `503 service_disabled`; SPA shows unavailable                                                 |
| `GAUGE_PROFILE_API_ENABLED` | matchbox-developer-api     | `/v1/*` except `/v1/health` and `/openapi.json` → `503 service_disabled`                                 |
| `MATCHBOX_ID_ENABLED`       | matchbox-id                | `/api/*`, `/oauth/*`, `/.well-known/*` → `503 service_disabled`; SPA shows unavailable                   |
| `DISCORD_CLAIMS_ENABLED`    | matchbox-id                | `discord:*` scopes dropped from discovery, refused at authorize (`invalid_scope`), omitted from userinfo |

Changing a flag: edit `wrangler.jsonc` and deploy (durable), or edit the
variable in the dashboard (Worker → Settings → Variables), which deploys a new
version immediately. The next `wrangler deploy` overwrites dashboard vars with
the file's values, so commit the flag state you want to keep. **Any deploy
from a checkout with `"false"` turns that product off.**

Safe rollout order:

1. Keep every flag `"false"`.
2. Apply migrations 0001 → 0002 → 0003 (`supabase db push` from a linked CLI,
   or run each file once, in order, in the Supabase SQL editor). Test against
   realistic data first per
   [agent-instructions/supabase-migrations.md](../agent-instructions/supabase-migrations.md).
3. Complete the Cloudflare prerequisites (§5).
4. Set secrets on all three Workers (§4). Invalid or missing config makes the
   console and API answer `500 internal_error` even while disabled; Matchbox ID
   validates its config only when enabled.
5. Deploy the three Workers (§4.4). Each deploy attaches its custom domain,
   which needs the host's Netlify CNAME removed first (§11).
6. Smoke-test the disabled state (§7.1).
7. Enable the console: `DEVELOPER_CONSOLE_ENABLED` → `"true"`, deploy. Sign up
   with the staff member's email (email code → passkey).
8. Create the staff row (SQL editor):

   ```sql
   INSERT INTO public.mbx_dev_staff (account_id, role)
   SELECT id, 'operator'
   FROM public.mbx_dev_accounts
   WHERE email = lower('staff@example.com')
   ON CONFLICT (account_id) DO UPDATE SET role = EXCLUDED.role;
   ```

   Columns: `account_id` (PK → `mbx_dev_accounts.id`, cascade delete),
   `role` (`reviewer | operator`), `created_at` (defaults to now). `operator`
   includes `reviewer`. Reviewers read the queue, apps and audit log and decide
   reviews; app status changes and quota overrides need `operator`. Staff
   writes also need a fresh passkey step-up. Confirm `/admin` loads.

9. Enable the API: `GAUGE_PROFILE_API_ENABLED` → `"true"`, deploy. Create a
   test app and key in the console; run §7.2.
10. Enable Matchbox ID: `MATCHBOX_ID_ENABLED` → `"true"`, deploy. Run §7.3 and
    a full sign-in against a test environment.
11. Discord claims last: `DISCORD_CLAIMS_ENABLED` → `"true"`, deploy — after
    confirming `discord_wallet_links` is populated by the Discord bot and a
    `discord:*` review has been approved in `/admin`.

## 4. Secrets

Set with `wrangler secret put <NAME>` (prompts for the value; creates and
deploys a new version). Never put secrets in `vars`.

```sh
pnpm --filter @repo/matchbox-id exec wrangler secret put SESSION_PEPPER
pnpm --filter @repo/developer-console exec wrangler secret put API_KEY_PEPPER
pnpm --filter @repo/developer-api exec wrangler secret list
```

### 4.1 Per Worker

| Secret                                         | matchbox-id | developer-console | developer-api | Notes                                                                                       |
| ---------------------------------------------- | :---------: | :---------------: | :-----------: | ------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`    |      ✓      |         ✓         |       ✓       | Service role key                                                                            |
| `API_KEY_PEPPER`                               |             |         ✓         |       ✓       | **Same value** on both. The API requires ≥ 32 chars                                         |
| `CLIENT_SECRET_PEPPER`                         |      ✓      |         ✓         |               | **Same value** on both                                                                      |
| `SESSION_PEPPER`                               |      ✓      |         ✓         |               | Independent per Worker; use distinct values                                                 |
| `OIDC_SIGNING_KEYS`                            |      ✓      |                   |               | JSON array of private ES256 JWKs with `kid`; index 0 signs, all are published in JWKS       |
| `CF_ACCOUNT_ID`, `CF_ANALYTICS_TOKEN`          |             |         ✓         |               | Analytics Engine SQL API, read-only token. Unset → usage endpoints answer 503               |
| `MEZO_MAINNET_RPC_URL`, `MEZO_TESTNET_RPC_URL` |      ✓      |                   |       ✓       | ID: SIWE ERC-1271/6492 checks (has defaults). API: cron; a network without a URL is skipped |

Vars already in the wrangler files: `ENVIRONMENT=production`, `ISSUER` (ID);
`WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`, `PUBLIC_API_ORIGIN`, `ID_ORIGIN`
(console); `API_VERSION`, `PUBLISHABLE_QUOTA_SHARE` (API). Leave
`PLATFORM_STORE` unset in production (`memory` is refused when
`ENVIRONMENT=production`).

Keep every secret's current value in the team password manager: Cloudflare
cannot show a secret back, and OIDC key rotation needs the existing
`OIDC_SIGNING_KEYS` value.

Generate fresh v2 peppers; do not reuse the beta `API_KEY_PEPPER` (it was also
held in Netlify env).

### 4.2 Generating values

Peppers (32 random bytes, base64url, 43 chars):

```sh
# bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'; echo
```

```powershell
# PowerShell 5.1+
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

Pipe straight into a secret (bash):

```sh
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))" \
  | pnpm --filter @repo/developer-api exec wrangler secret put API_KEY_PEPPER
```

For the shared peppers, generate once and set the same value on both Workers.

OIDC signing keys (prints a one-element JSON array):

```sh
pnpm --silent --filter @repo/matchbox-id keys:generate
```

Paste the output at the `wrangler secret put OIDC_SIGNING_KEYS` prompt.

### 4.3 OIDC signing key rotation

Index 0 signs; every key in the array is published at `/oauth/jwks`
(`Cache-Control: public, max-age=300`). Access and ID tokens live 10 min.

1. `pnpm --silent --filter @repo/matchbox-id keys:generate` → new key `N`.
2. Pre-publish: set the secret to `[OLD, N]` (old still signs, `N` is
   published). Wait ≥ 5 min for JWKS caches.
3. Set `[N, OLD]` — `N` now signs.
4. Wait > 15 min (10 min token lifetime + 5 min JWKS cache).
5. Set `[N]`.
6. Update the password manager entry.

Compromised key: set `[N]` immediately. Tokens signed with the old key stop
verifying at relying parties; users re-authorize.

### 4.4 Build and deploy

Use `pnpm run deploy` (`pnpm deploy` is a pnpm built-in command).

```sh
pnpm lint && pnpm typecheck && pnpm test
pnpm turbo run build --filter=@repo/developer-api...   # builds @repo/shared first
pnpm --filter @repo/developer-api run deploy           # wrangler deploy
pnpm --filter @repo/developer-console run deploy       # vite build && wrangler deploy
pnpm --filter @repo/matchbox-id run deploy             # vite build && wrangler deploy
```

- The API's Durable Object migration `v2` deletes the beta `ApiQuotaLimiter`
  class and adds `RateLimiter`.
- Logs: `pnpm --filter <package> exec wrangler tail`.
- Bad version: `pnpm --filter <package> exec wrangler rollback`.
- Workers Builds (CI) projects for these Workers are not defined in the repo.
  If used, configure each in the dashboard with deploy command
  `pnpm --filter <package> run deploy` (plus the `@repo/shared` build for the
  API).

## 5. Cloudflare prerequisites

- **Custom domains** — created by `wrangler deploy` from the wrangler routes.
  A custom domain cannot be created on a hostname that still has a CNAME
  record: delete the Netlify CNAME for `id.`, `developer.` and `api.` at
  cutover.
  <https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>
- **Email Sending** — onboard `matchbox.markets` under Email Service → Email
  Sending (adds `cf-bounce` MX, SPF, DKIM and a `_dmarc` record) so the console
  can send from `no-reply@matchbox.markets`. Review existing SPF/DMARC records
  on the zone before accepting. New accounts start with a conservative daily
  sending quota.
  <https://developers.cloudflare.com/email-service/get-started/send-emails/> ·
  <https://developers.cloudflare.com/email-service/configuration/send-bindings/> ·
  <https://developers.cloudflare.com/email-service/platform/limits/>
- **Analytics Engine dataset** `mbx_api_requests` — created implicitly by the
  API Worker's first write; nothing to provision. After the first API request,
  confirm with `SHOW TABLES` against the SQL API.
  <https://developers.cloudflare.com/analytics/analytics-engine/>
- **Analytics read token** (`CF_ANALYTICS_TOKEN`) — custom API token with
  Account → Account Analytics → Read, limited to the Matchbox account.
  `CF_ACCOUNT_ID` is that account's id.
  <https://developers.cloudflare.com/analytics/analytics-engine/sql-api/> ·
  <https://developers.cloudflare.com/fundamentals/api/get-started/create-token/>
- Reference: secrets
  <https://developers.cloudflare.com/workers/configuration/secrets/>, cron
  triggers
  <https://developers.cloudflare.com/workers/configuration/cron-triggers/>.

## 6. Local development

Each app runs alone on its own seeded in-memory store
(`PLATFORM_STORE=memory`); stores are per Worker and share no data. First,
`cp .dev.vars.example .dev.vars` in each app (git-ignored).

### developer-console — `http://localhost:5175`

```sh
pnpm --filter @repo/developer-console dev
```

- `.dev.vars.example` already sets `PLATFORM_STORE=memory`,
  `DEVELOPER_CONSOLE_ENABLED=true`, `WEBAUTHN_RP_ID=localhost`.
- Seed: account `dev@matchbox.local` (staff `reviewer`), org "Mallard Labs",
  an approved live gauge-profile app, an app with an open `discord:profile`
  review.
- Sign in with the dev sign-in button (`POST /api/auth/dev-sign-in`; memory
  store outside production only; the session is already stepped up).
- Usage charts are synthetic unless `CF_ACCOUNT_ID`/`CF_ANALYTICS_TOKEN` are
  set.

### matchbox-id — `http://localhost:5180`

```sh
pnpm --silent --filter @repo/matchbox-id keys:generate   # paste into OIDC_SIGNING_KEYS in .dev.vars
pnpm --filter @repo/matchbox-id dev
```

- Seeded clients: test `mbx_test_ExampleTestClient0000001` (public, redirects
  `http://localhost:5174/callback`, `http://127.0.0.1:5174/callback`); live
  `mbx_live_ExampleLiveClient0000001` (confidential, redirect
  `https://localhost:5174/callback`, dev secret in
  `src/worker/store/memory-store.ts`).
- Seeded wallet `0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266` (Hardhat account
  #0, public test key) with a linked Discord. There is no dev sign-in: SIWE
  needs a wallet signature.
- Pass `issuer: "http://localhost:5180"` to the SDK OIDC helpers.

### developer-api — `http://localhost:8787`

```sh
pnpm --filter @repo/developer-api dev:memory      # sample profiles + fixed keys, no Supabase
pnpm --filter @repo/developer-api dev:seed-keys   # prints the memory-mode keys
pnpm --filter @repo/developer-api dev             # Supabase-backed; needs .dev.vars secrets
```

- Publishable test-key origins: `http://localhost:3000`,
  `http://localhost:5173`.
- Cron: `pnpm --filter @repo/developer-api exec wrangler dev --test-scheduled`,
  then `curl http://localhost:8787/__scheduled`.

To run any app against Supabase, remove `PLATFORM_STORE=memory` and fill
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (use a non-production project).

## 7. Smoke tests

PowerShell: use `curl.exe`.

### 7.1 Disabled state (after first deploy)

```sh
curl -i https://api.matchbox.markets/v1/health          # 200 {"status":"ok","version":"2.0.0","flags":{"gaugeProfileApi":false}}
curl -i https://api.matchbox.markets/openapi.json       # 200, OpenAPI 3.1
curl -i https://api.matchbox.markets/v1/networks        # 503 service_disabled
curl -i https://id.matchbox.markets/.well-known/openid-configuration   # 503 service_disabled
curl -i https://developer.matchbox.markets/api/me       # 503 service_disabled
curl -I https://developer.matchbox.markets/             # 200 (SPA, unavailable state)
```

`500 internal_error` means invalid config: `wrangler tail` shows the problem
list (names only, never values).

### 7.2 API enabled

```sh
curl -i https://api.matchbox.markets/v1/networks        # 401 unauthorized
curl -i -H "Authorization: Bearer $MBX_TEST_SK" https://api.matchbox.markets/v1/networks
curl -i -H "Authorization: Bearer $MBX_TEST_SK" "https://api.matchbox.markets/v1/gauge-profiles?network=mezo-testnet&limit=5"
curl -i -H "Authorization: Bearer $MBX_TEST_SK" "https://api.matchbox.markets/v1/gauge-profiles?network=mezo"   # 403 network_not_allowed
curl -i -H "Authorization: Bearer $MBX_TEST_SK" -H "Origin: https://example.com" https://api.matchbox.markets/v1/networks   # 403 origin_not_allowed
```

Check `X-Request-Id`, `RateLimit-*` and `ETag` headers, then confirm the
requests appear in the console Usage view.

### 7.3 Matchbox ID enabled

```sh
curl -s https://id.matchbox.markets/.well-known/openid-configuration   # "issuer":"https://id.matchbox.markets"
curl -s https://id.matchbox.markets/oauth/jwks                         # one key per OIDC_SIGNING_KEYS entry
```

Then run code + PKCE with the SDK against a test environment: sign in,
consent, exchange, `verifyIdToken`, userinfo, refresh, revoke. Confirm the
grant shows on `https://id.matchbox.markets/` and can be revoked there.

### 7.4 Console enabled

Sign up (code arrives from `no-reply@matchbox.markets`), register a passkey,
create an org and an app, create a test API key (step-up prompt), rotate and
revoke it, open `/admin` as staff.

## 8. Partner quickstart

1. Sign up at `https://developer.matchbox.markets` (email code → passkey) and
   create an organization.
2. Create an app; its test (`mezo-testnet`) and live (`mezo`) environments are
   created with it.
3. Test environment → API keys: secret (`mbx_sk_test_…`, server-only) or
   publishable (`mbx_pk_test_…`, browsers; register the origin first). Keys
   are shown once.
4. Read gauge profiles:

   ```ts
   import { createMatchboxClient } from "@matchbox-markets/sdk";

   const matchbox = createMatchboxClient({
     apiKey: process.env.MATCHBOX_API_KEY ?? "",
   });
   const page = await matchbox.gaugeProfiles.list({
     network: "mezo-testnet",
     limit: 50,
   });
   for await (const profile of matchbox.gaugeProfiles.iterate({
     network: "mezo-testnet",
   })) {
     console.log(profile.gaugeAddress, profile.displayName);
   }
   ```

   Test keys read `mezo-testnet` only (validator gauges; boost gauges are
   mainnet-only). Live keys need the live environment approved: a submission
   for `gauge-profiles:read` alone is auto-approved when the owner email is
   verified, the app has a website URL and the app is `active`.

5. Sign in with Matchbox: register redirect URIs on the environment (test
   accepts `https://` and `http://localhost` / `http://127.0.0.1`; live
   `https://` only), take the client id (`mbx_test_…`), create a client secret
   for confidential clients, then use `@matchbox-markets/sdk/oidc`:
   `createPkcePair`, `createState`, `createNonce`, `buildAuthorizeUrl`,
   `exchangeCode`, `verifyIdToken`, `fetchUserinfo`, `refreshTokens`,
   `revokeToken`. Scopes `openid`, `wallet`; `discord:id` and
   `discord:profile` need a manual review. Refresh tokens rotate: always store
   the newest.

Full reference: the console Docs section and
[packages/developer-sdk/README.md](../packages/developer-sdk/README.md).

## 9. Security checklist

- [ ] All Workers run `ENVIRONMENT=production` with `PLATFORM_STORE` unset
      (memory store and dev sign-in are refused in production).
- [ ] Peppers freshly generated from ≥ 32 random bytes; shared peppers
      identical across each pair; `SESSION_PEPPER` distinct per Worker.
- [ ] `OIDC_SIGNING_KEYS` and all peppers held only in Cloudflare secrets and
      the password manager.
- [ ] `CF_ANALYTICS_TOKEN` is Account Analytics Read only, one account.
- [ ] Migrations applied; `anon`/`authenticated` have no access to `mbx_*`
      (spot-check a `mbx_*` read with the anon key: it must fail).
- [ ] Stale beta secrets removed from `matchbox-developer-api`
      (`wrangler secret list`; delete `API_GATEWAY_SECRET` and `MEZO_RPC_URL`
      if present).
- [ ] `WEBAUTHN_RP_ID=developer.matchbox.markets`,
      `WEBAUTHN_ORIGIN=https://developer.matchbox.markets`,
      `ISSUER=https://id.matchbox.markets`.
- [ ] Email Sending domain verified (SPF, DKIM, DMARC).
- [ ] Staff rows limited to named people; `operator` only where needed.
- [ ] Intended flag state committed in each `wrangler.jsonc`.

## 10. Emergency controls

| Situation                        | Action                                                                                                                                                 | Effect                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Product misbehaving              | Flag → `"false"` (dashboard var for speed, then commit)                                                                                                | `503 service_disabled`                                                                                    |
| Bad deploy                       | `wrangler rollback`                                                                                                                                    | Previous version                                                                                          |
| Abusive or compromised app       | Console `/admin` → app status `suspended` (operator + step-up)                                                                                         | API refuses its keys (≤ 15 s key cache); ID refuses authorize/token/userinfo. Nothing revoked; reversible |
| Leaked API key                   | Owner revokes in the console. Staff fallback (SQL, no audit event): `UPDATE public.mbx_dev_api_keys SET revoked_at = now() WHERE prefix = '<prefix>';` | 401 within 15 s                                                                                           |
| Leaked client secret             | Owner revokes/rotates in the console                                                                                                                   | Token endpoint rejects it                                                                                 |
| Revoke all OIDC tokens of an env | SQL: `SELECT public.mbx_dev_revoke_environment_tokens('<environment uuid>', '<kebab-case-reason>');`                                                   | Revokes token families and access tokens; bumps `scope_version` (forces re-consent)                       |
| OIDC signing key compromise      | §4.3, compromised key                                                                                                                                  | All outstanding tokens invalid                                                                            |
| Quota abuse                      | `/admin` quota override on the environment (operator)                                                                                                  | Applies within 60 s (override cache)                                                                      |

Pepper rotation consequences (there is no dual-pepper overlap):

- `API_KEY_PEPPER` — every API key fails (401); all partners must create new
  keys. Change on console and API together.
- `CLIENT_SECRET_PEPPER` — every client secret fails at `/oauth/token`;
  confidential clients need new secrets. Change on console and ID together.
- `SESSION_PEPPER` (ID) — wallet sessions, pending codes and refresh tokens
  stop matching: users sign in again and apps re-authorize. Access tokens run
  out within 10 min.
- `SESSION_PEPPER` (console) — console sessions, pending email codes, sign-up
  state and invitation tokens become invalid: developers sign in again;
  resend invitations.

## 11. Beta cutover

- Old `developer_*` tables are untouched; drop them in a later migration once
  v2 is stable. Beta API keys and OAuth clients do **not** carry over:
  partners re-register in the console.
- Removed beta surfaces: `apps/developer-platform`, custom
  `/v1/authorizations/exchange`, `/v1/profiles/by-wallet`, webapp `/id-bridge`.
- Per host (`developer.`, `id.`, `api.`): delete the Netlify CNAME, deploy the
  Worker (creates the custom domain and certificate), run §7.1. Expect a short
  gap per host.
- `api.matchbox.markets` is served today by the beta Netlify proxy in front of
  `matchbox-developer-api`; it moves to that Worker's custom domain. Same
  Worker name, so the deploy replaces the beta code.
- Once `id.` and `developer.` resolve to the new Workers, decommission Worker
  `matchbox-developer-platform`
  (`npx wrangler delete --name matchbox-developer-platform`, or the dashboard)
  and Netlify site `matchboxdeveloper` (remove its custom domains, then
  delete).

## 12. Known boundaries and follow-ups

- Staff are added by SQL only; there is no staff UI and no staff-side API-key
  revoke (SQL fallback above).
- Revocation latency: API keys ≤ 15 s; quota overrides ≤ 60 s. Rate limiters
  fail open if the Durable Object is unavailable.
- `discord:*` without a linked Discord fails with `access_denied`
  (`discord-not-linked`); optional scopes are not supported.
- `pool_address` in chain state is always null.
- Matchbox MCP hosting is out of scope.
- `matchbox-id` has no `workers_dev` setting, so its first live test is on
  `id.matchbox.markets`; SIWE domain, WebAuthn RP ID and issuer are bound to
  the production hosts anyway.
- `turbo.json` `globalEnv` still lists beta variables
  (`DEVELOPER_API_ORIGIN`, `API_GATEWAY_SECRET`,
  `DEVELOPER_PLATFORM_ENABLED`, `DEVELOPER_PROFILE_API_ENABLED`,
  `NEXT_PUBLIC_ID_URL`, `NEXT_PUBLIC_DEVELOPER_URL`); nothing in `apps/` or
  `packages/` reads them.
- No documented npm release step for `@matchbox-markets/sdk`.
- No Workers Builds configuration in the repo for the three Workers.
