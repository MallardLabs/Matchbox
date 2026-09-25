# Matchbox Activity Subgraph

Goldsky subgraph for the public Matchbox activity API (`matchbox-explorer`).

**Deployed version:** `matchbox-explorer/3.4.0` (tag `live`)

It normalizes activity from:

- `VeMEZO` + `VeBTC` voting escrow lock lifecycle
- `BoostVoter` / `PoolsVoter` / third-party / validators votes
- Bribe + fee voting reward notify/claims (`VOTE_*_CLAIMED`)
- Pool factory + known pools: LP add/remove, swaps
- Gauge stake/unstake (dynamic template from PoolsVoter)
- Bribes and fees on pool gauges older than `startBlock` (see below)
- mUSD savings, rebase/merkle claims, system splitters/PCV/minter

## Pre-`startBlock` pool gauges

`BribeToPool` and the `BribeVotingReward` / `FeeVotingReward` templates are only
created by `handlePoolGaugeCreated`. The nine gauges from the original v2 pool
launch (blocks 5231392–5231459) predate the main `startBlock` (7739500), so their
reward contracts were never registered and every bribe posted to them was silently
dropped — roughly $10.9k of real incentives missing, against ~$352 that was
visible. The split was total: every basic (v2) pool invisible, every concentrated
pool fine.

Both reward contracts for each of those nine gauges are therefore declared as
**static** datasources (`LegacyBribe*` / `LegacyFee*`, 18 in total), each at its
own contract-creation block so the full history is covered rather than just the
window after 7739500. `src/legacy-pool-rewards.ts` seeds the pool/gauge mapping on
first use.

Because those datasources start at 5231392, the subgraph as a whole now begins
there. Only the 18 legacy datasources are active before 7739500, so no other
entity's history changes — but a fresh sync has ~2.5M more blocks to scan.

That address table is **generated from chain state**, with every entry read back
from `gaugeToBribe` / `gaugeToFees` and cross-checked against the compiled
manifest. Regenerate rather than hand-editing it: a mistyped address fails
silently, which is exactly how the original bug went unnoticed.

The set is closed — it can only ever describe gauges older than `startBlock`, so
new pools never belong in it.

## Development

```bash
pnpm install
pnpm --filter @repo/activity-subgraph codegen
pnpm --filter @repo/activity-subgraph build
```

## Deploy

```bash
pnpm --filter @repo/activity-subgraph deploy:mezo
pnpm --filter @repo/activity-subgraph deploy:mezo-testnet
```

## Public API Shape

The `ActivityEvent` entity is intentionally normalized so the web app and a
future public Matchbox API can query one feed:

```graphql
{
  activityEvents(
    first: 100
    orderBy: timestamp
    orderDirection: desc
    where: {
      timestamp_gte: "1775000000"
      timestamp_lte: "1777600000"
      actionType_in: [LOCK_CREATED, LOCK_EXTENDED, BOOST_VOTE]
    }
  ) {
    id
    actionType
    boostContext
    source
    txHash
    actor
    tokenId
    amount
    duration
    gauge
    timestamp
  }
}
```
