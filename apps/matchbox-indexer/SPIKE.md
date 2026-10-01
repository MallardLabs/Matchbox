# Goldsky one-address ingest spike

Status: complete on 2026-08-30 against the isolated Neon branch
`dev-indexed-data-phase-a` (`br-winter-sea-ay6x5lru`). This was not a
production backfill.

## Environment

- Goldsky project: `Matchbox` (`project_cmoiy2fc3z9sl01rk465n7poh`)
- Goldsky CLI: `13.10.0`
- Turbo extension: `0.13.0`
- Neon project: `fragrant-math-82213579` in `Mallard Labs`
- Resource size: `s`
- Address: `CONTRACTS.mainnet.veMEZO`
  (`0xb90fdad3dfd180458d62cc6acedc983d78e20122`)
- Range: `start_at: earliest` and `block_number >= 7739500`

## Dataset result

- Dataset slug: `mezo.raw_logs`
- Dataset version: `1.1.0`; the design's expected `1.0.0` is stale
- Columns reported by `goldsky dataset get mezo.raw_logs`: `id`,
  `block_number`, `block_hash`, `transaction_hash`, `transaction_index`,
  `log_index`, `address`, `data`, `topics`, `block_timestamp`
- `mezo-testnet.raw_logs` was not found; Phase A remained mainnet-only

Both sink tables contained 23,768 rows from blocks 7,741,542 through
11,501,929. `block_hash` was non-null on every row.

## Turbo versus Mirror

Turbo and Mirror were applied from separate, engine-valid YAML documents to
`matchbox_raw.logs_spike_turbo` and `matchbox_raw.logs_spike_mirror`.

| Check | Turbo | Mirror |
| --- | --- | --- |
| Rows | 23,768 | 23,768 |
| Physical columns | 11 | 11 |
| Table owner | `goldsink` | `goldsink` |
| Primary key | `id` | `id` |
| Null `block_hash` | 0 | 0 |

A full outer join by `id` found zero Turbo-only IDs, zero Mirror-only IDs,
and zero differing payload rows. Reapplying Turbo also preserved the same
snapshot. This establishes same-ID delivery for the observed canonical data;
it does **not** establish ID behavior across a reorg.

### `_gs_op` and deletes

Current Turbo guidance requires explicitly selecting `_gs_op` when a sink
needs update/delete semantics. The generator now does that. The PostgreSQL
sink treats `_gs_op` as connector control metadata and did not create a
physical `_gs_op` column.

A controlled SQL attempt to replace `_gs_op` with the literal `d` left the
23,768 rows unchanged. Turbo owns and propagates this special field, so that
attempt is not evidence of real reorg-delete behavior. No Mezo reorg occurred
during the observation window. Therefore:

- PostgreSQL DELETE on a real source `_gs_op=d`: **not observed**
- Goldsky `id` stability across a real reorg: **not observed**

The current [Turbo PostgreSQL sink documentation](https://docs.goldsky.com/turbo-pipelines/sinks/postgres)
documents auto-create and upsert behavior but does not specify delete behavior.
These unknowns must not be promoted into production assumptions.

## Sink versus DDL result

Goldsky auto-created both tables with the desired eleven data columns and an
`id` primary key. However, a fresh Turbo deployment after revoking `CREATE`
failed while executing `CREATE SCHEMA/TABLE IF NOT EXISTS`, even though the
schema and table already existed:

```text
permission denied for database neondb
failed to create schema/table matchbox_raw.logs_spike_turbo
```

The proposed “let Goldsky create once, then revoke DDL” option is therefore
not restart-safe. Goldsky's BYO PostgreSQL runbook also says database and
schema `CREATE` are required even for existing schemas. Phase B should not
grant permanent database DDL to the production sink without an explicit
security decision.

## Decision

Use **Mirror apiVersion 3 for the raw ledger** as the Phase B default. Turbo
remains blocked for the raw ledger because its real reorg-delete behavior is
unobserved and its startup DDL requirement conflicts with the intended
least-privilege sink role. Reconsider Turbo only after Goldsky confirms both
delete semantics and a no-DDL startup mode, or after an append-only/orphaning
architecture is implemented ahead of the PostgreSQL sink.

The one-address pipelines are stopped (`Turbo: PAUSED`, `Mirror: TERMINATED`
after pause), temporary database/schema `CREATE` grants are revoked, and the
comparison tables remain on the disposable Neon branch as evidence. The
`MATCHBOX_NEON_SPIKE` secret remains in the Matchbox Goldsky project. The
generated production YAML was **not applied**.
