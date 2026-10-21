# Matchbox indexer

The Mezo warehouse ingest that replaces the `matchbox-explorer` Goldsky
subgraph (see `docs/goldsky-exit.md`). It reads `eth_getLogs` from Mezo RPC into
Neon. There is no Goldsky pipeline. Go-live steps are in `GO-LIVE.md`.

## How ingest works

- **Contracts.**
  - The explorer subgraph's static data sources (`src/ingest/static-contracts.ts`),
    including the 18 `Legacy*` reward contracts.
  - Children discovered from `PoolsVoter.GaugeCreated` (gauge, bribe and fee reward
    contracts) and `PoolFactory.PoolCreated` (pools).
  - Warehouse-only: the bribe reward contracts of BoostVoter, ValidatorsVoter and
    ThirdPartyVoter gauges (kind `voterBribeReward`, from their 3-argument
    `GaugeCreated`), and the mUSD `BorrowerOperations` and `TroveManager`
    (static, from their deployment at block 178,630).
  - All of them live in `matchbox.contracts`. A `GaugeCreated` links an
    already-registered pool to its gauge, but never registers a pool it only
    names (CL pools were never explorer templates).
- **Topics.**
  - Only the events a handler reads are stored, per contract kind
    (`src/ingest/topics.ts`), as one `eth_getLogs` filter per topic group.
  - Pools' `Sync`/`Fees`/LP `Transfer`/`Approval` alone would double the raw table.
  - The ~750 voter bribe contracts are not listed by address: their group is
    fetched with one address-less filter on the two reward topics
    (`NotifyReward`, `ClaimRewards`) and kept to the registered set.
  - Widening a set is a config change plus a re-backfill.
  - `test/ingest/manifest.test.ts` fails if the explorer contracts or topics
    drift from `apps/activity-subgraph/subgraph.yaml`.
- **Windows.**
  - Logs are fetched in 10,000-block windows, at most 100 addresses per filter
    on `rpc-internal.mezo.org`. ValidationCloud (30) and Boar are fallbacks.
  - Failures retry with backoff, then fail over to the next endpoint.
  - A range no endpoint serves is split.
  - A child created mid-window has its logs from that same window fetched
    before the window commits.
- **Timestamps.**
  - Mezo's `eth_getLogs` returns `blockTimestamp: "0x0"`, so every timestamp
    comes from a batched `eth_getBlockByNumber` header.
  - A header whose hash differs from the log's `blockHash` fails the window.
  - `CHECK (block_timestamp > 0)` guards the table.
- **Transactions.** Every transaction that emitted a stored log is kept, with
  `from` and `to`. Its `input` is the 4-byte selector, except for
  `claimBribes` / `claimFees` / `claimFeesAndBribes` calls sent straight to a
  voter, which keep their full calldata so claims carry the lock's tokenId
  (`src/decode/calldata.ts`). Full calldata was about 80% of each row.
- **Commits.**
  - A window's logs, transactions, registry changes and checkpoint commit in one
    transaction. Re-ingesting is a no-op.
  - The `logs` checkpoint covers a contiguous prefix from the network start
    block (5,000,000). An out-of-order range never advances it past a gap.
    Windows below the start (the mUSD history) never move it.
- **Finality.** Mezo is CometBFT (instant finality, not independently verified).
  Ingest stays 2 blocks behind head and stores `block_hash`.
- **Retention.** Raw logs and transactions are deleted once projected and more
  than 160,000 blocks (about 7 days) behind ingest (`src/maintenance.ts`).
  Nothing outside the indexer reads `matchbox_raw`; a replay re-ingests
  history from RPC (`rebuild:history -- --replay`). This keeps the warehouse
  inside Neon Free's 1 GB (`GO-LIVE.md`, "Free-tier budget").

## Decoder

`src/decode` projects raw logs into `matchbox.activity_events` (the explorer's
`ActivityEvent`, field for field), `lock_positions`, `votes`, `bribe_to_pool`,
and the warehouse-only `reward_deposits` and `trove_updates`. Rows the explorer
would not have produced have `explorer_parity = false`; `parity` compares the
rest with frozen `matchbox-explorer` 3.4.0. `DECODER_VERSION` is 2. A database
built by another version halts projection until `rebuild:history -- --replay`.

## Commands

Migrations, roles, the loads, projection and parity need the direct
(non-pooler) `DATABASE_URL_UNPOOLED`. The linked Neon development branch puts it
in the repository-root ignored `.env.local`.

```bash
pnpm --filter @repo/matchbox-indexer migrate
pnpm --filter @repo/matchbox-indexer roles   # re-run after new migrations
pnpm --filter @repo/matchbox-indexer verify:warehouse
pnpm --filter @repo/matchbox-indexer vacuum:raw   # after a migration that trims raw rows

# Full load or replay: ingest, project and prune 500,000 blocks at a time, so
# raw never holds more than one chunk plus the retention tail. --from defaults
# to block 178,630 (mUSD); resumable after the projection checkpoint; stops
# before 90% of the storage cap. --replay truncates the projection first.
pnpm --filter @repo/matchbox-indexer rebuild:history -- --network mezo \
  [--replay] [--from N] [--to N] [--chunk 500000] [--concurrency 4]

# Raw ingest alone, without projecting or pruning (the cron prunes what it
# projects later). Resumable, and stops cleanly over --max-db-mb.
pnpm --filter @repo/matchbox-indexer backfill -- --network mezo \
  [--from N] [--to N] [--concurrency 4] [--max-db-mb 900] [--skip-discovery]

# Project raw logs. --replay refuses once raw is pruned: use rebuild:history.
pnpm --filter @repo/matchbox-indexer project -- --network mezo [--replay]

# Row-level diff against frozen matchbox-explorer 3.4.0 (exits 1 on a diff).
pnpm --filter @repo/matchbox-indexer parity -- --network mezo [--out file.json]

# Once, on a database ingested before full claim calldata was kept.
pnpm --filter @repo/matchbox-indexer refetch:claims -- --network mezo [--dry-run]
```

`--skip-discovery` drops the factory pre-scan. Only use it when the range's
children are already in `matchbox.contracts`, because parallel windows need the
full address set up front.

## Worker

`src/index.ts` runs every 15 minutes (`wrangler.jsonc` cron; each tick wakes
the Neon compute, and Neon Free has 100 CU-hours a month). Each tick:

1. checks the storage guard: at 90% of `neon.max_cluster_size` it logs
   "WAREHOUSE NEAR STORAGE CAP" and writes nothing;
2. ingests from the `logs` checkpoint to head minus 2, at most 50,000 blocks;
3. projects what it ingested;
4. prunes raw past the retention window, at most 250,000 blocks per tick.

`GET /health` reports head, last block, lag, projection state and
`database` (`bytes`, `capBytes`, `usedPercent`, `writable`). It queries the
database, so it wakes the compute: check it by hand, not from a monitor.

- `DATABASE_URL` is a secret: `wrangler secret put DATABASE_URL`. Use the
  direct URL for a login granted `matchbox_indexer`.
- On an empty `logs` checkpoint the cron starts at the network start, so the
  mUSD history before it only arrives through `rebuild:history`.

## History

`SPIKE.md` records the August Goldsky Turbo/Mirror spike that preceded this
design. The spike tables `matchbox_raw.logs_spike_*` and the `goldsink` role may
still exist on the dev branch. `roles` strips `goldsink`'s privileges.
