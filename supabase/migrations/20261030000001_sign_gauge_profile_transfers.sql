-- Gauge profile transfers: signed, nonce-bound requests only.
--
-- transfer-gauge-profile used to trust a caller-supplied owner address. It now
-- issues a single-use nonce naming the chain, both gauges and both veBTC token
-- ids, and moves the profile only after the controller of both NFTs signs it.
-- Public clients never touch the nonces. It also clears forged and duplicate
-- profile_transfers rows so the per-gauge epoch claim can be enforced.
--
-- Apply before deploying the new transfer-gauge-profile function.
--
-- Rollback (manual; deleted profile_transfers rows are not restored, and the
-- anon insert policy stays dropped):
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
-- transferred". Until now the anon key could insert any row there (MBX-L06),
-- so a forged row for the current or a future epoch would 429 the real
-- controller. Drop that policy here too (20261030000002 locks the grants):
-- DROP POLICY holds the table lock until this migration commits, so no anon
-- row lands between the cleanup below and the lock.
DROP POLICY IF EXISTS "Users can insert profile transfers" ON public.profile_transfers;

-- A real row is written by the service role in the request that moved the
-- profile: lowercase addresses, two different gauges, an epoch_start aligned
-- to the week that holds transferred_at, both gauge_profiles rows present
-- (rows are never deleted) and both touched within minutes of transferred_at
-- (the source is cleared, the destination upserted). Malformed rows go from
-- any epoch; the profile checks apply to the current epoch only, the one a
-- forged row can still block. Deleting a real current-epoch row only allows
-- one more transfer this week.
--
-- Operator review of what survives (a real transfer leaves the source's
-- fields NULL at transferred_at; match against the function's "Gauge profile
-- transferred" logs and delete rows the logs do not back):
--   SELECT t.*, s.display_name AS source_name, s.updated_at AS source_updated,
--     d.updated_at AS destination_updated
--   FROM public.profile_transfers t
--   LEFT JOIN public.gauge_profiles s ON s.gauge_address = t.from_gauge_address
--   LEFT JOIN public.gauge_profiles d ON d.gauge_address = t.to_gauge_address
--   WHERE t.epoch_start >= floor(extract(epoch FROM now()) / 604800) * 604800
--   ORDER BY t.transferred_at;
DELETE FROM public.profile_transfers t
WHERE t.epoch_start > floor(extract(epoch FROM now()) / 604800) * 604800
  OR t.epoch_start % 604800 <> 0
  OR t.owner_address !~ '^0x[0-9a-f]{40}$'
  OR t.from_gauge_address !~ '^0x[0-9a-f]{40}$'
  OR t.to_gauge_address !~ '^0x[0-9a-f]{40}$'
  OR t.from_gauge_address = t.to_gauge_address
  OR (
    t.epoch_start = floor(extract(epoch FROM now()) / 604800) * 604800
    AND (
      t.transferred_at IS NULL
      OR t.transferred_at > now()
      OR t.transferred_at < to_timestamp(t.epoch_start)
      OR NOT EXISTS (
        SELECT 1 FROM public.gauge_profiles s
        WHERE s.gauge_address = t.from_gauge_address
          AND s.updated_at >= t.transferred_at - interval '5 minutes'
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.gauge_profiles d
        WHERE d.gauge_address = t.to_gauge_address
          AND d.updated_at >= t.transferred_at - interval '5 minutes'
      )
    )
  );

-- Without the unique index, duplicate claims may exist; keep the first.
DELETE FROM public.profile_transfers newer
USING public.profile_transfers older
WHERE newer.from_gauge_address = older.from_gauge_address
  AND newer.epoch_start = older.epoch_start
  AND newer.id > older.id;

-- 20250121000001's one-transfer-per-wallet index was replaced by the
-- per-gauge one in 20250226000001. If it survived, a controller's second
-- gauge transfer in an epoch would 429.
DROP INDEX IF EXISTS public.idx_profile_transfers_unique_owner_epoch;

-- 20250226000001 created this index; recreate it if the live database lost
-- it, since the claim is only atomic with it in place.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_transfers_unique_gauge_epoch
  ON public.profile_transfers(from_gauge_address, epoch_start);

COMMENT ON TABLE public.gauge_profile_transfer_nonces IS
  'Single-use nonces for signed gauge profile transfers; written only by transfer-gauge-profile.';
