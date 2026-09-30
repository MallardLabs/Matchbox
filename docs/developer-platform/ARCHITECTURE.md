# Matchbox Developer Platform v2 — architecture contract

Status: build contract for the ground-up rebuild (branch
`feat/developer-platform-v2`). Product intent lives in
`docs/matchbox-pro/04-developer-platform-redesign.md` on the Pro branch; this
file is the executable decisions. When code and this file disagree, fix one of
them in the same PR.

## 0. Owner decisions (2026-09-30)

- Own sessions on Workers; Supabase Postgres is the data store only (service
  role, RLS on, no anon/authenticated policies). No Supabase Auth.
- Matchbox ID: SIWE (EIP-4361) wallet sign-in. Developer console: passkeys +
  email recovery.
- Scope: Matchbox ID / OIDC, developer console + staff review, Gauge Profile
  API + generated SDK. Matchbox MCP hosting is out of scope.
- Clean break from the beta: `apps/developer-platform`, the custom
  `/v1/authorizations/exchange`, `/v1/profiles/by-wallet`, and the webapp
  `/id-bridge` are deleted. Old `developer_*` tables are left untouched (a later
  migration drops them after cutover).
- Additive tables; one kill switch per product.
- Test environment = Mezo testnet; live = Mezo mainnet. Enforced by policy.
- Staff review lives at `/admin` in the developer console.
- UI borrows the Matchbox Pro design language (tokens, Figtree + DM Mono,
  Radix, Tailwind 3, Vite + TanStack Router, React 18).

## 1. Surfaces and packages

| Path | Package | Host | Runtime |
| --- | --- | --- | --- |
| `apps/matchbox-id` | `@repo/matchbox-id` | `id.matchbox.markets` | Worker (Hono) + Vite SPA via ASSETS |
| `apps/developer-console` | `@repo/developer-console` | `developer.matchbox.markets` | Worker (Hono) + Vite SPA via ASSETS |
| `apps/developer-api` | `@repo/developer-api` (rewritten) | `api.matchbox.markets` | Worker (Hono) + Durable Object |
| `packages/ui` | `@repo/ui` | — | React 18 component + token library |
| `packages/platform-contracts` | `@repo/platform-contracts` | — | Zod schemas, OpenAPI generator, shared constants |
| `packages/platform-server` | `@repo/platform-server` | — | Worker-side helpers shared by the three Workers |
| `packages/logger` | `@repo/logger` | — | Tiny structured logger (JSON in Workers) |
| `packages/developer-sdk` | `@matchbox-markets/sdk` (rewritten) | — | Generated types + ergonomic client |

Rules:

- Each Worker's SPA is built by Vite into `dist/client` and served with
  `assets.not_found_handling = "single-page-application"`, with
  `run_worker_first` covering `/api/*`, `/oauth/*`, `/.well-known/*` (see each
  app's wrangler file). Dev uses `@cloudflare/vite-plugin` so `vite dev` runs
  the Worker too.
- Workers never import React; SPAs never import `@repo/platform-server`.
- All cross-package imports go through package names, never relative paths.
- Every package has `lint`, `lint:fix`, `typecheck`, `test` scripts; Workers
  also have `build` (`vite build` or `wrangler deploy --dry-run --outdir dist`).
- Custom-domain routes are declared in each wrangler file (zone is on
  Cloudflare now: `app.matchbox.markets` is served by Cloudflare).

## 2. Feature flags

Worker `vars` (string `"true"`/`"false"`), read through
`@repo/platform-server` `flags(env)`:

| Flag | Worker(s) | Off behaviour |
| --- | --- | --- |
| `MATCHBOX_ID_ENABLED` | matchbox-id | `/oauth/*`, `/api/*` return `503 {error:{code:"service_disabled"}}`; SPA shows a static unavailable state |
| `DEVELOPER_CONSOLE_ENABLED` | developer-console | same shape; SPA shows unavailable |
| `GAUGE_PROFILE_API_ENABLED` | developer-api | `/v1/*` except `/v1/health` and `/openapi.json` return 503 |
| `DISCORD_CLAIMS_ENABLED` | matchbox-id | `discord:*` scopes are dropped from discovery, refused at authorize (`invalid_scope`), and omitted from userinfo |

All default to `"false"` in checked-in wrangler files.

## 3. Secrets (wrangler secret put, never vars)

| Secret | Used by |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | all three Workers |
| `API_KEY_PEPPER` | developer-console (issue), developer-api (verify) |
| `CLIENT_SECRET_PEPPER` | developer-console (issue), matchbox-id (verify) |
| `SESSION_PEPPER` | matchbox-id, developer-console (session/token hashing) |
| `OIDC_SIGNING_KEYS` | matchbox-id — JSON array of private ES256 JWKs, each with `kid`; index 0 signs, all publish in JWKS |
| `CF_ACCOUNT_ID`, `CF_ANALYTICS_TOKEN` | developer-console (Analytics Engine SQL API, read-only token) |
| `MEZO_MAINNET_RPC_URL`, `MEZO_TESTNET_RPC_URL` | matchbox-id (ERC-1271/6492 SIWE verification), developer-api (reconciliation cron) |

Rotation of `OIDC_SIGNING_KEYS`: prepend new key, deploy, wait > max token
lifetime, remove the old key.

## 4. Data model (migration `supabase/migrations/20260930000001_create_developer_platform_v2.sql`)

Conventions: `uuid` PKs (`gen_random_uuid()`), `timestamptz`, `text` + CHECK
constraints for unions (kebab-case values), lower-case hex addresses, RLS
enabled with **no** anon/authenticated policies, `REVOKE ALL ... FROM anon,
authenticated`. Every table defensively created. Secrets and tokens are stored
only as `HMAC-SHA256(pepper, value)` hex (`*_hash`).

### 4.1 Matchbox ID (`mbx_id_*`)

- `mbx_id_accounts` — `id`, `wallet_address` unique, `created_at`,
  `last_sign_in_at`, `disabled_at`.
- `mbx_id_siwe_nonces` — `nonce` PK, `expires_at`, `consumed_at`,
  `created_at`. Single use, 10 min.
- `mbx_id_sessions` — `id`, `account_id`, `token_hash` unique, `created_at`,
  `expires_at` (7 d), `last_seen_at`, `revoked_at`, `user_agent`,
  `ip_prefix` (IPv4 /24, IPv6 /48 — never full IP), `siwe_chain_id bigint`,
  `signer_kind` (`eoa | contract`; both NULL for pre-binding sessions —
  migration `20260930000003`). See §7 "Network binding".
- `mbx_id_pairwise_subjects` — `(account_id, sector_id)` PK, `subject` unique
  (`mbx_` + 32 base64url random chars).
- `mbx_id_grants` — `id`, `account_id`, `app_id`, `environment_id`,
  `scopes text[]`, `scope_version int`, `claims_snapshot jsonb` (field labels
  shown at consent, no values), `discord_user_id text null` (the linked Discord
  at consent time, used for invalidation), `created_at`, `updated_at`,
  `revoked_at`, `revoked_reason` (`user-revoked | app-suspended |
  discord-link-changed | scope-changed | account-disabled`). Unique active grant
  per `(account_id, environment_id)`.
- `mbx_id_authorization_codes` — `code_hash` PK, `grant_id`, `environment_id`,
  `redirect_uri`, `code_challenge`, `code_challenge_method` (`S256` only),
  `nonce null`, `scopes`, `expires_at` (60 s), `consumed_at`, `created_at`.
- `mbx_id_refresh_tokens` — `id`, `token_hash` unique, `grant_id`,
  `family_id`, `parent_id null`, `scopes`, `expires_at` (30 d), `created_at`,
  `rotated_at`, `revoked_at`. Reuse of a rotated token revokes the family.
- `mbx_id_token_families` (migration `20260930000003`) — `family_id` PK,
  `grant_id null`, `created_at`, `revoked_at`. The family-level revocation
  record. All token writes go through `SECURITY INVOKER` functions
  (service_role only) that lock the family row:
  `mbx_id_issue_code_tokens` (first code redemption creates the family and
  its first refresh + access token; returns `family-revoked` if a replay
  got there first), `mbx_id_rotate_refresh_token` (marks the old token
  rotated and inserts the successor refresh + access token atomically; a
  second rotation of the same token revokes the family instead) and
  `mbx_id_revoke_token_family` (marks the family, revokes its refresh tokens
  and `jti`-prefixed access tokens). `mbx_id_purge_expired(now, batch)`
  deletes expired nonces/requests (+1 h), codes/tokens (+1 d) and empty
  families (> 2 d) in bounded batches for the hourly Worker cron.
- `mbx_id_access_tokens` — `jti` PK, `grant_id`, `expires_at` (10 min),
  `revoked_at`. Access tokens are ES256 JWTs; userinfo checks jti + grant.

Trigger `mbx_id_invalidate_discord_grants` on `discord_wallet_links`
(AFTER UPDATE OF wallet_address, discord_user_id OR DELETE): revoke active
grants that contain a `discord:*` scope for the old wallet, reason
`discord-link-changed`, and revoke their refresh/access tokens.

### 4.2 Developer console (`mbx_dev_*`)

- `mbx_dev_accounts` — `id`, `email` unique (lower-cased), `email_verified_at`,
  `display_name`, `created_at`, `disabled_at`.
- `mbx_dev_passkeys` — `id`, `account_id`, `credential_id` unique (base64url),
  `public_key` (base64url COSE), `counter bigint`, `transports text[]`,
  `device_type`, `backed_up bool`, `name`, `created_at`, `last_used_at`.
- `mbx_dev_email_challenges` — `id`, `email`, `purpose` (`sign-up | recovery |
  invitation`), `code_hash`, `attempts int`, `expires_at` (15 min),
  `consumed_at`, `created_at`.
- `mbx_dev_webauthn_challenges` — `id`, `challenge`, `purpose`
  (`register | authenticate | step-up`), `account_id null`, `expires_at`
  (5 min), `consumed_at`.
- `mbx_dev_sessions` — as `mbx_id_sessions` plus `stepped_up_at` (step-up
  valid 10 min) and `account_id` → `mbx_dev_accounts`.
- `mbx_dev_organizations` — `id`, `name`, `slug` unique, `created_at`.
- `mbx_dev_memberships` — `(organization_id, account_id)` PK, `role`
  (`owner | admin | developer`), `created_at`. At least one owner enforced in
  application code.
- `mbx_dev_invitations` — `id`, `organization_id`, `email`, `role`,
  `token_hash`, `invited_by`, `expires_at` (7 d), `accepted_at`, `revoked_at`.
- `mbx_dev_apps` — `id`, `organization_id`, `name`, `slug`, `description`,
  `logo_url`, `website_url`, `privacy_url`, `terms_url`, `support_email`,
  `status` (`active | restricted | suspended | retired`), `created_at`,
  `updated_at`.
- `mbx_dev_environments` — `id`, `app_id`, `kind` (`test | live`), `network`
  (`mezo-testnet` for test, `mezo` for live — CHECK enforces pairing),
  `client_id` unique (`mbx_test_…` / `mbx_live_…`), `client_type`
  (`confidential | public`), `review_state` (`development | submitted |
  approved | changes-requested | rejected`), `requested_scopes text[]`,
  `approved_scopes text[]`, `scope_version int`, `sector_id` (default = env
  id; used for pairwise sub), `created_at`, `updated_at`. Unique
  `(app_id, kind)`.
- `mbx_dev_redirect_uris` — `(environment_id, uri)` PK. Live: `https://` only.
  Test: `https://` or `http://localhost`/`http://127.0.0.1` with any port.
- `mbx_dev_origins` — `(environment_id, origin)` PK, same scheme rules.
- `mbx_dev_client_secrets` — `id`, `environment_id`, `secret_hash`,
  `prefix`, `created_by`, `created_at`, `expires_at null`, `revoked_at`.
  Up to 2 active (rotation overlap).
- `mbx_dev_api_keys` — `id`, `environment_id`, `kind` (`publishable |
  secret`), `name`, `prefix` unique, `secret_hash`, `allowed_cidrs text[]`,
  `created_by`, `created_at`, `expires_at null`, `last_used_at`,
  `revoked_at`, `rotated_from null`.
- `mbx_dev_reviews` — `id`, `environment_id`, `requested_scopes`, `state`
  (`open | approved | changes-requested | rejected | withdrawn`),
  `submitter_id`, `submitter_note`, `reviewer_id null`, `reviewer_note`,
  `created_at`, `decided_at`.
- `mbx_dev_quota_overrides` — `id`, `environment_id`, `endpoint_class`,
  `per_minute`, `per_day`, `reason`, `created_by`, `created_at`,
  `expires_at`.
- `mbx_dev_staff` — `account_id` PK, `role` (`reviewer | operator`),
  `created_at`. Bootstrap by SQL insert.
- `mbx_platform_audit_events` — `id bigserial`, `occurred_at`, `actor_type`
  (`developer | staff | wallet | system`), `actor_id`, `organization_id
  null`, `app_id null`, `environment_id null`, `action` (kebab-case, e.g.
  `api-key-created`), `target_type`, `target_id`, `metadata jsonb`,
  `ip_prefix`. UPDATE/DELETE blocked by trigger (immutable).

### 4.3 Gauge Profile read model

- View `mbx_api_gauge_profiles` unions `gauge_profiles` (profile_type
  `boost-gauge`, network `mezo`, chain 31612) and `validator_profiles`
  (profile_type `validator-gauge`, network from `chain_id`). Columns:
  `network`, `profile_type`, `gauge_address`, `vebtc_token_id null`,
  `operator_address null`, `display_name`, `description`, `avatar_url`,
  `website_url`, `social_links jsonb`, `tags text[]`, `incentive_strategy`,
  `voting_strategy`, `is_featured`, `created_at`, `updated_at`,
  `profile_updated_by`.
- Table `mbx_api_gauge_chain_state` — `(network, gauge_address)` PK,
  `is_alive`, `vebtc_token_id`, `nft_owner`, `beneficiary`, `pool_address`,
  `checked_at`, `block_number`. Written by the developer-api cron
  (`*/10 * * * *`) that reconciles live chain state; the API never calls RPC
  on the request path. Select `block_number::text` (decimal string in the
  API).

### 4.4 Implementation notes (as built)

Additions to the column lists above, all additive:

- `created_at` on `mbx_id_authorization_requests`, `mbx_id_access_tokens`,
  `mbx_dev_webauthn_challenges`, `mbx_dev_invitations` (lifetime CHECKs
  compare `expires_at` with it, plus ~1 min clock slack).
- `auth_time timestamptz not null` on `mbx_id_authorization_codes` and
  `mbx_id_refresh_tokens` so ID tokens (incl. refreshed ones) carry the real
  `auth_time`.
- `request_id` on `mbx_platform_audit_events`. The audit table has **no
  foreign keys** (events outlive rows; `ON DELETE SET NULL` would be blocked
  by the immutability trigger). UPDATE/DELETE/TRUNCATE are blocked by
  trigger and revoked from `service_role`.
- `mbx_dev_quota_overrides.expires_at` is nullable (no expiry).
- `mbx_dev_webauthn_challenges`: `account_id` is required unless
  `purpose = 'authenticate'`. Sign-up therefore creates the
  `mbx_dev_accounts` row (with `email_verified_at`) when the email code is
  verified, then registers the passkey against it; an account with no
  passkey can re-run sign-up for the same email.
- `sector_id` defaults to the environment id via a BEFORE INSERT trigger.
- The live-environment `https://`-only rule for redirect URIs/origins is
  also enforced by trigger; format CHECKs reject fragments, wildcards,
  whitespace and non-loopback `http://`.
- One open review per environment (partial unique index).
- The view is `security_invoker = true`; `anon`/`authenticated` have no
  privileges on any v2 relation; no policies exist on `mbx_*` tables.

## 5. Shared contracts (`@repo/platform-contracts`)

- `network.ts` — `networkSlugSchema = z.enum(["mezo","mezo-testnet"])`,
  chain ids 31612 / 31611, `environmentKindSchema`, env↔network map.
- `scopes.ts` — API key scopes: `gauge-profiles:read`. OIDC scopes:
  `openid`, `wallet`, `discord:id`, `discord:profile`. Each scope has label,
  consent description, claims, `requiresReview` (discord scopes: true).
- `errors.ts` — `errorBodySchema = { error: { code, message, requestId,
  docsUrl, issues? } }` (`issues: [{ path, message }]` only for validation
  failures); stable codes: `invalid_request`, `unauthorized`,
  `forbidden`, `not_found`, `conflict` (409, console), `step_up_required`
  (403, console), `rate_limited`, `service_disabled`,
  `origin_not_allowed`, `network_not_allowed`, `internal_error`, plus OAuth
  RFC 6749 codes on `/oauth/*` (`{ error, error_description }`).
- `gauge-profiles.ts` — `gaugeProfileSchema` (discriminated on
  `profileType`), `gaugeProfileListSchema` (`data`, `nextCursor | null`),
  `networkListSchema`, `sourceMetaSchema` (`{ source: "matchbox-profiles",
  profileUpdatedAt | null, chainCheckedAt | null, chainBlock | null }` —
  `profileUpdatedAt` is null only for an empty page), detail envelope
  `{ data, meta }`, `parseGaugeProfileListQuery(URLSearchParams)` and the
  keyset cursor codec over `(updated_at DESC, gauge_address ASC)`.
- `credentials.ts` — formats: API key
  `mbx_{pk|sk}_{test|live}_<prefix 12 base62>_<secret 43 base64url>`,
  client id `mbx_{test|live}_<24 base62>`, client secret
  `mbx_cs_<prefix 12 base62>_<secret 43 base64url>`, pairwise subject
  `mbx_<32 base64url>`. `prefix` is the unique DB lookup column;
  `*_hash = HMAC-SHA256(pepper, full credential)` hex.
- `redirects.ts` — `validateRedirectUri` / `validateOrigin` (per env kind)
  accept only canonical values (`new URL(x).href` / `.origin` round-trips;
  otherwise `not-canonical` with a suggestion), so matching is exact string
  equality (`redirectUriMatches`, `originMatches`).
- `audit.ts` — audit actor types, the kebab-case `auditActionSchema`, and
  `auditEventInputSchema` used by `recordAudit`.
- `cursor.ts`, `encoding.ts`, `common.ts` — opaque cursor codec, base64url /
  UTF-8 / safe JSON parse, shared primitives (addresses, timestamps, ids).
- `oidc.ts` — discovery document, token response, userinfo, ID token claims.
- `console.ts` — request/response schemas for the console `/api/*`.
- `identity.ts` — request/response schemas for the ID `/api/*`.
- `rate-limits.ts` — `rateLimitPolicies` by environment kind and endpoint
  class (`gauge-profiles`, `unauthenticated`, `oidc-token`, `siwe`,
  `userinfo`).
- `api-request-log.ts` — Analytics Engine layout for `mbx_api_requests`
  (`API_REQUEST_LOG_LAYOUT`, `apiRequestLogSchema`, `apiRequestLogDataPoint`,
  `apiRequestLogDataset`, `apiRequestCacheStatusSchema`); see §6.
- `openapi.ts` + `scripts/generate-openapi.ts` — builds the public OpenAPI 3.1
  document from the schemas (`z.toJSONSchema`, draft-2020-12) and writes
  `packages/platform-contracts/openapi.json`. A test asserts the checked-in
  file is up to date. The SDK and the console docs consume this file.

### `@repo/platform-server` exports

Subpath `@repo/platform-server/rate-limiter` exports only the
`RateLimiter` Durable Object (it imports `cloudflare:workers`; re-export it
from each Worker entry and declare it with a `new_sqlite_classes`
migration). Everything else is on `@repo/platform-server`. Routes should
depend on the `RateLimitClient` type (`createDurableRateLimitClient`, or
`createMemoryRateLimitClient` in tests).

`createSupabaseAdmin(env)` (supabase-js, no session persistence),
`flags(env)`, crypto (`randomToken(bytes)`, `hmacHex(pepper, value)`,
`timingSafeEqualHex`, `sha256Base64Url`, base64url codec), cookies
(`__Host-` session cookie set/clear/read), `ipPrefix(request)`, Hono
middleware (`requestId`, `errorHandler` producing `errorBodySchema`,
`securityHeaders`, `requireSameOrigin` for non-GET), `jsonBody(c, schema)`
(zod-validated body → 400 `invalid_request`), `recordAudit(supabase, event)`,
and a `RateLimiter` Durable Object class + `checkRateLimit(namespace, key,
policy)` helper reused by all three Workers.

## 6. Public API (`api.matchbox.markets`)

All `/v1` routes require `Authorization: Bearer mbx_{pk|sk}_{test|live}_…`.

| Route | Notes |
| --- | --- |
| `GET /v1/health` | no auth; `{ status, version, flags }` |
| `GET /openapi.json` | no auth |
| `GET /v1/networks` | networks the key's environment may read |
| `GET /v1/gauge-profiles` | `network` (required), `profileType`, `tag`, `updatedSince`, `address` (repeatable, ≤ 50), `limit` (≤ 100, default 50), `cursor` (opaque base64url of `(updated_at, gauge_address)`) |
| `GET /v1/gauge-profiles/{network}/{gaugeAddress}` | 404 `not_found` |
| `GET /v1/vebtc/{network}/{tokenId}/gauge-profile` | via chain state + profile |

Rules:

- Key's environment network must equal the requested network, else
  `403 network_not_allowed`.
- Publishable keys: `Origin` must match a registered origin, else
  `403 origin_not_allowed`. Secret keys: rejected when an `Origin` header is
  present (browser use), optional CIDR allowlist on `CF-Connecting-IP`.
- Live keys require environment `review_state = approved` and app
  `status = active` (restricted apps keep read access at development limits).
- Key verification: look up by prefix, constant-time compare HMAC. Cache the
  verified policy in-isolate for 15 s (revocation latency ≤ 15 s, documented).
- Responses: `ETag` (weak hash of body), honour `If-None-Match` → 304;
  `Cache-Control: private, max-age=30`; `X-Request-Id` on every response;
  `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, and
  `Retry-After` on 429. CORS headers on **every** response including errors
  (publishable keys only echo registered origins).
- Rate limits: Durable Object `RateLimiter` keyed by `environment_id` and
  key kind (burst per-minute + daily; publishable keys get their own,
  smaller share so browser traffic cannot starve server traffic), plus a
  second key `pk:<key>:<ip-prefix>` for publishable keys. Defaults by
  endpoint class in
  `@repo/platform-contracts` `rateLimitPolicies` (test: 60/min, 5 000/day;
  live: 300/min, 100 000/day; publishable+IP: 60/min), overridable per
  environment by `mbx_dev_quota_overrides` (cached 60 s). Unauthenticated or
  malformed requests hit a per-IP-prefix limiter before any DB lookup.
- Usage/logs: write one Analytics Engine data point per request (binding
  `REQUEST_LOG`) to dataset `mbx_api_requests`. The layout is owned by
  `@repo/platform-contracts/api-request-log` (`API_REQUEST_LOG_LAYOUT`,
  `apiRequestLogSchema`, `apiRequestLogDataPoint`); the console reads it
  with the same constants. No DB writes on the request path; `last_used_at`
  is updated at most once per key per 5 min via `ctx.waitUntil`.

  | Column | Field | Values |
  | --- | --- | --- |
  | `index1` | environment id | `"anonymous"` when no key verified |
  | `blob1` | request id | `req_…` (= `X-Request-Id`) |
  | `blob2` | key id | `""` when unknown |
  | `blob3` | route template | `/v1/gauge-profiles/{network}/{gaugeAddress}`, `preflight`, `unmatched` |
  | `blob4` | method | |
  | `blob5` | status | `"200"` |
  | `blob6` | cache status | `not-modified` (304), `full` (2xx body), `none` |
  | `blob7` | colo | `""` when absent |
  | `blob8` | country | `""` when absent |
  | `blob9` | environment kind | `test` / `live` / `""` |
  | `double1` | latency ms | |
  | `double2` | status code | |
- Errors never echo upstream detail; logs carry request id.

### 6.1 Implementation notes (as built)

- `createApp(deps)` (`apps/developer-api/src/app.ts`) takes `{ store,
  rateLimits, analytics, now, flags, config }`; `src/index.ts` validates the
  bindings with zod once per isolate and answers 500 `internal_error` when
  they are invalid. `PLATFORM_STORE=memory` (sample data, fixed dev keys) is
  refused when `ENVIRONMENT=production`.
- Rate-limit buckets: `env:<environmentId>:secret` (gauge-profiles policy +
  overrides), `env:<environmentId>:publishable` (the same policy scaled by
  `PUBLISHABLE_QUOTA_SHARE`, default `0.5`, floored, min 1 — anyone holding
  the public key can spend it, so it cannot drain the secret-key quota),
  `pk:<keyId>:<ipPrefix>` (publishable), `ip:<ipPrefix>`
  (missing/malformed/failed keys, `unauthenticated` policy) and
  `lookup:<ipPrefix>` (120/min, 20 000/day) consumed before each key-cache
  miss reaches the DB. The limiter fails open when the Durable Object is
  unavailable (logged).
- `tag` must be a lower-case slug (`^[a-z0-9][a-z0-9-]{0,39}$`, contract
  `gaugeProfileTagFilterSchema`); the store re-checks it before it reaches
  PostgREST's `cs.{…}` filter. Stored tags are free text today, so tags such
  as `DeFi` are not filterable until they are normalised.
- Live keys also need `gauge-profiles:read` in the environment's
  `approved_scopes`; test keys need no scope. Suspended/retired apps → 403
  `forbidden`; revoked/expired keys → 401 `unauthorized`; a secret key with
  an `Origin` header → 403 `origin_not_allowed`; CIDR miss → 403
  `forbidden`.
- CORS: preflight is answered for any origin. Actual responses echo the
  origin only for a publishable key whose registered origins contain it;
  secret-key responses never carry `Access-Control-Allow-Origin`; responses
  with no verified key echo the origin on errors only (no data); health and
  `openapi.json` use `*`. `Vary: Origin, Authorization` everywhere.
- Chain-state cron: Multicall3 (`0xcA11…CA11`) pinned to one block per
  network; boost gauges read `BoostVoter.isAlive`,
  `boostableTokenIdToGauge(tokenId)` (the token is stored only when it maps
  back to the gauge), veBTC `ownerOf`, and gauge `rewardsBeneficiary`;
  validator gauges read `ValidatorsVoter.isAlive` + `rewardsBeneficiary`.
  `pool_address` stays null. `/v1/vebtc/...` resolves the token via chain
  state first, then the profile's own `vebtc_token_id`.

## 7. Matchbox ID (`id.matchbox.markets`)

Issuer: `https://id.matchbox.markets`.

| Route | Notes |
| --- | --- |
| `GET /.well-known/openid-configuration` | generated from contracts |
| `GET /oauth/jwks` | public keys from `OIDC_SIGNING_KEYS` |
| `GET /oauth/authorize` | validates request server-side, then 302 to SPA `/authorize?request=<id>` (request stored 10 min in `mbx_id_authorization_requests`, see below); errors before redirect-URI validation render the SPA error page, never redirect |
| `POST /oauth/token` | `authorization_code` (PKCE S256 required for every client) and `refresh_token` grants; client auth `client_secret_basic`/`client_secret_post` for confidential, `none` for public |
| `GET/POST /oauth/userinfo` | bearer access token; claims per granted scopes |
| `POST /oauth/revoke` | RFC 7009; refresh tokens revoke the family, access tokens by jti |
| `POST /api/siwe/nonce` | `{ nonce }` |
| `POST /api/siwe/verify` | `{ message, signature }` → verifies domain = ID host, URI, chain id ∈ Mezo networks, nonce single-use, expiry ≤ 10 min; uses viem `verifySiweMessage` with a Mezo public client (EOA + ERC-1271 + ERC-6492); sets `__Host-mbx_id` cookie |
| `POST /api/session/sign-out` | |
| `GET /api/session` | `{ account: { walletAddress, discord: {...} | null } | null }` |
| `GET /api/authorization-requests/{id}` | app, env kind, scopes with labels, claim preview with **the signed-in user's own** values, existing grant diff |
| `POST /api/authorization-requests/{id}/decision` | `{ decision: "approve" | "deny" }` → `{ redirectTo }`; CSRF-protected |
| `GET /api/grants` | connected apps for the session account |
| `DELETE /api/grants/{id}` | revoke (+ tokens), audit |
| `GET /api/sessions`, `DELETE /api/sessions/{id}` | device/session management |

Add table `mbx_id_authorization_requests` — `id`, `environment_id`,
`redirect_uri`, `state`, `scopes`, `code_challenge`, `nonce`, `prompt`,
`expires_at`, `consumed_at`.

Claims: `sub` (pairwise per `sector_id`), `wallet_address` (+
`wallet_network`) for `wallet`, `discord_id` for `discord:id`,
`discord_username`, `discord_display_name`, `discord_avatar_url` for
`discord:profile`. ID token: `iss`, `aud` = client_id, `sub`, `iat`, `exp`
(10 min), `auth_time`, `nonce`, `azp`, and requested claims. `discord:*`
scopes require an approved review and a linked Discord; when no link exists,
consent shows the scope as unavailable with the Discord bot link instructions
and the decision proceeds without it only if the app marks it optional
(`optionalScopes` param is out of scope — v1 fails with `access_denied`
reason `discord-not-linked`).

Security: the `__Host-mbx_id` session cookie is `SameSite=Lax` (Strict would
hide the session from the cross-site top-level redirect into
`/oauth/authorize`, breaking `prompt=none` and consent skipping); CSRF on
`/api/*` is the `Origin` check on every non-GET request
(`requireSameOrigin`); CSP with `frame-ancestors 'none'`; no iframe bridge;
per-IP-prefix + per-account limits on `/api/siwe/*`; per-IP-prefix +
per-client limits on `/oauth/token`, `/oauth/userinfo` and
`/oauth/authorize` (authorize: 60/min, 2 000/day per IP prefix before any
lookup, then the client's `oidc-token` policy before a request row is
stored). Per-client limits honour `mbx_dev_quota_overrides` (cached 60 s).
The consent decision re-checks that the stored `redirect_uri` is still
registered and otherwise sends the SPA error page (`invalid_redirect_uri`).
An hourly cron (`triggers.crons`) purges expired rows.

Access tokens: ES256 `at+jwt` with `iss` = issuer and `aud` = the
`client_id`; userinfo and revocation require the `at+jwt` header, `aud` ==
`client_id`, and a grant for that client (an ID token is not an access
token).

Network binding: `/api/siwe/verify` records the SIWE `chainId` and the
signer kind on the session — `eoa` when the signature ecrecovers to the
wallet (the key controls the address on every chain), otherwise `contract`
(ERC-1271 / ERC-6492, verified against that chain only; the same address
on another network may belong to someone else). A contract session may
only authorize environments on its SIWE chain's network: silent approval
is skipped (`prompt=none` → `login_required`), the consent view sets
`networkSignInRequired` and the SPA sends the user to
`/sign-in?chain=<chainId>&force=true` ("Sign in on <network>"), and an
approve decision is refused. Connected apps and device lists are scoped the
same way. `wallet_network` is the environment network, which the session is
thereby verified for.


SPA pages: `/` (account: wallet, linked Discord, connected apps, sessions),
`/sign-in`, `/authorize`, `/apps` (connected apps; kept for old links),
`/error`.

## 8. Developer console (`developer.matchbox.markets`)

Auth: WebAuthn via `@simplewebauthn/server` + `@simplewebauthn/browser`
(RP ID `developer.matchbox.markets`; `localhost` in dev). Sign-up: email →
6-digit code (Cloudflare Email Service `send_email` binding `EMAIL`, from
`no-reply@matchbox.markets`; when the binding is absent in dev the code is
logged) → create passkey → first org created. Sign-in: passkey
(discoverable, conditional UI). Recovery: email code → register a new
passkey (old passkeys kept; user can remove). Step-up: passkey assertion
within 10 min for secret/API-key creation+rotation, client secret rotation,
member/role changes, org deletion.

API (`/api/*`, all JSON, all validated with `@repo/platform-contracts`):
auth (`/api/auth/*`), `me`, organizations, members, invitations, apps,
environments (redirects, origins, scopes, submit-for-review), api keys
(create → secret shown once, rotate with overlap, expire, revoke), client
secrets, usage (Analytics Engine SQL: requests, error rate, p50/p95 latency,
top routes, by key, time buckets; request-id lookup; CSV export), OAuth
(grant counts, revocations, consent preview), and `/api/admin/*` for staff
(review queue, decide, app status changes, quota overrides, audit search).

Auto-approval: a live environment requesting only `gauge-profiles:read`
moves to `approved` on submit when the org's owner email is verified, the app
has a website URL, and the app is `active`. Any `discord:*` scope opens a
manual review. Scope increases open a new review; the currently approved
scopes keep working meanwhile; approval bumps `scope_version`, which forces
re-consent (grants with a lower version are treated as not covering new
scopes).

SPA sections: Overview, Apps (list, create), App detail (Settings,
Environments [test/live tabs: credentials, redirect URIs, origins, scopes,
review], API keys, OAuth, Usage), Organization (members, invitations),
Account (passkeys, sessions), Docs (quickstart TS + curl for the selected
environment, API reference rendered from `openapi.json`, guides: auth &
keys, OIDC integration, rate limits, errors, pagination, changelog), Admin.

## 9. SDK (`@matchbox-markets/sdk`)

- Types generated from `packages/platform-contracts/openapi.json` with
  `openapi-typescript`; runtime via a small typed fetch wrapper (no
  hand-written response schemas).
- `createMatchboxClient({ apiKey, baseUrl? , fetch? })` →
  `gaugeProfiles.list/iterate/get/byVebtc`, `networks.list`; retries 429/503
  with `Retry-After` (max 2), surfaces `MatchboxApiError` with code +
  requestId.
- `oidc` helpers: `createPkcePair`, `buildAuthorizeUrl`, `exchangeCode`,
  `refreshTokens`, `revokeToken`, `fetchUserinfo`, `verifyIdToken` (via
  `jose` + remote JWKS).
- No React or wallet dependency. ESM + CJS via tsup.
- As built (1.0.0-beta.1): `src/generated/schema.ts` is checked in and
  regenerated with `pnpm --filter @matchbox-markets/sdk generate`; a test
  fails when it is stale. Client options `{ apiKey, baseUrl?, fetch?,
  maxRetries? (2), maxRetryDelayMs? (10 000) }`; responses are shape-checked
  with type guards (no zod dependency). OIDC lives on the `./oidc` subpath
  (plus `createState`, `createNonce`, `pkceChallenge`, `oidcEndpoints`,
  `OidcError`); `verifyIdToken` checks ES256 signature, `iss`, `aud`,
  `exp`/`iat`, `nonce` and `azp`. The CJS build bundles `jose` (ESM-only).

## 10. UI (`@repo/ui`)

Tokens copied from Pro (`apps/matchbox-pro/src/styles/globals.css` and
`tailwind.config.ts` on `feat/stuart-query-mvp`) into `@repo/ui/tokens.css`
and a Tailwind preset `@repo/ui/tailwind-preset`. Theme: system default,
persisted override, set before first paint by an inline script
(`@repo/ui/theme-script`). Components follow `agent-instructions/ui-and-react.md`
(namespace imports, compound Root pattern, `forwardRef`, `tailwind-variants`,
Radix foundations): button, input, textarea, select, checkbox, switch, field
(label/description/error), fieldset, table, badge (status chips), card
(panel), dialog, alert-dialog, dropdown-menu, tabs, segmented-control, toast,
tooltip, copy-field (mono value + copy button), code-block, empty-state,
skeleton, key-value list, app-shell (sidebar + top bar slots), logo.

Design rules: dark and light both tuned; one orange accent per view; neutral
surfaces; hierarchy from type, whitespace and dividers; mono only for keys,
ids, addresses, URIs and numbers; tabular numerals; `—` for missing data;
terse labels, no explanatory marketing sentences.

## 11. Testing

- Unit tests (vitest) for contracts, crypto, PKCE, SIWE validation, pairwise
  subject, scope diffing, cursor codec, rate-limit policy, redirect matching.
- Worker integration tests with an in-memory fake of the storage layer (each
  Worker owns a `src/store/` module exporting a `type XStore = {...}` plus a
  Supabase implementation and an in-memory implementation; routes depend only
  on the type; `app(env, store)` factories make Hono apps testable with
  `app.request()`), covering the full OIDC code +
  PKCE + refresh rotation + reuse detection + revoke + userinfo flow, API key
  auth matrix (publishable/secret × origin × network × revoked × expired), and
  console step-up gating.
- SDK contract test against the generated OpenAPI.
