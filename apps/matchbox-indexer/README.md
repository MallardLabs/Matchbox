# Matchbox indexer

The Mezo warehouse ingest that replaces the `matchbox-explorer` Goldsky
subgraph (see `docs/goldsky-exit.md`). It reads `eth_getLogs` from Mezo RPC into
Neon. There is no Goldsky pipeline.

## How ingest works

- **Contracts.**
  - The explorer subgraph's static data sources (`src/ingest/static-contracts.ts`),
    including the 18 `Legacy*` reward contracts.
  - Children discovered from `PoolsVoter.GaugeCreated` (gauge, bribe and fee reward
    contracts) and `PoolFactory.PoolCreated` (pools).
  - Both kinds live in `matchbox.contracts`. A `GaugeCreated` links an
    already-registered pool to its gauge, but never registers a pool it only
    names (CL pools were never explorer templates).
- **Topics.**
  - Only the events the explorer handles are stored, per contract kind
    (`src/ingest/topics.ts`), as one `eth_getLogs` filter per topic group.
  - Pools' `Sync`/`Fees`/LP `Transfer`/`Approval` alone would double the raw table.
  - Widening a set is a config change plus a re-backfill.
  - `test/ingest/manifest.test.ts` fails if contracts or topics drift from
    `apps/activity-subgraph/subgraph.yaml`.
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
  `from` and `to`. Its `input` is the 4-byte selector only, because no handler
  reads further (`src/decode/calldata.ts`). Full calldata was about 80% of
  each row.
- **Commits.**
  - A window's logs, transactions, registry changes and checkpoint commit in one
    transaction. Re-ingesting is a no-op.
  - The `logs` checkpoint covers a contiguous prefix from the network start
    block (5,000,000). An out-of-order range never advances it past a gap.
- **Finality.** Mezo is CometBFT (instant finality, not independently verified).
  Ingest stays 2 blocks behind head and stores `block_hash`.

## Commands

Migrations, roles and the backfill need the direct (non-pooler)
`DATABASE_URL_UNPOOLED`. The linked Neon development branch puts it in the
repository-root ignored `.env.local`.

```bash
pnpm --filter @repo/matchbox-indexer migrate
pnpm --filter @repo/matchbox-indexer roles   # re-run after new migrations
pnpm --filter @repo/matchbox-indexer verify:warehouse
pnpm --filter @repo/matchbox-indexer vacuum:raw   # after a migration that trims raw rows

# Full history (about 30 minutes). Resumable, and stops cleanly over --max-db-mb.
pnpm --filter @repo/matchbox-indexer backfill -- --network mezo --from 5000000 \
  [--to N] [--concurrency 4] [--max-db-mb 900] [--skip-discovery]
```

`--skip-discovery` drops the factory pre-scan. Only use it when the range's
children are already in `matchbox.contracts`, because parallel windows need the
full address set up front.

## Worker

`src/index.ts` runs every minute (`wrangler.jsonc` cron). Each tick ingests
from the `logs` checkpoint to head minus 2, at most 50,000 blocks.
`GET /health` reports head, last block and lag.

- `DATABASE_URL` is a secret: `wrangler secret put DATABASE_URL`. Use the
  direct URL for a login granted `matchbox_indexer`.
- The decoder's `runProjection` is called from the marked hook after ingest.

## History

`SPIKE.md` records the August Goldsky Turbo/Mirror spike that preceded this
design. The spike tables `matchbox_raw.logs_spike_*` and the `goldsink` role may
still exist on the dev branch. `roles` strips `goldsink`'s privileges.
