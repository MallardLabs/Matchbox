-- Keep the raw layer inside the warehouse budget (docs/goldsky-exit.md).
--
-- No decoder handler reads past the 4-byte calldata selector
-- (src/decode/calldata.ts, enforced by test/decode/calldata.test.ts), and
-- full calldata was about 80% of each transaction row. Ingest now persists
-- only the selector; trim the rows stored before that. left(input, 10) is
-- "0x" plus 4 bytes, the same as storedInput().
UPDATE matchbox_raw.transactions
SET input = left(input, 10)
WHERE length(input) > 10;

COMMENT ON COLUMN matchbox_raw.transactions.input IS
  'Calldata selector only ("0x" plus 4 bytes, or shorter input as-is). Decoders never read past it.';

-- Nothing queries these. Projection reads logs by (network, block_number,
-- log_index) and joins transactions on (network, hash).
DROP INDEX IF EXISTS matchbox_raw.logs_block_timestamp_idx;
DROP INDEX IF EXISTS matchbox_raw.transactions_network_block_idx;

-- Reclaiming the trimmed space needs VACUUM FULL, which cannot run inside this
-- migration's transaction: `pnpm --filter @repo/matchbox-indexer vacuum:raw`.
