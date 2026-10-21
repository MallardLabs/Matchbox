# Warehouse go-live runbook

How to take the Matchbox activity warehouse (decoder v2) from the Neon dev
branch to production: a Neon production branch fed by the `matchbox-indexer`
cron Worker, read by the `matchbox` webapp and the `matchbox-pro` Worker.
Background and parity results: `docs/goldsky-exit.md`.

Every step is marked:

- **[OUTWARD]** changes something outside this repository (Neon production,
  Cloudflare, Goldsky, Mezo RPC load). Confirm each one with the owner before
  running it.
- **[READ]** read-only checks. Safe to run any time.

Never paste a connection string or password into a file, a commit, a chat or
a ticket. Keep them in shell variables for the session, and in Cloudflare
secrets.

## 0. Preconditions

- The decoder v2 commit is on the branch being released (migrations
  `0001`–`0011`, `DECODER_VERSION = 2`), and its `test`, `typecheck` and
  `lint` scripts pass (`pnpm --filter @repo/matchbox-indexer test`).
- Access: Neon organization Mallard Labs, project `fragrant-math-82213579`;
  Cloudflare account `df8279c833d38dca96f9a091ca3a9219` (Mallard Labs);
  Goldsky project `Matchbox` (step 10 only).
- Tools: Node 24 and pnpm from the repo, `npx neonctl@2.47.0` (logged in with
  `npx neonctl@2.47.0 auth` or `NEON_API_KEY`), and the repo's `wrangler` 4.x
  (`pnpm --filter @repo/matchbox-indexer exec wrangler`).
- Run everything from the repository root unless a step says otherwise.

```bash
export NEON_PROJECT=fragrant-math-82213579
export CLOUDFLARE_ACCOUNT_ID=df8279c833d38dca96f9a091ca3a9219
```

## 1. Create the production branch [OUTWARD]

1. **[READ]** List the branches and pick the parent: the project's root branch
   (`main` unless the listing shows otherwise). Do not branch from
   `dev-indexed-data-phase-a`: it carries the Goldsky spike tables, the
   `goldsink` role and decoder test history.

   ```bash
   npx neonctl@2.47.0 branches list --project-id $NEON_PROJECT
   ```

2. **[OUTWARD]** Create the branch with its own read-write compute. The cron
   runs every minute, so the compute never suspends: keep the floor small.

   ```bash
   npx neonctl@2.47.0 branches create --project-id $NEON_PROJECT \
     --name warehouse-production --parent main --cu 0.25-2 --protected
   ```

   `--protected` needs a plan that supports protected branches; drop it if the
   CLI refuses.

3. **[READ]** Load the owner's direct URL into this shell only. The scripts
   read `DATABASE_URL_UNPOOLED` and refuse a pooler host.

   ```bash
   export DATABASE_URL_UNPOOLED="$(npx neonctl@2.47.0 connection-string \
     warehouse-production --project-id $NEON_PROJECT \
     --role-name neondb_owner --database-name neondb --ssl verify-full)"
   ```

4. **[READ]** Confirm the branch is empty of warehouse schemas. Anything
   other than an empty result means the parent was not clean: stop and ask.

   ```bash
   pnpm --filter @repo/matchbox-indexer migrate -- --dry-run
   ```

   Expect "Migration is pending" for all eleven `matchbox` files and the one
   `matchbox_pro` file, and `pending: 12`.

5. **[READ]** Check the branch's storage cap. The dev branch is capped at
   1,024 MB (`neon.max_cluster_size`). A fresh warehouse is about 660 MB on
   2026-10-21 and grows about 50 MB a month (22,000 raw logs, 12,000
   transactions and 18,000 activity rows in the last 30 days). At 1,024 MB
   that is about seven months of headroom: tell the owner, and raise the plan
   or the cap before go-live if possible.

   ```sql
   SHOW neon.max_cluster_size;
   ```

Rollback: `npx neonctl@2.47.0 branches delete warehouse-production --project-id $NEON_PROJECT`.
Nothing reads the branch yet.

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

Rollback: delete the branch (step 1).

## 3. Login roles [OUTWARD]

Create the logins with SQL, not the Neon Console or API: roles made there join
`neon_superuser`, which defeats the read-only grants. Generate each password
locally and keep it in the shell:

```bash
export INDEXER_PASSWORD="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
export READER_PASSWORD="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
```

Run this as `neondb_owner` on `warehouse-production` (Neon Console, SQL
Editor, or `psql "$DATABASE_URL_UNPOOLED"`), with the two values substituted
in place of the placeholders:

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

## 4. Backfill raw history [OUTWARD]

Loads every handled log from block 178,630 (mUSD deployment) to head minus 2:
the mUSD contracts alone below 5,000,000, everything from there. About 1,250
windows of 10,000 blocks plus the factory pre-scan, against
`rpc-internal.mezo.org` (ValidationCloud and Boar on failure).

```bash
pnpm --filter @repo/matchbox-indexer backfill -- --network mezo \
  --concurrency 4 --max-db-mb 950
```

- Measured on the dev branch (2026-10-21, blocks 178,630 to 12,663,499):
  about 75 minutes. The factory pre-scan takes about 7 minutes, then each
  10,000-block window about 3.3 seconds at concurrency 4. RPC throttling is
  the variable.
- `--max-db-mb` stops cleanly before the storage cap: use about 90% of the
  value from step 1, item 5 (950 for a 1,024 MB cap). Raw ends at about 400 MB
  (326,000 logs, 206,000 transactions).
- The process needs about 100 MB of memory. Run it on its own, not next to
  a heavy build or test run.
- Resumable: if it stops, run the same command again. Committed windows are
  no-ops.

**[READ]** Check: the `logs` checkpoint is within a few hundred blocks of
head.

```sql
SELECT stream, last_block, updated_at FROM matchbox.indexer_checkpoints
WHERE network = 'mezo';
```

Rollback: none needed. Raw rows are append-only and idempotent; delete the
branch to start over.

## 5. Project and check parity [OUTWARD]

```bash
pnpm --filter @repo/matchbox-indexer project -- --network mezo
pnpm --filter @repo/matchbox-indexer parity -- --network mezo --out parity.json
```

- `project` replays every raw log in order: about 16 minutes for the 326,000
  raw logs on dev, ending at about 196,000 activity rows (163,000 explorer
  parity, 33,000 warehouse-only), 1,094 reward deposits and 7,421 trove
  updates. It needs the owner URL: one batch can exceed the worker role's
  10 s statement timeout. It is resumable; `--to <block>` splits it.
- `parity` downloads frozen `matchbox-explorer/3.4.0` (about 150 GraphQL
  pages) and must print "Parity exact" with `explorerRows: 147270`,
  `actionTypes: 42`, every `miss`, `extra` and `fdiff` column 0, and
  `enrichedFields: 17367` (998 INCENTIVE_ADDED epochs, 7,430 bribe and 8,939
  fee claim token ids: the listed intended differences). The warehouse-only
  table under it lists the 32,435 rows at or below the frozen block it did
  not compare. `--out` writes into `apps/matchbox-indexer/`; delete the file
  afterwards.
- A non-zero exit is a stop: do not continue to step 6.

Rollback: `project -- --network mezo --replay` rebuilds the projection from
raw.

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
  `secret put` wants an existing Worker; the one or two cron ticks in between
  fail on the missing `DATABASE_URL` and change nothing.
- The deploy registers the `* * * * *` cron. Each tick ingests at most 50,000
  blocks and projects them, so the gap since step 4 closes in one or two
  ticks.

**[READ]** Checks, about two minutes after the deploy:

```bash
curl -s https://matchbox-indexer.mallard.workers.dev/health
pnpm --filter @repo/matchbox-indexer exec wrangler tail matchbox-indexer --format pretty
```

`/health` must show `lag` under 30, `projection.lag` under 30,
`decoderVersion: 2`, `builtWithDecoderVersion: 2`, `replayRequired: false`.
The tail shows "Ingested logs" and "Projected activity" once a minute.

Rollback: stop the cron with an empty trigger list
(`pnpm exec wrangler triggers deploy` after setting `"crons": []`, or remove
the trigger in the dashboard), or `pnpm exec wrangler delete matchbox-indexer`.
Data stays valid; ingest resumes from its checkpoint when redeployed.

## 7. Point the webapp at the warehouse [OUTWARD]

The live webapp Worker is `matchbox` (OpenNext, deployed by Workers Builds
from `main`). Set both values as secrets: secrets survive the CI deploys, and
`process.env` reads secrets and vars alike.

Precondition: the deployed `main` has the webapp change that reads only
`explorer_parity` rows and returns the two enrichments as null
(`apps/webapp/src/lib/mezoActivity/warehouse.ts`). Without it, Classic would
show the warehouse-only bribe claims and pre-March voter rows, and its claim
drawers would label veBTC lock ids as veMEZO. With it, a dev-branch window of
2,636 rows matched the explorer exactly (ids, `tokenId`, `epochStart`).

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

The header must be present and within a few blocks of head; vote rows have a
real `blockNumber` (not `"0"`) and no `earn-vote:` ids. Open `/activity` and a
gauge page; there must be no "as of" chip.

Rollback (seconds): `printf 'explorer' | ... wrangler secret put
MEZO_ACTIVITY_SOURCE --name matchbox`. The webapp returns to the frozen
explorer plus earn-votes. Keep `matchbox-explorer/3.4.0` until step 10.

## 8. Give Matchbox Pro read access [OUTWARD]

The Pro Worker is `matchbox-pro`. Its history routes read
`MATCHBOX_WAREHOUSE_URL`, the secret its `wrangler.jsonc` lists
(`apps/matchbox-pro/src/worker/history/sources.ts`); without it they fall
back to the frozen explorer. Pro reads every row, warehouse-only ones
included.

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

Run as `matchbox_reader` (`psql "$READER_URL"`) or the owner.

Lag (both streams within a few minutes of now, and equal or close):

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

Warehouse-only tables keep moving:

```sql
SELECT 'reward_deposits' AS t, count(*), max(block_number) FROM matchbox.reward_deposits
UNION ALL
SELECT 'trove_updates', count(*), max(block_number) FROM matchbox.trove_updates;
```

Voter bribe coverage: the registered count per voter must match each voter's
`length()` on chain (BoostVoter 719, ValidatorsVoter 24, ThirdPartyVoter 7 on
2026-10-21):

```sql
SELECT parent, count(*) FROM matchbox.contracts
WHERE network = 'mezo' AND kind = 'voterBribeReward' GROUP BY parent;
```

Size against the plan's cap:

```sql
SELECT pg_size_pretty(pg_database_size(current_database()));
```

## 10. Delete `matchbox-explorer/3.4.0` [OUTWARD, irreversible]

Only after a clean day in step 9 and the owner's sign-off. This removes the
frozen parity oracle; parity can never be re-run afterwards.

```bash
goldsky subgraph delete matchbox-explorer/3.4.0
```

Then confirm in the Goldsky dashboard that the `Matchbox` project has no
subgraph storage left.

## Full rollback

1. Webapp: `MEZO_ACTIVITY_SOURCE=explorer` (step 7). Pro: delete its
   `MATCHBOX_WAREHOUSE_URL` (step 8).
2. Indexer: remove the cron or delete the Worker (step 6).
3. Database: keep `warehouse-production` for diagnosis, or delete it (step 1).

None of this touches the dev branch, the explorer subgraph or the webapp's
code.
