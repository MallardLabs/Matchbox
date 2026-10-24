-- Every 4-argument NotifyReward on a reward contract the decoder tracks (pool
-- bribe and fee rewards, the Legacy* ones, and the voter bribes), keyed by
-- the contract's own epoch. Gives tokenRewardsPerEpoch in SQL, so per-epoch
-- incentives need neither RPC nor timestamp bucketing. Warehouse-only.
-- Amounts are numeric(78,0) token base units; addresses lowercase hex.

CREATE TABLE IF NOT EXISTS matchbox.reward_deposits (
  network text NOT NULL REFERENCES matchbox.networks(slug),
  tx_hash text NOT NULL,
  log_index bigint NOT NULL,
  block_number bigint NOT NULL,
  timestamp bigint NOT NULL,
  tx_from text NOT NULL,
  reward_contract text NOT NULL,
  reward_type text NOT NULL CHECK (reward_type IN ('Bribe', 'Fee')),
  voter_source text NOT NULL CHECK (voter_source IN (
    'POOLS_VOTER', 'BOOST_VOTER', 'THIRD_PARTY_VOTER', 'VALIDATORS_VOTER'
  )),
  gauge text NOT NULL,
  pool text,
  token text NOT NULL,
  epoch_start bigint NOT NULL,
  amount numeric(78, 0) NOT NULL,
  depositor text NOT NULL,
  decoder_version int NOT NULL,
  PRIMARY KEY (network, tx_hash, log_index)
);

COMMENT ON TABLE matchbox.reward_deposits IS
  'One row per 4-argument NotifyReward: amount of token deposited on reward_contract for the epoch starting at epoch_start (unix seconds, from the event). Sum by (reward_contract, token, epoch_start) = tokenRewardsPerEpoch.';
COMMENT ON COLUMN matchbox.reward_deposits.depositor IS
  'NotifyReward.from: the voter contract for BribesAdded deposits, else the caller. tx_from is the signer.';

CREATE INDEX IF NOT EXISTS reward_deposits_epoch_idx
  ON matchbox.reward_deposits (network, epoch_start, gauge);
CREATE INDEX IF NOT EXISTS reward_deposits_gauge_idx
  ON matchbox.reward_deposits (network, gauge, epoch_start DESC);
CREATE INDEX IF NOT EXISTS reward_deposits_contract_idx
  ON matchbox.reward_deposits (network, reward_contract, epoch_start DESC);

-- Same grant pattern as 0004: roles may not exist yet on a fresh database,
-- and scripts/create-roles.ts default privileges cover tables made later.
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'matchbox_indexer') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON matchbox.reward_deposits
      TO matchbox_indexer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'matchbox_api_ro') THEN
    GRANT SELECT ON matchbox.reward_deposits TO matchbox_api_ro;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'matchbox_pro_rw') THEN
    GRANT SELECT ON matchbox.reward_deposits TO matchbox_pro_rw;
  END IF;
END
$grants$;
