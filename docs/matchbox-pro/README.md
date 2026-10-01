# Matchbox Pro discovery and handoff

Status: working draft, updated through the Stuart Query decisions accepted on
2026-08-11.

This package captures the product behavior that Matchbox Pro must consciously
preserve, replace, or retire. It is intentionally implementation-agnostic where
the existing implementation is accidental or due for replacement.

## Documents

1. [Current product capability map](./01-current-product-capability-map.md)
2. [Matchbox Pro product requirements](./02-matchbox-pro-requirements.md)
3. [Node 24 platform architecture](./03-node24-platform-architecture.md)
4. [Developer platform redesign](./04-developer-platform-redesign.md)
5. [Open product decisions](./05-open-product-decisions.md)
6. [Design and frontend principles](./06-design-and-frontend-principles.md)
7. [Consolidated owner questionnaire](./07-owner-questionnaire.md)
8. [Brand, interface, and launch options](./08-brand-interface-and-launch-options.md)
9. [Matchscan future product brief](./09-matchscan-future-product-brief.md)
10. [Stuart Query product and architecture](./10-stuart-query-product-and-architecture.md)
11. [Agent handoff prompt](./agent-handoff-prompt.md)

## How to use this package

- Product and design agents should start with documents 1, 2, 5, 6, and 10.
- Backend agents should read all documents, especially 3, 4, and 10.
- A frontend implementation agent should not copy the current page structure.
  It should preserve required outcomes and workflows while following the new
  Pencil/Figma designs.
- Every item marked `Decide` is deliberately unresolved. Do not silently choose
  an answer in implementation.
- Current documentation contains some aspirational behavior that the UI does
  not fully implement. The capability map distinguishes verified code behavior
  from desired Pro behavior.

## Product thesis

Matchbox Pro is a focused incentive marketplace for Mezo Earn. It serves
veMEZO voters first, then mixed veMEZO/veBTC power users:

- veMEZO holders discover and optimize gauge-boost opportunities.
- veBTC holders direct emissions, attract boost, and manage incentive strategy.
- validators and liquidity projects compete for veBTC votes.
- voters understand which incentives they earned, why they earned them, and
  what to do before the next epoch;
- developers consume reliable unified gauge-profile data and consented Discord
  identity without rebuilding Matchbox.
- users search the entire product, ask Stuart sourced Mezo questions, inspect a
  connected or watched wallet, and prepare safe transactions through Query;
- external agents consume the same data, deterministic calculations, unsigned
  actions, and optional Stuart synthesis through the Matchbox MCP.

Analytics supports better marketplace decisions. A broader Matchbox Portfolio
is a later adjacent product, not part of the initial Pro scope.

## Non-negotiable safety principles

- Matchbox never receives or stores a user's private key.
- Transactions remain explicitly wallet-signed and are simulated before signing
  whenever the chain permits.
- Monetary values retain integer or arbitrary-precision representations from
  ingestion through API serialization.
- Mainnet and testnet data, caches, identities, and API responses cannot bleed
  into one another.
- Historical values retain the price, block, timestamp, and calculation version
  used at the time.
- Chain reorganizations and duplicate events cannot create duplicate earnings,
  votes, claims, or notifications.
- Destructive and irreversible on-chain actions receive plain-language warnings.

## What this draft does not decide

- The visual layout, visual language, component styling, or final information
  architecture. Those will come from Pencil/Figma.
- The hosting provider for the Node 24 services.
- The later scope and timing of Matchbox Portfolio.
- The implementation-level provider, key-management, and operational choices
  for Matchbox ID; its OAuth/OIDC product boundary and consented claim set are
  accepted.
- The final detailed visual expression of Query and its canvas beyond the
  accepted interaction model and trusted generative UI registry.

## Accepted exclusions

- Matchbox Pro has no paid features, and the registered developer API is free.
  Protective rate limits are operational controls rather than monetization.
- Academy is retired from Matchbox Pro and must not be carried into the new
  product architecture.

## Accepted launch gate

- Matchbox Pro requires strict self-contained parity before any public release,
  including a public beta. In-scope voter reads and writes cannot depend on a
  legacy handoff.
- Launch timing is intentionally unset and milestone-driven.

## Greenfield mandate

Matchbox Pro is a ground-up redesign. The existing codebase is a functional
reference and migration source, not a frontend foundation. Agents must not
preserve the current navigation, route structure, visual motif, component
libraries, client-side data fetching, or backend deployment seams merely for
parity. Use the latest stable, supported technology where it improves user or
operator outcomes; do not adopt preview technology for novelty.
