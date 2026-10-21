-- Developer platform: optional consent scopes and re-consent counts
-- (docs/developer-platform/ARCHITECTURE.md §4.5).
--
-- 1. `mbx_dev_environments.optional_scopes`: requested OIDC scopes users may
--    decline at consent (toggles). Always a subset of `requested_scopes`;
--    `openid` and API key scopes can never be optional. The console must
--    write `requested_scopes` and `optional_scopes` in the same UPDATE when
--    a scope is removed (the subset CHECK is evaluated per row).
-- 2. `mbx_id_grants.declined_scopes`: optional scopes the user switched off,
--    disjoint from `scopes` (the granted subset that claims are released
--    for). Lets consent be skipped when every optional scope was decided.
-- 3. Partial index for "awaiting re-consent" (active grants whose
--    `scope_version` is below the environment's).
--
-- Additive only; both columns default to '{}' so existing rows and older
-- Workers keep working (all scopes required, nothing declined).
--
-- Rollback (manual, single transaction):
--   DROP INDEX IF EXISTS public.idx_mbx_id_grants_environment_active_version;
--   ALTER TABLE public.mbx_id_grants
--     DROP CONSTRAINT IF EXISTS mbx_id_grants_declined_disjoint,
--     DROP CONSTRAINT IF EXISTS mbx_id_grants_declined_scopes_valid,
--     DROP COLUMN IF EXISTS declined_scopes;
--   ALTER TABLE public.mbx_dev_environments
--     DROP CONSTRAINT IF EXISTS mbx_dev_environments_optional_subset,
--     DROP CONSTRAINT IF EXISTS mbx_dev_environments_optional_scopes_valid,
--     DROP COLUMN IF EXISTS optional_scopes;

-- ---------------------------------------------------------------------------
-- 1. Environment optional scopes
-- ---------------------------------------------------------------------------

ALTER TABLE public.mbx_dev_environments
  ADD COLUMN IF NOT EXISTS optional_scopes TEXT[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mbx_dev_environments_optional_scopes_valid'
      AND conrelid = 'public.mbx_dev_environments'::REGCLASS
  ) THEN
    ALTER TABLE public.mbx_dev_environments
      ADD CONSTRAINT mbx_dev_environments_optional_scopes_valid CHECK (
        optional_scopes <@ ARRAY['wallet', 'discord:id', 'discord:profile']::TEXT[]
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mbx_dev_environments_optional_subset'
      AND conrelid = 'public.mbx_dev_environments'::REGCLASS
  ) THEN
    ALTER TABLE public.mbx_dev_environments
      ADD CONSTRAINT mbx_dev_environments_optional_subset CHECK (
        optional_scopes <@ requested_scopes
      );
  END IF;
END $$;

COMMENT ON COLUMN public.mbx_dev_environments.optional_scopes IS
  'Requested OIDC scopes users may decline at consent; the rest are required.';

-- ---------------------------------------------------------------------------
-- 2. Declined scopes on grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.mbx_id_grants
  ADD COLUMN IF NOT EXISTS declined_scopes TEXT[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mbx_id_grants_declined_scopes_valid'
      AND conrelid = 'public.mbx_id_grants'::REGCLASS
  ) THEN
    ALTER TABLE public.mbx_id_grants
      ADD CONSTRAINT mbx_id_grants_declined_scopes_valid CHECK (
        declined_scopes <@ ARRAY['wallet', 'discord:id', 'discord:profile']::TEXT[]
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mbx_id_grants_declined_disjoint'
      AND conrelid = 'public.mbx_id_grants'::REGCLASS
  ) THEN
    ALTER TABLE public.mbx_id_grants
      ADD CONSTRAINT mbx_id_grants_declined_disjoint CHECK (
        NOT (declined_scopes && scopes)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.mbx_id_grants.declined_scopes IS
  'Optional scopes the user switched off at consent; disjoint from scopes.';

-- ---------------------------------------------------------------------------
-- 3. Re-consent count
-- ---------------------------------------------------------------------------

-- SELECT count(*), min(scope_version) FROM mbx_id_grants
-- WHERE environment_id = $1 AND revoked_at IS NULL AND scope_version < $2
CREATE INDEX IF NOT EXISTS idx_mbx_id_grants_environment_active_version
  ON public.mbx_id_grants(environment_id, scope_version)
  WHERE revoked_at IS NULL;
