-- Warehouse-only data next to the explorer mirror (docs/goldsky-exit.md,
-- "Warehouse extensions"). The decoder now also handles the voters from the
-- network start, the bribe rewards of BoostVoter, ValidatorsVoter and
-- ThirdPartyVoter gauges, and the mUSD trove contracts. None of that existed
-- in matchbox-explorer 3.4.0, so activity rows carry a flag and the parity
-- check compares only the rows the explorer would have produced.

ALTER TABLE matchbox.activity_events
  ADD COLUMN IF NOT EXISTS explorer_parity boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN matchbox.activity_events.explorer_parity IS
  'False for rows matchbox-explorer 3.4.0 would not have produced: voter logs before block 7,739,500 and claims on voter bribe contracts. scripts/parity.ts compares only true rows.';

-- Ingest registry: the voter bribe rewards (discovered from the 3-argument
-- GaugeCreated) and the two mUSD trove contracts.
ALTER TABLE matchbox.contracts
  DROP CONSTRAINT IF EXISTS contracts_kind_check;
ALTER TABLE matchbox.contracts
  ADD CONSTRAINT contracts_kind_check CHECK (kind IN (
    'votingEscrow', 'boostVoter', 'poolsVoter', 'thirdPartyVoter',
    'validatorsVoter', 'splitter', 'minter', 'rebaseDistributor',
    'merkleDistributor', 'musdSavingsRate', 'pcv', 'poolFactory', 'pool',
    'gauge', 'bribeVotingReward', 'feeVotingReward', 'voterBribeReward',
    'musdBorrowerOperations', 'musdTroveManager'
  ));

COMMENT ON TABLE matchbox.contracts IS
  'Contracts ingest fetches logs for: the explorer static sources, the mUSD trove contracts, and GaugeCreated / PoolCreated children. voterBribeReward rows are fetched by topic, not by address.';

-- Decoder data sources: the voter bribe template remembers which voter and
-- gauge created it, because its claims are attributed to them.
ALTER TABLE matchbox.projection_data_sources
  ADD COLUMN IF NOT EXISTS voter_source text,
  ADD COLUMN IF NOT EXISTS gauge text;

ALTER TABLE matchbox.projection_data_sources
  DROP CONSTRAINT IF EXISTS projection_data_sources_template_check;
ALTER TABLE matchbox.projection_data_sources
  ADD CONSTRAINT projection_data_sources_template_check CHECK (template IN (
    'BribeVotingReward', 'FeeVotingReward', 'Gauge', 'Pool', 'VoterBribeReward'
  ));

ALTER TABLE matchbox.projection_data_sources
  DROP CONSTRAINT IF EXISTS projection_data_sources_voter_bribe_check;
ALTER TABLE matchbox.projection_data_sources
  ADD CONSTRAINT projection_data_sources_voter_bribe_check CHECK (
    template <> 'VoterBribeReward'
    OR (voter_source IN ('BOOST_VOTER', 'THIRD_PARTY_VOTER', 'VALIDATORS_VOTER')
        AND gauge IS NOT NULL)
  );

-- Claims sent straight to a voter keep their full calldata so the claimed
-- lock's tokenId is recoverable (src/decode/calldata.ts). Rows stored before
-- this change hold the selector only: scripts/refetch-claim-calldata.ts
-- restores them.
COMMENT ON COLUMN matchbox_raw.transactions.input IS
  'Full calldata for claimBribes / claimFees / claimFeesAndBribes calls to a voter; the selector ("0x" plus 4 bytes) for everything else.';
