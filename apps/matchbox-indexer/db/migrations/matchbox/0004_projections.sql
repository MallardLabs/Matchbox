-- Projections decoded from matchbox_raw by src/decode (docs/goldsky-exit.md).
-- activity_events mirrors the explorer subgraph's ActivityEvent field for field
-- so the webapp reads it unchanged and parity is a row diff against
-- matchbox-explorer 3.4.0. Amounts and token ids are numeric(78,0); block,
-- log index and timestamp are bigint; addresses and hashes are lowercase hex
-- text.

CREATE TABLE IF NOT EXISTS matchbox.activity_events (
  network text NOT NULL REFERENCES matchbox.networks(slug),
  id text NOT NULL,
  action_type text NOT NULL,
  boost_context text NOT NULL,
  source text NOT NULL,
  tx_hash text NOT NULL,
  tx_from text,
  log_index bigint NOT NULL,
  block_number bigint NOT NULL,
  timestamp bigint NOT NULL,
  actor text,
  recipient text,
  token_id numeric(78, 0),
  amount numeric(78, 0),
  duration numeric(78, 0),
  prev_amount numeric(78, 0),
  prev_duration numeric(78, 0),
  prev_is_permanent boolean,
  post_amount numeric(78, 0),
  post_duration numeric(78, 0),
  post_is_permanent boolean,
  merge_source_token_id numeric(78, 0),
  merge_dest_token_id numeric(78, 0),
  merge_dest_prev_amount numeric(78, 0),
  merge_dest_prev_duration numeric(78, 0),
  merge_dest_prev_is_permanent boolean,
  token text,
  gauge text,
  pool text,
  reward_contract text,
  reward_type text,
  metadata text,
  boostable_token_id numeric(78, 0),
  boost numeric(78, 0),
  weight numeric(78, 0),
  total_weight numeric(78, 0),
  poke_method text,
  period numeric(78, 0),
  new_period numeric(78, 0),
  first_recipient_amount numeric(78, 0),
  second_recipient_amount numeric(78, 0),
  old_rate numeric(78, 0),
  new_rate numeric(78, 0),
  emission numeric(78, 0),
  rebase numeric(78, 0),
  rewards numeric(78, 0),
  total_supply numeric(78, 0),
  epoch_index numeric(78, 0),
  epoch_start numeric(78, 0),
  epoch_end numeric(78, 0),
  distribution_id numeric(78, 0),
  merkle_root text,
  contract_address text NOT NULL,
  decoder_version int NOT NULL,
  PRIMARY KEY (network, id)
);

COMMENT ON TABLE matchbox.activity_events IS
  'Explorer-compatible activity rows. id = {txHash}-{logIndex}-{ACTION_TYPE}.';

-- The activity route filters a timestamp window, optionally by one of these
-- columns, newest first.
CREATE INDEX IF NOT EXISTS activity_events_timestamp_idx
  ON matchbox.activity_events (network, timestamp DESC, id);
CREATE INDEX IF NOT EXISTS activity_events_actor_idx
  ON matchbox.activity_events (network, actor, timestamp DESC);
CREATE INDEX IF NOT EXISTS activity_events_recipient_idx
  ON matchbox.activity_events (network, recipient, timestamp DESC);
CREATE INDEX IF NOT EXISTS activity_events_gauge_idx
  ON matchbox.activity_events (network, gauge, timestamp DESC);
CREATE INDEX IF NOT EXISTS activity_events_action_type_idx
  ON matchbox.activity_events (network, action_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS activity_events_source_idx
  ON matchbox.activity_events (network, source, timestamp DESC);
CREATE INDEX IF NOT EXISTS activity_events_block_idx
  ON matchbox.activity_events (network, block_number);

CREATE TABLE IF NOT EXISTS matchbox.lock_positions (
  network text NOT NULL REFERENCES matchbox.networks(slug),
  id text NOT NULL,
  token_id numeric(78, 0) NOT NULL,
  contract_address text NOT NULL,
  owner text,
  amount numeric(78, 0) NOT NULL,
  unlock_at numeric(78, 0),
  created_at numeric(78, 0),
  last_extended_at numeric(78, 0),
  withdrawn_at numeric(78, 0),
  is_permanent boolean NOT NULL,
  is_withdrawn boolean NOT NULL,
  is_merged boolean NOT NULL,
  merged_into_token_id numeric(78, 0),
  merged_at numeric(78, 0),
  boost numeric(78, 0),
  activity_count numeric(78, 0) NOT NULL,
  PRIMARY KEY (network, id)
);

COMMENT ON TABLE matchbox.lock_positions IS
  'Explorer LockPosition: current state per (escrow, tokenId). id = {escrow}-{tokenId}.';

CREATE INDEX IF NOT EXISTS lock_positions_owner_idx
  ON matchbox.lock_positions (network, owner);

CREATE TABLE IF NOT EXISTS matchbox.votes (
  network text NOT NULL REFERENCES matchbox.networks(slug),
  id text NOT NULL,
  voter_contract text NOT NULL,
  token_id numeric(78, 0) NOT NULL,
  gauge text NOT NULL,
  owner text NOT NULL,
  current_weight numeric(78, 0) NOT NULL,
  last_updated_epoch numeric(78, 0) NOT NULL,
  last_updated_at numeric(78, 0) NOT NULL,
  is_active boolean NOT NULL,
  PRIMARY KEY (network, id)
);

COMMENT ON TABLE matchbox.votes IS
  'Explorer Vote: latest state per (voter contract, tokenId, gauge).';

CREATE INDEX IF NOT EXISTS votes_voter_active_idx
  ON matchbox.votes (network, voter_contract, is_active);

CREATE TABLE IF NOT EXISTS matchbox.bribe_to_pool (
  network text NOT NULL REFERENCES matchbox.networks(slug),
  id text NOT NULL,
  pool_address text NOT NULL,
  gauge_address text NOT NULL,
  PRIMARY KEY (network, id)
);

COMMENT ON TABLE matchbox.bribe_to_pool IS
  'Explorer BribeToPool: bribe or fee reward contract to its pool and gauge.';

-- graph-node template data sources the decoder created (GaugeCreated,
-- PoolCreated). Distinct from matchbox.contracts, which is the wider set
-- ingest fetches logs for.
CREATE TABLE IF NOT EXISTS matchbox.projection_data_sources (
  network text NOT NULL REFERENCES matchbox.networks(slug),
  address text NOT NULL,
  template text NOT NULL
    CHECK (template IN ('BribeVotingReward', 'FeeVotingReward', 'Gauge', 'Pool')),
  created_block bigint NOT NULL,
  PRIMARY KEY (network, address)
);

CREATE TABLE IF NOT EXISTS matchbox.projection_state (
  network text PRIMARY KEY REFERENCES matchbox.networks(slug),
  decoder_version int NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE matchbox.projection_state IS
  'Decoder version the projection tables were built with. A mismatch requires a replay.';

-- Roles come from scripts/create-roles.ts; on a fresh database they may not
-- exist yet, and their default privileges then cover these tables.
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'matchbox_indexer') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      matchbox.activity_events,
      matchbox.lock_positions,
      matchbox.votes,
      matchbox.bribe_to_pool,
      matchbox.projection_data_sources,
      matchbox.projection_state
    TO matchbox_indexer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'matchbox_api_ro') THEN
    GRANT SELECT ON
      matchbox.activity_events,
      matchbox.lock_positions,
      matchbox.votes,
      matchbox.bribe_to_pool
    TO matchbox_api_ro;
  END IF;
END
$grants$;
