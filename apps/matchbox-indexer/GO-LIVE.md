# Warehouse go-live runbook

How to take the Matchbox activity warehouse (decoder v2) to production on
Neon's Free plan: a new Neon project fed by the `matchbox-indexer` cron
Worker every 15 minutes, read by the `matchbox` webapp and the `matchbox-pro`
Worker. Background and parity results: `docs/goldsky-exit.md`.

Every step is marked:

- **[OUTWARD]** changes something outside this repository (Neon, Cloudflare,
  Goldsky, Mezo RPC load). Confirm each one with the owner before running it.
- **[READ]** read-only checks. Safe to run any time, except that any query
  wakes the Neon compute (see the budget below).

Never paste a connection string or password into a file, a commit, a chat or
a ticket. Keep them in shell variables for the session, and in Cloudflare
secrets.

## Free-tier budget

Neon Free gives each project 100 CU-hours a month and 1 GB of storage
(writes are refused past it). The compute suspends after 5 idle minutes, and
that cannot be changed on Free. Production gets its own project so the dev
project's usage (696 MB on `dev-indexed-data-phase-a`) does not count.

**Compute.** Fixed at 0.25 CU. Every cron tick wakes the compute and keeps it
up for the tick plus the 5-minute suspend timeout.

| Cron                      | Ticks a month | Awake per tick                      | Indexer CU-h a month | Left for reads   |
| ------------------------- | ------------- | ----------------------------------- | -------------------- | ---------------- |
| `*/15 * * * *` (default)  | 2,880         | about 5.1 min (8 s of work + 300 s) | about 62             | about 38         |
| `*/30 * * * *` (fallback) | 1,440         | about 5.1 min                       | about 31             | about 69         |
| every minute (old design) | 43,200        | always awake                        | 180                  | none: over quota |

- Reads: the webapp and Pro cache every warehouse read for 5 minutes per
  query (`apps/webapp/src/lib/warehouse.ts`, `queryBatchCached` in
  `apps/matchbox-pro/src/worker/history/neon.ts`), and round open-ended
  windows to that bucket so repeat requests share a key.
  A read that lands while the compute is awake (about a third of the day at
  15-minute ticks) costs nothing extra. A cache miss while it sleeps costs a
  5-minute wake, about 0.02 CU-h, so 38 CU-h covers about 1,800 such wakes a
  month (about 60 a day).
- Steady traffic is the risk: if misses arrive more often than every 5
  minutes around the clock, the compute never sleeps and the month needs
  about 180 CU-h. Neon then suspends the project until the next month.
- If that happens (or Neon is down): Classic falls back on its own. A
  warehouse read that fails or takes over 6 s is served from the frozen
  explorer plus earn-votes (`degraded: ["warehouse"]` in `/api/activity`
  meta; the gauge pages use earn-votes and earn-locks), and a breaker skips
  the warehouse for 2 minutes per isolate so the dead endpoint is not
  hammered. Once `matchbox-explorer/3.4.0` is deleted (step 10), only the
  vote rows survive that fallback. Pro returns 503 `warehouse_unavailable`
  for activity and transaction pages (earnings and ledgers are RPC and keep
  working, without claim links).
- `/health` on the indexer queries the database: check it by hand, at most
  hourly, never from an uptime monitor.
- Watch: Neon Console → `matchbox-warehouse` → Monitoring (or Billing,
  Usage) → compute hours this month. Projected month = used × days in month ÷
  day of month. Above 85 CU-h projected, switch to the 30-minute cron (step
  6, rollback note) and raise `WAREHOUSE_CACHE_SECONDS` to 900. Above 95,
  point the webapp back at the explorer while it lasts (step 7 rollback).

**Storage.** Raw logs and transactions are pruned after they are projected,
keeping the last 160,000 blocks (about 7 days): nothing outside the indexer
reads `matchbox_raw`. The projection is about 265 MB and the
loaded database about 285 MB on 2026-10-21, growing about 25 MB a
month (18,000 activity rows in the last 30 days). The indexer stops writing
at 90% of the cap (`neon.max_cluster_size`, 1 GB) and logs "WAREHOUSE NEAR
STORAGE CAP"; at that growth that is about 27 months away.
`/health` reports `database.bytes`, `capBytes`, `usedPercent` and `writable`.

**Worker.** A tick does about 8 seconds of wall time and well under a second
of CPU (measured on the dev branch: 0.5 s in Node, including TLS set-up), so
it needs the Workers Paid plan: Workers Free allows 10 ms of CPU per cron
invocation. A catch-up tick after an outage ingests at most 50,000 blocks
(five 10,000-block windows, about a minute of wall time), inside the 15-minute
wall and 30-second CPU limits.

## 0. Preconditions

- The decoder v2 commit is on the branch being released (migrations
  `0001`–`0011`, `DECODER_VERSION = 2`), and its `test`, `typecheck` and
  `lint` scripts pass (`pnpm --filter @repo/matchbox-indexer test`).
- Access: Neon organization Mallard Labs; Cloudflare account
  `df8279c833d38dca96f9a091ca3a9219` (Mallard Labs) on Workers Paid (check
  under Workers & Pages → Plans); Goldsky project `Matchbox` (step 10 only).
- Tools: Node 24 and pnpm from the repo, `npx neonctl@2.47.0` (logged in with
  `npx neonctl@2.47.0 auth` or `NEON_API_KEY`), and the repo's `wrangler` 4.x
  (`pnpm --filter @repo/matchbox-indexer exec wrangler`).
- Run everything from the repository root unless a step says otherwise.

```bash
export CLOUDFLARE_ACCOUNT_ID=df8279c833d38dca96f9a091ca3a9219
```

## 1. Create the Neon project [OUTWARD]

1. **[READ]** Find the Mallard Labs organization id and confirm it can hold
   another Free project (Free allows 100).

   ```bash
   npx neonctl@2.47.0 orgs list
   export NEON_ORG=<Mallard Labs org id>
   ```

2. **[OUTWARD]** Create the project with a fixed 0.25 CU compute (minimum and
   maximum), in the dev branch's region and Postgres version. Free keeps the
   default 5-minute suspend.

   ```bash
   npx neonctl@2.47.0 projects create --org-id $NEON_ORG \
     --name matchbox-warehouse --region-id aws-us-east-2 --pg-version 18 \
     --cu 0.25
   npx neonctl@2.47.0 projects list --org-id $NEON_ORG
   export NEON_PROJECT=<id of matchbox-warehouse>
   ```

3. **[READ]** Load the owner's direct URL for the project's default branch
   into this shell only. The scripts read `DATABASE_URL_UNPOOLED` and refuse a
   pooler host.

   ```bash
   export DATABASE_URL_UNPOOLED="$(npx neonctl@2.47.0 connection-string \
     --project-id $NEON_PROJECT --role-name neondb_owner \
     --database-name neondb --ssl verify-full)"
   ```

4. **[READ]** Confirm the project is empty and check its cap (expect `1GB`;
   anything smaller means the budget above no longer holds).

   ```bash
   pnpm --filter @repo/matchbox-indexer migrate -- --dry-run
   ```

   ```sql
   SHOW neon.max_cluster_size;
   ```

   Expect "Migration is pending" for all eleven `matchbox` files and the one
   `matchbox_pro` file, and `pending: 12`.

Rollback: `npx neonctl@2.47.0 projects delete $NEON_PROJECT`. Nothing reads
it yet.

## 2. Migrations and roles [OUTWARD]

```bash
pnpm --filter @repo/matchbox-indexer migrate
pnpm --filter @repo/matchbox-indexer roles
pnpm --filter @repo/matchbox-indexer verify:warehouse
```

Expect "Migrations complete" (`pending: 12`), "Warehouse roles and privilege
assertions passed" and "Warehouse verification passed". `roles` creates the
NOLOGIN group roles `matchbox_indexer`, `matchbox_api_ro` and
`matchbox_pro_rw`, and the default privileges that cover every table the
migrations created.

Rollback: delete the project (step 1).

## 3. Login roles [OUTWARD]

Create the logins with SQL, not the Neon Console or API: roles made there join
`neon_superuser`, which defeats the read-only grants. Generate each password
locally and keep it in the shell:

```bash
export INDEXER_PASSWORD="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
export READER_PASSWORD="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
```

Run this as `neondb_owner` on `matchbox-warehouse` (Neon Console, SQL Editor,
or `psql "$DATABASE_URL_UNPOOLED"`), with the two values substituted in place
of the placeholders:

```sql
CREATE ROLE matchbox_indexer_worker LOGIN PASSWORD '<INDEXER_PASSWORD>'
  IN ROLE matchbox_indexer;
CREATE ROLE matchbox_reader LOGIN PASSWORD '<READER_PASSWORD>'
  IN ROLE matchbox_api_ro;

-- Role settings are not inherited from group roles: repeat them.
ALTER ROLE matchbox_indexer_worker SET statement_timeout = '10s';
ALTER ROLE matchbox_reader SET statement_timeout = '2s';
ALTER ROLE matchbox_reader SET default_transaction_read_only = on;

-- Checks: both must return true, then false.
SELECT has_table_privilege('matchbox_reader', 'matchbox.activity_events', 'SELECT'),
       has_table_privilege('matchbox_indexer_worker', 'matchbox_raw.logs', 'INSERT');
SELECT has_table_privilege('matchbox_reader', 'matchbox.activity_events', 'INSERT');
```

Build the two consumer URLs in the shell. The host comes from the owner URL;
the reader uses the pooler host (`-pooler` after the endpoint id):

```bash
HOST="$(node -e "console.log(new URL(process.env.DATABASE_URL_UNPOOLED).hostname)")"
POOLER_HOST="$(echo "$HOST" | sed -E 's/^(ep-[a-z0-9-]+)\./\1-pooler./')"
export INDEXER_URL="postgresql://matchbox_indexer_worker:${INDEXER_PASSWORD}@${HOST}/neondb?sslmode=require"
export READER_URL="postgresql://matchbox_reader:${READER_PASSWORD}@${POOLER_HOST}/neondb?sslmode=require"
```

Rollback: `DROP ROLE matchbox_indexer_worker; DROP ROLE matchbox_reader;`
(after removing any secret that uses them).

## 4. Load history [OUTWARD]

Ingests every handled log from block 178,630 (mUSD deployment) to head minus
2, projecting and pruning as it goes: 500,000 blocks at a time, it fetches
the chunk from `rpc-internal.mezo.org` (ValidationCloud and Boar on failure),
projects it, then deletes the chunk's raw rows except the last 160,000
blocks. Raw never exceeds one chunk plus that tail.

```bash
pnpm --filter @repo/matchbox-indexer rebuild:history -- --network mezo
```

- Measured on the dev branch (2026-10-21, blocks 178,630 to 12,664,962):
  about 110 minutes, with a factory pre-scan per chunk; the script now scans
  once up front, which should bring it nearer 95. RPC throttling is the
  variable. It ended with parity exact and 6,340 raw logs left (the 7-day
  tail).
- It stops before 90% of the cap. It is resumable: run the same command
  again and it continues after the projection checkpoint.
- It is light on memory, but run it on its own, not next to a heavy build or
  test run (a memory-starved machine killed a dev backfill once).
- It uses the owner URL: projection batches can exceed the worker role's
  10 s statement timeout.

**[READ]** Checks:

```sql
SELECT stream, last_block, updated_at FROM matchbox.indexer_checkpoints
WHERE network = 'mezo';
SELECT min(block_number), count(*) FROM matchbox_raw.logs WHERE network = 'mezo';
SELECT pg_size_pretty(pg_database_size(current_database()));
```

Both checkpoints sit within a few hundred blocks of head, raw starts about
160,000 blocks behind it, and the database is about 285 MB.

Rollback: delete the project and start over (step 1).

## 5. Check parity [READ]

```bash
pnpm --filter @repo/matchbox-indexer parity -- --network mezo --out parity.json
```

`parity` downloads frozen `matchbox-explorer/3.4.0` (about 150 GraphQL pages)
and must print "Parity exact" with `explorerRows: 147270`, `actionTypes: 42`,
every `miss`, `extra` and `fdiff` column 0, and `enrichedFields: 17367` (998
INCENTIVE_ADDED epochs, 7,430 bribe and 8,939 fee claim token ids: the listed
intended differences). The warehouse-only table under it lists the 32,435
rows at or below the frozen block it did not compare. `--out` writes into
`apps/matchbox-indexer/`; delete the file afterwards.

A non-zero exit is a stop: do not continue to step 6.

## 6. Deploy the indexer Worker [OUTWARD]

From `apps/matchbox-indexer`:

```bash
cd apps/matchbox-indexer
pnpm exec wrangler deploy --var ENVIRONMENT:production
printf '%s' "$INDEXER_URL" | pnpm exec wrangler secret put DATABASE_URL
cd ../..
```

- Both commands use `CLOUDFLARE_ACCOUNT_ID` from step 0 and the name
  `matchbox-indexer` from `wrangler.jsonc`. The secret goes second because
  `secret put` wants an existing Worker; a tick in between fails on the
  missing `DATABASE_URL` and changes nothing.
- The deploy registers the `*/15 * * * *` cron (96 ticks a day). Each tick
  checks the storage guard, ingests at most 50,000 blocks, projects them and
  prunes raw older than 160,000 blocks.

**[READ]** Checks, after the next quarter hour:

```bash
curl -s https://matchbox-indexer.mallard.workers.dev/health
pnpm --filter @repo/matchbox-indexer exec wrangler tail matchbox-indexer --format pretty
```

`/health` must show `lag` and `projection.lag` under about 300 (15 minutes
of blocks), `decoderVersion: 2`, `builtWithDecoderVersion: 2`,
`replayRequired: false` and `database.writable: true`. The tail shows
"Ingested logs", "Projected activity" and, once raw is old enough, "Pruned raw
history" every 15 minutes.

Rollback: stop the cron with an empty trigger list
(`pnpm exec wrangler triggers deploy` after setting `"crons": []`, or remove
the trigger in the dashboard), or `pnpm exec wrangler delete matchbox-indexer`.
Data stays valid; ingest resumes from its checkpoint when redeployed. To slow
to 30 minutes, set `"crons": ["*/30 * * * *"]` and redeploy, and raise the
webapp's `STALE_INDEX_SECONDS` (MezoActivityPage.tsx) to 75 minutes.

## 7. Point the webapp at the warehouse [OUTWARD]

The live webapp Worker is `matchbox` (OpenNext, deployed by Workers Builds
from `main`). Set both values as secrets: secrets survive the CI deploys, and
`process.env` reads secrets and vars alike.

Precondition: the deployed `main` has the webapp changes from this branch:

- the warehouse activity query reads only `explorer_parity` rows and returns
  the two enrichments as null (`apps/webapp/src/lib/mezoActivity/warehouse.ts`).
  Without it, Classic would show the warehouse-only bribe claims and
  pre-March voter rows, and its claim drawers would label veBTC lock ids as
  veMEZO. With it, a dev window of 2,636 rows matched the explorer exactly;
- the 5-minute read cache (`apps/webapp/src/lib/warehouse.ts`) and the
  45-minute "as of" threshold. Without the cache, traffic keeps the compute
  awake;
- the automatic fallback: a failed or timed-out warehouse read is served from
  the explorer and earn-votes, behind a 2-minute breaker
  (`withWarehouseFallback`, `lib/warehouse.ts`).

```bash
printf '%s' "$READER_URL" | pnpm --filter @repo/matchbox-indexer exec wrangler secret put MATCHBOX_WAREHOUSE_URL --name matchbox
printf 'warehouse' | pnpm --filter @repo/matchbox-indexer exec wrangler secret put MEZO_ACTIVITY_SOURCE --name matchbox
```

Each `secret put` deploys a new version of `matchbox` immediately.

**[READ]** Checks:

```bash
curl -sD - -o /dev/null "https://app.matchbox.markets/api/activity?limit=1" | grep -i x-activity-indexed-block
curl -s "https://app.matchbox.markets/api/activity?limit=5" | head -c 600
```

The header must be present and within about 300 blocks of head; vote rows
have a real `blockNumber` (not `"0"`) and no `earn-vote:` ids. Open
`/activity` and a gauge page; there must be no "as of" chip.

Rollback (seconds): `printf 'explorer' | ... wrangler secret put
MEZO_ACTIVITY_SOURCE --name matchbox`. The webapp returns to the frozen
explorer plus earn-votes. Keep `matchbox-explorer/3.4.0` until step 10.

## 8. Give Matchbox Pro read access [OUTWARD]

The Pro Worker is `matchbox-pro`. Its history routes read
`MATCHBOX_WAREHOUSE_URL`, the secret its `wrangler.jsonc` lists
(`apps/matchbox-pro/src/worker/history/sources.ts`); without it they fall
back to the frozen explorer. Pro reads every row, warehouse-only ones
included. The deployed Pro build must include its 5-minute warehouse read
cache (`queryBatchCached`) and its 45-minute staleness threshold
(`STALE_SECONDS` in `sources.ts`); an older build shows "stale" between
ticks and its traffic keeps the compute awake.

Run this only after Pro's first deploy, once `matchbox-pro` exists on the
account: `secret put` on a missing Worker would create an empty one. It can
come any time after step 6 and does not depend on step 7.

```bash
pnpm --filter @repo/matchbox-indexer exec wrangler deployments list --name matchbox-pro   # [READ] must list a deployment
printf '%s' "$READER_URL" | pnpm --filter @repo/matchbox-indexer exec wrangler secret put MATCHBOX_WAREHOUSE_URL --name matchbox-pro
```

The `secret put` deploys a new version of `matchbox-pro` immediately.

**[READ]** Check: `curl -s https://pro.matchbox.markets/api/history/status`
reports the warehouse as the source and `freshness.state` as `fresh`.

Rollback: `pnpm --filter @repo/matchbox-indexer exec wrangler secret delete MATCHBOX_WAREHOUSE_URL --name matchbox-pro`.
Pro falls back to the frozen explorer.

## 9. Watch for a day [READ]

Neon consumption first: Console → `matchbox-warehouse` → compute hours. After
24 hours expect about 2 CU-h from the indexer plus reads; more than 3 means
reads are waking the compute too often (see the budget).

Run the rest once as `matchbox_reader` (`psql "$READER_URL"`) or the owner;
each session wakes the compute.

Lag (both streams within about 20 minutes of now, and equal or close):

```sql
SELECT stream, last_block, now() - updated_at AS age
FROM matchbox.indexer_checkpoints WHERE network = 'mezo' ORDER BY stream;
```

Per-type counts for the last day, explorer mirror and warehouse-only side by
side (compare with the previous day; a type dropping to 0 is a stop):

```sql
SELECT action_type, explorer_parity, count(*)
FROM matchbox.activity_events
WHERE network = 'mezo'
  AND timestamp >= extract(epoch FROM now() - interval '1 day')::bigint
GROUP BY 1, 2 ORDER BY 1, 2;
```

Warehouse-only tables keep moving, and raw stays a 7-day tail:

```sql
SELECT 'reward_deposits' AS t, count(*), max(block_number) FROM matchbox.reward_deposits
UNION ALL
SELECT 'trove_updates', count(*), max(block_number) FROM matchbox.trove_updates
UNION ALL
SELECT 'raw logs', count(*), min(block_number) FROM matchbox_raw.logs;
```

Voter bribe coverage: the registered count per voter must match each voter's
`length()` on chain (BoostVoter 719, ValidatorsVoter 24, ThirdPartyVoter 7 on
2026-10-21):

```sql
SELECT parent, count(*) FROM matchbox.contracts
WHERE network = 'mezo' AND kind = 'voterBribeReward' GROUP BY parent;
```

Size against the cap:

```sql
SELECT pg_size_pretty(pg_database_size(current_database())),
       current_setting('neon.max_cluster_size', true);
```

## 10. Delete `matchbox-explorer/3.4.0` [OUTWARD, irreversible]

Only after a clean day in step 9 and the owner's sign-off. This removes the
frozen parity oracle; parity can never be re-run afterwards.

```bash
goldsky subgraph delete matchbox-explorer/3.4.0
```

Then confirm in the Goldsky dashboard that the `Matchbox` project has no
subgraph storage left.

## Replaying the projection [OUTWARD]

A decoder version change halts projection ("PROJECTION HALTED ... replay
required" in the tail, `replayRequired: true` in `/health`). Raw is pruned,
so a replay re-ingests history from RPC:

1. Stop the cron (step 6 rollback). It must not project while the replay
   does.
2. With the owner URL loaded (step 1, item 3):

   ```bash
   pnpm --filter @repo/matchbox-indexer rebuild:history -- --network mezo --replay
   ```

   It truncates the projection tables, then loads history as in step 4
   (about 110 minutes on dev). Readers see a growing, incomplete
   history until it finishes: point the webapp at the explorer meanwhile if
   it still exists (step 7 rollback), or accept the gap.

3. Run parity (step 5) if the explorer still exists, then restore the cron.

`project -- --replay` refuses on a pruned database for this reason.

## Full rollback

1. Webapp: `MEZO_ACTIVITY_SOURCE=explorer` (step 7). Pro: delete its
   `MATCHBOX_WAREHOUSE_URL` (step 8).
2. Indexer: remove the cron or delete the Worker (step 6).
3. Database: keep `matchbox-warehouse` for diagnosis, or delete the project
   (step 1).

None of this touches the dev project, the explorer subgraph or the webapp's
code.
