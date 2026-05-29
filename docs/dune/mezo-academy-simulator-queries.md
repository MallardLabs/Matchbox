# Mezo Academy Simulator Dune Checks

These are DuneSQL companion queries for checking the Mezo Academy Simulator
activity counts on Mezo mainnet.

Set these Dune parameters on each query:

- `from_time`: DateTime, inclusive lower bound, for example `2026-03-19 00:00:00`
- `to_time`: DateTime, inclusive upper bound, for example `2026-05-14 00:00:00`
- `actor_address`: Text, optional single actor filter for the event-detail
  queries; use blank or `none` to show all actors
- `blacklist_csv`: Text, optional comma-separated addresses to exclude in
  addition to the app's seeded blacklist

The queries use Mezo mainnet contracts from `@repo/shared/contracts`:

- veMEZO: `0xb90fdad3dfd180458d62cc6acedc983d78e20122`
- BoostVoter: `0x2ba614a598cffa5a19d683cdca97bac3a49313d1`

The app blacklist seed is from
`apps/webapp/src/lib/academy/blacklistedActors.ts`. The boost poke cron address
is included too because the simulator hard-filters it separately.

For app comparison:

- `row_type = 'total'` is the row to compare against the simulator totals.
- `row_type = 'epoch'` shows Thursday 00:00 UTC epoch buckets.
- Actor breakdowns are separate result tables where included.
- All counts are after the seed plus optional CSV blacklist.

## 1A. New veMEZO Locks by Epoch

This returns the simulator `newLockCount` plus its component parts. The
simulator currently groups `LOCK_CREATED`, `LOCK_AMOUNT_INCREASED`, and
`LOCK_PERMANENT` under `newLockCount`.

`LOCK_AMOUNT_INCREASED` is not a lock extension. It is
`Deposit.depositType = 2` and contributes to simulator `newLockCount`.
Duration extensions are `Deposit.depositType = 3` and are counted only in the
extensions query below.

`actor` for `lock_created` rows is `Deposit.provider`. Claim/grant
relayers (e.g. `MerkleClaimAndLockHandler`) appear here as provider but
are blacklisted, so the recipient of a granted lock earns no credit —
only direct callers of `createLock` are counted.

```sql
WITH
params AS (
  SELECT
    timestamp '{{from_time}}' AS from_time,
    timestamp '{{to_time}}' AS to_time
),
runtime_blacklist_raw AS (
  SELECT lower(trim(addr)) AS addr
  FROM unnest(split('{{blacklist_csv}}', ',')) AS t(addr)
),
runtime_blacklist AS (
  SELECT from_hex(substr(addr, 3)) AS actor
  FROM runtime_blacklist_raw
  WHERE regexp_like(addr, '^0x[0-9a-f]{40}$')
),
seed_blacklist(actor) AS (
  VALUES
    (0x965c18b6ac7d233c00c93c7c0039bef6a6035d26),
    (0x2bc442310e6684c678e7b8498efa8aa3cbd7c44b),
    (0x35cf1381f056559299b6a4dc08f83833fab07946),
    (0x57de1ae5933ca6e5c672f6a9e8967d5e2fbf21cf),
    (0x075108f275ed81c9cfc01065e6e50ceea81d6363),
    (0xf8176df5b9fbcf0ed38c06970371ba89b7701bbb)
),
excluded_actors AS (
  SELECT actor FROM seed_blacklist
  UNION
  SELECT actor FROM runtime_blacklist
),
event_rows AS (
  SELECT
    from_unixtime(floor(to_unixtime(d.evt_block_time) / 604800) * 604800) AS epoch_start,
    d.evt_block_time,
    d.evt_tx_hash,
    d.evt_index,
    d.provider AS actor,
    d.tokenId,
    d.value AS amount_raw,
    d.locktime AS locktime_raw,
    CASE
      WHEN d.depositType = 1 THEN 'lock_created'
      WHEN d.depositType = 2 THEN 'lock_amount_increased'
    END AS event_kind
  FROM mezo_mezo.vemezo_evt_deposit d
  CROSS JOIN params p
  WHERE d.contract_address = 0xb90fdad3dfd180458d62cc6acedc983d78e20122
    AND d.evt_block_date >= CAST(p.from_time AS date)
    AND d.evt_block_date <= CAST(p.to_time AS date)
    AND d.evt_block_time >= p.from_time
    AND d.evt_block_time <= p.to_time
    AND d.depositType IN (1, 2)

  UNION ALL

  SELECT
    from_unixtime(floor(to_unixtime(lp.evt_block_time) / 604800) * 604800) AS epoch_start,
    lp.evt_block_time,
    lp.evt_tx_hash,
    lp.evt_index,
    lp._owner AS actor,
    lp._tokenId AS tokenId,
    lp.amount AS amount_raw,
    CAST(NULL AS uint256) AS locktime_raw,
    'lock_permanent' AS event_kind
  FROM mezo_mezo.vemezo_evt_lockpermanent lp
  CROSS JOIN params p
  WHERE lp.contract_address = 0xb90fdad3dfd180458d62cc6acedc983d78e20122
    AND lp.evt_block_date >= CAST(p.from_time AS date)
    AND lp.evt_block_date <= CAST(p.to_time AS date)
    AND lp.evt_block_time >= p.from_time
    AND lp.evt_block_time <= p.to_time
),
classified AS (
  SELECT
    e.*,
    x.actor IS NOT NULL AS excluded_by_blacklist
  FROM event_rows e
  LEFT JOIN excluded_actors x ON e.actor = x.actor
),
filtered AS (
  SELECT *
  FROM classified
  WHERE NOT excluded_by_blacklist
),
aggregated AS (
  SELECT
    CASE
      WHEN grouping(epoch_start) = 1 THEN 'total'
      ELSE 'epoch'
    END AS row_type,
    CASE WHEN grouping(epoch_start) = 1 THEN 0 ELSE 1 END AS row_sort,
    epoch_start,
    count(*) AS simulator_new_lock_count,
    count_if(event_kind = 'lock_created') AS new_lock_count,
    count_if(event_kind = 'lock_amount_increased') AS lock_amount_increased_count,
    count_if(event_kind = 'lock_permanent') AS new_permanent_lock_count,
    count(DISTINCT actor) AS actor_count,
    count(DISTINCT tokenId) AS token_count,
    sum(CAST(amount_raw AS double)) / 1e18 AS mezo_amount
  FROM filtered
  GROUP BY GROUPING SETS ((epoch_start), ())
)
SELECT
  row_type,
  epoch_start,
  simulator_new_lock_count,
  new_lock_count,
  lock_amount_increased_count,
  new_permanent_lock_count,
  actor_count,
  token_count,
  mezo_amount
FROM aggregated
ORDER BY
  row_sort,
  epoch_start;
```

Column meanings:

- `row_type`: `total` is the single row to compare to the simulator totals; `epoch` is a Thursday 00:00 UTC epoch bucket.
- `epoch_start`: start of the epoch. Blank on the `total` row.
- `simulator_new_lock_count`: count that should match simulator `newLockCount`.
- `new_lock_count`: literal new veMEZO locks, `Deposit.depositType = 1`.
- `lock_amount_increased_count`: added amount to existing locks, `Deposit.depositType = 2`; included in simulator `newLockCount`.
- `new_permanent_lock_count`: locks made permanent via `LockPermanent`; included in simulator `newLockCount`.
- `actor_count`: distinct included actors in that row.
- `token_count`: distinct veMEZO NFT token IDs in that row.
- `mezo_amount`: summed raw event amount scaled by `1e18`.

## 1B. New veMEZO Locks by Actor

This produces the actor list for the same lock track. Use it to inspect who
contributed the new locks / permanent locks in the selected period.

```sql
WITH
params AS (
  SELECT
    timestamp '{{from_time}}' AS from_time,
    timestamp '{{to_time}}' AS to_time
),
runtime_blacklist_raw AS (
  SELECT lower(trim(addr)) AS addr
  FROM unnest(split('{{blacklist_csv}}', ',')) AS t(addr)
),
runtime_blacklist AS (
  SELECT from_hex(substr(addr, 3)) AS actor
  FROM runtime_blacklist_raw
  WHERE regexp_like(addr, '^0x[0-9a-f]{40}$')
),
seed_blacklist(actor) AS (
  VALUES
    (0x965c18b6ac7d233c00c93c7c0039bef6a6035d26),
    (0x4859c4fad2bb8a93ec4ad8c232dd280b80d84ea8),
    (0x2bc442310e6684c678e7b8498efa8aa3cbd7c44b),
    (0x35cf1381f056559299b6a4dc08f83833fab07946),
    (0x57de1ae5933ca6e5c672f6a9e8967d5e2fbf21cf),
    (0x075108f275ed81c9cfc01065e6e50ceea81d6363),
    (0xf8176df5b9fbcf0ed38c06970371ba89b7701bbb)
),
excluded_actors AS (
  SELECT actor FROM seed_blacklist
  UNION
  SELECT actor FROM runtime_blacklist
),
event_rows AS (
  SELECT
    d.evt_block_time,
    d.evt_tx_hash,
    d.evt_index,
    d.provider AS actor,
    d.tokenId,
    d.value AS amount_raw,
    d.locktime AS locktime_raw,
    CASE
      WHEN d.depositType = 1 THEN 'lock_created'
      WHEN d.depositType = 2 THEN 'lock_amount_increased'
    END AS event_kind
  FROM mezo_mezo.vemezo_evt_deposit d
  CROSS JOIN params p
  WHERE d.contract_address = 0xb90fdad3dfd180458d62cc6acedc983d78e20122
    AND d.evt_block_date >= CAST(p.from_time AS date)
    AND d.evt_block_date <= CAST(p.to_time AS date)
    AND d.evt_block_time >= p.from_time
    AND d.evt_block_time <= p.to_time
    AND d.depositType IN (1, 2)

  UNION ALL

  SELECT
    lp.evt_block_time,
    lp.evt_tx_hash,
    lp.evt_index,
    lp._owner AS actor,
    lp._tokenId AS tokenId,
    lp.amount AS amount_raw,
    CAST(NULL AS uint256) AS locktime_raw,
    'lock_permanent' AS event_kind
  FROM mezo_mezo.vemezo_evt_lockpermanent lp
  CROSS JOIN params p
  WHERE lp.contract_address = 0xb90fdad3dfd180458d62cc6acedc983d78e20122
    AND lp.evt_block_date >= CAST(p.from_time AS date)
    AND lp.evt_block_date <= CAST(p.to_time AS date)
    AND lp.evt_block_time >= p.from_time
    AND lp.evt_block_time <= p.to_time
),
classified AS (
  SELECT
    e.*,
    x.actor IS NOT NULL AS excluded_by_blacklist
  FROM event_rows e
  LEFT JOIN excluded_actors x ON e.actor = x.actor
),
filtered AS (
  SELECT *
  FROM classified
  WHERE NOT excluded_by_blacklist
)
SELECT
  actor AS actor_address,
  count(*) AS simulator_new_lock_count,
  count_if(event_kind = 'lock_created') AS new_lock_count,
  count_if(event_kind = 'lock_amount_increased') AS lock_amount_increased_count,
  count_if(event_kind = 'lock_permanent') AS new_permanent_lock_count,
  count(DISTINCT tokenId) AS token_count,
  min(evt_block_time) AS first_event_time,
  max(evt_block_time) AS last_event_time,
  sum(CAST(amount_raw AS double)) / 1e18 AS mezo_amount
FROM filtered
GROUP BY actor
ORDER BY
  simulator_new_lock_count DESC,
  new_lock_count DESC,
  new_permanent_lock_count DESC,
  actor_address;
```

Column meanings:

- `actor_address`: included wallet address after applying seed plus optional CSV blacklist.
- `simulator_new_lock_count`: count that contributes to simulator `newLockCount` for that actor.
- `new_lock_count`: literal new veMEZO locks, `Deposit.depositType = 1`.
- `lock_amount_increased_count`: added amount to existing locks, `Deposit.depositType = 2`.
- `new_permanent_lock_count`: locks made permanent via `LockPermanent`.
- `token_count`: distinct veMEZO NFT token IDs touched by that actor in this track.
- `first_event_time`: first included lock-track event for the actor in the selected period.
- `last_event_time`: last included lock-track event for the actor in the selected period.
- `mezo_amount`: summed raw event amount scaled by `1e18`.

## 2A. Boost Vote Actions by Epoch

This mirrors the simulator's in-range `boostCount`: **distinct
`(tokenId, epoch)` pairs** that voted manually on the Mezo veBTC pair
boost voter (one NFT voting on 100 gauges in one epoch still counts as
1). Cron-driven pokes are excluded — the simulator only credits manual
re-votes, so poke-emitted `Voted` rows whose `tx.from` equals the cron
address (`0xf8176df5b9fbcf0ed38c06970371ba89b7701bbb`) are filtered from
`simulator_boost_count` (they remain in `boost_event_count` for
forensics). To preserve blacklist parity with the app, the query also
resolves the actor to the veMEZO NFT owner at the vote event instead of
using the raw `voter` field. Ownership resolution uses veMEZO `Transfer`
events plus `LockPermanent` owner confirmations; it intentionally does
not use `Deposit.provider`, because that field is not reliable as NFT
ownership for
boost attribution.

```sql
WITH
params AS (
  SELECT
    timestamp '{{from_time}}' AS from_time,
    timestamp '{{to_time}}' AS to_time
),
runtime_blacklist_raw AS (
  SELECT lower(trim(addr)) AS addr
  FROM unnest(split('{{blacklist_csv}}', ',')) AS t(addr)
),
runtime_blacklist AS (
  SELECT from_hex(substr(addr, 3)) AS actor
  FROM runtime_blacklist_raw
  WHERE regexp_like(addr, '^0x[0-9a-f]{40}$')
),
seed_blacklist(actor) AS (
  VALUES
    (0x965c18b6ac7d233c00c93c7c0039bef6a6035d26),
    (0x4859c4fad2bb8a93ec4ad8c232dd280b80d84ea8),
    (0x2bc442310e6684c678e7b8498efa8aa3cbd7c44b),
    (0x35cf1381f056559299b6a4dc08f83833fab07946),
    (0x57de1ae5933ca6e5c672f6a9e8967d5e2fbf21cf),
    (0x075108f275ed81c9cfc01065e6e50ceea81d6363),
    (0xf8176df5b9fbcf0ed38c06970371ba89b7701bbb)
),
excluded_actors AS (
  SELECT actor FROM seed_blacklist
  UNION
  SELECT actor FROM runtime_blacklist
),
votes AS (
  SELECT
    from_unixtime(floor(to_unixtime(v.evt_block_time) / 604800) * 604800) AS epoch_start,
    v.evt_block_time,
    v.evt_block_number,
    v.evt_block_date,
    v.evt_tx_hash,
    v.evt_tx_from,
    v.evt_index,
    v.voter AS raw_voter,
    v.tokenId,
    v.gauge,
    v.weight,
    v.totalWeight,
    -- The maintainer cron's tx.from is the discriminator between
    -- poke-driven and manual Voted events. The simulator's poke gate
    -- only credits boostCount for manual votes; mirror that here.
    v.evt_tx_from != 0xf8176df5b9fbcf0ed38c06970371ba89b7701bbb AS is_manual
  FROM mezo_mezo.boostvoter_evt_voted v
  CROSS JOIN params p
  WHERE v.contract_address = 0x2ba614a598cffa5a19d683cdca97bac3a49313d1
    AND v.evt_block_date >= CAST(p.from_time AS date)
    AND v.evt_block_date <= CAST(p.to_time AS date)
    AND v.evt_block_time >= p.from_time
    AND v.evt_block_time <= p.to_time
),
owner_events AS (
  SELECT
    t.evt_block_date,
    t.evt_block_number,
    t.evt_index,
    t.tokenId,
    t."to" AS owner
  FROM mezo_mezo.vemezo_evt_transfer t
  CROSS JOIN params p
  WHERE t.contract_address = 0xb90fdad3dfd180458d62cc6acedc983d78e20122
    AND t.evt_block_date <= CAST(p.to_time AS date)

  UNION ALL

  SELECT
    lp.evt_block_date,
    lp.evt_block_number,
    lp.evt_index,
    lp._tokenId AS tokenId,
    lp._owner AS owner
  FROM mezo_mezo.vemezo_evt_lockpermanent lp
  CROSS JOIN params p
  WHERE lp.contract_address = 0xb90fdad3dfd180458d62cc6acedc983d78e20122
    AND lp.evt_block_date <= CAST(p.to_time AS date)
),
owner_candidates AS (
  SELECT
    v.*,
    o.owner AS owner_at_event,
    row_number() OVER (
      PARTITION BY v.evt_tx_hash, v.evt_index, v.tokenId, v.gauge
      ORDER BY o.evt_block_number DESC, o.evt_index DESC
    ) AS owner_rank
  FROM votes v
  LEFT JOIN owner_events o
    ON o.tokenId = v.tokenId
    AND o.evt_block_date <= v.evt_block_date
    AND (
      o.evt_block_number < v.evt_block_number
      OR (
        o.evt_block_number = v.evt_block_number
        AND o.evt_index <= v.evt_index
      )
    )
),
event_rows AS (
  SELECT
    epoch_start,
    evt_block_time,
    evt_tx_hash,
    evt_index,
    coalesce(owner_at_event, raw_voter) AS actor,
    raw_voter,
    tokenId,
    gauge,
    weight,
    totalWeight,
    is_manual
  FROM owner_candidates
  WHERE owner_rank = 1
),
classified AS (
  SELECT
    e.*,
    x.actor IS NOT NULL AS excluded_by_blacklist
  FROM event_rows e
  LEFT JOIN excluded_actors x ON e.actor = x.actor
),
filtered AS (
  SELECT *
  FROM classified
  WHERE NOT excluded_by_blacklist
),
aggregated AS (
  SELECT
    CASE
      WHEN grouping(epoch_start) = 1 THEN 'total'
      ELSE 'epoch'
    END AS row_type,
    CASE WHEN grouping(epoch_start) = 1 THEN 0 ELSE 1 END AS row_sort,
    epoch_start,
    count(DISTINCT CASE WHEN is_manual THEN CAST(tokenId AS varchar) || '|' || CAST(to_unixtime(epoch_start) AS varchar) END) AS simulator_boost_count,
    count(*) AS boost_event_count,
    count_if(is_manual) AS manual_boost_event_count,
    count(DISTINCT actor) AS actor_count,
    count(DISTINCT tokenId) AS token_count,
    count(DISTINCT gauge) AS gauge_count,
    sum(CAST(weight AS double)) / 1e18 AS vote_weight
  FROM filtered
  GROUP BY GROUPING SETS ((epoch_start), ())
)
SELECT
  row_type,
  epoch_start,
  simulator_boost_count,
  boost_event_count,
  manual_boost_event_count,
  actor_count,
  token_count,
  gauge_count,
  vote_weight
FROM aggregated
ORDER BY
  row_sort,
  epoch_start;
```

Column meanings:

- `row_type`: `total` is the single row to compare to the simulator totals; `epoch` is a Thursday 00:00 UTC epoch bucket.
- `epoch_start`: start of the epoch. Blank on the `total` row.
- `simulator_boost_count`: distinct `(tokenId, epoch)` pairs that boosted **manually** in that row — matches the simulator's `boostCount`. Excludes poke-driven `Voted` rows.
- `boost_event_count`: raw `BoostVoter.Voted` event count for the row (one per gauge per vote tx, includes pokes); kept for forensic comparison.
- `manual_boost_event_count`: raw event count restricted to manual votes (poke-driven excluded); useful for sanity-checking the simulator-count.
- `actor_count`: distinct included actors in that row.
- `token_count`: distinct veMEZO NFT token IDs in that row.
- `gauge_count`: distinct boost gauges voted for in that row.
- `vote_weight`: summed `Voted.weight`, scaled by `1e18`.

## 2B. Boost Vote Actions by Actor

This produces the actor list for the same boost action track. The
headline `simulator_boost_count` is the actor's distinct in-range
`(tokenId, epoch)` manual-boost pairs (poke-driven rows excluded);
`boost_event_count` is the raw event count including pokes, and
`manual_boost_event_count` is the raw count restricted to manual votes.
Ownership resolution from `BoostVoter.Voted` to the veMEZO NFT owner
intentionally ignores `Deposit.provider`; `Transfer` is the source of
truth for NFT ownership.

```sql
WITH
params AS (
  SELECT
    timestamp '{{from_time}}' AS from_time,
    timestamp '{{to_time}}' AS to_time
),
runtime_blacklist_raw AS (
  SELECT lower(trim(addr)) AS addr
  FROM unnest(split('{{blacklist_csv}}', ',')) AS t(addr)
),
runtime_blacklist AS (
  SELECT from_hex(substr(addr, 3)) AS actor
  FROM runtime_blacklist_raw
  WHERE regexp_like(addr, '^0x[0-9a-f]{40}$')
),
seed_blacklist(actor) AS (
  VALUES
    (0x965c18b6ac7d233c00c93c7c0039bef6a6035d26),
    (0x4859c4fad2bb8a93ec4ad8c232dd280b80d84ea8),
    (0x2bc442310e6684c678e7b8498efa8aa3cbd7c44b),
    (0x35cf1381f056559299b6a4dc08f83833fab07946),
    (0x57de1ae5933ca6e5c672f6a9e8967d5e2fbf21cf),
    (0x075108f275ed81c9cfc01065e6e50ceea81d6363),
    (0xf8176df5b9fbcf0ed38c06970371ba89b7701bbb)
),
excluded_actors AS (
  SELECT actor FROM seed_blacklist
  UNION
  SELECT actor FROM runtime_blacklist
),
votes AS (
  SELECT
    v.evt_block_time,
    v.evt_block_number,
    v.evt_block_date,
    v.evt_tx_hash,
    v.evt_tx_from,
    v.evt_index,
    v.voter AS raw_voter,
    v.tokenId,
    v.gauge,
    v.weight,
    v.totalWeight,
    v.evt_tx_from != 0xf8176df5b9fbcf0ed38c06970371ba89b7701bbb AS is_manual
  FROM mezo_mezo.boostvoter_evt_voted v
  CROSS JOIN params p
  WHERE v.contract_address = 0x2ba614a598cffa5a19d683cdca97bac3a49313d1
    AND v.evt_block_date >= CAST(p.from_time AS date)
    AND v.evt_block_date <= CAST(p.to_time AS date)
    AND v.evt_block_time >= p.from_time
    AND v.evt_block_time <= p.to_time
),
owner_events AS (
  SELECT
    t.evt_block_date,
    t.evt_block_number,
    t.evt_index,
    t.tokenId,
    t."to" AS owner
  FROM mezo_mezo.vemezo_evt_transfer t
  CROSS JOIN params p
  WHERE t.contract_address = 0xb90fdad3dfd180458d62cc6acedc983d78e20122
    AND t.evt_block_date <= CAST(p.to_time AS date)

  UNION ALL

  SELECT
    lp.evt_block_date,
    lp.evt_block_number,
    lp.evt_index,
    lp._tokenId AS tokenId,
    lp._owner AS owner
  FROM mezo_mezo.vemezo_evt_lockpermanent lp
  CROSS JOIN params p
  WHERE lp.contract_address = 0xb90fdad3dfd180458d62cc6acedc983d78e20122
    AND lp.evt_block_date <= CAST(p.to_time AS date)
),
owner_candidates AS (
  SELECT
    v.*,
    o.owner AS owner_at_event,
    row_number() OVER (
      PARTITION BY v.evt_tx_hash, v.evt_index, v.tokenId, v.gauge
      ORDER BY o.evt_block_number DESC, o.evt_index DESC
    ) AS owner_rank
  FROM votes v
  LEFT JOIN owner_events o
    ON o.tokenId = v.tokenId
    AND o.evt_block_date <= v.evt_block_date
    AND (
      o.evt_block_number < v.evt_block_number
      OR (
        o.evt_block_number = v.evt_block_number
        AND o.evt_index <= v.evt_index
      )
    )
),
event_rows AS (
  SELECT
    evt_block_time,
    evt_tx_hash,
    evt_index,
    coalesce(owner_at_event, raw_voter) AS actor,
    raw_voter,
    tokenId,
    gauge,
    weight,
    totalWeight,
    is_manual
  FROM owner_candidates
  WHERE owner_rank = 1
),
classified AS (
  SELECT
    e.*,
    x.actor IS NOT NULL AS excluded_by_blacklist
  FROM event_rows e
  LEFT JOIN excluded_actors x ON e.actor = x.actor
),
filtered AS (
  SELECT *
  FROM classified
  WHERE NOT excluded_by_blacklist
)
SELECT
  actor AS actor_address,
  count(DISTINCT CASE WHEN is_manual THEN CAST(tokenId AS varchar) || '|' || CAST(floor(to_unixtime(evt_block_time) / 604800) AS varchar) END) AS simulator_boost_count,
  count(*) AS boost_event_count,
  count_if(is_manual) AS manual_boost_event_count,
  count(DISTINCT tokenId) AS token_count,
  count(DISTINCT gauge) AS gauge_count,
  min(evt_block_time) AS first_event_time,
  max(evt_block_time) AS last_event_time,
  sum(CAST(weight AS double)) / 1e18 AS vote_weight
FROM filtered
GROUP BY actor
ORDER BY
  simulator_boost_count DESC,
  vote_weight DESC,
  actor_address;
```

Column meanings:

- `actor_address`: included wallet address after applying seed plus optional CSV blacklist.
- `simulator_boost_count`: actor's distinct in-range `(tokenId, epoch)` manual-boost pairs; compare to the app `Boost` column. Poke-driven rows are excluded.
- `boost_event_count`: raw in-range `BoostVoter.Voted` event count for the actor (includes pokes); kept for forensic comparison.
- `manual_boost_event_count`: raw event count restricted to manual votes (poke-driven excluded).
- `token_count`: distinct veMEZO NFT token IDs used by that actor.
- `gauge_count`: distinct boost gauges voted for by that actor.
- `first_event_time`: actor's first included boost vote in the selected period.
- `last_event_time`: actor's last included boost vote in the selected period.
- `vote_weight`: summed `Voted.weight`, scaled by `1e18`.

## 3A. veMEZO Lock Extensions by Epoch

This mirrors the simulator's `extensionCount`: `Deposit.depositType = 3`.

```sql
WITH
params AS (
  SELECT
    timestamp '{{from_time}}' AS from_time,
    timestamp '{{to_time}}' AS to_time
),
runtime_blacklist_raw AS (
  SELECT lower(trim(addr)) AS addr
  FROM unnest(split('{{blacklist_csv}}', ',')) AS t(addr)
),
runtime_blacklist AS (
  SELECT from_hex(substr(addr, 3)) AS actor
  FROM runtime_blacklist_raw
  WHERE regexp_like(addr, '^0x[0-9a-f]{40}$')
),
seed_blacklist(actor) AS (
  VALUES
    (0x965c18b6ac7d233c00c93c7c0039bef6a6035d26),
    (0x4859c4fad2bb8a93ec4ad8c232dd280b80d84ea8),
    (0x2bc442310e6684c678e7b8498efa8aa3cbd7c44b),
    (0x35cf1381f056559299b6a4dc08f83833fab07946),
    (0x57de1ae5933ca6e5c672f6a9e8967d5e2fbf21cf),
    (0x075108f275ed81c9cfc01065e6e50ceea81d6363),
    (0xf8176df5b9fbcf0ed38c06970371ba89b7701bbb)
),
excluded_actors AS (
  SELECT actor FROM seed_blacklist
  UNION
  SELECT actor FROM runtime_blacklist
),
event_rows AS (
  SELECT
    from_unixtime(floor(to_unixtime(d.evt_block_time) / 604800) * 604800) AS epoch_start,
    d.evt_block_time,
    d.evt_tx_hash,
    d.evt_index,
    d.provider AS actor,
    d.tokenId,
    d.value AS amount_raw,
    d.locktime AS locktime_raw
  FROM mezo_mezo.vemezo_evt_deposit d
  CROSS JOIN params p
  WHERE d.contract_address = 0xb90fdad3dfd180458d62cc6acedc983d78e20122
    AND d.evt_block_date >= CAST(p.from_time AS date)
    AND d.evt_block_date <= CAST(p.to_time AS date)
    AND d.evt_block_time >= p.from_time
    AND d.evt_block_time <= p.to_time
    AND d.depositType = 3
),
classified AS (
  SELECT
    e.*,
    x.actor IS NOT NULL AS excluded_by_blacklist
  FROM event_rows e
  LEFT JOIN excluded_actors x ON e.actor = x.actor
),
filtered AS (
  SELECT *
  FROM classified
  WHERE NOT excluded_by_blacklist
),
aggregated AS (
  SELECT
    CASE
      WHEN grouping(epoch_start) = 1 THEN 'total'
      ELSE 'epoch'
    END AS row_type,
    CASE WHEN grouping(epoch_start) = 1 THEN 0 ELSE 1 END AS row_sort,
    epoch_start,
    count(*) AS simulator_extension_count,
    count(DISTINCT actor) AS actor_count,
    count(DISTINCT tokenId) AS token_count,
    sum(CAST(amount_raw AS double)) / 1e18 AS mezo_amount
  FROM filtered
  GROUP BY GROUPING SETS ((epoch_start), ())
)
SELECT
  row_type,
  epoch_start,
  simulator_extension_count,
  actor_count,
  token_count,
  mezo_amount
FROM aggregated
ORDER BY
  row_sort,
  epoch_start;
```

Column meanings:

- `row_type`: `total` is the single row to compare to the simulator totals; `epoch` is a Thursday 00:00 UTC epoch bucket.
- `epoch_start`: start of the epoch. Blank on the `total` row.
- `simulator_extension_count`: count that should match simulator `extensionCount`.
- `actor_count`: distinct included actors in that row.
- `token_count`: distinct veMEZO NFT token IDs in that row.
- `mezo_amount`: summed raw event amount, scaled by `1e18`.

## 3B. veMEZO Lock Extensions by Actor

This produces the actor list for the same extension track.

```sql
WITH
params AS (
  SELECT
    timestamp '{{from_time}}' AS from_time,
    timestamp '{{to_time}}' AS to_time
),
runtime_blacklist_raw AS (
  SELECT lower(trim(addr)) AS addr
  FROM unnest(split('{{blacklist_csv}}', ',')) AS t(addr)
),
runtime_blacklist AS (
  SELECT from_hex(substr(addr, 3)) AS actor
  FROM runtime_blacklist_raw
  WHERE regexp_like(addr, '^0x[0-9a-f]{40}$')
),
seed_blacklist(actor) AS (
  VALUES
    (0x965c18b6ac7d233c00c93c7c0039bef6a6035d26),
    (0x4859c4fad2bb8a93ec4ad8c232dd280b80d84ea8),
    (0x2bc442310e6684c678e7b8498efa8aa3cbd7c44b),
    (0x35cf1381f056559299b6a4dc08f83833fab07946),
    (0x57de1ae5933ca6e5c672f6a9e8967d5e2fbf21cf),
    (0x075108f275ed81c9cfc01065e6e50ceea81d6363),
    (0xf8176df5b9fbcf0ed38c06970371ba89b7701bbb)
),
excluded_actors AS (
  SELECT actor FROM seed_blacklist
  UNION
  SELECT actor FROM runtime_blacklist
),
event_rows AS (
  SELECT
    d.evt_block_time,
    d.evt_tx_hash,
    d.evt_index,
    d.provider AS actor,
    d.tokenId,
    d.value AS amount_raw,
    d.locktime AS locktime_raw
  FROM mezo_mezo.vemezo_evt_deposit d
  CROSS JOIN params p
  WHERE d.contract_address = 0xb90fdad3dfd180458d62cc6acedc983d78e20122
    AND d.evt_block_date >= CAST(p.from_time AS date)
    AND d.evt_block_date <= CAST(p.to_time AS date)
    AND d.evt_block_time >= p.from_time
    AND d.evt_block_time <= p.to_time
    AND d.depositType = 3
),
classified AS (
  SELECT
    e.*,
    x.actor IS NOT NULL AS excluded_by_blacklist
  FROM event_rows e
  LEFT JOIN excluded_actors x ON e.actor = x.actor
),
filtered AS (
  SELECT *
  FROM classified
  WHERE NOT excluded_by_blacklist
)
SELECT
  actor AS actor_address,
  count(*) AS simulator_extension_count,
  count(DISTINCT tokenId) AS token_count,
  min(evt_block_time) AS first_event_time,
  max(evt_block_time) AS last_event_time,
  sum(CAST(amount_raw AS double)) / 1e18 AS mezo_amount
FROM filtered
GROUP BY actor
ORDER BY
  simulator_extension_count DESC,
  mezo_amount DESC,
  actor_address;
```

Column meanings:

- `actor_address`: included wallet address after applying seed plus optional CSV blacklist.
- `simulator_extension_count`: actor's duration-extension count; compare to the app `Ext` column.
- `token_count`: distinct veMEZO NFT token IDs extended by that actor.
- `first_event_time`: actor's first included extension in the selected period.
- `last_event_time`: actor's last included extension in the selected period.
- `mezo_amount`: summed raw event amount, scaled by `1e18`.

## 4A. Lock Track Event Details by Actor

This is the event-level comparison table for the actor profile's
`Lock / extension events in range` view, restricted to the simulator's
new-lock track. It returns one row per `lockCreated`,
`lockAmountIncreased`, or `lockPermanent` event.

```sql
WITH
params AS (
  SELECT
    timestamp '{{from_time}}' AS from_time,
    timestamp '{{to_time}}' AS to_time
),
actor_filter_input AS (
  SELECT lower(trim('{{actor_address}}')) AS addr
),
actor_filter AS (
  SELECT try(from_hex(substr(addr, 3))) AS actor
  FROM actor_filter_input
  WHERE regexp_like(addr, '^0x[0-9a-f]{40}$')
),
runtime_blacklist_raw AS (
  SELECT lower(trim(addr)) AS addr
  FROM unnest(split('{{blacklist_csv}}', ',')) AS t(addr)
),
runtime_blacklist AS (
  SELECT from_hex(substr(addr, 3)) AS actor
  FROM runtime_blacklist_raw
  WHERE regexp_like(addr, '^0x[0-9a-f]{40}$')
),
seed_blacklist(actor) AS (
  VALUES
    (0x965c18b6ac7d233c00c93c7c0039bef6a6035d26),
    (0x4859c4fad2bb8a93ec4ad8c232dd280b80d84ea8),
    (0x2bc442310e6684c678e7b8498efa8aa3cbd7c44b),
    (0x35cf1381f056559299b6a4dc08f83833fab07946),
    (0x57de1ae5933ca6e5c672f6a9e8967d5e2fbf21cf),
    (0x075108f275ed81c9cfc01065e6e50ceea81d6363),
    (0xf8176df5b9fbcf0ed38c06970371ba89b7701bbb)
),
excluded_actors AS (
  SELECT actor FROM seed_blacklist
  UNION
  SELECT actor FROM runtime_blacklist
),
event_rows AS (
  SELECT
    concat(CAST(d.evt_tx_hash AS varchar), ':', CAST(d.evt_index AS varchar)) AS event_id,
    d.evt_block_time AS event_time,
    CAST(floor(to_unixtime(d.evt_block_time)) AS bigint) AS timestamp,
    from_unixtime(floor(to_unixtime(d.evt_block_time) / 604800) * 604800) AS epoch_start,
    d.evt_block_number AS block_number,
    d.evt_index AS log_index,
    d.evt_tx_hash AS tx_hash,
    d.evt_tx_from AS tx_from,
    d.provider AS actor_address,
    CASE
      WHEN d.depositType = 1 THEN 'lockCreated'
      WHEN d.depositType = 2 THEN 'lockAmountIncreased'
    END AS action_type,
    'unknown' AS boost_context,
    'votingEscrow' AS contract,
    'dune' AS source,
    d.tokenId AS token_id,
    d.value AS amount_raw,
    CAST(d.value AS double) / 1e18 AS amount_mezo,
    d.locktime AS locktime_raw,
    from_unixtime(CAST(d.locktime AS double)) AS unlock_time,
    greatest(CAST(d.locktime AS double) - to_unixtime(d.evt_block_time), CAST(0 AS double)) AS duration_seconds_approx,
    CAST(NULL AS varbinary) AS gauge_address,
    CAST(NULL AS uint256) AS weight_raw,
    CAST(NULL AS uint256) AS total_weight_raw,
    true AS counts_for_simulator_new_lock,
    false AS counts_for_simulator_extension,
    false AS counts_for_simulator_boost
  FROM mezo_mezo.vemezo_evt_deposit d
  CROSS JOIN params p
  WHERE d.contract_address = 0xb90fdad3dfd180458d62cc6acedc983d78e20122
    AND d.evt_block_date >= CAST(p.from_time AS date)
    AND d.evt_block_date <= CAST(p.to_time AS date)
    AND d.evt_block_time >= p.from_time
    AND d.evt_block_time <= p.to_time
    AND d.depositType IN (1, 2)

  UNION ALL

  SELECT
    concat(CAST(lp.evt_tx_hash AS varchar), ':', CAST(lp.evt_index AS varchar)) AS event_id,
    lp.evt_block_time AS event_time,
    CAST(floor(to_unixtime(lp.evt_block_time)) AS bigint) AS timestamp,
    from_unixtime(floor(to_unixtime(lp.evt_block_time) / 604800) * 604800) AS epoch_start,
    lp.evt_block_number AS block_number,
    lp.evt_index AS log_index,
    lp.evt_tx_hash AS tx_hash,
    lp.evt_tx_from AS tx_from,
    lp._owner AS actor_address,
    'lockPermanent' AS action_type,
    'unknown' AS boost_context,
    'votingEscrow' AS contract,
    'dune' AS source,
    lp._tokenId AS token_id,
    lp.amount AS amount_raw,
    CAST(lp.amount AS double) / 1e18 AS amount_mezo,
    CAST(NULL AS uint256) AS locktime_raw,
    CAST(NULL AS timestamp) AS unlock_time,
    CAST(NULL AS double) AS duration_seconds_approx,
    CAST(NULL AS varbinary) AS gauge_address,
    CAST(NULL AS uint256) AS weight_raw,
    CAST(NULL AS uint256) AS total_weight_raw,
    true AS counts_for_simulator_new_lock,
    false AS counts_for_simulator_extension,
    false AS counts_for_simulator_boost
  FROM mezo_mezo.vemezo_evt_lockpermanent lp
  CROSS JOIN params p
  WHERE lp.contract_address = 0xb90fdad3dfd180458d62cc6acedc983d78e20122
    AND lp.evt_block_date >= CAST(p.from_time AS date)
    AND lp.evt_block_date <= CAST(p.to_time AS date)
    AND lp.evt_block_time >= p.from_time
    AND lp.evt_block_time <= p.to_time
),
filtered AS (
  SELECT e.*
  FROM event_rows e
  LEFT JOIN excluded_actors x ON e.actor_address = x.actor
  WHERE x.actor IS NULL
    AND (
      NOT EXISTS (SELECT 1 FROM actor_filter)
      OR e.actor_address IN (SELECT actor FROM actor_filter)
    )
)
SELECT
  event_id,
  actor_address,
  event_time,
  timestamp,
  epoch_start,
  action_type,
  boost_context,
  contract,
  source,
  tx_from,
  token_id,
  amount_raw,
  amount_mezo,
  locktime_raw,
  unlock_time,
  duration_seconds_approx,
  block_number,
  log_index,
  tx_hash,
  counts_for_simulator_new_lock,
  counts_for_simulator_extension,
  counts_for_simulator_boost,
  concat('https://explorer.mezo.org/tx/', CAST(tx_hash AS varchar)) AS explorer_url
FROM filtered
ORDER BY
  actor_address,
  event_time,
  block_number,
  log_index;
```

## 4B. Boost Event Details by Actor

This is the event-level comparison table for the actor profile's
`Boost actions in range` view. It includes both `boostVote` and `boostAbstain`
rows because abstains explain why an actor can have in-range boost activity but
fewer active epochs or points. Only **manual** `boostVote` rows have
`counts_for_simulator_boost = true`; rows where `tx_from` equals the cron
poke address are flagged with `action_type = 'boostPoke'` and excluded
from the simulator count. Actor attribution is resolved from veMEZO NFT
ownership (`Transfer` plus `LockPermanent`) and deliberately ignores
`Deposit.provider`.

```sql
WITH
params AS (
  SELECT
    timestamp '{{from_time}}' AS from_time,
    timestamp '{{to_time}}' AS to_time
),
actor_filter_input AS (
  SELECT lower(trim('{{actor_address}}')) AS addr
),
actor_filter AS (
  SELECT try(from_hex(substr(addr, 3))) AS actor
  FROM actor_filter_input
  WHERE regexp_like(addr, '^0x[0-9a-f]{40}$')
),
runtime_blacklist_raw AS (
  SELECT lower(trim(addr)) AS addr
  FROM unnest(split('{{blacklist_csv}}', ',')) AS t(addr)
),
runtime_blacklist AS (
  SELECT from_hex(substr(addr, 3)) AS actor
  FROM runtime_blacklist_raw
  WHERE regexp_like(addr, '^0x[0-9a-f]{40}$')
),
seed_blacklist(actor) AS (
  VALUES
    (0x965c18b6ac7d233c00c93c7c0039bef6a6035d26),
    (0x4859c4fad2bb8a93ec4ad8c232dd280b80d84ea8),
    (0x2bc442310e6684c678e7b8498efa8aa3cbd7c44b),
    (0x35cf1381f056559299b6a4dc08f83833fab07946),
    (0x57de1ae5933ca6e5c672f6a9e8967d5e2fbf21cf),
    (0x075108f275ed81c9cfc01065e6e50ceea81d6363),
    (0xf8176df5b9fbcf0ed38c06970371ba89b7701bbb)
),
excluded_actors AS (
  SELECT actor FROM seed_blacklist
  UNION
  SELECT actor FROM runtime_blacklist
),
boost_events AS (
  SELECT
    concat(CAST(v.evt_tx_hash AS varchar), ':', CAST(v.evt_index AS varchar)) AS event_id,
    v.evt_block_time AS event_time,
    CAST(floor(to_unixtime(v.evt_block_time)) AS bigint) AS timestamp,
    from_unixtime(floor(to_unixtime(v.evt_block_time) / 604800) * 604800) AS epoch_start,
    v.evt_block_date,
    v.evt_block_number AS block_number,
    v.evt_index AS log_index,
    v.evt_tx_hash AS tx_hash,
    v.evt_tx_from AS tx_from,
    v.voter AS raw_voter,
    v.tokenId AS token_id,
    v.gauge AS gauge_address,
    v.weight AS weight_raw,
    v.totalWeight AS total_weight_raw,
    -- Poke-driven Voted events get re-classified as 'boostPoke' and lose
    -- their simulator-boost flag, mirroring the simulator's poke gate.
    CASE
      WHEN v.evt_tx_from = 0xf8176df5b9fbcf0ed38c06970371ba89b7701bbb
        THEN 'boostPoke'
      ELSE 'boostVote'
    END AS action_type,
    v.evt_tx_from != 0xf8176df5b9fbcf0ed38c06970371ba89b7701bbb AS counts_for_simulator_boost
  FROM mezo_mezo.boostvoter_evt_voted v
  CROSS JOIN params p
  WHERE v.contract_address = 0x2ba614a598cffa5a19d683cdca97bac3a49313d1
    AND v.evt_block_date >= CAST(p.from_time AS date)
    AND v.evt_block_date <= CAST(p.to_time AS date)
    AND v.evt_block_time >= p.from_time
    AND v.evt_block_time <= p.to_time

  UNION ALL

  SELECT
    concat(CAST(a.evt_tx_hash AS varchar), ':', CAST(a.evt_index AS varchar)) AS event_id,
    a.evt_block_time AS event_time,
    CAST(floor(to_unixtime(a.evt_block_time)) AS bigint) AS timestamp,
    from_unixtime(floor(to_unixtime(a.evt_block_time) / 604800) * 604800) AS epoch_start,
    a.evt_block_date,
    a.evt_block_number AS block_number,
    a.evt_index AS log_index,
    a.evt_tx_hash AS tx_hash,
    a.evt_tx_from AS tx_from,
    a.voter AS raw_voter,
    a.tokenId AS token_id,
    a.gauge AS gauge_address,
    a.weight AS weight_raw,
    a.totalWeight AS total_weight_raw,
    'boostAbstain' AS action_type,
    false AS counts_for_simulator_boost
  FROM mezo_mezo.boostvoter_evt_abstained a
  CROSS JOIN params p
  WHERE a.contract_address = 0x2ba614a598cffa5a19d683cdca97bac3a49313d1
    AND a.evt_block_date >= CAST(p.from_time AS date)
    AND a.evt_block_date <= CAST(p.to_time AS date)
    AND a.evt_block_time >= p.from_time
    AND a.evt_block_time <= p.to_time
),
owner_events AS (
  SELECT
    t.evt_block_date,
    t.evt_block_number,
    t.evt_index,
    t.tokenId AS token_id,
    t."to" AS owner
  FROM mezo_mezo.vemezo_evt_transfer t
  CROSS JOIN params p
  WHERE t.contract_address = 0xb90fdad3dfd180458d62cc6acedc983d78e20122
    AND t.evt_block_date <= CAST(p.to_time AS date)

  UNION ALL

  SELECT
    lp.evt_block_date,
    lp.evt_block_number,
    lp.evt_index,
    lp._tokenId AS token_id,
    lp._owner AS owner
  FROM mezo_mezo.vemezo_evt_lockpermanent lp
  CROSS JOIN params p
  WHERE lp.contract_address = 0xb90fdad3dfd180458d62cc6acedc983d78e20122
    AND lp.evt_block_date <= CAST(p.to_time AS date)
),
owner_candidates AS (
  SELECT
    b.*,
    o.owner AS owner_at_event,
    row_number() OVER (
      PARTITION BY b.tx_hash, b.log_index, b.token_id, b.gauge_address, b.action_type
      ORDER BY o.evt_block_number DESC, o.evt_index DESC
    ) AS owner_rank
  FROM boost_events b
  LEFT JOIN owner_events o
    ON o.token_id = b.token_id
    AND o.evt_block_date <= b.evt_block_date
    AND (
      o.evt_block_number < b.block_number
      OR (
        o.evt_block_number = b.block_number
        AND o.evt_index <= b.log_index
      )
    )
),
event_rows AS (
  SELECT
    event_id,
    event_time,
    timestamp,
    epoch_start,
    block_number,
    log_index,
    tx_hash,
    tx_from,
    coalesce(owner_at_event, raw_voter) AS actor_address,
    raw_voter,
    action_type,
    'mezoVeBtcPairBoost' AS boost_context,
    'boostVoter' AS contract,
    'dune' AS source,
    token_id,
    gauge_address,
    weight_raw,
    CAST(weight_raw AS double) / 1e18 AS weight,
    total_weight_raw,
    CAST(total_weight_raw AS double) / 1e18 AS total_weight,
    CASE
      WHEN CAST(total_weight_raw AS double) = 0 THEN NULL
      ELSE CAST(weight_raw AS double) / CAST(total_weight_raw AS double)
    END AS voter_power_share,
    counts_for_simulator_boost
  FROM owner_candidates
  WHERE owner_rank = 1
),
filtered AS (
  SELECT e.*
  FROM event_rows e
  LEFT JOIN excluded_actors x ON e.actor_address = x.actor
  WHERE x.actor IS NULL
    AND (
      NOT EXISTS (SELECT 1 FROM actor_filter)
      OR e.actor_address IN (SELECT actor FROM actor_filter)
    )
)
SELECT
  event_id,
  actor_address,
  event_time,
  timestamp,
  epoch_start,
  action_type,
  boost_context,
  contract,
  source,
  tx_from,
  raw_voter,
  token_id,
  gauge_address,
  weight_raw,
  weight,
  total_weight_raw,
  total_weight,
  voter_power_share,
  block_number,
  log_index,
  tx_hash,
  false AS counts_for_simulator_new_lock,
  false AS counts_for_simulator_extension,
  counts_for_simulator_boost,
  concat('https://explorer.mezo.org/tx/', CAST(tx_hash AS varchar)) AS explorer_url
FROM filtered
ORDER BY
  actor_address,
  event_time,
  block_number,
  log_index;
```

## 4C. Extension Event Details by Actor

This is the event-level comparison table for duration extensions only:
`Deposit.depositType = 3`, mapped to the app action type `lockExtended`.

```sql
WITH
params AS (
  SELECT
    timestamp '{{from_time}}' AS from_time,
    timestamp '{{to_time}}' AS to_time
),
actor_filter_input AS (
  SELECT lower(trim('{{actor_address}}')) AS addr
),
actor_filter AS (
  SELECT try(from_hex(substr(addr, 3))) AS actor
  FROM actor_filter_input
  WHERE regexp_like(addr, '^0x[0-9a-f]{40}$')
),
runtime_blacklist_raw AS (
  SELECT lower(trim(addr)) AS addr
  FROM unnest(split('{{blacklist_csv}}', ',')) AS t(addr)
),
runtime_blacklist AS (
  SELECT from_hex(substr(addr, 3)) AS actor
  FROM runtime_blacklist_raw
  WHERE regexp_like(addr, '^0x[0-9a-f]{40}$')
),
seed_blacklist(actor) AS (
  VALUES
    (0x965c18b6ac7d233c00c93c7c0039bef6a6035d26),
    (0x4859c4fad2bb8a93ec4ad8c232dd280b80d84ea8),
    (0x2bc442310e6684c678e7b8498efa8aa3cbd7c44b),
    (0x35cf1381f056559299b6a4dc08f83833fab07946),
    (0x57de1ae5933ca6e5c672f6a9e8967d5e2fbf21cf),
    (0x075108f275ed81c9cfc01065e6e50ceea81d6363),
    (0xf8176df5b9fbcf0ed38c06970371ba89b7701bbb)
),
excluded_actors AS (
  SELECT actor FROM seed_blacklist
  UNION
  SELECT actor FROM runtime_blacklist
),
event_rows AS (
  SELECT
    concat(CAST(d.evt_tx_hash AS varchar), ':', CAST(d.evt_index AS varchar)) AS event_id,
    d.evt_block_time AS event_time,
    CAST(floor(to_unixtime(d.evt_block_time)) AS bigint) AS timestamp,
    from_unixtime(floor(to_unixtime(d.evt_block_time) / 604800) * 604800) AS epoch_start,
    d.evt_block_number AS block_number,
    d.evt_index AS log_index,
    d.evt_tx_hash AS tx_hash,
    d.evt_tx_from AS tx_from,
    d.provider AS actor_address,
    'lockExtended' AS action_type,
    'unknown' AS boost_context,
    'votingEscrow' AS contract,
    'dune' AS source,
    d.tokenId AS token_id,
    d.value AS amount_raw,
    CAST(d.value AS double) / 1e18 AS amount_mezo,
    d.locktime AS locktime_raw,
    from_unixtime(CAST(d.locktime AS double)) AS unlock_time,
    greatest(CAST(d.locktime AS double) - to_unixtime(d.evt_block_time), CAST(0 AS double)) AS duration_seconds_approx,
    false AS counts_for_simulator_new_lock,
    true AS counts_for_simulator_extension,
    false AS counts_for_simulator_boost
  FROM mezo_mezo.vemezo_evt_deposit d
  CROSS JOIN params p
  WHERE d.contract_address = 0xb90fdad3dfd180458d62cc6acedc983d78e20122
    AND d.evt_block_date >= CAST(p.from_time AS date)
    AND d.evt_block_date <= CAST(p.to_time AS date)
    AND d.evt_block_time >= p.from_time
    AND d.evt_block_time <= p.to_time
    AND d.depositType = 3
),
filtered AS (
  SELECT e.*
  FROM event_rows e
  LEFT JOIN excluded_actors x ON e.actor_address = x.actor
  WHERE x.actor IS NULL
    AND (
      NOT EXISTS (SELECT 1 FROM actor_filter)
      OR e.actor_address IN (SELECT actor FROM actor_filter)
    )
)
SELECT
  event_id,
  actor_address,
  event_time,
  timestamp,
  epoch_start,
  action_type,
  boost_context,
  contract,
  source,
  tx_from,
  token_id,
  amount_raw,
  amount_mezo,
  locktime_raw,
  unlock_time,
  duration_seconds_approx,
  block_number,
  log_index,
  tx_hash,
  counts_for_simulator_new_lock,
  counts_for_simulator_extension,
  counts_for_simulator_boost,
  concat('https://explorer.mezo.org/tx/', CAST(tx_hash AS varchar)) AS explorer_url
FROM filtered
ORDER BY
  actor_address,
  event_time,
  block_number,
  log_index;
```

Detail column meanings:

- `event_id`: Dune event identity, built from `tx_hash:log_index`.
- `actor_address`: wallet that the simulator should attribute the event to, after blacklist filtering.
- `event_time` / `timestamp`: UTC timestamp as Dune timestamp and Unix seconds.
- `epoch_start`: Thursday 00:00 UTC bucket containing the event.
- `action_type`: app-style activity action, such as `lockCreated`, `lockExtended`, `boostVote`, or `boostAbstain`.
- `boost_context`: `mezoVeBtcPairBoost` for BoostVoter rows, otherwise `unknown`.
- `contract`: app-style contract source, `votingEscrow` or `boostVoter`.
- `source`: `dune`, to distinguish this export from app `subgraph` rows.
- `tx_from`: transaction sender. For boost rows this can differ from `actor_address` when a poke/maintainer transaction updates a user's veMEZO token.
- `raw_voter`: only in the boost query; the contract's `voter` field before owner resolution.
- `token_id`: veMEZO NFT token id.
- `gauge_address`: boost gauge address for boost rows.
- `amount_raw` / `amount_mezo`: lock event amount as raw WAD and scaled MEZO.
- `locktime_raw` / `unlock_time`: deposit event lock end timestamp.
- `duration_seconds_approx`: `unlock_time - event_time`; this is an approximation of the app's displayed duration.
- `weight_raw` / `weight`: boost vote weight as raw WAD and scaled value.
- `total_weight_raw` / `total_weight`: total voter weight from the BoostVoter event.
- `voter_power_share`: `weight / total_weight` for the vote event.
- `counts_for_simulator_new_lock`: true for `lockCreated`, `lockAmountIncreased`, and `lockPermanent`.
- `counts_for_simulator_extension`: true for `lockExtended`.
- `counts_for_simulator_boost`: true only for `boostVote`, not `boostAbstain`.
- `explorer_url`: Mezo explorer transaction link.
