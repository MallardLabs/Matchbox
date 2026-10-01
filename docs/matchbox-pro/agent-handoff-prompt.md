# Agent handoff prompt

Use this prompt with a product, architecture, or implementation agent after the
owner has answered the relevant open decisions.

---

You are designing Matchbox Pro, the next generation of Matchbox for the Mezo
ecosystem.

Read every document in `docs/matchbox-pro/` before proposing architecture,
routes, data models, or UI. The documents have this authority order:

1. explicit owner answers recorded in `05-open-product-decisions.md`;
2. `02-matchbox-pro-requirements.md`;
3. `10-stuart-query-product-and-architecture.md` for Query, Stuart, generative
   UI, transaction proposals, memory, and Matchbox MCP;
4. `01-current-product-capability-map.md`;
5. `06-design-and-frontend-principles.md` for the frontend;
6. `07-owner-questionnaire.md` preserves the resolved Q1–Q33 record and delegates
   Q34–Q40 to evidence-based implementation ADRs;
7. `08-brand-interface-and-launch-options.md` records accepted brand, scope,
   strict public-release parity, and milestone-driven timing choices;
8. `09-matchscan-future-product-brief.md` defines a future adjacent product, not
   Matchbox Pro launch scope;
9. architecture proposals in `03-node24-platform-architecture.md` and
   `04-developer-platform-redesign.md`.

The current application is evidence, not the target design. Preserve user
outcomes and on-chain safety rules. Do not copy the current page layout, route
names, giant React components, client RPC waterfalls, Supabase/Deno split, or
custom developer authorization flow without a new written rationale.

Hard constraints:

- Node 24 LTS backend.
- New frontend driven by supplied Pencil/Figma designs.
- Greenfield implementation using current stable/LTS technology, never preview
  releases merely because they are newer.
- Non-custodial: Matchbox never receives private keys.
- Exact integer/arbitrary-precision financial math.
- Explicit network, block, epoch, finality, pricing source, and calculation
  version in historical data.
- Reorg-safe, idempotent chain ingestion.
- Canonical historical voting-incentive earnings ledger; do not expand it into
  general portfolio accounting.
- One optimizer objective: maximize projected personal voting-incentive return
  in USD using verified token prices at calculation time; gas never affects
  allocation. Retain native amounts, price provenance, and the vote snapshot. Do
  not invent balanced, favorite, or diversification modes. Lead with projected
  active-epoch USD earnings; annualized APY is secondary extrapolated context.
- Recalculate the optimum immediately before signing and require acknowledgement
  of a material change; never silently overwrite manual ballot edits.
- No saved-strategy product.
- Academy is retired and has no Matchbox Pro route, program engine, role job, or
  launch dependency.
- Strict self-contained parity is required before any public release, including
  a public beta. Every retained high-value read must be reconciled and every
  retained voter write must be native, safe, and complete in Pro; do not use a
  legacy handoff to pass the public-release gate.
- Launch timing is intentionally unset and milestone-driven.
- Matchbox Pro and its registered developer API have no paid features; do not
  add billing, plan, entitlement, upgrade, or paywall architecture.
- Query is the product and Stuart is its friendly, restrained agent. Preserve
  deterministic Command-K navigation, the overlay-to-workspace-to-canvas model,
  and native generative UI from a trusted component registry.
- The active Query scope is exactly one connected, watched, or explicitly
  inspected wallet. Watched and inspected wallets are read-only. Cross-chain
  context follows only bridge records that explicitly link both transaction
  legs; do not add implicit same-address multichain scanning.
- Matchbox MCP is the stateless deterministic tool boundary shared by Stuart and
  external agents. Stuart runs a Matchbox-controlled tool loop on Groq; do not
  place domain calculations in prompts or make the MCP an LLM wrapper.
- The first public release includes user-confirmed proposals for votes, sends,
  loan repayments, claims, approved swaps, Earn deposits, and zaps. Proposals
  use allowlisted contracts/routes, exact approval by default, deterministic
  quotes and simulations, explicit review, and wallet signing. Bridge execution
  is deferred; bridge activity remains searchable and explainable.
- Stuart memory is authenticated, explicit, inspectable, editable, and
  deletable. Memory never authorizes an action or changes optimizer math.
- Shared Query links warn that wallet/public chain data becomes public and omit
  account data, memory, and hidden conversation content. Support reports show a
  preview and require confirmation before entering the internal structured
  queue.
- Matchscan is a separate next-phase Mezo explorer. Pro provides contextual
  activity, stable source metadata, and future deep links; do not expand the Pro
  launch into the complete explorer described in
  `09-matchscan-future-product-brief.md`.
- Registered credentials are required for every REST developer API call and
  authenticated use is free. Matchbox MCP has an intentional, tightly bounded
  anonymous exception for public knowledge and basic public reads; higher-volume
  access, memory, and account continuity require registration or OAuth. MCP may
  return unsigned proposals only and never signs or broadcasts for a caller.
- Restore Matchbox ID as a first-class general wallet identity/sign-in product
  using standards-based OAuth/OIDC, pairwise subjects, explicit scopes, and
  connected-app revocation; do not port the custom beta protocol.
- Public on-chain data must not be mislabeled as private OAuth data.
- Mainnet/testnet isolation.
- Simulation and partial-failure handling for transaction flows.
- Accessible, responsive UI with expert technical detail available but not
  forced on beginners.

Before implementation:

1. Summarize the owner-approved product thesis and first persona.
2. Produce a preserve/redesign/retire matrix for every capability in
   `01-current-product-capability-map.md`.
3. Identify unanswered decisions that materially change the build; do not
   silently resolve them.
4. Create ADRs for hosting, server framework, database tooling, indexer, queue,
   frontend framework, auth, pricing, developer API policy, Matchbox MCP, the
   Groq agent loop, memory/share/support boundaries, and the transaction
   proposal allowlist.
5. Define source-of-truth and reconciliation tests for every financial metric.
6. Define the MCP tool schemas, generative-UI payload schemas, compatibility
   fixtures, and golden conversational/action eval set before wiring prompts.
7. Produce an incremental migration plan that keeps the existing Matchbox
   deployable.

For every proposed feature, specify:

- persona and user problem;
- source data and source of truth;
- exact calculation or contract rule;
- loading/degraded/empty/error behavior;
- permissions and threat cases;
- mainnet/testnet behavior;
- observability and acceptance criteria;
- whether it is exact, estimated, projected, or inferred.

Do not call the work complete because the new frontend looks polished. Completion
requires verified functional parity for the agreed launch scope, financial
reconciliation, transaction safety, accessibility, performance, and an
operational rollback plan.

---

## Recommended first agent deliverables

1. Product decision summary.
2. Domain model and glossary.
3. Data-source/source-of-truth matrix.
4. Historical voting-incentive earnings calculation specification.
5. API resource model and OpenAPI skeleton.
6. Backend ADR set.
7. Frontend information architecture mapped to Figma frames.
8. Migration roadmap with parity gates.
9. Threat model.
10. Test and reconciliation plan.
11. Matchbox MCP tool catalog and protocol-compatibility fixtures.
12. Stuart Query intent, generative-UI, memory, and transaction-proposal specs.
13. Golden eval set covering search, support, wallet analysis, and adversarial
    action requests.
