-- Discord unlink: single-use challenges.
--
-- The `discord-link` edge function used to accept a signature over a fixed
-- unlink message, so one leaked signature could unlink a wallet after every
-- relink. It now issues a challenge bound to the wallet and the Discord account
-- linked at that moment, the wallet signs a message carrying its nonce and
-- expiry, and `unlink` consumes the challenge once before deleting that link.
--
-- Only the service role (edge functions) touches this table: RLS is on with no
-- policies and client grants are revoked, as for discord_link_tokens.
--
-- Apply before deploying the discord-link function that reads it.
--
-- Rollback (manual):
--   DROP TABLE IF EXISTS public.discord_unlink_challenges;

CREATE TABLE IF NOT EXISTS public.discord_unlink_challenges (
  nonce_hash TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT discord_unlink_challenges_hash_format CHECK (
    nonce_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT discord_unlink_challenges_wallet_format CHECK (
    wallet_address ~ '^0x[0-9a-f]{40}$'
  ),
  CONSTRAINT discord_unlink_challenges_lifetime CHECK (
    expires_at > issued_at AND expires_at <= issued_at + INTERVAL '6 minutes'
  )
);

CREATE INDEX IF NOT EXISTS idx_discord_unlink_challenges_expires
  ON public.discord_unlink_challenges(expires_at);

ALTER TABLE public.discord_unlink_challenges ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  client_role TEXT;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format(
        'REVOKE ALL ON public.discord_unlink_challenges FROM %I',
        client_role
      );
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.discord_unlink_challenges TO service_role;
  END IF;
END $$;
