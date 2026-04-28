# Matchbox Activity Subgraph

Goldsky subgraph for the public Matchbox activity API.

It normalizes activity from:

- `VeMEZO` voting escrow `Deposit` events
  - lock creation
  - lock amount increases
  - lock duration extensions
- `BoostVoter` events
  - veMEZO votes on veBTC boost gauges
  - boost gauge creation
  - boost pokes
- `PoolsVoter` events
  - votes on Matchbox staking/pool gauges
  - staking/pool gauge creation

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
