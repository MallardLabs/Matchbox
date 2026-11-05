-- Matchbox ID: `discord:membership` scope (claim `discord_joined_at`).
--
-- 1. `discord_wallet_links.discord_joined_at`: when the linked member joined
--    the guild in `guild_id`, read from Discord's guild member `joined_at`.
--    Written by the discord-link verify, by /matchbox runs inside the guild,
--    and backfilled by discord-reconcile-roles. Writing it alone does not
--    fire `mbx_id_invalidate_discord_grants` (UPDATE OF wallet_address,
--    discord_user_id) or `trigger_revoke_developer_grants_on_wallet_change`
--    (UPDATE OF wallet_address); it does bump `updated_at`.
-- 2. Every scope-list CHECK accepts 'discord:membership'. Each expression is
--    otherwise unchanged. The v1 developer_* tables never listed discord:*
--    scopes and are left alone.
--
-- Idempotent and transaction-safe: hand-apply with
-- `supabase db query --linked -f` inside BEGIN/COMMIT.
--
-- Rollback (manual, single transaction; fails while any row holds the scope):
--   re-add each constraint below with 'discord:membership' removed, then
--   ALTER TABLE public.discord_wallet_links DROP COLUMN IF EXISTS discord_joined_at;

-- ---------------------------------------------------------------------------
-- 1. Guild join time on Discord links
-- ---------------------------------------------------------------------------

ALTER TABLE public.discord_wallet_links
  ADD COLUMN IF NOT EXISTS discord_joined_at TIMESTAMPTZ;

COMMENT ON COLUMN public.discord_wallet_links.discord_joined_at IS
  'When the member joined the guild in guild_id (Discord guild member joined_at); null until read or after the member left.';

-- ---------------------------------------------------------------------------
-- 2. Scope-list CHECK constraints
-- ---------------------------------------------------------------------------

ALTER TABLE public.mbx_dev_environments
  DROP CONSTRAINT IF EXISTS mbx_dev_environments_requested_scopes_valid,
  ADD CONSTRAINT mbx_dev_environments_requested_scopes_valid CHECK (
    requested_scopes <@ ARRAY['gauge-profiles:read', 'openid', 'wallet', 'discord:id', 'discord:profile', 'discord:membership']::TEXT[]
  ),
  DROP CONSTRAINT IF EXISTS mbx_dev_environments_approved_scopes_valid,
  ADD CONSTRAINT mbx_dev_environments_approved_scopes_valid CHECK (
    approved_scopes <@ ARRAY['gauge-profiles:read', 'openid', 'wallet', 'discord:id', 'discord:profile', 'discord:membership']::TEXT[]
  ),
  DROP CONSTRAINT IF EXISTS mbx_dev_environments_optional_scopes_valid,
  ADD CONSTRAINT mbx_dev_environments_optional_scopes_valid CHECK (
    optional_scopes <@ ARRAY['wallet', 'discord:id', 'discord:profile', 'discord:membership']::TEXT[]
  );

ALTER TABLE public.mbx_dev_reviews
  DROP CONSTRAINT IF EXISTS mbx_dev_reviews_requested_scopes_valid,
  ADD CONSTRAINT mbx_dev_reviews_requested_scopes_valid CHECK (
    requested_scopes <@ ARRAY['gauge-profiles:read', 'openid', 'wallet', 'discord:id', 'discord:profile', 'discord:membership']::TEXT[]
  );

ALTER TABLE public.mbx_id_grants
  DROP CONSTRAINT IF EXISTS mbx_id_grants_scopes_valid,
  ADD CONSTRAINT mbx_id_grants_scopes_valid CHECK (
    scopes <@ ARRAY['openid', 'wallet', 'discord:id', 'discord:profile', 'discord:membership']::TEXT[]
  ),
  DROP CONSTRAINT IF EXISTS mbx_id_grants_declined_scopes_valid,
  ADD CONSTRAINT mbx_id_grants_declined_scopes_valid CHECK (
    declined_scopes <@ ARRAY['wallet', 'discord:id', 'discord:profile', 'discord:membership']::TEXT[]
  );

ALTER TABLE public.mbx_id_authorization_requests
  DROP CONSTRAINT IF EXISTS mbx_id_authorization_requests_scopes_valid,
  ADD CONSTRAINT mbx_id_authorization_requests_scopes_valid CHECK (
    scopes <@ ARRAY['openid', 'wallet', 'discord:id', 'discord:profile', 'discord:membership']::TEXT[]
  );

ALTER TABLE public.mbx_id_authorization_codes
  DROP CONSTRAINT IF EXISTS mbx_id_authorization_codes_scopes_valid,
  ADD CONSTRAINT mbx_id_authorization_codes_scopes_valid CHECK (
    scopes <@ ARRAY['openid', 'wallet', 'discord:id', 'discord:profile', 'discord:membership']::TEXT[]
  );

ALTER TABLE public.mbx_id_refresh_tokens
  DROP CONSTRAINT IF EXISTS mbx_id_refresh_tokens_scopes_valid,
  ADD CONSTRAINT mbx_id_refresh_tokens_scopes_valid CHECK (
    scopes <@ ARRAY['openid', 'wallet', 'discord:id', 'discord:profile', 'discord:membership']::TEXT[]
  );
