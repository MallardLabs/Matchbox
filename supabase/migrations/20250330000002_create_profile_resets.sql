-- Profile resets audit table
-- Records when a gauge profile is reset due to NFT transfer or burn.

CREATE TABLE profile_resets (
  id SERIAL PRIMARY KEY,
  gauge_address TEXT NOT NULL,
  vebtc_token_id TEXT NOT NULL,
  previous_owner TEXT NOT NULL,
  new_owner TEXT NOT NULL,
  reset_reason TEXT NOT NULL,
  reset_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profile_resets_gauge ON profile_resets(gauge_address);
