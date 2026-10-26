-- Market snapshots for /v1/gauges, /v1/incentives and gauge history.
-- Written only by the market cron; HTTP requests only read.

-- One row per network and epoch: the latest snapshot that wrote the epoch.
CREATE TABLE market_epochs (
  network TEXT NOT NULL,
  epoch_start INTEGER NOT NULL,
  block_number TEXT NOT NULL,
  as_of TEXT NOT NULL,
  -- JSON VoterTotalWeights
  total_weights TEXT NOT NULL,
  -- JSON { btcUsd, mezoUsd } reference prices
  prices TEXT NOT NULL,
  PRIMARY KEY (network, epoch_start)
);

-- One row per gauge per epoch. The current epoch holds every gauge; upcoming
-- epochs only gauges with rewards already deposited for them.
CREATE TABLE market_gauges (
  network TEXT NOT NULL,
  epoch_start INTEGER NOT NULL,
  gauge_address TEXT NOT NULL,
  voter TEXT NOT NULL,
  vebtc_token_id TEXT,
  -- 1 when the epoch has at least one non-zero reward
  has_rewards INTEGER NOT NULL,
  -- JSON Gauge and GaugeIncentives (contract schemas)
  gauge TEXT NOT NULL,
  incentives TEXT NOT NULL,
  -- SHA-256 of gauge + incentives; unchanged rows are not rewritten
  hash TEXT NOT NULL,
  PRIMARY KEY (network, epoch_start, gauge_address)
);

CREATE INDEX market_gauges_voter
  ON market_gauges (network, epoch_start, voter);

CREATE INDEX market_gauges_vebtc
  ON market_gauges (network, epoch_start, vebtc_token_id);

CREATE INDEX market_gauges_history
  ON market_gauges (network, gauge_address, epoch_start);
