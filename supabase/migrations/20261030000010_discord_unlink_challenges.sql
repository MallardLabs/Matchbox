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
-- Anyone can ask for a challenge or try a link token, so both are capped:
-- a link token is expired after 5 failed Discord sign-in checks (each one is a
-- call to Discord), a wallet holds at most 3 open challenges, and a challenge
-- is spent after 5 signature attempts.
--
-- Apply before deploying the discord-link function that reads it.
--
-- Rollback (manual):
--   DROP FUNCTION IF EXISTS public.issue_discord_unlink_challenge(
--     TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
--   );
--   DROP FUNCTION IF EXISTS public.claim_discord_unlink_attempt(TEXT, TEXT);
--   DROP FUNCTION IF EXISTS public.claim_discord_link_auth_check(TEXT);
--   DROP FUNCTION IF EXISTS public.settle_discord_link_auth_check(TEXT, BOOLEAN);
--   ALTER TABLE public.discord_link_tokens
--     DROP COLUMN IF EXISTS discord_auth_failures;
--   DROP TABLE IF EXISTS public.discord_unlink_challenges;

CREATE TABLE IF NOT EXISTS public.discord_unlink_challenges (
  nonce_hash TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  -- Signatures tried against this challenge.
  attempts INTEGER NOT NULL DEFAULT 0,
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

ALTER TABLE public.discord_unlink_challenges
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_discord_unlink_challenges_expires
  ON public.discord_unlink_challenges(expires_at);
CREATE INDEX IF NOT EXISTS idx_discord_unlink_challenges_wallet
  ON public.discord_unlink_challenges(wallet_address, issued_at);

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

-- Stores a new challenge, after clearing expired ones and the wallet's oldest
-- open ones beyond the newest 2, so a wallet never holds more than 3.
CREATE OR REPLACE FUNCTION public.issue_discord_unlink_challenge(
  p_nonce_hash TEXT,
  p_wallet_address TEXT,
  p_discord_user_id TEXT,
  p_issued_at TIMESTAMPTZ,
  p_expires_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- One issuance per wallet at a time, so concurrent requests can't overshoot.
  PERFORM pg_advisory_xact_lock(
    hashtext('discord_unlink_challenges'),
    hashtext(p_wallet_address)
  );
  DELETE FROM public.discord_unlink_challenges
  WHERE expires_at < p_issued_at;
  DELETE FROM public.discord_unlink_challenges
  WHERE nonce_hash IN (
    SELECT nonce_hash
    FROM public.discord_unlink_challenges
    WHERE wallet_address = p_wallet_address
      AND consumed_at IS NULL
    ORDER BY issued_at DESC, nonce_hash
    OFFSET 2
  );
  INSERT INTO public.discord_unlink_challenges (
    nonce_hash,
    wallet_address,
    discord_user_id,
    issued_at,
    expires_at
  )
  VALUES (
    p_nonce_hash,
    p_wallet_address,
    p_discord_user_id,
    p_issued_at,
    p_expires_at
  );
END;
$$;

-- Counts one signature attempt against an open challenge and returns it, or
-- nothing once it is consumed, expired or has had 5 attempts.
CREATE OR REPLACE FUNCTION public.claim_discord_unlink_attempt(
  p_nonce_hash TEXT,
  p_wallet_address TEXT
)
RETURNS TABLE (
  discord_user_id TEXT,
  issued_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.discord_unlink_challenges AS c
  SET attempts = c.attempts + 1
  WHERE c.nonce_hash = p_nonce_hash
    AND c.wallet_address = p_wallet_address
    AND c.consumed_at IS NULL
    AND c.expires_at > NOW()
    AND c.attempts < 5
  RETURNING c.discord_user_id, c.issued_at, c.expires_at
$$;

REVOKE ALL ON FUNCTION public.issue_discord_unlink_challenge(
  TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_discord_unlink_attempt(TEXT, TEXT)
  FROM PUBLIC;

DO $$
DECLARE
  client_role TEXT;
  function_signature TEXT;
  function_signatures TEXT[] := ARRAY[
    'public.issue_discord_unlink_challenge(TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)',
    'public.claim_discord_unlink_attempt(TEXT, TEXT)'
  ];
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      FOREACH function_signature IN ARRAY function_signatures LOOP
        EXECUTE format(
          'REVOKE ALL ON FUNCTION %s FROM %I',
          function_signature,
          client_role
        );
      END LOOP;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    FOREACH function_signature IN ARRAY function_signatures LOOP
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO service_role',
        function_signature
      );
    END LOOP;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Link tokens: at most 5 failed Discord sign-in checks
-- ---------------------------------------------------------------------------

-- Checks that failed, plus any still in flight.
ALTER TABLE IF EXISTS public.discord_link_tokens
  ADD COLUMN IF NOT EXISTS discord_auth_failures INTEGER NOT NULL DEFAULT 0;

-- Reserves one Discord sign-in check on a usable link token before discord-link
-- calls Discord. Counting before the call keeps concurrent requests within the
-- cap too. Returns false once 5 checks have failed or are in flight.
CREATE OR REPLACE FUNCTION public.claim_discord_link_auth_check(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH claimed AS (
    UPDATE public.discord_link_tokens
    SET discord_auth_failures = discord_auth_failures + 1
    WHERE token = p_token
      AND status = 'pending'
      AND expires_at > NOW()
      AND discord_auth_failures < 5
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM claimed)
$$;

-- Settles a reserved check. A pass, or a check Discord couldn't answer, hands
-- it back; a failure keeps it, and the fifth expires the token.
CREATE OR REPLACE FUNCTION public.settle_discord_link_auth_check(
  p_token TEXT,
  p_passed BOOLEAN
)
RETURNS VOID
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.discord_link_tokens
  SET
    discord_auth_failures = CASE
      WHEN p_passed THEN GREATEST(discord_auth_failures - 1, 0)
      ELSE discord_auth_failures
    END,
    expires_at = CASE
      WHEN NOT p_passed AND discord_auth_failures >= 5
        THEN LEAST(expires_at, NOW())
      ELSE expires_at
    END
  WHERE token = p_token
    AND status = 'pending'
$$;

REVOKE ALL ON FUNCTION public.claim_discord_link_auth_check(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_discord_link_auth_check(TEXT, BOOLEAN)
  FROM PUBLIC;

DO $$
DECLARE
  client_role TEXT;
  function_signature TEXT;
  function_signatures TEXT[] := ARRAY[
    'public.claim_discord_link_auth_check(TEXT)',
    'public.settle_discord_link_auth_check(TEXT, BOOLEAN)'
  ];
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      FOREACH function_signature IN ARRAY function_signatures LOOP
        EXECUTE format(
          'REVOKE ALL ON FUNCTION %s FROM %I',
          function_signature,
          client_role
        );
      END LOOP;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    FOREACH function_signature IN ARRAY function_signatures LOOP
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO service_role',
        function_signature
      );
    END LOOP;
  END IF;
END $$;
