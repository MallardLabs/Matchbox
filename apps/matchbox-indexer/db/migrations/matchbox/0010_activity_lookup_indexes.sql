-- Lookups Matchbox Pro needs that 0006 left unindexed:
-- - a transaction permalink (WHERE tx_hash = $1)
-- - a lock's vote history for epoch-end balance replays (token_id with
--   source, BOOST_VOTE / BOOST_ABSTAIN only)
-- - "Boost refreshed" for a wallet: BOOST_POKE has no actor, so it is
--   scoped by tx_from
-- The partial indexes stay small; the dev branch is capped at 1 GB.

CREATE INDEX IF NOT EXISTS activity_events_tx_hash_idx
  ON matchbox.activity_events (network, tx_hash);

CREATE INDEX IF NOT EXISTS activity_events_vote_token_idx
  ON matchbox.activity_events (network, token_id, timestamp DESC)
  WHERE action_type IN ('BOOST_VOTE', 'BOOST_ABSTAIN');

CREATE INDEX IF NOT EXISTS activity_events_poke_tx_from_idx
  ON matchbox.activity_events (network, tx_from, timestamp DESC)
  WHERE action_type = 'BOOST_POKE';
