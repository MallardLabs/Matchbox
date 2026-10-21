-- mUSD trove history for "Recent repayments" (warehouse-only). One row per
-- TroveUpdated from BorrowerOperations or TroveManager, from the contracts'
-- deployment (block 178,630): the trove's state after the operation, the
-- previous state, the interest accrued in between (musd InterestRateMath),
-- and the signed change. src/decode/handlers/musd.ts documents the rules.
-- Amounts are numeric(78,0) base units (mUSD and BTC both 18 decimals).

CREATE TABLE IF NOT EXISTS matchbox.trove_updates (
  network text NOT NULL REFERENCES matchbox.networks(slug),
  tx_hash text NOT NULL,
  log_index bigint NOT NULL,
  block_number bigint NOT NULL,
  timestamp bigint NOT NULL,
  tx_from text NOT NULL,
  contract_address text NOT NULL,
  emitter text NOT NULL
    CHECK (emitter IN ('BORROWER_OPERATIONS', 'TROVE_MANAGER')),
  borrower text NOT NULL,
  operation smallint NOT NULL,
  action text NOT NULL CHECK (action IN (
    'LOAN_OPENED', 'LOAN_REPAID', 'LOAN_BORROWED', 'LOAN_COLL_ADDED',
    'LOAN_COLL_WITHDRAWN', 'LOAN_ADJUSTED', 'LOAN_REFINANCED', 'LOAN_CLOSED',
    'LOAN_REWARDS_APPLIED', 'LOAN_LIQUIDATED', 'LOAN_REDEEMED', 'LOAN_UNKNOWN'
  )),
  principal numeric(78, 0) NOT NULL,
  interest numeric(78, 0) NOT NULL,
  coll numeric(78, 0) NOT NULL,
  stake numeric(78, 0) NOT NULL,
  interest_rate integer,
  last_interest_update_time bigint,
  prev_principal numeric(78, 0),
  prev_interest numeric(78, 0),
  prev_coll numeric(78, 0),
  accrued_interest numeric(78, 0),
  debt_change numeric(78, 0),
  coll_change numeric(78, 0),
  decoder_version int NOT NULL,
  PRIMARY KEY (network, tx_hash, log_index)
);

COMMENT ON TABLE matchbox.trove_updates IS
  'mUSD TroveUpdated history. debt_change = (principal + interest) - (prev_principal + prev_interest + accrued_interest); negative is a repayment (LOAN_REPAID, LOAN_CLOSED, LOAN_REDEEMED, LOAN_LIQUIDATED).';
COMMENT ON COLUMN matchbox.trove_updates.operation IS
  'Raw uint8. BORROWER_OPERATIONS: 0 open, 1 close, 2 adjust, 3 refinance. TROVE_MANAGER: 0 applyPendingRewards, 1 liquidate, 2 redeemCollateral.';
COMMENT ON COLUMN matchbox.trove_updates.debt_change IS
  'Signed base units. Exact except across an interest checkpoint that emitted no event, where it can be off by 1 wei per checkpoint.';

-- Latest state per borrower (the decoder''s prefetch) and a wallet's history.
CREATE INDEX IF NOT EXISTS trove_updates_borrower_idx
  ON matchbox.trove_updates (network, borrower, block_number DESC, log_index DESC);
-- Protocol-wide recent repayments and liquidations.
CREATE INDEX IF NOT EXISTS trove_updates_action_idx
  ON matchbox.trove_updates (network, action, timestamp DESC);

DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'matchbox_indexer') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON matchbox.trove_updates
      TO matchbox_indexer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'matchbox_api_ro') THEN
    GRANT SELECT ON matchbox.trove_updates TO matchbox_api_ro;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'matchbox_pro_rw') THEN
    GRANT SELECT ON matchbox.trove_updates TO matchbox_pro_rw;
  END IF;
END
$grants$;
