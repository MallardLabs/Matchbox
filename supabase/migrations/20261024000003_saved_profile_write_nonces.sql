-- Saved profile templates: single-use write nonces.
--
-- The `manage-saved-profile` edge function issues a nonce, the wallet signs a
-- message containing it, and the function consumes it before writing to
-- `saved_profiles` with the service role. Paired with
-- 20261024000004_lock_saved_profile_writes.sql, which removes anonymous
-- writes. Apply this one first: it only adds a table.
--
-- Rollback (manual):
--   DROP TABLE IF EXISTS public.saved_profile_write_nonces;

CREATE TABLE IF NOT EXISTS public.saved_profile_write_nonces (
  nonce_hash TEXT PRIMARY KEY,
  owner_address TEXT NOT NULL,
  action TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT saved_profile_write_nonces_hash_format CHECK (
    nonce_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT saved_profile_write_nonces_owner_format CHECK (
    owner_address ~ '^0x[0-9a-f]{40}$'
  ),
  CONSTRAINT saved_profile_write_nonces_action_valid CHECK (
    action IN ('save-template', 'delete-template')
  ),
  CONSTRAINT saved_profile_write_nonces_lifetime CHECK (
    expires_at <= created_at + INTERVAL '6 minutes'
  )
);

CREATE INDEX IF NOT EXISTS idx_saved_profile_write_nonces_expires
  ON public.saved_profile_write_nonces(expires_at);

ALTER TABLE public.saved_profile_write_nonces ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  client_role TEXT;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format(
        'REVOKE ALL ON public.saved_profile_write_nonces FROM %I',
        client_role
      );
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.saved_profile_write_nonces TO service_role;
  END IF;
END $$;
