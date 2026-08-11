# Developer platform redesign

The current developer platform is a private-beta prototype. Preserve its useful
product intent, but do not port its architecture or custom authorization
protocol by default.

## Accepted product scope

The first developers are application builders who need:

1. public Matchbox gauge-profile data for display in their own products;
2. the Discord ID, username, display name, and avatar associated with the
   authorizing wallet, only after that user explicitly consents;
3. structured Mezo, wallet, gauge, support, Optimizer, and unsigned action tools
   for their own AI agents through the Matchbox MCP.

Matchbox ID is also restored as the general wallet identity/sign-in surface that
delivers those claims through standards-based consent.

The registered REST developer API remains deliberately narrow. The Matchbox MCP
is a distinct foundational agent surface: it exposes the approved Query-era
data, deterministic calculations, support knowledge, and unsigned action
proposals without becoming a general portfolio, tax, arbitrary trading, or
webhook platform.

## 1. What the current platform proves

- Developers may need normalized Matchbox data.
- Public browser integrations and server integrations need different keys.
- Apps need origin/redirect registration, scopes, quotas, usage, and revocation.
- Some user-linked information requires explicit consent.
- A TypeScript SDK and OpenAPI document reduce integration friction.
- App and key audit trails matter.

## 2. Current constraints to remove

- The API has only two read scopes and four v1 operations.
- Gauge reads perform live RPC work on each request instead of serving canonical
  read models.
- The consented “profile” is a Discord-wallet link, not a general Matchbox user
  profile.
- Authorization is a custom short-lived code exchange rather than a complete
  standards-based OAuth/OIDC implementation.
- Developer identity and end-user wallet identity use separate Supabase auth
  paths bridged across hosts.
- One Next.js app serves both ID and developer hosts with host-aware routing.
- The console is one large page for app registration, usage, and keys.
- App approval appears to require database/operator intervention rather than a
  complete review workflow.
- Usage is coarse daily aggregation with limited analytics.
- Cloudflare Worker quotas, Supabase service access, a Netlify proxy, DNS
  constraints, and feature flags create several operational layers for a small
  API.
- Mainnet is hard-coded into gauge API types and behavior.
- OpenAPI response schemas use broad `additionalProperties` placeholders even
  though the SDK has stricter hand-maintained schemas.

## 3. Three deliberately bounded products

These are separate products and should have separate scopes and launch gates.

### Product A — Gauge Profile API

Public access to profiles curated in Matchbox: identity, avatar, description,
links, tags, strategies, profile type, gauge identity, and update metadata.

This should read from canonical profile read models, not perform live RPC work
on every request. Background reconciliation verifies the live gauge/NFT,
operator, beneficiary, and profile authorization state.

### Product B — Matchbox ID

An app may sign a user in through Matchbox ID and request scoped identity claims:
a stable pairwise Matchbox subject, wallet address, and linked Discord identity.
The result is bound to the user and app that completed authorization; it is not
a wallet-to-Discord directory.

Implement a standards-conformant authorization code + PKCE flow rather than
extending the custom beta exchange. Matchbox ID is a general sign-in provider,
so implement the relevant OpenID Connect discovery, ID token, userinfo, JWKS,
pairwise subject, grant, and revocation behavior.

Public on-chain wallet data is not made private by adding an OAuth prompt. Apply
consent to Matchbox-owned/private account data, not data any caller can already
read from the chain.

### Product C — Matchbox MCP

A stateless MCP 2026-07-28 server exposes the same deterministic domain tools
that power Stuart. External agents may use primitive tools or `ask_stuart` for
sourced Matchbox synthesis and trusted MCP Apps.

The MCP is part of the Query foundation and reaches stable public availability
with the self-contained Pro launch. Developer-console polish, broader REST/SDK
work, and partner operations may still follow later.

## 4. Proposed API products

### Gauge Profile API

Use cases:

- power the Matchbox Pro frontend;
- show Matchbox-curated gauge identity in partner apps;
- render profile cards, lists, and links;
- resolve a veBTC token or gauge address to its public Matchbox profile.

Resources:

```text
/v1/networks
/v1/gauge-profiles
/v1/gauge-profiles/:network/:gaugeAddress
/v1/vebtc/:network/:tokenId/gauge-profile
```

The list endpoint supports cursor pagination, profile type, tag, updated-since,
and address filters. A profile response distinguishes Matchbox-authored fields
from live chain-derived identity and authorization fields.

Every call requires a registered application credential. There is no anonymous
developer API tier. Publishable app keys authenticate browser integrations and
require registered origins; secret keys authenticate server integrations.

Accepted scope: the API includes every profile-backed type—boost gauge,
validator gauge, pool, and standalone target—through one unified profile schema
with an explicit `profileType` discriminator.

### Matchbox ID API

Recommended flow:

```text
GET  /.well-known/openid-configuration
GET  /oauth/authorize
POST /oauth/token
GET  /oauth/jwks
GET  /v1/userinfo
POST /oauth/revoke
```

Scopes:

- `openid` — stable pairwise Matchbox subject and ID token;
- `wallet` — the authorizing wallet address;
- `discord:id` — linked Discord user ID;
- `discord:profile` — username, display name, and avatar.

Both Discord scopes ship in v1. An app requesting profile presentation fields
must request `discord:profile`; the consent screen lists every field being
shared. The stable Discord ID remains available as the narrower scope.

The default `sub` is pairwise per app/sector so Matchbox ID does not create an
unnecessary universal cross-app tracking identifier. Wallet address and Discord
claims require their own explicit scopes.

`/v1/userinfo` returns data for the bearer token's authorizing user. Do not ship
an endpoint that accepts an arbitrary wallet address and reveals its Discord
identity, even if that wallet previously authorized some other app.

### Matchbox MCP

Initial MCP families cover:

- Matchbox navigation and entity resolution;
- official Mezo support knowledge, governance, audits, announcements, and
  structured status;
- public wallet activity, transactions, loans, Mezo Earn positions, votes, and
  claimable rewards;
- gauges, histories, deterministic research rankings, and the canonical
  Optimizer;
- unsigned preparation and simulation for votes, sends, repayments, claims,
  approved swaps, Earn deposits, and approved zaps;
- optional `ask_stuart` synthesis, trusted MCP Apps, and reviewed support-report
  submission.

The server implements MCP `2026-07-28` with self-contained requests, cacheable
discovery, header-based routing, Multi Round-Trip Requests where supported, and
the formal extension framework. The complete product/tool contract lives in
`10-stuart-query-product-and-architecture.md`.

MCP access has three explicit classes:

- a tightly rate-limited anonymous subset for basic public Mezo knowledge and
  public chain data;
- free registered application access for higher-volume public tools;
- user OAuth for persistent Query state, memory, saved watches, and support
  history.

External action tools return unsigned proposals only. V1 has no signing tool.
The bounded anonymous MCP subset is an explicit exception to the registered REST
developer API's credential-only policy.

### Deferred API products

- general portfolio, tax, cost-basis, and cross-chain balance aggregation;
- non-approved analytics outside the Query/Pro contract;
- webhooks and event streams;
- bulk data exports;
- arbitrary write/trading APIs and transaction signing;

## 5. API design rules

- OpenAPI is generated from the executable route schemas.
- Generate the public developer client from the same route schemas used by
  Matchbox Pro where those focused public endpoints overlap; do not publish the
  product's private/internal API surface by accident.
- No separate hand-written SDK response schema that can drift from OpenAPI.
- Version in the URL for breaking resource changes.
- Network is explicit and validated; no hard-coded mainnet-only types.
- Pagination uses opaque cursors.
- Every response includes source/freshness/finality metadata where relevant.
- Stable error codes, request IDs, and documentation links.
- Public responses support ETag and appropriate cache controls.
- Deprecations include headers, a migration guide, and an announced sunset.
- MCP tools, resources, prompts, Apps, and Tasks are generated from versioned
  executable schemas that reuse the same domain handlers as the product API.
- `ask_stuart` is layered above primitive tools and cannot recursively call
  itself.

### Product web API containment

Any request made by browser JavaScript can be inspected and replayed. Matchbox
cannot make public data visible in the product while making its delivery path
secret. Security must not depend on undocumented URLs, custom headers, CORS, or
a credential embedded in the frontend bundle.

Use these boundaries instead:

- Keep the core Node API on private service networking with service-to-service
  authentication; the browser never receives a core or developer API secret.
- Route first-party browser data through a narrow, same-origin
  backend-for-frontend (BFF). The BFF returns task-specific view models rather
  than exposing a general query surface or bulk database-shaped resources.
- Keep first-party session state in `Secure`, `HttpOnly`, `SameSite` cookies and
  require CSRF protection for mutations. A cookie protects token material from
  JavaScript; it does not make an observable browser request impossible to
  replay.
- Render and cache anonymous public discovery server-side where practical.
  Public HTML and its data remain scrapeable in principle.
- Rate-limit first-party BFF traffic by endpoint cost plus browser session and IP
  prefix, adding wallet/account identity when available. Never rely on IP alone.
- Treat origin checks, CORS, and fetch metadata as useful browser defenses, not
  proof that a caller is the genuine UI.
- Apply WAF/bot controls and step-up challenges only to suspicious or expensive
  behavior so normal voting and inspection stay fast.
- Make the registered developer API the stable, documented, and easier path for
  integrations. Internal BFF routes have no external compatibility guarantee.
- Make the Matchbox MCP the stable documented path for agent integrations; do
  not make external agents imitate first-party Query/BFF requests.

## 6. Authentication and credentials

### Developer console

- Developer tooling lives on a distinct console surface and does not appear in
  the ordinary Matchbox Pro product sidebar.
- Developer sign-in uses passkeys with email recovery. GitHub OAuth is a
  follow-on only if developer demand justifies it.
- Organizations own apps, never an individual developer row.
- Start with owner, admin, and developer roles.
- Require step-up authentication for secret creation, rotation, and member
  changes.

### API credentials

- Publishable keys identify browser apps and require registered origins.
- Secret keys are server-only and stored as one-way hashes.
- Support key expiry, rotation overlap, last-used metadata, and revocation.
- Allow distinct test and live environments.
- Do not put environment into a cosmetic prefix only; enforce environment and
  network access at the app/key policy layer.
- CIDR restrictions are optional defense in depth, not the primary secret-key
  control.
- Consider short-lived service tokens for larger partners after launch.

### Matchbox ID and Discord consent

- authorization code + PKCE;
- exact redirect URI match;
- state and nonce validation;
- short-lived single-use codes;
- short-lived access tokens and rotating refresh tokens;
- explicit audience and issuer;
- OIDC discovery, signed ID tokens, key rotation, and published JWKS;
- pairwise subject identifiers;
- granular consent screen;
- grant/version invalidation when scopes or linked wallets change;
- connected-app management and revocation;
- security review against the relevant OAuth threat model;
- explicit separation between public wallet data and consented Matchbox-owned
  identity claims.

### Matchbox MCP access

- Follow MCP 2026-07-28 authorization and current client metadata guidance.
- Use granular scopes for persistent threads, saved watch wallets, support
  history, `memory:read`, and `memory:write`.
- Require visible user consent for memory writes and support submission.
- Bind every unsigned action proposal to network, target wallet, exact content,
  source snapshot, and expiry.
- Keep public reads public; OAuth protects Matchbox-owned data and continuity,
  not public chain facts.

## 7. Developer console requirements

### Overview

- environment status, API health, usage, errors, and recent changelog.

### Applications

- create/edit app;
- app metadata, logo, site, contacts, policies;
- development/live environments;
- requested/approved scopes;
- review status and operator feedback;
- origins and redirect URIs;
- team ownership.

### Keys

- create, reveal once, copy, rotate, expire, revoke;
- identify last used time, IP/region summary, and affected endpoints;
- warn on keys that appear in browser traffic or source-code leak telemetry.

### Usage and logs

- requests, latency, cache status, response codes, quota, and top routes;
- filter by key/environment/time;
- inspect request ID without exposing private response data;
- export usage.

### OAuth/Connect

- redirect configuration, consent preview, grant counts, revocation events, and
  scope-change migration state.

### Documentation

- interactive OpenAPI reference;
- copyable quickstarts using the selected environment;
- TypeScript first, then curl;
- generated API examples with real schema fields;
- changelog, status, limits, errors, pagination, consent, and migration guides.

## 8. App lifecycle and review

Suggested states:

```text
draft -> development -> submitted -> approved-live
                      -> changes-requested
                      -> rejected
approved-live -> restricted -> suspended -> retired
```

- Public gauge-profile apps may register and receive development credentials
  through the dedicated console, but every request remains authenticated.
- Gauge-profile-only apps receive production credentials automatically after
  registration and automated abuse checks.
- Access to the `discord:id` or `discord:profile` scope requires manual approval
  during beta.
- Scope increases create a new review and require affected users to re-consent.
- Existing lower scopes remain functional during review when safe.
- Every operator action produces an immutable audit event.

## 9. Quotas and service protection

- Enforce short-window limits close to the API process.
- The registered REST API is free but never anonymous; every request resolves to
  an organization, app, environment, and active key.
- The separately bounded anonymous MCP subset uses stricter weighted cost,
  concurrency, daily safety, and IP-prefix controls. Expensive history,
  personalized continuity, memory, support history, and action preparation may
  require a registered app or user OAuth.
- Make app/key identity and weighted endpoint cost the primary limit dimensions.
- Add IP or IP-prefix limits as a secondary abuse layer, especially for
  publishable browser keys. IP cannot be the sole limit because shared networks
  punish legitimate users and attackers can rotate addresses.
- Apply tighter per-app and per-authorizing-user limits to Discord consent and
  identity routes than to cacheable gauge-profile reads.
- Enforce burst and sustained windows, pagination ceilings, query complexity,
  concurrent-request limits, and daily safety quotas.
- Return `429`, `Retry-After`, standard rate-limit headers, and a stable reason
  code. Show current usage and resets in the developer console.
- Persist usage aggregates asynchronously; do not add a database write to the
  critical path of every cacheable read.
- Configure policies by endpoint class so limits can be tuned without a deploy.
- Begin beta with these adjustable hypotheses:
  - development: 60 requests/minute and 5,000/day per app;
  - production profile reads: 300/minute and 100,000/day per app;
  - publishable browser keys: an additional 60/minute per key + IP prefix;
  - Discord identity: 30/minute per app and 10/minute per authorizing user;
  - maximum profile page size: 100.
- Validate those numbers with load tests and upstream cost budgets, then tune
  them with beta telemetry. Do not turn them into hard-coded product constants.
- Support temporary quota increases through an audited operator workflow. This
  is capacity management, not a paid plan.

## 10. SDK strategy

### TypeScript SDK v1

- Generated core types/client from OpenAPI.
- Small hand-written ergonomic layer for bigint strings, pagination, retries,
  OAuth/OIDC/PKCE helpers, and Node/browser environment checks.
- No heavyweight React or wallet dependency in the base SDK.
- Separate optional React Query package.
- Semver, changelog, provenance, and automated compatibility tests.

### Later

- CLI for auth, app/key inspection, and API exploration.
- Python SDK only after demonstrated demand.
- Embeddable UI widgets as a separate package, never bundled into the data SDK.
- Typed MCP tool schemas and selected MCP Apps ship with Query; later SDK work
  may add ergonomic MCP helpers without forking the protocol.

## 11. Security and privacy

- Threat-model API keys, OAuth redirect abuse, wallet-signature replay,
  organization privilege escalation, and data scraping.
- Strict separation of service roles and public database access.
- Encrypt sensitive provider tokens at rest.
- Hash API keys and refresh tokens.
- Maintain a complete admin/developer audit trail.
- Define retention for request metadata, IPs, audit logs, grants, and deleted
  accounts.
- Provide user data export and connected-app revocation.
- Threat-model prompt injection, malicious MCP clients, tool confused-deputy
  behavior, unsigned proposal substitution, memory poisoning, and support-report
  overcollection.
- Avoid returning raw Discord IDs or other linked-provider identifiers unless the
  approved scope and user-facing consent make that necessary.

Official guidance:

- [OWASP REST Security — API keys and throttling](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html#api-keys)
- [OWASP API4:2023 — Unrestricted Resource Consumption](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/)
- [IETF browser-based application BFF pattern](https://datatracker.ietf.org/doc/draft-ietf-oauth-browser-based-apps/)

## 12. Migration from the beta

1. Inventory actual beta apps, keys, grants, and usage.
2. Confirm whether any external integration depends on the custom authorization
   exchange.
3. Serve compatibility gauge-profile reads from new canonical read models.
4. Generate an accurate compatibility OpenAPI and SDK release.
5. Offer beta app owners a migration environment and parallel credentials.
6. Launch the focused gauge-profile API and console.
7. Dogfood the Matchbox MCP with Stuart, expose an external preview during
   closed Pro alpha, and publish the stable endpoint with Pro launch.
8. Migrate or sunset custom profile authorization with a dated notice.
9. Revoke old keys only after verified partner cutover.
10. Retain beta audit records under the chosen retention policy.

## 13. Remaining decisions

The initial developer audience, REST API scope, Matchbox MCP direction, Matchbox
ID direction, Discord claim set, credential policy, and free-access model are
accepted. Implementation details that remain belong in delegated ADRs:
identity/session provider, OIDC signing-key custody and rotation, MCP client
metadata/compatibility, exact rate limits, abuse controls, hosting, and data
retention.
