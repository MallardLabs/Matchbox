# Matchbox Activity Subgraph

Goldsky subgraph for the public Matchbox activity API (`matchbox-explorer`).

**Deployed version:** `matchbox-explorer/3.3.0` (tag `live`)

It normalizes activity from:

- `VeMEZO` + `VeBTC` voting escrow lock lifecycle
- `BoostVoter` / `PoolsVoter` / third-party / validators votes
- Bribe + fee voting reward notify/claims (`VOTE_*_CLAIMED`)
- Pool factory + known pools: LP add/remove, swaps
- Gauge stake/unstake (dynamic template from PoolsVoter)
- mUSD savings, rebase/merkle claims, system splitters/PCV/minter

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
