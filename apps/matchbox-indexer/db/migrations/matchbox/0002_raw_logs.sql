-- The Goldsky dataset slug/version and reorg columns are settled by SPIKE.md.
-- This pre-created shape intentionally omits `_gs_op` until the spike proves
-- whether the PostgreSQL sink sends it and whether DELETE-on-d is supported.

CREATE TABLE IF NOT EXISTS matchbox_raw.logs (
  id text PRIMARY KEY,
  block_number bigint NOT NULL,
  block_hash text NOT NULL,
  block_timestamp bigint NOT NULL,
  transaction_hash text NOT NULL,
  transaction_index bigint,
  log_index bigint NOT NULL,
  address text NOT NULL,
  topics text,
  data text,
  network text NOT NULL
  -- _gs_op text  -- pending one-address Turbo spike
);

COMMENT ON TABLE matchbox_raw.logs IS
  'Raw Goldsky Mezo logs. Goldsky id is the ingest key pending reorg spike evidence.';
COMMENT ON COLUMN matchbox_raw.logs.topics IS
  'Comma-separated topic list; topic zero is the event signature.';

CREATE INDEX IF NOT EXISTS logs_network_address_topic0_idx
  ON matchbox_raw.logs (network, address, matchbox.topic0(topics));

CREATE INDEX IF NOT EXISTS logs_network_block_order_idx
  ON matchbox_raw.logs (network, block_number, log_index);

-- Deliberately non-unique until the spike establishes reorg delivery semantics.
CREATE INDEX IF NOT EXISTS logs_tx_log_idx
  ON matchbox_raw.logs (transaction_hash, log_index);

CREATE INDEX IF NOT EXISTS logs_block_timestamp_idx
  ON matchbox_raw.logs (block_timestamp);
