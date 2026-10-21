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
(root `.env.local`). Production gets its own Neon project at go-live (see
"Free-tier design").

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

### Parity result (2026-10-01, dev branch)

`matchbox.activity_events` matches frozen 3.4.0 through block 12,073,396 on
all 147,270 rows across 42 action types. There are no missing, extra or
differing fields. `lock_positions` (6,133), `votes` (7,870) and
`bribe_to_pool` (54) also match field for field. Through `/api/activity`,
warehouse and explorer responses are identical in order, ids and fields.

Intended differences:

- **Ties inside one transaction:** graph-node breaks timestamp ties by
  string id (`-12-` sorts before `-8-`). The warehouse orders by
  `(timestamp, block_number, log_index, id)`, which is chain order. Rows
  can split differently at a page edge. The same window fetched whole is
  identical.
- **Locks before block 7,739,500:** raw holds them, but projection starts
  at the explorer's start block, as the explorer did. The all-time lock
  total is 2,825, against 2,882 in Mezo's earn-locks.

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

## Warehouse extensions for Matchbox Pro (decoder v2, 2026-10-21)

The explorer mirror stays exact; everything below is warehouse-only and
marked so. Migrations `0007`–`0011`; `DECODER_VERSION` 2 (a v1 database
halts projection until `project -- --replay`).

| Item | What changed | Where |
| --- | --- | --- |
| Parity flag | `activity_events.explorer_parity` is false for rows 3.4.0 would not have produced. `parity` compares only true rows and lists the rest | `0007`, `src/decode/dispatch.ts` (`resolveHandler`), `src/decode/store.ts` (`WarehouseOnlyStore`) |
| A1 voter bribes | The 3-argument `GaugeCreated` on BoostVoter, ValidatorsVoter and ThirdPartyVoter registers the gauge's bribe (`matchbox.contracts` kind `voterBribeReward`; decoder template `VoterBribeReward`, which remembers voter and gauge). Their `ClaimRewards` become `VOTE_BRIBE_CLAIMED` (source `BRIBE_VOTING_REWARD`, the voter's boost context, `gauge`, no `pool`). Their `NotifyReward` adds no activity row (`BribesAdded` already does) | `src/ingest/discovery.ts`, `src/decode/handlers/rewards.ts` |
| A1 ingest | The ~750 bribe addresses are not added to the shared filter. Their group is fetched with one address-less `eth_getLogs` on the two reward topics per window and kept to the registered set (`LogFilter.scanByTopic`); a handful of fresh children still go by address | `src/ingest/topics.ts`, `src/ingest/rpc.ts` |
| A2 deposits | `matchbox.reward_deposits`: every 4-argument `NotifyReward` on a tracked reward contract (pool bribe/fee, `Legacy*`, voter bribes), keyed by the event's own `epoch_start`. Sum by (reward_contract, token, epoch_start) = `tokenRewardsPerEpoch` | `0008` |
| A2 epoch | `INCENTIVE_ADDED.epoch_start` is set: the event epoch for pool rewards, `epochStart(block time)` for `BribesAdded` (Velodrome `Reward` notifies the current epoch) | handlers |
| A3 claim lock | Ingest keeps the full input of `claimBribes` (`0x7715ee75`), `claimFees` (`0x666256aa`) and `claimFeesAndBribes` (`0xe494ab8b`) calls sent straight to a voter, and every `VOTE_BRIBE_CLAIMED` / `VOTE_FEE_CLAIMED` in such a transaction gets `token_id`. Claims through a Safe, smart account or wrapper keep `token_id` null. `refetch:claims` restores the input of claims stored before | `src/decode/calldata.ts`, `scripts/refetch-claim-calldata.ts` |
| A4 votes from 5.0M | The four voters project from the network start instead of 7,739,500 (BoostVoter's first log is 6,248,484), so `votes` and vote replays include ballots never re-cast after March. `PoolsVoter.GaugeCreated` keeps the explorer start: it spawns explorer templates | `src/decode/dispatch.ts` (`voterSource`) |
| A5 indexes | `activity_events (network, tx_hash)`; `(network, token_id, timestamp desc)` for votes; `(network, tx_from, timestamp desc)` for `BOOST_POKE` | `0010` |
| mUSD troves | `BorrowerOperations` and `TroveManager` are static contracts from their deployment (block 178,630; the backfill now defaults to it). Ingest stores `TroveUpdated` (both signatures), `TroveCreated`, `BorrowingFeePaid`, `RefinancingFeePaid`, `TroveLiquidated`, `Redemption`. `matchbox.trove_updates` holds each `TroveUpdated` with the previous state, the interest accrued in between (musd `InterestRateMath`) and a signed `debt_change`, classified as `LOAN_OPENED`, `LOAN_REPAID`, `LOAN_BORROWED`, `LOAN_COLL_ADDED`, `LOAN_COLL_WITHDRAWN`, `LOAN_REFINANCED`, `LOAN_CLOSED`, `LOAN_REWARDS_APPLIED`, `LOAN_LIQUIDATED`, `LOAN_REDEEMED`. "Recent repayments" = rows with `debt_change < 0` for a borrower. Not in `activity_events`, so the webapp feed is unchanged | `0009`, `src/decode/handlers/musd.ts` |

Intended differences, in addition to the two listed under the parity result:

- **Enrichments.** `INCENTIVE_ADDED.epoch_start` and `VOTE_*_CLAIMED.token_id`
  are filled where 3.4.0 left null. `parity` counts them as `enriched`; any
  other value change is still a difference.
- **Votes table.** `matchbox.votes` gains the (voter, tokenId, gauge) rows
  last touched before block 7,739,500, so it no longer matches the explorer's
  7,870 `Vote` entities.
- **Classic stays on explorer semantics.** The webapp's warehouse activity
  query (`apps/webapp/src/lib/mezoActivity/warehouse.ts`) reads only
  `explorer_parity` rows and returns the two enrichments as null. Its claim
  drawers would otherwise call veBTC lock ids "veMEZO token". The gauges
  routes need no filter: no warehouse-only row matches their action types
  and sources. Matchbox Pro reads every row.
- **Trove amounts.** `debt_change` is exact to the wei except across an
  interest checkpoint that emitted no event (`updateSystemAndTroveInterest`
  is public): each one can shift it by 1 wei. A closed, liquidated or fully
  redeemed trove reports a zero state, so its accrual runs to the block time.
  BorrowerOperations emits interest 0 after every borrow (the contract never
  sets `newInterest` on that branch); `trove_updates.interest` keeps the real
  figure (previous interest plus accrual) on `LOAN_BORROWED` rows.

### Dev verification (2026-10-21, dev branch)

- **Parity:** after a full v2 replay, `parity` is exact on all 147,270
  explorer rows across 42 action types through block 12,073,396 (0 missing,
  0 extra, 0 differing fields), with 17,367 enriched fields (998
  INCENTIVE_ADDED epochs, 7,430 bribe and 8,939 fee claim token ids). 32,435
  warehouse-only rows sit at or below that block and are not compared.
- **Backfill:** 178,630 to 12,663,499 in about 75 minutes at concurrency 4
  (7-minute factory pre-scan, then about 3.3 s per window). Raw: 325,996
  logs and 205,761 transactions, about 400 MB. Projection replay: about 16
  minutes, 195,873 activity rows (163,195 explorer parity, 32,678
  warehouse-only), 12,767 votes, 6,346 locks, 1,094 reward deposits, 7,421
  trove updates. With full raw history the branch was 696 MB of its 1,024
  MB cap (36 MB are the Goldsky spike tables), growing about 50 MB a month;
  raw retention (below) brings that to about 285 MB and 25 MB a month.
- **Voter bribes:** registered 719 / 24 / 7, equal to `length()` on
  BoostVoter, ValidatorsVoter and ThirdPartyVoter. 2,185 bribe claims
  (2,099 boost, 86 validator; ThirdPartyVoter bribes have none yet).
- **Deposit epochs:** all 236 `BribesAdded` rows (187 BoostVoter, 49
  ValidatorsVoter) have a bribe `NotifyReward` in the same transaction with
  the same epoch. BoostVoter has one deposit (188 against 187) that did not
  go through `BribesAdded`, so `reward_deposits`, not `INCENTIVE_ADDED`, is
  the exact per-epoch total.
- **Claim token ids:** 19,944 of 21,232 claims carry one (94%); 40 of 40
  sampled were owned by the claimer at the claim block (`ownerOf` on the
  escrow).
- **Troves:** 400 `LOAN_REPAID` rows checked against the borrower's MUSD
  burn in the same receipt: 399 exact, 1 off by 1 wei. Principal and
  collateral of 60 sampled borrowers equal `TroveManager.Troves()` at head.
- **Pruned replay:** `rebuild:history -- --replay` on the dev branch
  re-ingested 178,630 to 12,664,962 from RPC in about 110 minutes, pruning as
  it went, and parity stayed exact (147,270 rows, 17,367 enriched). Raw ended
  at the 7-day tail (6,340 logs, 3,923 transactions). Compacted, the
  database is 320 MB, 37 MB of it the old Goldsky spike tables: a fresh
  production load is about 285 MB, of which the projection is 265 MB.
- **Tick cost:** a 15-minute tick (about 235 blocks) took about 5 to 8 s of
  wall time and 0.3 to 0.5 s of CPU in Node, TLS set-up included.

### A6 (not built): sealed earnings and prices

- At each epoch close plus finality, seal `matchbox.epoch_vote_balances`
  (voter, gauge, token_id, epoch_start, balance, gauge_supply) by replaying
  `BOOST_VOTE`/`BOOST_ABSTAIN` rows to `epoch_end - 1`, and
  `matchbox.epoch_earned` (+ reward_contract, token, deposited, earned) as
  `balance × Σ reward_deposits / max(supply, 1)` with floor division. Golden
  test: Σ claimable epochs equals the bribe's `earned()` (tokenId 111 on
  `0x18bE…1baA`: 702.670804524943038744 MEZO).
- An hourly `matchbox.price_observations` cron: Skip `latestRoundData` on
  Mezo for BTC, Aerodrome CL `slot0` on Base for MEZO, $1 for stables, each
  row with source, block and timestamp, and a backfill for past epoch ends.
- Both are writes by the indexer Worker into `matchbox`, so they need no new
  role; the Pro BFF switches its ledger `method` to `warehouse-sealed-v1`.

## Free-tier design (2026-10-21)

Production runs on Neon's Free plan: 100 CU-hours and 1 GB per project, and
the compute suspends after 5 idle minutes (not configurable). So:

- **Own project.** Production is a new Neon project, `matchbox-warehouse`,
  not a branch of `fragrant-math-82213579` (its dev branch alone is 696 MB).
  Compute fixed at 0.25 CU.
- **15-minute cron.** A per-minute cron keeps 0.25 CU awake around the clock
  (about 180 CU-h a month). Every 15 minutes, each tick (about 8 s of work)
  keeps the compute up for about 5 minutes: about 62 CU-h a month, leaving
  about 38 for reads. Fallback: every 30 minutes (about 31 CU-h).
- **Raw retention.** After projection, raw logs and transactions more than
  160,000 blocks (about 7 days) behind ingest are deleted
  (`src/maintenance.ts`). Nothing outside the indexer reads `matchbox_raw`
  (the webapp, Pro and `parity` read only `matchbox.*`). A replay re-ingests
  from RPC with `rebuild:history -- --replay`, which loads, projects and
  prunes 500,000 blocks at a time; `project -- --replay` refuses on a pruned
  database. The initial load uses the same path.
- **Size guard.** Ticks stop writing at 90% of `neon.max_cluster_size`, and
  `/health` reports the usage.
- **Read cache.** The webapp caches every warehouse read for 5 minutes per
  query (Workers Cache API plus a per-isolate memo), and the activity route
  rounds its default window to that. Shorter TTLs would keep the compute
  awake under steady traffic. The "as of" chip waits 45 minutes.

`apps/matchbox-indexer/GO-LIVE.md`, "Free-tier budget", has the numbers and
what to watch.

## Go-live (needs account access)

`apps/matchbox-indexer/GO-LIVE.md` is the step-by-step runbook, each
outward-facing step marked. In short:

1. Neon: create the `matchbox-warehouse` project (Free, 0.25 CU), apply the
   migrations and roles, create the two logins, load history from block
   178,630 with `rebuild:history`, and pass `parity`.
2. Cloudflare (mallard account): deploy `matchbox-indexer` with its 15-minute
   cron and `DATABASE_URL` secret. On the `matchbox` Worker, set
   `MATCHBOX_WAREHOUSE_URL` and `MEZO_ACTIVITY_SOURCE=warehouse`. After
   Pro's first deploy, set `MATCHBOX_WAREHOUSE_URL` on `matchbox-pro` to the
   same read-only URL.
3. Watch lag and per-type counts for a day.
4. Delete `matchbox-explorer/3.4.0`. Matchbox then has no Goldsky subgraph
   storage.

## Out of scope

- `matchbox-api` and Matchscan. Pro reads the warehouse directly.
- Testnet. Ingest is per network, so testnet is a config row later (the
  decoder already reads the older 6-argument `TroveUpdated` it emits).
- Porting academy.
