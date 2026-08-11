# Matchbox Pro Node 24 platform architecture

Status: proposed baseline. Hosting, ORM/query layer, queue, and indexer framework
remain architecture decision records (ADRs), not settled facts.

## 1. Architecture goals

- One authoritative backend for product calculations and read models.
- Fast public reads with predictable cache behavior.
- Exact, reproducible historical voting-incentive earnings.
- Reorg-safe and idempotent chain ingestion.
- A thin frontend that does not rebuild protocol topology through RPC waterfalls.
- Wallet-signed, non-custodial writes.
- Clear boundaries between public chain data, Matchbox-owned profile data, and
  user-authorized private data.
- One deterministic domain/tool layer consumed by the product API, stateless
  Matchbox MCP, Stuart, and external agents.
- A Matchbox-controlled Groq agent loop with auditable tool use, explicit
  memory, and graceful deterministic degradation.
- Simple enough for a small team to operate.

## 2. Recommended shape: modular monolith plus workers

Begin with one codebase and one primary PostgreSQL database, deployed as several
process types:

```text
Mezo RPC / logs ──> indexer ──> raw chain ledger ──> projections
Mezo/price APIs ──> workers ───────────────────────> PostgreSQL
Goldsky (fallback/reconciliation) ─────────────────> PostgreSQL
                                                    │
Browser ──> CDN ──> web/BFF ──> private Node API ──┤
SDK ───────────────> developer API gateway ────────┤
                         │                          │
                         └──> jobs/outbox ──────────┘
```

Processes:

- `api`: private core product services, auth, writes to Matchbox-owned data,
  transaction preparation, and shared domain queries.
- `indexer`: continuous chain log ingestion, finality/reorg handling, raw event
  normalization, and projection triggers.
- `worker`: backfills, price snapshots, voting-incentive earnings
  materialization, notifications, exports, and reconciliation.
- `web`: the new frontend, server rendering, and same-origin
  backend-for-frontend (BFF). It consumes the private API contract and does not
  reach into the database.
- `developer-api`: the registered-key gateway for the deliberately limited
  external profile and consented-identity API.
- `mcp`: the stateless MCP 2026-07-28 adapter and public gateway over approved
  domain handlers. It may initially share a deployable with `api` after an ADR,
  but its auth, quotas, schemas, and scaling boundary remain explicit.
- `agent`: the Stuart orchestrator, Groq client, tool loop, response validation,
  thread/memory boundary, and streaming events. It may initially be an `api`
  module rather than an independent microservice.

Do not start with independently deployed microservices for every domain.
Separate a module only after its scaling, security, or release needs are proven.

## 3. Runtime and server

- Pin the current Node 24 LTS patch in development, CI, and containers. Node 24
  is the Krypton LTS line and is scheduled for updates through April 2028.
- TypeScript in strict mode, ESM, and explicit package exports.
- Fastify is the recommended HTTP candidate because it is schema-oriented,
  low-overhead, supports structured logging, and can generate OpenAPI from the
  same route contracts. Confirm it with a representative benchmark before the
  implementation ADR.
- Use JSON Schema/TypeBox or another compile-friendly schema system for hot API
  paths. Zod remains appropriate at trust boundaries and tools, but avoid
  repeatedly parsing large internal objects.
- Keep domain logic framework-independent.
- Build production JavaScript ahead of time; do not rely on runtime TypeScript
  transformation in production.

Official references:

- [Node 24 LTS](https://nodejs.org/en/download/archive/v24)
- [Fastify v5](https://fastify.dev/docs/v5.10.x/)

## 4. Repository layout

Proposed:

```text
apps/
  api/                 Node 24 Fastify HTTP service
  indexer/             chain ingestion process
  worker/              scheduled and asynchronous jobs
  web/                 new designed frontend
  mcp/                 stateless MCP server and public gateway
  agent/               Stuart orchestration and response streaming
  developer-console/   optional; may initially live in web
packages/
  api-contract/        schemas, OpenAPI generation, generated clients
  mcp-contract/        MCP tools/resources/apps and compatibility fixtures
  agent-runtime/       Groq loop, policies, events, response validation
  generative-ui/       trusted versioned UI manifest schemas
  knowledge/           official source ingestion, retrieval, authority metadata
  chain/               clients, RPC pools, log decoding, block consistency
  contracts/           addresses, ABIs, network metadata
  database/            schema, migrations, query repositories
  domain/              epochs, earnings, voting, incentives, profiles
  optimizer/           deterministic pure-return maximization engine
  pricing/             price observations, selection, confidence
  auth/                sessions, wallet proofs, organizations, consent
  jobs/                job payloads, handlers, outbox
  observability/       logging, tracing, metrics, error conventions
  testkit/             fixtures, chain snapshots, database helpers
```

The domain and contract packages must not import React, Fastify, or a specific
hosting provider.

## 5. Primary data model

Use managed PostgreSQL as the system of record. Store on-chain integer amounts
as `numeric(78,0)` or decimal strings at API boundaries; never coerce them to a
JavaScript `number`.

### Chain foundation

- `networks`
- `contracts`
- `blocks`
- `chain_events`
- `indexer_checkpoints`
- `reorg_log`

`chain_events` should have a unique natural key of network + block hash +
transaction hash + log index, retain decoded and raw payloads, and support a
canonical/finalized state.

### Protocol entities

- `epochs`
- `wallets`
- `ve_positions`
- `position_ownership_intervals`
- `gauges`
- `pools`
- `validators`
- `voting_targets`
- `votes`
- `vote_snapshots`
- `incentive_deposits`
- `reward_distributions`
- `reward_claims`
- `beneficiary_intervals`

Use history/interval tables where ownership or beneficiary state affects who
earned a reward.

### Read models

- `wallet_voting_context_current`
- `wallet_action_items`
- `wallet_voting_incentive_earnings_ledger`
- `wallet_voting_incentive_earnings_daily`
- `position_current`
- `opportunity_current`
- `gauge_epoch_metrics`
- `pool_epoch_metrics`
- `validator_epoch_metrics`
- `campaign_epoch_metrics`
- `protocol_epoch_metrics`

Read models are rebuildable from canonical source tables. A projection version
is stored with each derived result.

### Matchbox-owned data

- `wallet_accounts` (one account row per signing wallet; no linked-wallet
  aggregation)
- `user_preferences`
- `watchlists`
- `profiles`
- `profile_versions`
- `profile_permissions`
- `campaigns`
- `notification_rules`
- `notification_deliveries`
- `query_threads` and selected message/content records
- `query_pinned_views` and saved presentation state
- `stuart_memories` with category, provenance, consent, and deletion metadata
- `query_share_links` with selected content, expiry, and revocation
- `transaction_proposals` and `transaction_simulations` with immutable content
  hash, target wallet/network, source snapshot, and expiry
- `support_reports` and `support_report_events`
- `knowledge_sources`, `knowledge_documents`, and versioned retrieval chunks
- `identity_subjects` (pairwise app/sector subjects, never a universal public
  identifier)
- `identity_grants` and consent-version history
- `oidc_clients`, redirect URIs, and approved scopes
- `oidc_signing_keys` and rotation metadata; private signing material remains in
  managed secret/KMS storage rather than ordinary database columns
- other developer platform tables described separately.

### Pricing

- `assets`
- `price_observations`
- `price_candles`
- `price_selections`

Every selected price records provider, observed time, target time, confidence,
and selection policy version. Stablecoin assumptions are explicit observations,
not hard-coded `$1` values with no provenance.

An incentive token cannot enter the approved gauge allowlist until its price
asset mapping, provider policy, freshness threshold, and failure behavior are
configured and tested. A provider outage is still possible, so degraded states
remain mandatory even though unpriced approved tokens are forbidden by policy.

Optimizer comparisons use a consistent calculation-time USD price snapshot
across all candidate gauges. Persist the selected price observation IDs and
native projected rewards with the recommendation; never retain only the
converted USD totals. A later price or vote change creates a new calculation,
not a mutation of the prior result.

## 6. Chain ingestion and historical correctness

### Ingestion

- Maintain a redundant RPC pool per network with health, latency, archive
  capability, and rate-limit metadata.
- Fetch logs in bounded block ranges and adapt range size to provider behavior.
- Persist raw logs before deriving product data.
- Decode against versioned contract metadata.
- Use database uniqueness plus idempotent handlers; “at least once” delivery is
  acceptable when projections are deterministic.
- Keep Goldsky as a reconciliation/backfill source during migration, not the only
  copy of essential historical product data.

### Reorganizations

- Track block hash and parent hash.
- Mark data tentative until the configured finality depth.
- On a detected fork, invalidate orphaned events and rebuild affected
  projections from the last common canonical block.
- Delay irreversible notifications and finalized earnings until finality.
- The UI may show tentative activity, clearly labeled.

### Epoch snapshots

- Create canonical epoch records from contract time rules.
- Snapshot related metrics at one explicit block.
- Retain both boundary block and calculation block where they differ.
- Never join “latest” values from different blocks into a supposedly historical
  row.

### Voting-incentive earnings materialization

Voting-incentive earnings is a projection pipeline. It includes only the
categories accepted in `02-matchbox-pro-requirements.md`; general yield,
balances, cost basis, and P&L are outside this domain.

1. Identify the reward pool/distribution for an epoch.
2. Resolve the eligible vote/ownership/beneficiary interval at the correct block.
3. Calculate the participant's raw share using versioned integer math.
4. Reconcile against claim and distribution events.
5. Attach a historical price selection without overwriting the native amount.
6. Emit exact/estimated/confidence metadata.
7. Recompute only affected wallets/epochs after a backfill or reorg.

Before launch, compare projected earnings to a representative set of direct
contract `earned` reads and realized claim events.

### Indexer framework ADR

Evaluate two approaches with a real Mezo dataset:

1. A small custom viem-based indexer using the schema above.
2. A maintained TypeScript indexer framework with PostgreSQL and reorg support.

Score archive-RPC behavior, dynamic contract discovery, template gauges,
backfills, reorg recovery, custom projections, operational visibility, and the
ability to retain raw events. Do not choose solely on the speed of a hello-world
setup.

## 7. API boundaries

### Core product API

This contract is consumed by the trusted web/BFF and internal services. It is
not a general browser-facing integration API and should not be publicly routed
around the BFF.

- REST/JSON with an OpenAPI 3.1 contract.
- Cursor pagination for event/time-series collections.
- Explicit `network`, `asOfBlock`, `dataStatus`, and `generatedAt`.
- Raw amounts serialized as decimal strings.
- Conditional requests with ETag/Last-Modified where appropriate.
- Problem Details-style error envelope with request ID and stable code.
- Idempotency keys for Matchbox-owned POST operations.
- No database table shapes exposed directly.

Representative routes:

```text
GET  /v1/networks
GET  /v1/epochs/current
GET  /v1/wallets/:address/voting-context
GET  /v1/wallets/:address/actions
GET  /v1/wallets/:address/voting-incentive-earnings
GET  /v1/opportunities
GET  /v1/gauges/:address
GET  /v1/gauges/:address/history
GET  /v1/pools/:address
GET  /v1/validators/:address
GET  /v1/activity
POST /v1/transactions/prepare
POST /v1/transactions/simulate
POST /v1/query/streams
GET  /v1/query/threads/:id
POST /v1/query/support-reports
```

The browser can still submit the prepared transaction directly through wagmi or
viem. Preparation must not become required for users to interact with public
contracts independently.

### Internal API

Use the same domain services and schemas. Avoid a second tRPC-only business API
unless it creates a measurable development benefit; divergent public/internal
contracts recreate the current duplication.

The external registered developer API is the smaller resource surface defined
in `04-developer-platform-redesign.md`; it reuses domain services without
exposing this complete core contract.

### Matchbox MCP and Stuart boundary

The stateless Matchbox MCP reuses the same framework-independent domain handlers
and executable schemas. MCP is a protocol adapter, not a second business-logic
implementation and not an LLM wrapper around ordinary reads.

Stuart is a first-party MCP client. Matchbox controls the Groq tool loop so the
application owns authorization, parallel read fan-out, approvals, backpressure,
observability, and compatibility with MCP 2026-07-28. External agents may call
primitive tools or `ask_stuart`; the latter invokes the agent runtime with a
non-recursive allowed tool set.

MCP requests remain self-contained. Durable threads, memories, proposals,
support reports, and later automations are explicit application records
referenced by opaque authenticated handles, never hidden transport sessions.

The public MCP exposes only allowlisted resources/tools. Its bounded anonymous
public subset is separate from the credential-only registered REST developer
API. OAuth/OIDC protects Matchbox-owned account data; public wallet data is not
misrepresented as private because authorization is available.

## 8. Cache and performance strategy

- CDN cache anonymous product-site detail and list responses. This does not
  grant anonymous access to the registered-only developer API.
- Use short stale-while-revalidate windows for current epoch state.
- Cache immutable historical epoch responses aggressively.
- Use PostgreSQL read models and correct indexes before adding Redis/Valkey.
- Add Redis/Valkey only for workloads that need it: distributed rate limits,
  hot ephemeral state, or a selected queue system.
- Prevent request stampedes with single-flight refreshes and jittered expiry.
- Use background refresh rather than making users wait on multiple upstream RPCs.
- Return partial sections with source-specific status only when the API contract
  makes incompleteness explicit.

Initial service-level objectives:

- cached public API p95 under 150 ms at the service edge;
- uncached read-model API p95 under 400 ms, excluding client network;
- wallet voting-context p95 under 800 ms for a wallet with 100 positions;
- first useful frontend content under 2.5 s on a mid-range mobile device/4G;
- indexer lag under 2 blocks in healthy conditions;
- finalized ledger correction after a reorg under 5 minutes;
- 99.9% monthly availability for read APIs after public launch.

These are design targets and require a load-test ADR with actual traffic models.

## 9. Jobs and event delivery

- Use a durable queue with retries, visibility, dead-letter handling, and unique
  job keys.
- Prefer a PostgreSQL-backed job system initially to reduce infrastructure,
  unless throughput testing proves it insufficient.
- Use the transactional outbox pattern for notifications and other durable
  event delivery.
- Job types include:
  - projection rebuild;
  - historical price resolution;
  - wallet voting-context and voting-incentive earnings backfill;
  - epoch close;
  - campaign metric calculation;
  - alert evaluation;
  - export generation;
  - official knowledge ingestion and revalidation;
  - support-report enrichment and delivery;
  - long-running MCP Tasks after v1.
- Store attempt count, next attempt, last error, trace ID, and idempotency key.

## 10. Authentication and authorization

- Public chain-derived product pages require no end-user login, but their data is
  delivered through server rendering/caching, a rate-limited BFF session, or the
  explicitly bounded anonymous Matchbox MCP public subset. This does not create
  anonymous access to the registered REST developer API.
- Optional user accounts use secure HTTP-only sessions.
- Wallet linking uses a nonce, domain/audience, chain, issued/expiry time, and
  single-use signature verification.
- Re-authenticate for high-impact Matchbox-owned changes.
- Contract write authorization remains enforced on-chain.
- Backend profile permissions are continuously reconciled with current chain
  ownership/operator/beneficiary state.
- Organization access uses explicit membership roles and resource-scoped checks.
- Matchbox ID uses authorization code + PKCE, OIDC discovery, signed ID tokens,
  rotating keys/JWKS, pairwise subjects, explicit claims consent, and
  connected-app revocation.
- MCP authorization follows the 2026-07-28 authorization model and current
  client metadata guidance; scopes separate public reads, persistent Query
  state, support history, and memory read/write.
- Wallet and Discord claims are separately scoped; no endpoint may enumerate an
  arbitrary wallet's Discord identity.
- Service credentials use least privilege and rotate without downtime.
- Secrets are never stored in reversible form when verification can use a hash.

## 11. Frontend boundary

The all-new frontend should:

- consume generated API clients and stable domain view models;
- use wagmi/viem for wallet connection, simulation, signing, and submission;
- avoid direct multi-contract reads for data already available from the backend;
- optionally verify critical prepared-call parameters against the selected
  network/contract registry;
- keep transaction state in a dedicated state machine rather than component
  booleans;
- render only trusted versioned generative UI manifests from Stuart;
- support keyboard-complete Command-K search, a persistent Query side workspace,
  and a durable responsive canvas without turning navigation-only searches into
  threads;
- use one styling/component foundation selected to fit the Figma/Pencil system;
- not inherit current route names or the Tailwind/Styletron/BaseUI mixture.

Recommended greenfield baseline as of 2026-07-31, still recorded in a design
ADR and pinned to secure stable patches:

- Next.js 16.2 Active LTS and React 19.2 stable;
- App Router server rendering for public discovery and a responsive client
  voting workspace;
- Tailwind CSS 4.3 with CSS-first semantic design tokens;
- one accessible primitive system, preferably Base UI after a prototype;
- TanStack Query only for client server-state that route data cannot satisfy;
- `motion/react` only for purposeful compositor-only animation;
- Storybook or an equivalent component workbench;
- Playwright for critical journeys and visual regression.

The separate Node 24 API owns business logic. Do not rebuild the current pattern
of business APIs distributed through frontend route handlers.

The complete experience constraints live in
`06-design-and-frontend-principles.md`.

## 12. Observability and operations

- Structured JSON logs with request/job/network/block/epoch correlation fields.
- OpenTelemetry traces and metrics across API, jobs, database, and RPC calls.
  Traces and metrics are stable in the current OpenTelemetry JavaScript SDK;
  treat OTel log support separately.
- Error reporting with source maps and release identifiers.
- Dashboards:
  - API latency/error/cache rate;
  - RPC latency/error/failover;
  - indexer head/lag/reorgs;
  - projection backlog/failures;
  - notification delivery;
  - price staleness/confidence;
  - data reconciliation drift;
  - MCP calls by tool, client, auth class, latency, and weighted cost;
  - Groq latency, errors, rate-limit pressure, and token use;
  - Stuart tool-selection failures, unsupported UI blocks, and citation gaps;
  - support queue age and resolution state.
- Synthetic checks for wallet voting context, opportunity lists, detail pages,
  OpenAPI, and transaction simulation.
- Every deploy includes schema compatibility checks and a rollback plan.

Official reference:

- [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/)

## 13. Testing

- Unit tests for integer financial math, epoch rules, optimizer, and permission
  decisions.
- Property tests for allocation totals, rounding, reward conservation, and
  idempotent projections.
- Contract tests against pinned Mezo fork/snapshot blocks.
- Integration tests with isolated PostgreSQL.
- Replay tests using captured real log ranges, including duplicates and reorgs.
- Golden reconciliation fixtures for known wallets/epochs.
- API schema and generated SDK compatibility tests.
- MCP 2026-07-28 schema, discovery caching, MRTR fallback, OAuth scope, and
  MCP App compatibility tests.
- Golden Stuart query/tool selection, source authority, prompt injection,
  memory consent, and hallucinated-entity tests.
- Generative UI manifest validation, accessibility, responsive, and visual
  regression tests.
- Load tests for large wallets, activity scans, epoch rollover, and public list
  endpoints.
- End-to-end tests for connect/read, prepare/simulate, profile publish, claims,
  Query overlay/workspace/canvas, watched-wallet permissions, approved swaps and
  zaps, support submission, developer app/key flow, and consent/revocation.

## 14. Migration approach

1. Freeze and document calculation semantics from the existing code.
2. Ingest historical logs into the new raw ledger.
3. Build read models and compare them with current Supabase history, Goldsky,
   Mezo APIs, and direct RPC.
4. Expose internal shadow APIs and run parity reports.
5. Point selected read-only current screens at the new backend behind flags.
6. Expose the new frontend on read-only and wallet voting-context flows only to
   internal/closed-alpha participants.
7. Migrate write preparation/profile storage.
8. Migrate claims, voting, and incentive workflows with dual-run telemetry.
9. Pass the complete voter-core reconciliation, transaction-safety,
   performance, accessibility, and rollback gates.
10. Make Pro public only after every retained in-scope read and write is
    self-contained; no public workflow may hand off to legacy Matchbox.
11. Dogfood the stateless MCP with Stuart, expose an external preview during
    closed alpha, and launch the stable MCP with the self-contained Pro release.
12. Launch the broader redesigned developer console/API against the same read
    models in its accepted later phase.
13. Retire old Next routes, Deno functions, and duplicated client calculations
    only after backfill, public parity, rollback, and partner-cutover criteria
    pass.

Strict public parity does not require a big-bang implementation. Build, shadow,
reconcile, and migrate incrementally behind internal flags while legacy
Matchbox remains deployable; the strict gate applies when Pro first becomes
public.

## 15. ADRs required before implementation

- ADR-001 hosting and deployment topology for true Node 24 processes.
- ADR-002 Fastify and schema/type-generation stack.
- ADR-003 PostgreSQL provider and migration/query tooling.
- ADR-004 indexer framework versus custom ingestion.
- ADR-005 finality depth and reorg policy per Mezo network.
- ADR-006 job queue and scheduler.
- ADR-007 frontend framework and rendering boundaries.
- ADR-008 account/session provider, wallet-link model, and Matchbox ID OIDC
  boundary.
- ADR-009 price providers and historical selection policy.
- ADR-010 product BFF containment, free developer API authentication, and rate
  limiting.
- ADR-011 data retention and privacy policy.
- ADR-012 whether Goldsky remains production-critical or reconciliation-only.
- ADR-013 MCP 2026-07-28 server, tool/resource/app versioning, authorization,
  anonymous subset, and weighted quotas.
- ADR-014 Stuart Groq runtime, controlled tool loop, streaming, backpressure,
  outage degradation, and model evaluation.
- ADR-015 Query thread/memory/share/support retention and consent model.
- ADR-016 official knowledge ingestion, source authority, citation, and prompt-
  injection defenses.
- ADR-017 transaction proposal handles, approved swap/zap registry, quote expiry,
  refresh, simulation, and unsigned external handoff.
