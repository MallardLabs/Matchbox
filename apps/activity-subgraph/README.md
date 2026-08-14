# Matchbox Activity Subgraph

Goldsky subgraph for the public Matchbox activity API (`matchbox-explorer`).

**Deployed version:** `matchbox-explorer/3.4.0` (tag `live`)

It normalizes activity from:

- `VeMEZO` + `VeBTC` voting escrow lock lifecycle
- `BoostVoter` / `PoolsVoter` / third-party / validators votes
- Bribe + fee voting reward notify/claims (`VOTE_*_CLAIMED`)
- Pool factory + known pools: LP add/remove, swaps
- Gauge stake/unstake (dynamic template from PoolsVoter)
- Bribes on pool gauges older than `startBlock` (see below)
- mUSD savings, rebase/merkle claims, system splitters/PCV/minter

## Pre-`startBlock` pool gauges

`BribeToPool` and the `BribeVotingReward` / `FeeVotingReward` templates are only
created by `handlePoolGaugeCreated`. Gauges from the original v2 pool launch
(~block 5231392) predate `startBlock` (7739500), so their reward contracts were
never registered and every bribe posted to them was silently dropped — roughly
$10.9k of real incentives missing, against ~$352 that was visible.

The nine affected bribe contracts are therefore declared as **static**
datasources (`LegacyBribe*`), and `src/legacy-pool-rewards.ts` seeds the
pool/gauge mapping on first use. That table is closed: it can only describe
gauges older than `startBlock`, so new pools never belong in it.

Two known limits:

- Coverage starts at `startBlock` (2026-03-25). Bribes those pools received
  earlier (as far back as 2025-12-11) stay unindexed. The activity UI only
  renders from 2026-04-02, so its window is fully covered — but widening that
  start date would need a lower `startBlock` and a full resync.
- Only the bribe side is backfilled. The matching `FeeVotingReward` contracts are
  still untracked for these gauges, so `VOTE_FEE_CLAIMED` remains incomplete for
  them. Fees are excluded from incentive totals, so this does not affect them.

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
