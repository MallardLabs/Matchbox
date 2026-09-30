-- Matchbox ID hardening (docs/developer-platform/ARCHITECTURE.md §4.1, §7).
--
-- 1. SIWE network binding: each session records the SIWE `chainId` and
--    whether the signer is an EOA (an ecrecover signature: valid on every
--    chain) or a contract / counterfactual account (ERC-1271 / ERC-6492:
--    verified against that chain's state only). Contract sessions may only
--    authorize environments on their own network. NULL on both columns means
--    a session created before this migration: treated as unverified.
-- 2. Refresh-token families: `mbx_id_token_families` is the family-level
--    revocation record. Issuance (first code redemption), rotation and
--    revocation all take the family row lock, so a concurrent code replay or
--    refresh-token reuse can never leave a successor token active.
-- 3. `mbx_id_purge_expired`: bounded deletion of expired rows (hourly cron in
--    the Matchbox ID Worker).
--
-- Every function is SECURITY INVOKER with a fixed search_path and is
-- executable by service_role only.
--
-- Additive only. Rollback (manual, single transaction):
--   DROP FUNCTION IF EXISTS public.mbx_id_purge_expired(TIMESTAMPTZ, INTEGER);
--   DROP FUNCTION IF EXISTS public.mbx_id_rotate_refresh_token(
--     TEXT, TEXT, UUID, TIMESTAMPTZ, TEXT[], TEXT, TIMESTAMPTZ, TIMESTAMPTZ);
--   DROP FUNCTION IF EXISTS public.mbx_id_issue_code_tokens(
--     UUID, UUID, UUID, TEXT, TEXT[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT,
--     TIMESTAMPTZ, TIMESTAMPTZ);
--   DROP FUNCTION IF EXISTS public.mbx_id_revoke_token_family(UUID, TIMESTAMPTZ);
--   DROP TABLE IF EXISTS public.mbx_id_token_families;
--   ALTER TABLE public.mbx_id_sessions
--     DROP CONSTRAINT IF EXISTS mbx_id_sessions_signer_consistency,
--     DROP CONSTRAINT IF EXISTS mbx_id_sessions_siwe_chain_id_positive,
--     DROP CONSTRAINT IF EXISTS mbx_id_sessions_signer_kind_valid,
--     DROP COLUMN IF EXISTS signer_kind,
--     DROP COLUMN IF EXISTS siwe_chain_id;

-- ---------------------------------------------------------------------------
-- 1. Session signer binding
-- ---------------------------------------------------------------------------

ALTER TABLE public.mbx_id_sessions
  ADD COLUMN IF NOT EXISTS siwe_chain_id BIGINT,
  ADD COLUMN IF NOT EXISTS signer_kind TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mbx_id_sessions_signer_kind_valid'
      AND conrelid = 'public.mbx_id_sessions'::REGCLASS
  ) THEN
    ALTER TABLE public.mbx_id_sessions
      ADD CONSTRAINT mbx_id_sessions_signer_kind_valid CHECK (
        signer_kind IS NULL OR signer_kind IN ('eoa', 'contract')
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mbx_id_sessions_siwe_chain_id_positive'
      AND conrelid = 'public.mbx_id_sessions'::REGCLASS
  ) THEN
    ALTER TABLE public.mbx_id_sessions
      ADD CONSTRAINT mbx_id_sessions_siwe_chain_id_positive CHECK (
        siwe_chain_id IS NULL OR siwe_chain_id > 0
      );
  END IF;
  -- Both recorded (new sessions) or neither (pre-migration sessions).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mbx_id_sessions_signer_consistency'
      AND conrelid = 'public.mbx_id_sessions'::REGCLASS
  ) THEN
    ALTER TABLE public.mbx_id_sessions
      ADD CONSTRAINT mbx_id_sessions_signer_consistency CHECK (
        (siwe_chain_id IS NULL) = (signer_kind IS NULL)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.mbx_id_sessions.siwe_chain_id IS
  'EIP-4361 chainId of the sign-in message. NULL for pre-binding sessions.';
COMMENT ON COLUMN public.mbx_id_sessions.signer_kind IS
  'eoa = ecrecover signature (valid on every chain); contract = ERC-1271/6492, verified on siwe_chain_id only.';

-- ---------------------------------------------------------------------------
-- 2. Refresh-token families
-- ---------------------------------------------------------------------------

-- One row per refresh family (= per first code redemption). A code replay
-- may create the row already revoked, before the first redemption issues.
CREATE TABLE IF NOT EXISTS public.mbx_id_token_families (
  family_id UUID PRIMARY KEY,
  grant_id UUID REFERENCES public.mbx_id_grants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mbx_id_token_families_grant
  ON public.mbx_id_token_families(grant_id)
  WHERE grant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mbx_id_token_families_created
  ON public.mbx_id_token_families(created_at);

-- Backfill families for refresh tokens issued before this migration. A
-- family whose tokens are all revoked is recorded as revoked.
INSERT INTO public.mbx_id_token_families (family_id, grant_id, created_at, revoked_at)
SELECT
  token.family_id,
  (array_agg(token.grant_id ORDER BY token.created_at))[1],
  MIN(token.created_at),
  CASE WHEN bool_and(token.revoked_at IS NOT NULL) THEN MAX(token.revoked_at) END
FROM public.mbx_id_refresh_tokens AS token
GROUP BY token.family_id
ON CONFLICT (family_id) DO NOTHING;

ALTER TABLE public.mbx_id_token_families ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.mbx_id_token_families IS
  'Matchbox ID refresh-token families. revoked_at set = no token may be issued or rotated in the family.';

-- Marks the family revoked (creating the row when a code replay beats the
-- first redemption) and revokes its refresh and access tokens. Access-token
-- jtis start with the family id as 32 lower-case hex characters.
CREATE OR REPLACE FUNCTION public.mbx_id_revoke_token_family(
  p_family_id UUID,
  p_now TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.mbx_id_token_families AS family (family_id, created_at, revoked_at)
  VALUES (p_family_id, p_now, p_now)
  ON CONFLICT (family_id) DO UPDATE
    SET revoked_at = COALESCE(family.revoked_at, EXCLUDED.revoked_at);

  UPDATE public.mbx_id_refresh_tokens AS token
  SET revoked_at = p_now
  WHERE token.family_id = p_family_id
    AND token.revoked_at IS NULL;

  UPDATE public.mbx_id_access_tokens AS token
  SET revoked_at = p_now
  WHERE token.jti LIKE replace(p_family_id::TEXT, '-', '') || '%'
    AND token.revoked_at IS NULL;
END;
$$;

-- First redemption of an authorization code: creates the family and issues
-- its first refresh + access token, unless the family was already revoked
-- (a concurrent replay) or the grant is gone. Returns 'issued',
-- 'family-revoked' or 'grant-revoked'.
CREATE OR REPLACE FUNCTION public.mbx_id_issue_code_tokens(
  p_family_id UUID,
  p_grant_id UUID,
  p_refresh_token_id UUID,
  p_refresh_token_hash TEXT,
  p_scopes TEXT[],
  p_auth_time TIMESTAMPTZ,
  p_refresh_expires_at TIMESTAMPTZ,
  p_access_jti TEXT,
  p_access_expires_at TIMESTAMPTZ,
  p_now TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  family_revoked_at TIMESTAMPTZ;
  grant_revoked_at TIMESTAMPTZ;
BEGIN
  IF left(p_access_jti, 32) <> replace(p_family_id::TEXT, '-', '') THEN
    RAISE EXCEPTION 'access token jti is not in the family'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.mbx_id_token_families (family_id, grant_id, created_at)
  VALUES (p_family_id, p_grant_id, p_now)
  ON CONFLICT (family_id) DO NOTHING;

  SELECT family.revoked_at INTO family_revoked_at
  FROM public.mbx_id_token_families AS family
  WHERE family.family_id = p_family_id
  FOR UPDATE;
  IF family_revoked_at IS NOT NULL THEN
    RETURN 'family-revoked';
  END IF;

  -- FOR SHARE: a concurrent grant revocation waits for this issuance, then
  -- revokes the tokens it created.
  SELECT grant_row.revoked_at INTO grant_revoked_at
  FROM public.mbx_id_grants AS grant_row
  WHERE grant_row.id = p_grant_id
  FOR SHARE;
  IF NOT FOUND OR grant_revoked_at IS NOT NULL THEN
    RETURN 'grant-revoked';
  END IF;

  INSERT INTO public.mbx_id_refresh_tokens (
    id, token_hash, grant_id, family_id, parent_id, scopes, auth_time,
    expires_at, created_at
  )
  VALUES (
    p_refresh_token_id, p_refresh_token_hash, p_grant_id, p_family_id, NULL,
    p_scopes, p_auth_time, p_refresh_expires_at, p_now
  );

  INSERT INTO public.mbx_id_access_tokens (jti, grant_id, expires_at, created_at)
  VALUES (p_access_jti, p_grant_id, p_access_expires_at, p_now);

  RETURN 'issued';
END;
$$;

-- Refresh-token rotation, atomic under the family lock. Returns JSONB
-- { status, familyId?, tokenId? } where status is:
--   'rotated' — old token marked rotated; successor refresh + access token
--               inserted (successor keeps the old token's grant and auth_time).
--   'reused'  — the old token was already rotated: the family is revoked.
--   'invalid' — unknown, revoked, expired, family/grant revoked, scopes
--               wider than the old token, or a jti outside the family.
CREATE OR REPLACE FUNCTION public.mbx_id_rotate_refresh_token(
  p_old_hash TEXT,
  p_new_hash TEXT,
  p_new_id UUID,
  p_expires_at TIMESTAMPTZ,
  p_scopes TEXT[],
  p_access_jti TEXT,
  p_access_expires_at TIMESTAMPTZ,
  p_now TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  old_token public.mbx_id_refresh_tokens%ROWTYPE;
  family_revoked_at TIMESTAMPTZ;
  grant_revoked_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO old_token
  FROM public.mbx_id_refresh_tokens AS token
  WHERE token.token_hash = p_old_hash;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  -- Pre-migration families have a backfilled row; create one defensively.
  INSERT INTO public.mbx_id_token_families (family_id, grant_id, created_at)
  VALUES (old_token.family_id, old_token.grant_id, old_token.created_at)
  ON CONFLICT (family_id) DO NOTHING;

  SELECT family.revoked_at INTO family_revoked_at
  FROM public.mbx_id_token_families AS family
  WHERE family.family_id = old_token.family_id
  FOR UPDATE;

  -- Re-read under the family lock: a concurrent rotation has committed.
  SELECT * INTO old_token
  FROM public.mbx_id_refresh_tokens AS token
  WHERE token.id = old_token.id
  FOR UPDATE;

  IF family_revoked_at IS NOT NULL OR old_token.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'invalid',
      'familyId', old_token.family_id
    );
  END IF;

  IF old_token.rotated_at IS NOT NULL THEN
    PERFORM public.mbx_id_revoke_token_family(old_token.family_id, p_now);
    RETURN jsonb_build_object(
      'status', 'reused',
      'familyId', old_token.family_id
    );
  END IF;

  IF old_token.expires_at <= p_now
    OR NOT (p_scopes <@ old_token.scopes)
    OR left(p_access_jti, 32) <> replace(old_token.family_id::TEXT, '-', '')
  THEN
    RETURN jsonb_build_object(
      'status', 'invalid',
      'familyId', old_token.family_id
    );
  END IF;

  SELECT grant_row.revoked_at INTO grant_revoked_at
  FROM public.mbx_id_grants AS grant_row
  WHERE grant_row.id = old_token.grant_id
  FOR SHARE;
  IF NOT FOUND OR grant_revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'invalid',
      'familyId', old_token.family_id
    );
  END IF;

  UPDATE public.mbx_id_refresh_tokens AS token
  SET rotated_at = p_now
  WHERE token.id = old_token.id;

  INSERT INTO public.mbx_id_refresh_tokens (
    id, token_hash, grant_id, family_id, parent_id, scopes, auth_time,
    expires_at, created_at
  )
  VALUES (
    p_new_id, p_new_hash, old_token.grant_id, old_token.family_id,
    old_token.id, p_scopes, old_token.auth_time, p_expires_at, p_now
  );

  INSERT INTO public.mbx_id_access_tokens (jti, grant_id, expires_at, created_at)
  VALUES (p_access_jti, old_token.grant_id, p_access_expires_at, p_now);

  RETURN jsonb_build_object(
    'status', 'rotated',
    'familyId', old_token.family_id,
    'tokenId', p_new_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Expired-row cleanup
-- ---------------------------------------------------------------------------

-- Deletes at most p_batch_size (1..5000) rows per table and returns the
-- counts; the Worker cron calls it until a pass deletes fewer than a batch.
-- Codes are kept a day past expiry so replays are still detected; families
-- go once they are two days old and no refresh token references them.
CREATE OR REPLACE FUNCTION public.mbx_id_purge_expired(
  p_now TIMESTAMPTZ,
  p_batch_size INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  batch INTEGER := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
  nonces INTEGER;
  requests INTEGER;
  codes INTEGER;
  access_tokens INTEGER;
  refresh_tokens INTEGER;
  families INTEGER;
BEGIN
  DELETE FROM public.mbx_id_siwe_nonces
  WHERE nonce IN (
    SELECT expired.nonce FROM public.mbx_id_siwe_nonces AS expired
    WHERE expired.expires_at < p_now - INTERVAL '1 hour'
    ORDER BY expired.expires_at
    LIMIT batch
  );
  GET DIAGNOSTICS nonces = ROW_COUNT;

  DELETE FROM public.mbx_id_authorization_requests
  WHERE id IN (
    SELECT expired.id FROM public.mbx_id_authorization_requests AS expired
    WHERE expired.expires_at < p_now - INTERVAL '1 hour'
    ORDER BY expired.expires_at
    LIMIT batch
  );
  GET DIAGNOSTICS requests = ROW_COUNT;

  DELETE FROM public.mbx_id_authorization_codes
  WHERE code_hash IN (
    SELECT expired.code_hash FROM public.mbx_id_authorization_codes AS expired
    WHERE expired.expires_at < p_now - INTERVAL '1 day'
    ORDER BY expired.expires_at
    LIMIT batch
  );
  GET DIAGNOSTICS codes = ROW_COUNT;

  DELETE FROM public.mbx_id_access_tokens
  WHERE jti IN (
    SELECT expired.jti FROM public.mbx_id_access_tokens AS expired
    WHERE expired.expires_at < p_now - INTERVAL '1 day'
    ORDER BY expired.expires_at
    LIMIT batch
  );
  GET DIAGNOSTICS access_tokens = ROW_COUNT;

  DELETE FROM public.mbx_id_refresh_tokens
  WHERE id IN (
    SELECT expired.id FROM public.mbx_id_refresh_tokens AS expired
    WHERE expired.expires_at < p_now - INTERVAL '1 day'
    ORDER BY expired.expires_at
    LIMIT batch
  );
  GET DIAGNOSTICS refresh_tokens = ROW_COUNT;

  DELETE FROM public.mbx_id_token_families
  WHERE family_id IN (
    SELECT family.family_id FROM public.mbx_id_token_families AS family
    WHERE family.created_at < p_now - INTERVAL '2 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.mbx_id_refresh_tokens AS token
        WHERE token.family_id = family.family_id
      )
    ORDER BY family.created_at
    LIMIT batch
  );
  GET DIAGNOSTICS families = ROW_COUNT;

  RETURN jsonb_build_object(
    'siweNonces', nonces,
    'authorizationRequests', requests,
    'authorizationCodes', codes,
    'accessTokens', access_tokens,
    'refreshTokens', refresh_tokens,
    'tokenFamilies', families
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: service_role only
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.mbx_id_revoke_token_family(UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mbx_id_issue_code_tokens(
  UUID, UUID, UUID, TEXT, TEXT[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TIMESTAMPTZ,
  TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mbx_id_rotate_refresh_token(
  TEXT, TEXT, UUID, TIMESTAMPTZ, TEXT[], TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mbx_id_purge_expired(TIMESTAMPTZ, INTEGER) FROM PUBLIC;

DO $$
DECLARE
  client_role TEXT;
  function_signature TEXT;
  function_signatures TEXT[] := ARRAY[
    'public.mbx_id_revoke_token_family(UUID, TIMESTAMPTZ)',
    'public.mbx_id_issue_code_tokens(UUID, UUID, UUID, TEXT, TEXT[], TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)',
    'public.mbx_id_rotate_refresh_token(TEXT, TEXT, UUID, TIMESTAMPTZ, TEXT[], TEXT, TIMESTAMPTZ, TIMESTAMPTZ)',
    'public.mbx_id_purge_expired(TIMESTAMPTZ, INTEGER)'
  ];
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('REVOKE ALL ON public.mbx_id_token_families FROM %I', client_role);
      FOREACH function_signature IN ARRAY function_signatures LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', function_signature, client_role);
      END LOOP;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.mbx_id_token_families TO service_role;
    FOREACH function_signature IN ARRAY function_signatures LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', function_signature);
    END LOOP;
  END IF;
END $$;
