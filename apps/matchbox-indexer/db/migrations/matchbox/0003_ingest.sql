-- RPC ingest replaces the Goldsky pipeline (docs/goldsky-exit.md). Raw logs
-- come from eth_getLogs, so the id is ours: lower(tx_hash) || '-' || log_index.
-- matchbox_raw.logs held no rows when this was written; the reshape is safe.

COMMENT ON SCHEMA matchbox_raw IS
  'Raw Mezo logs and transactions from RPC ingest. Never edit rows by hand.';

COMMENT ON TABLE matchbox_raw.logs IS
  'Raw Mezo logs from eth_getLogs, one row per (network, tx, log index).';

-- Mezo's eth_getLogs reports blockTimestamp 0x0; ingest reads timestamps from
-- block headers, and a zero must never be stored.
ALTER TABLE matchbox_raw.logs
  ALTER COLUMN transaction_index SET NOT NULL,
  ADD CONSTRAINT logs_block_timestamp_positive CHECK (block_timestamp > 0),
  ADD CONSTRAINT logs_id_format
    CHECK (id = lower(transaction_hash) || '-' || log_index::text),
  ADD CONSTRAINT logs_network_fkey
    FOREIGN KEY (network) REFERENCES matchbox.networks(slug);

-- Superseded by the unique constraint below.
DROP INDEX IF EXISTS matchbox_raw.logs_tx_log_idx;

ALTER TABLE matchbox_raw.logs
  ADD CONSTRAINT logs_network_tx_log_key
    UNIQUE (network, transaction_hash, log_index);

CREATE TABLE IF NOT EXISTS matchbox_raw.transactions (
  network text NOT NULL REFERENCES matchbox.networks(slug),
  hash text NOT NULL,
  block_number bigint NOT NULL,
  transaction_index int NOT NULL,
  from_address text NOT NULL,
  to_address text,
  input text NOT NULL,
  PRIMARY KEY (network, hash)
);

COMMENT ON TABLE matchbox_raw.transactions IS
  'Each transaction that emitted an ingested log. Decoders need from and the calldata selector.';

CREATE INDEX IF NOT EXISTS transactions_network_block_idx
  ON matchbox_raw.transactions (network, block_number, transaction_index);

CREATE TABLE IF NOT EXISTS matchbox.contracts (
  network text NOT NULL REFERENCES matchbox.networks(slug),
  address text NOT NULL,
  kind text NOT NULL CHECK (kind IN (
    'votingEscrow', 'boostVoter', 'poolsVoter', 'thirdPartyVoter',
    'validatorsVoter', 'splitter', 'minter', 'rebaseDistributor',
    'merkleDistributor', 'musdSavingsRate', 'pcv', 'poolFactory', 'pool',
    'gauge', 'bribeVotingReward', 'feeVotingReward'
  )),
  template text NOT NULL,
  parent text,
  pool text,
  gauge text,
  created_block bigint NOT NULL,
  created_tx text,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (network, address),
  CHECK (address = lower(address))
);

COMMENT ON TABLE matchbox.contracts IS
  'Contracts ingest fetches logs for: the explorer static sources plus GaugeCreated / PoolCreated children.';
COMMENT ON COLUMN matchbox.contracts.template IS
  'Subgraph data source name (VeMEZO, LegacyBribeX) or template name (Gauge, Pool).';
COMMENT ON COLUMN matchbox.contracts.created_block IS
  'First block ingest fetches logs from: network start for core contracts, creation block for children.';

CREATE INDEX IF NOT EXISTS contracts_network_pool_idx
  ON matchbox.contracts (network, pool);
CREATE INDEX IF NOT EXISTS contracts_network_gauge_idx
  ON matchbox.contracts (network, gauge);

CREATE TABLE IF NOT EXISTS matchbox.indexer_checkpoints (
  network text NOT NULL REFERENCES matchbox.networks(slug),
  stream text NOT NULL,
  last_block bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (network, stream)
);

COMMENT ON TABLE matchbox.indexer_checkpoints IS
  'Highest block fully processed per stream. Stream logs: raw ingest.';

-- Code is the source of truth (src/ingest/networks.ts); keep the row aligned.
UPDATE matchbox.networks
SET start_block = 5000000, finality_depth = 2
WHERE slug = 'mezo';
