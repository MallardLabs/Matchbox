# Goldsky exit: activity data without the Matchbox subgraph

Supersedes the "Cut Matchbox Goldsky usage" plan (2026-09-21). That plan
slimmed the subgraph, then moved to a Goldsky Turbo pipeline. Both steps kept
Matchbox on the Goldsky meter. The project paused on 2026-09-24 at block
12,073,396 while `matchbox-explorer` 3.4.0 and 3.5.0 overlapped.

## What changed and why

| Original plan | Now | Why |
| --- | --- | --- |
| Slim subgraph to 3.5.x, tag `live`, delete 3.4.0 | No new subgraph deploys. Delete 3.5.0. Keep 3.4.0 paused as a frozen parity oracle, then delete it | Subgraph storage is the binding meter and `ActivityEvent` is append-only. Slimming buys weeks. Every redeploy re-bills a backfill. 3.5.0 also lost the 18 `Legacy*` reward sources by accident |
| Goldsky Turbo/Mirror pipeline into Neon | Cloudflare cron Worker reading `eth_getLogs` from Mezo RPC into Neon | Measured: full history from block 5.0M is about 1,450 calls, about 10 minutes. At head it is 1 to 2 calls a minute. No vendor meter, no `_gs_op` reorg unknown, no `goldsink` role |
| Separate `matchbox-api` Worker serves `/v1/activity` | Webapp `/api/activity` reads the warehouse directly | It is already the HTTP read API, and MCP calls it. A second Worker adds a hop and a deploy with no consumer yet |
| New activity read model | `matchbox.activity_events` mirrors the explorer `ActivityEvent` exactly (same ids, same fields) | The UI mapping does not change, and parity is a row-level diff against frozen 3.4.0 |
| Port all subgraph entities | Port only what a handler or a reader needs: `ActivityEvent`, `LockPosition`, `Vote`, `BribeToPool`, plus the gauge and reward registry | `Account`, `GaugeEpoch` and `ActivityStats` counters have no consumer |
| Votes from Mezo `earn-votes` long term | `earn-votes` is the phase 1 stopgap. The warehouse decodes `Voted`/`Abstained` itself | Mezo's endpoint is 50 req/10s, shared with their dapp |
| Third-party snapshot from `earn-votes` `votePositions` at a block | Current state from `votePositions`. Historical blocks from `voteEvents` replay | `earn-votes` time-travel is pruned to about 1,000 blocks |

## Phase 1: ship now (webapp only)

Re-applied on `main`. The branch copy was edited on an older base: it drops
`rewardType`, `THIRD_PARTY_VOTER_ABI` and the `Legacy*` sources.

1. `apps/webapp/src/lib/mezoActivity/earnVotes.ts`. Votes and abstains from
   `earn-votes-mezo/v1`, merged in `fetchMezoActivity`. Fixes over the branch
   copy:
   - gauge filter on the server
   - actor scoping by the actor's tokenIds
   - 429 backoff
   - failures surfaced, not returned as empty
   - `VoteEvent.timestamp` is microseconds
2. The gauges snapshot no longer reads the explorer. Votes come from
   `earn-votes`, and lock owners from `earn-locks-mezo/v2` `Stake`.
3. Academy is unwired. Routes answer 410, and entry points are hidden.

Everything else on `/activity` stays frozen at 2026-09-24 until phase 2.

## Phase 2: warehouse

Neon project `fragrant-math-82213579`. Build and verify on the dev branch
(root `.env.local`). Production gets its own branch at go-live.

### Ingest (`apps/matchbox-indexer/src/ingest/`)

- RPC order:
  1. `https://rpc-internal.mezo.org` (≤10,000 blocks, ≤100 addresses)
  2. ValidationCloud (≤30 addresses)
  3. Boar (rate-limited per IP)
  - Retry with backoff, then fail over.
- Address set:
  - static: the escrows, the four voters, splitters, minter, rebase,
    merkle, savings, PCV, `PoolFactory` and the three seed pools
  - discovered: `GaugeCreated` (voters) and `PoolCreated` (`PoolFactory`)
    register gauges, bribe and fee reward contracts, and pools in
    `matchbox.contracts`
- Per window: discover children first, then fetch logs for the full set.
  A child created inside a window is caught in the same window.
- `eth_getLogs` rows carry `blockTimestamp`. Transactions are needed for
  `txFrom` and for calldata-based actor and poke-method resolution. Fetch
  each unique tx once with a batched `eth_getTransactionByHash`.
- Start block 5,000,000. That covers the `Legacy*` reward contracts at about
  5.23M.
- Mezo is CometBFT (instant finality, unverified). Stay 2 blocks behind head.
  Store `block_hash`. Logs with `removed: true` are dropped.

### Tables (migrations `0003+`, never edit applied ones)

- `matchbox_raw.logs`:
  - key: `id = lower(tx_hash || '-' || log_index)`
  - unique on `(network, transaction_hash, log_index)`
  - `topics` stays comma-joined
- `matchbox_raw.transactions (network, hash PK, block_number,
  transaction_index, from_address, to_address, input)`
- `matchbox.contracts (network, address, kind, template, parent, pool, gauge,
  created_block, created_tx, PRIMARY KEY (network, address))`
- `matchbox.indexer_checkpoints (network, stream, last_block, updated_at,
  PRIMARY KEY (network, stream))`
- `matchbox.activity_events`:
  - every `ActivityEvent` field, snake_case
  - `id` is the explorer id (`{txHash}-{logIndex}-{ACTION}`)
  - big integers `numeric(78,0)`, addresses lowercase hex `text`
  - indexes on `(timestamp desc)`, `actor`, `recipient`, `gauge`,
    `action_type`, `source`
- `matchbox.lock_positions`, `matchbox.votes`, `matchbox.bribe_to_pool`. Same
  fields as the subgraph entities.

### Decoder (`apps/matchbox-indexer/src/decode/`)

- A TypeScript port of `apps/activity-subgraph/src/*.ts` from `main`,
  including `legacy-pool-rewards.ts`.
- Pure handlers over `(RawLog, RawTx, Store)`. The store is in-memory in tests
  and Postgres in production.
- Processed strictly in `(block_number, log_index)` order. Deterministic and
  replayable: truncate the projections and replay raw. Bump
  `decoder_version` on semantic change.

### Parity (gate for go-live)

- For every action type, compare `matchbox.activity_events` with frozen
  `matchbox-explorer/3.4.0` for `block_number <= 12,073,396`:
  - counts match exactly
  - the id sets match exactly
  - every field matches on all rows
- Any intended difference is listed in this file with a reason.

### Read path (webapp)

- `MEZO_ACTIVITY_SOURCE=explorer|warehouse` selects the source. The default
  stays `explorer` until go-live.
- `warehouse` reads `matchbox.activity_events` with the read-only role
  through `MATCHBOX_WAREHOUSE_URL`. Votes come from the warehouse too, so
  `earn-votes` drops out.
- The gauges routes (`emissions`, `locks`, snapshot owners and votes) move to
  the same tables.
- The ingest lag is returned in a response header. No UI copy beyond an
  "as of" chip when lag is more than 10 minutes.

## Go-live (needs account access)

1. Neon: create a production branch, apply the migrations and roles, and run
   the backfill from 5.0M.
2. Cloudflare (mallard account): deploy `matchbox-indexer` with a 1-minute
   cron and its `DATABASE_URL` secret. On the `matchbox` Worker, set
   `MATCHBOX_WAREHOUSE_URL` and `MEZO_ACTIVITY_SOURCE=warehouse`.
3. Watch lag and per-type counts for a day.
4. Delete `matchbox-explorer/3.4.0`. Matchbox then has no Goldsky subgraph
   storage.

## Out of scope

- `matchbox-api`, Matchscan and Pro read models.
- Testnet. Ingest is per network, so testnet is a config row later.
- Porting academy.
