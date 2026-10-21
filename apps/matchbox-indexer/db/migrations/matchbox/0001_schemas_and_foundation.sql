-- Phase A warehouse foundation. Decoder and projection tables land in Phase B.

CREATE SCHEMA IF NOT EXISTS matchbox_raw;
CREATE SCHEMA IF NOT EXISTS matchbox;
CREATE SCHEMA IF NOT EXISTS matchbox_pro;
CREATE SCHEMA IF NOT EXISTS matchbox_scan;

COMMENT ON SCHEMA matchbox_raw IS
  'Raw EVM logs delivered by Goldsky. Never edit rows by hand.';
COMMENT ON SCHEMA matchbox IS
  'Indexer-owned canonical chain data and projections.';
COMMENT ON SCHEMA matchbox_pro IS
  'API-cron-owned Matchbox Pro read models.';
COMMENT ON SCHEMA matchbox_scan IS
  'Reserved for Matchscan. Intentionally empty in Phase A.';

CREATE OR REPLACE FUNCTION matchbox.topic(topics text, n int)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT nullif(btrim(split_part(topics, ',', n + 1)), '');
$$;

CREATE OR REPLACE FUNCTION matchbox.topic0(topics text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT lower(matchbox.topic(topics, 0));
$$;

CREATE TABLE IF NOT EXISTS matchbox.networks (
  slug text PRIMARY KEY,
  chain_id int NOT NULL UNIQUE,
  start_block bigint NOT NULL,
  finality_depth int NOT NULL DEFAULT 32 CHECK (finality_depth > 0)
);

INSERT INTO matchbox.networks (slug, chain_id, start_block, finality_depth)
VALUES
  ('mezo', 31612, 7739500, 32),
  ('mezo-testnet', 31611, 11739500, 32)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS matchbox.chain_events (
  canonical_id text PRIMARY KEY,
  goldsky_id text,
  network text NOT NULL REFERENCES matchbox.networks(slug),
  block_number bigint NOT NULL,
  block_hash text NOT NULL,
  block_timestamp bigint NOT NULL,
  transaction_hash text NOT NULL,
  transaction_index bigint,
  log_index bigint NOT NULL,
  address text NOT NULL,
  topic0 text NOT NULL,
  topics text,
  data text,
  event_name text,
  decoded jsonb,
  decoder_version int NOT NULL DEFAULT 1,
  finality_status text NOT NULL DEFAULT 'tentative'
    CHECK (finality_status IN ('tentative', 'canonical', 'orphaned'))
);

CREATE INDEX IF NOT EXISTS chain_events_tx_log_idx
  ON matchbox.chain_events (transaction_hash, log_index);

CREATE TABLE IF NOT EXISTS matchbox.reorg_log (
  id bigserial PRIMARY KEY,
  network text NOT NULL REFERENCES matchbox.networks(slug),
  detected_at timestamptz NOT NULL DEFAULT now(),
  from_block bigint NOT NULL,
  old_hash text NOT NULL,
  new_hash text NOT NULL,
  common_ancestor_hash text,
  rebuilt_at timestamptz
);

CREATE TABLE IF NOT EXISTS matchbox.reconciliation_break (
  id bigserial PRIMARY KEY,
  detected_at timestamptz NOT NULL DEFAULT now(),
  check_name text NOT NULL,
  network text REFERENCES matchbox.networks(slug),
  subject text,
  derived_value numeric(78, 0),
  onchain_value numeric(78, 0),
  difference numeric(78, 0),
  block_number bigint,
  detail text,
  resolved_at timestamptz
);
