-- Gauge profile transfers: signed, nonce-bound requests only.
--
-- transfer-gauge-profile used to trust a caller-supplied owner address. It now
-- issues a single-use nonce naming the chain, both gauges and both veBTC token
-- ids, and moves the profile only after the controller of both NFTs signs it.
-- Public clients never touch the nonces.
--
-- Apply before deploying the new transfer-gauge-profile function.
--
-- Rollback (manual):
--   DROP TABLE IF EXISTS public.gauge_profile_transfer_nonces;

CREATE TABLE IF NOT EXISTS public.gauge_profile_transfer_nonces (
  nonce_hash TEXT PRIMARY KEY CHECK (nonce_hash ~ '^[0-9a-f]{64}$'),
  chain_id INTEGER NOT NULL CHECK (chain_id IN (31611, 31612)),
  from_gauge_address TEXT NOT NULL CHECK (from_gauge_address ~ '^0x[0-9a-f]{40}$'),
  from_vebtc_token_id TEXT NOT NULL CHECK (from_vebtc_token_id ~ '^[0-9]+$'),
  to_gauge_address TEXT NOT NULL CHECK (to_gauge_address ~ '^0x[0-9a-f]{40}$'),
  to_vebtc_token_id TEXT NOT NULL CHECK (to_vebtc_token_id ~ '^[0-9]+$'),
  signer_address TEXT NOT NULL CHECK (signer_address ~ '^0x[0-9a-f]{40}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gauge_profile_transfer_nonces_expires
  ON public.gauge_profile_transfer_nonces(expires_at);

ALTER TABLE public.gauge_profile_transfer_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gauge_profile_transfer_nonces FROM anon, authenticated;

-- The function claims each epoch's transfer by inserting into
-- profile_transfers first and treats a unique violation as "already
-- transferred". 20250226000001 created this index; recreate it if the live
-- database lost it, since the claim is only atomic with it in place.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_transfers_unique_gauge_epoch
  ON public.profile_transfers(from_gauge_address, epoch_start);

COMMENT ON TABLE public.gauge_profile_transfer_nonces IS
  'Single-use nonces for signed gauge profile transfers; written only by transfer-gauge-profile.';
