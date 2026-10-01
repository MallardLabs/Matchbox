# Matchscan future product brief

Status: accepted next-phase direction, deliberately outside the Matchbox Pro
launch scope.

## 1. Product thesis

Matchscan is Matchbox's fully fledged explorer for Mezo. It should make ordinary
chain state searchable while interpreting Mezo-native entities—veBTC, veMEZO,
gauges, votes, incentives, pools, validators, and epochs—more usefully than a
generic EVM explorer.

It is a separate product, not a renamed Matchbox Pro activity page.

Reference inspiration:
[Chainflip Explorer](https://scan.chainflip.io/). Inspection on 2026-07-31 showed
a global “search anything” entry point, protocol-domain navigation, headline
network metrics, latest swaps, address/source/status/duration detail, finalized
block context, latest events, and latest blocks. Matchscan should learn from that
product structure without copying its brand or page layout.

## 2. Relationship to Matchbox Pro

- Matchbox Pro keeps contextual activity in wallet, Rewards, gauge, pool,
  validator, and transaction histories.
- Stuart Query may find and explain those contextual records, including activity
  for the connected wallet, a watched wallet, or any explicitly inspected public
  address. It follows activity across chains only when a supported bridge record
  explicitly links the source and destination transactions.
- Pro retains a compact normalized expert explorer under `More` until Matchscan
  is ready.
- Once live, Matchbox transaction, vote, claim, incentive, gauge, and block links
  deep-link to canonical Matchscan entity pages.
- Matchscan may reuse the canonical raw chain ledger, contract registry, decoded
  events, finality/reorg logic, and entity identifiers built for Pro.
- Matchscan owns separate explorer read models, search indexes, APIs, caching,
  routes, performance budgets, and release gates so explorer traffic cannot
  degrade voting or claiming.
- The shared Matchbox MCP may later expose Matchscan-backed explorer tools, but
  those tools retain separate capacity, schemas, and service objectives from the
  Pro financial and transaction tools.

## 3. Expected explorer surfaces

### Universal chain exploration

- Global search for transaction hash, address, block, token, contract, NFT/token
  ID, gauge, pool, validator, and epoch.
- Network overview with finalized head, block cadence, transaction/activity
  volume, active addresses, fees, and source freshness.
- Blocks, transactions, receipts, logs/events, contracts, tokens, holders,
  transfers, addresses, and decoded calls.
- Clear pending/finalized/reorged/failed status and canonical timestamps.
- Human-readable decoded data alongside raw calldata/logs and copyable values.

### Mezo-native exploration

- veBTC and veMEZO position histories, ownership intervals, lock state, voting
  power, and votes.
- Gauge, pool, and validator pages with identity/profile context, weights,
  incentives, votes, claims/distributions, epochs, and relevant transactions.
- Incentive deposits, reward distributions, voter claims, and token pricing
  provenance.
- Epoch pages that connect votes, incentives, distributions, and major changes.
- Validator and protocol-state views tailored to Mezo rather than generic
  contract logs alone.

### Operational and developer value

- Stable entity permalinks and shareable filtered URLs.
- Source block, finality, decoder version, contract version, and raw references.
- API access and export policy designed separately from the free registered
  Matchbox developer API.
- Support/debug workflows that let operators trace a Matchbox calculation back
  to raw canonical events.

## 4. Architecture boundary

The shared data foundation is intentional, but Matchscan is not merely another
frontend over Pro's BFF:

```text
Mezo RPC/logs -> shared raw canonical ledger and contract metadata
                         |                         |
                         v                         v
              Pro financial read models   Matchscan explorer/search read models
                         |                         |
                         v                         v
                  Matchbox Pro API             Matchscan API
```

- A reorg/finality policy is shared at ingestion.
- Financial calculations remain Pro domain projections.
- Explorer search/decoding/read throughput remains Matchscan's responsibility.
- Matchscan failure or traffic spikes must not block Pro voting, claims, or
  optimizer refreshes, Stuart's deterministic Pro tools, or transaction review.

## 5. Explicit non-goals for the Pro build

- Do not expand Pro into a complete blocks/transactions/contracts explorer.
- Do not turn Query into an implicit same-address multichain scanner. In the Pro
  release, cross-chain context is limited to explicitly linked bridge legs so it
  does not create a second explorer indexer burden.
- Do not delay Pro GA for Matchscan search, token-holder indexing, or explorer
  parity.
- Do not make Matchscan UI/brand decisions during the Pro design handoff.
- Do define stable canonical IDs and deep-linkable source metadata now so the
  later product does not require a data-model rewrite.

## 6. Decisions deferred to the Matchscan phase

- Matchscan MVP versus complete GA surface.
- Search technology and high-cardinality indexing.
- Exact Mezo protocol dashboards and network-health metrics.
- Contract verification and source-code publishing workflow.
- Public versus registered API policy and rate limits.
- Independent visual identity versus Matchbox-family design system.
- Hosting, scaling, retention, and archive-node strategy.
