-- Matchbox Developer Platform: organizations, applications, API credentials,
-- wallet-scoped consent grants, authorization codes, usage, and audit history.
-- All secret-bearing tables are service-role only. Portal access is mediated by
-- server routes and the public API Worker.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.developer_accounts (
  auth_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.developer_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.developer_organization_memberships (
  organization_id UUID NOT NULL REFERENCES public.developer_organizations(id) ON DELETE CASCADE,
  auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'developer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, auth_user_id)
);

CREATE TABLE IF NOT EXISTS public.developer_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.developer_organizations(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL UNIQUE DEFAULT ('mbx_app_' || encode(gen_random_bytes(18), 'hex')),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  purpose TEXT NOT NULL DEFAULT '' CHECK (char_length(purpose) <= 1000),
  logo_url TEXT,
  website_url TEXT,
  privacy_policy_url TEXT,
  terms_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending-review', 'approved', 'suspended')),
  requested_scopes TEXT[] NOT NULL DEFAULT ARRAY['gauges:read']::TEXT[],
  approved_scopes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  scope_version INTEGER NOT NULL DEFAULT 1 CHECK (scope_version > 0),
  gauge_requests_per_minute INTEGER NOT NULL DEFAULT 120 CHECK (gauge_requests_per_minute > 0),
  gauge_requests_per_day INTEGER NOT NULL DEFAULT 10000 CHECK (gauge_requests_per_day > 0),
  profile_requests_per_minute INTEGER NOT NULL DEFAULT 60 CHECK (profile_requests_per_minute > 0),
  profile_requests_per_day INTEGER NOT NULL DEFAULT 2000 CHECK (profile_requests_per_day > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT developer_apps_requested_scopes_valid CHECK (
    requested_scopes <@ ARRAY['gauges:read', 'profile:read']::TEXT[]
  ),
  CONSTRAINT developer_apps_approved_scopes_valid CHECK (
    approved_scopes <@ ARRAY['gauges:read', 'profile:read']::TEXT[]
  )
);

CREATE INDEX IF NOT EXISTS idx_developer_apps_organization
  ON public.developer_apps(organization_id);
CREATE INDEX IF NOT EXISTS idx_developer_apps_status
  ON public.developer_apps(status);

CREATE TABLE IF NOT EXISTS public.developer_app_redirect_uris (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES public.developer_apps(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL CHECK (redirect_uri ~ '^https://'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (app_id, redirect_uri)
);

CREATE TABLE IF NOT EXISTS public.developer_app_origins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES public.developer_apps(id) ON DELETE CASCADE,
  origin TEXT NOT NULL CHECK (origin ~ '^https://[^/]+$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (app_id, origin)
);

CREATE TABLE IF NOT EXISTS public.developer_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES public.developer_apps(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  key_type TEXT NOT NULL CHECK (key_type IN ('publishable', 'secret')),
  key_prefix TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL,
  scopes TEXT[] NOT NULL,
  allowed_cidrs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT developer_api_keys_scopes_valid CHECK (
    scopes <@ ARRAY['gauges:read', 'profile:read']::TEXT[]
  ),
  CONSTRAINT developer_publishable_key_scope CHECK (
    key_type = 'secret' OR scopes <@ ARRAY['gauges:read']::TEXT[]
  )
);

CREATE INDEX IF NOT EXISTS idx_developer_api_keys_app
  ON public.developer_api_keys(app_id);

CREATE TABLE IF NOT EXISTS public.developer_app_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES public.developer_apps(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL REFERENCES public.discord_wallet_links(wallet_address)
    ON DELETE CASCADE,
  scopes TEXT[] NOT NULL,
  scope_version INTEGER NOT NULL CHECK (scope_version > 0),
  consent_snapshot JSONB NOT NULL,
  authorized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  UNIQUE (app_id, wallet_address),
  CONSTRAINT developer_app_grants_scopes_valid CHECK (
    scopes <@ ARRAY['profile:read']::TEXT[]
  )
);

CREATE INDEX IF NOT EXISTS idx_developer_app_grants_wallet
  ON public.developer_app_grants(wallet_address);
CREATE INDEX IF NOT EXISTS idx_developer_app_grants_active
  ON public.developer_app_grants(app_id, wallet_address)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.developer_authorization_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT NOT NULL UNIQUE,
  app_id UUID NOT NULL REFERENCES public.developer_apps(id) ON DELETE CASCADE,
  grant_id UUID NOT NULL REFERENCES public.developer_app_grants(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL REFERENCES public.discord_wallet_links(wallet_address)
    ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at <= created_at + INTERVAL '6 minutes')
);

CREATE INDEX IF NOT EXISTS idx_developer_authorization_codes_app
  ON public.developer_authorization_codes(app_id);
CREATE INDEX IF NOT EXISTS idx_developer_authorization_codes_expires
  ON public.developer_authorization_codes(expires_at);

CREATE TABLE IF NOT EXISTS public.developer_usage_daily (
  key_id UUID NOT NULL REFERENCES public.developer_api_keys(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  gauge_requests BIGINT NOT NULL DEFAULT 0 CHECK (gauge_requests >= 0),
  profile_requests BIGINT NOT NULL DEFAULT 0 CHECK (profile_requests >= 0),
  error_requests BIGINT NOT NULL DEFAULT 0 CHECK (error_requests >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (key_id, usage_date)
);

CREATE TABLE IF NOT EXISTS public.developer_audit_events (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  organization_id UUID REFERENCES public.developer_organizations(id) ON DELETE SET NULL,
  app_id UUID REFERENCES public.developer_apps(id) ON DELETE SET NULL,
  actor_auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_wallet_address TEXT,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_developer_audit_events_app_created
  ON public.developer_audit_events(app_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_developer_audit_events_org_created
  ON public.developer_audit_events(organization_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_developer_platform_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_developer_accounts_updated_at ON public.developer_accounts;
CREATE TRIGGER trigger_developer_accounts_updated_at
  BEFORE UPDATE ON public.developer_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_developer_platform_updated_at();

DROP TRIGGER IF EXISTS trigger_developer_organizations_updated_at ON public.developer_organizations;
CREATE TRIGGER trigger_developer_organizations_updated_at
  BEFORE UPDATE ON public.developer_organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_developer_platform_updated_at();

DROP TRIGGER IF EXISTS trigger_developer_apps_updated_at ON public.developer_apps;
CREATE TRIGGER trigger_developer_apps_updated_at
  BEFORE UPDATE ON public.developer_apps
  FOR EACH ROW EXECUTE FUNCTION public.update_developer_platform_updated_at();

CREATE OR REPLACE FUNCTION public.bump_developer_app_scope_version()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.approved_scopes IS DISTINCT FROM OLD.approved_scopes THEN
    NEW.scope_version = OLD.scope_version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_bump_developer_app_scope_version ON public.developer_apps;
CREATE TRIGGER trigger_bump_developer_app_scope_version
  BEFORE UPDATE OF approved_scopes ON public.developer_apps
  FOR EACH ROW EXECUTE FUNCTION public.bump_developer_app_scope_version();

-- A Discord account changing wallets must not carry old consent to the new wallet.
CREATE OR REPLACE FUNCTION public.revoke_developer_grants_on_wallet_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.wallet_address IS DISTINCT FROM OLD.wallet_address THEN
    INSERT INTO public.developer_audit_events(app_id, actor_wallet_address, action)
      SELECT app_id, OLD.wallet_address, 'app-grant-revoked-wallet-link-changed'
      FROM public.developer_app_grants
      WHERE wallet_address = OLD.wallet_address AND revoked_at IS NULL;
    DELETE FROM public.developer_app_grants
      WHERE wallet_address = OLD.wallet_address;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_revoke_developer_grants_on_wallet_change
  ON public.discord_wallet_links;
CREATE TRIGGER trigger_revoke_developer_grants_on_wallet_change
  BEFORE UPDATE OF wallet_address ON public.discord_wallet_links
  FOR EACH ROW EXECUTE FUNCTION public.revoke_developer_grants_on_wallet_change();

CREATE OR REPLACE FUNCTION public.is_developer_organization_member(organization UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.developer_organization_memberships membership
    WHERE membership.organization_id = organization
      AND membership.auth_user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_developer_organization_admin(organization UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.developer_organization_memberships membership
    WHERE membership.organization_id = organization
      AND membership.auth_user_id = auth.uid()
      AND membership.role IN ('owner', 'admin')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.bootstrap_developer_account(
  account_display_name TEXT,
  organization_name TEXT,
  organization_slug TEXT
)
RETURNS UUID AS $$
DECLARE
  current_user_id UUID := auth.uid();
  new_organization_id UUID;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  INSERT INTO public.developer_accounts(auth_user_id, display_name)
  VALUES (current_user_id, account_display_name)
  ON CONFLICT (auth_user_id) DO UPDATE SET display_name = EXCLUDED.display_name;

  SELECT membership.organization_id INTO new_organization_id
  FROM public.developer_organization_memberships membership
  WHERE membership.auth_user_id = current_user_id
  ORDER BY membership.created_at
  LIMIT 1;

  IF new_organization_id IS NULL THEN
    INSERT INTO public.developer_organizations(name, slug)
    VALUES (organization_name, organization_slug)
    RETURNING id INTO new_organization_id;

    INSERT INTO public.developer_organization_memberships(
      organization_id, auth_user_id, role
    ) VALUES (new_organization_id, current_user_id, 'owner');
  END IF;

  RETURN new_organization_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.bootstrap_developer_account(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_developer_account(TEXT, TEXT, TEXT) TO authenticated;

ALTER TABLE public.developer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_app_redirect_uris ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_app_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_app_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_authorization_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.developer_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Developers read own account" ON public.developer_accounts;
CREATE POLICY "Developers read own account" ON public.developer_accounts
  FOR SELECT TO authenticated USING (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS "Members read organizations" ON public.developer_organizations;
CREATE POLICY "Members read organizations" ON public.developer_organizations
  FOR SELECT TO authenticated USING (public.is_developer_organization_member(id));

DROP POLICY IF EXISTS "Members read memberships" ON public.developer_organization_memberships;
CREATE POLICY "Members read memberships" ON public.developer_organization_memberships
  FOR SELECT TO authenticated
  USING (public.is_developer_organization_member(organization_id));

DROP POLICY IF EXISTS "Members read applications" ON public.developer_apps;
CREATE POLICY "Members read applications" ON public.developer_apps
  FOR SELECT TO authenticated
  USING (public.is_developer_organization_member(organization_id));

DROP POLICY IF EXISTS "Admins create applications" ON public.developer_apps;
DROP POLICY IF EXISTS "Admins update applications" ON public.developer_apps;

-- Redirect/origin configuration may be read by organization members. Mutations
-- remain server-mediated so review-sensitive fields cannot bypass validation.
DROP POLICY IF EXISTS "Members read redirect URIs" ON public.developer_app_redirect_uris;
CREATE POLICY "Members read redirect URIs" ON public.developer_app_redirect_uris
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.developer_apps app
      WHERE app.id = app_id
        AND public.is_developer_organization_member(app.organization_id)
    )
  );

DROP POLICY IF EXISTS "Members read origins" ON public.developer_app_origins;
CREATE POLICY "Members read origins" ON public.developer_app_origins
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.developer_apps app
      WHERE app.id = app_id
        AND public.is_developer_organization_member(app.organization_id)
    )
  );

-- Keep API-key hashes, codes, grants, usage, and audit storage service-role only.
REVOKE ALL ON public.developer_api_keys FROM anon, authenticated;
REVOKE ALL ON public.developer_authorization_codes FROM anon, authenticated;
REVOKE ALL ON public.developer_app_grants FROM anon, authenticated;
REVOKE ALL ON public.developer_usage_daily FROM anon, authenticated;
REVOKE ALL ON public.developer_audit_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_developer_usage(
  api_key_id UUID,
  usage_bucket TEXT,
  was_error BOOLEAN DEFAULT false
)
RETURNS VOID AS $$
BEGIN
  IF usage_bucket NOT IN ('gauge', 'profile') THEN
    RAISE EXCEPTION 'invalid usage bucket';
  END IF;

  INSERT INTO public.developer_usage_daily(
    key_id,
    usage_date,
    gauge_requests,
    profile_requests,
    error_requests
  ) VALUES (
    api_key_id,
    CURRENT_DATE,
    CASE WHEN usage_bucket = 'gauge' THEN 1 ELSE 0 END,
    CASE WHEN usage_bucket = 'profile' THEN 1 ELSE 0 END,
    CASE WHEN was_error THEN 1 ELSE 0 END
  )
  ON CONFLICT (key_id, usage_date) DO UPDATE SET
    gauge_requests = developer_usage_daily.gauge_requests +
      CASE WHEN usage_bucket = 'gauge' THEN 1 ELSE 0 END,
    profile_requests = developer_usage_daily.profile_requests +
      CASE WHEN usage_bucket = 'profile' THEN 1 ELSE 0 END,
    error_requests = developer_usage_daily.error_requests +
      CASE WHEN was_error THEN 1 ELSE 0 END,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.increment_developer_usage(UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_developer_usage(UUID, TEXT, BOOLEAN)
  TO service_role;

-- Gauge profile integrity: all mutations now require a short-lived, signed
-- nonce and live veBTC ownership verification in upsert-gauge-profile.
CREATE TABLE IF NOT EXISTS public.gauge_profile_write_nonces (
  nonce_hash TEXT PRIMARY KEY,
  gauge_address TEXT NOT NULL,
  vebtc_token_id TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('upsert-profile', 'upload-avatar')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gauge_profile_write_nonces_expires
  ON public.gauge_profile_write_nonces(expires_at);

ALTER TABLE public.gauge_profile_write_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gauge_profile_write_nonces FROM anon, authenticated;

DROP POLICY IF EXISTS "Users can insert gauge profiles" ON public.gauge_profiles;
DROP POLICY IF EXISTS "Users can update gauge profiles" ON public.gauge_profiles;
DROP POLICY IF EXISTS "Anyone can upload gauge avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update gauge avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete gauge avatars" ON storage.objects;
