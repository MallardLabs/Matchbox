-- Developer console: transactional helpers and recovery step-up block
-- (docs/developer-platform/ARCHITECTURE.md §4.2, §8).
--
-- Additive only. The developer-console Worker calls these functions through
-- PostgREST (`supabase.rpc`) with the service role:
--   * mbx_dev_create_organization      organization + owner membership
--   * mbx_dev_replace_redirect_uris    replace an environment's redirect URIs
--   * mbx_dev_replace_origins          replace an environment's origins
--   * mbx_dev_revoke_environment_tokens revoke Matchbox ID tokens of one
--                                      environment and force re-consent
-- Each runs in a single transaction (one function call), SECURITY INVOKER,
-- with a pinned search_path, and is executable only by service_role.
--
-- mbx_dev_passkeys.step_up_blocked_until: a passkey registered through email
-- recovery cannot step up a session (or yield a stepped-up sign-in) before
-- this time. NULL = no restriction.
--
-- Rollback (manual):
--   DROP FUNCTION IF EXISTS public.mbx_dev_revoke_environment_tokens(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.mbx_dev_replace_origins(UUID, TEXT[]);
--   DROP FUNCTION IF EXISTS public.mbx_dev_replace_redirect_uris(UUID, TEXT[]);
--   DROP FUNCTION IF EXISTS public.mbx_dev_create_organization(TEXT, TEXT, UUID);
--   ALTER TABLE public.mbx_dev_passkeys DROP COLUMN IF EXISTS step_up_blocked_until;

-- ---------------------------------------------------------------------------
-- Recovery passkeys: step-up block
-- ---------------------------------------------------------------------------

ALTER TABLE public.mbx_dev_passkeys
  ADD COLUMN IF NOT EXISTS step_up_blocked_until TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- Organization + owner membership
-- ---------------------------------------------------------------------------

-- Unique-slug races surface as SQLSTATE 23505 (the Worker answers 409).
CREATE OR REPLACE FUNCTION public.mbx_dev_create_organization(
  p_name TEXT,
  p_slug TEXT,
  p_owner_account_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_organization_id UUID;
BEGIN
  INSERT INTO public.mbx_dev_organizations (name, slug)
  VALUES (p_name, p_slug)
  RETURNING id INTO v_organization_id;

  INSERT INTO public.mbx_dev_memberships (organization_id, account_id, role)
  VALUES (v_organization_id, p_owner_account_id, 'owner');

  RETURN v_organization_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Redirect URIs and origins (replace the whole set)
-- ---------------------------------------------------------------------------

-- Existing rows keep their created_at (list order); new rows are appended in
-- array order. The environment row is locked so concurrent replacements
-- serialize. Format and live-https rules stay enforced by the table CHECKs
-- and the mbx_dev_check_environment_url trigger.
CREATE OR REPLACE FUNCTION public.mbx_dev_replace_redirect_uris(
  p_environment_id UUID,
  p_uris TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM 1
  FROM public.mbx_dev_environments AS environment
  WHERE environment.id = p_environment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'environment % not found', p_environment_id
      USING ERRCODE = 'no_data_found';
  END IF;

  DELETE FROM public.mbx_dev_redirect_uris AS redirect
  WHERE redirect.environment_id = p_environment_id
    AND NOT (redirect.uri = ANY (COALESCE(p_uris, '{}'::TEXT[])));

  INSERT INTO public.mbx_dev_redirect_uris (environment_id, uri, created_at)
  SELECT
    p_environment_id,
    requested.uri,
    clock_timestamp() + requested.position * INTERVAL '1 microsecond'
  FROM unnest(COALESCE(p_uris, '{}'::TEXT[]))
    WITH ORDINALITY AS requested(uri, position)
  ON CONFLICT (environment_id, uri) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.mbx_dev_replace_origins(
  p_environment_id UUID,
  p_origins TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM 1
  FROM public.mbx_dev_environments AS environment
  WHERE environment.id = p_environment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'environment % not found', p_environment_id
      USING ERRCODE = 'no_data_found';
  END IF;

  DELETE FROM public.mbx_dev_origins AS allowed
  WHERE allowed.environment_id = p_environment_id
    AND NOT (allowed.origin = ANY (COALESCE(p_origins, '{}'::TEXT[])));

  INSERT INTO public.mbx_dev_origins (environment_id, origin, created_at)
  SELECT
    p_environment_id,
    requested.origin,
    clock_timestamp() + requested.position * INTERVAL '1 microsecond'
  FROM unnest(COALESCE(p_origins, '{}'::TEXT[]))
    WITH ORDINALITY AS requested(origin, position)
  ON CONFLICT (environment_id, origin) DO NOTHING;
END;
$$;

-- ---------------------------------------------------------------------------
-- Environment-wide Matchbox ID token revocation
-- ---------------------------------------------------------------------------

-- Used when an environment's client flips confidential -> public: revokes
-- every refresh-token family with an active member and every unexpired
-- access token issued under the environment's grants, bumps the
-- environment's scope_version (grants below it no longer cover the approved
-- scopes, so users must re-consent), and writes a `system` audit event.
-- Grants themselves are kept. Returns
-- {refreshTokenFamiliesRevoked, accessTokensRevoked, scopeVersion}.
CREATE OR REPLACE FUNCTION public.mbx_dev_revoke_environment_tokens(
  p_environment_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_app_id UUID;
  v_organization_id UUID;
  v_scope_version INTEGER;
  v_families INTEGER;
  v_access_tokens INTEGER;
  v_result JSONB;
BEGIN
  IF p_reason IS NULL
    OR char_length(p_reason) > 64
    OR p_reason !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  THEN
    RAISE EXCEPTION 'invalid revocation reason'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.mbx_dev_environments AS environment
  SET scope_version = environment.scope_version + 1
  WHERE environment.id = p_environment_id
  RETURNING environment.app_id, environment.scope_version
  INTO v_app_id, v_scope_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'environment % not found', p_environment_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT app.organization_id INTO v_organization_id
  FROM public.mbx_dev_apps AS app
  WHERE app.id = v_app_id;

  WITH active_families AS (
    SELECT DISTINCT token.family_id
    FROM public.mbx_id_refresh_tokens AS token
    JOIN public.mbx_id_grants AS grant_row ON grant_row.id = token.grant_id
    WHERE grant_row.environment_id = p_environment_id
      AND token.revoked_at IS NULL
      AND token.expires_at > NOW()
  ),
  revoked AS (
    UPDATE public.mbx_id_refresh_tokens AS token
    SET revoked_at = NOW()
    WHERE token.family_id IN (SELECT active_families.family_id FROM active_families)
      AND token.revoked_at IS NULL
    RETURNING token.family_id
  )
  SELECT count(DISTINCT revoked.family_id) INTO v_families FROM revoked;

  WITH revoked AS (
    UPDATE public.mbx_id_access_tokens AS token
    SET revoked_at = NOW()
    FROM public.mbx_id_grants AS grant_row
    WHERE grant_row.id = token.grant_id
      AND grant_row.environment_id = p_environment_id
      AND token.revoked_at IS NULL
      AND token.expires_at > NOW()
    RETURNING token.jti
  )
  SELECT count(*) INTO v_access_tokens FROM revoked;

  v_result = jsonb_build_object(
    'refreshTokenFamiliesRevoked', v_families,
    'accessTokensRevoked', v_access_tokens,
    'scopeVersion', v_scope_version
  );

  INSERT INTO public.mbx_platform_audit_events (
    actor_type,
    actor_id,
    organization_id,
    app_id,
    environment_id,
    action,
    target_type,
    target_id,
    metadata
  )
  VALUES (
    'system',
    NULL,
    v_organization_id,
    v_app_id,
    p_environment_id,
    'oauth-tokens-revoked',
    'environment',
    p_environment_id::TEXT,
    v_result || jsonb_build_object('reason', p_reason)
  );

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: service_role only
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  function_signature TEXT;
  function_signatures TEXT[] := ARRAY[
    'public.mbx_dev_create_organization(TEXT, TEXT, UUID)',
    'public.mbx_dev_replace_redirect_uris(UUID, TEXT[])',
    'public.mbx_dev_replace_origins(UUID, TEXT[])',
    'public.mbx_dev_revoke_environment_tokens(UUID, TEXT)'
  ];
  client_role TEXT;
BEGIN
  FOREACH function_signature IN ARRAY function_signatures LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', function_signature);
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
        EXECUTE format(
          'REVOKE EXECUTE ON FUNCTION %s FROM %I',
          function_signature,
          client_role
        );
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO service_role',
        function_signature
      );
    END IF;
  END LOOP;
END $$;

COMMENT ON COLUMN public.mbx_dev_passkeys.step_up_blocked_until IS
  'Passkeys registered through email recovery cannot step up before this time (24 h). NULL = no restriction.';
