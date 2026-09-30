-- Matchbox Developer Platform v2 (docs/developer-platform/ARCHITECTURE.md §4).
--
-- Matchbox ID (mbx_id_*), developer console (mbx_dev_*), the immutable
-- platform audit log, and the Gauge Profile API read model (mbx_api_*).
-- Additive only: no existing table is altered or dropped. The beta
-- developer_* tables stay untouched until a later cutover migration.
--
-- Access model: Workers use the service role only. Every new relation has RLS
-- enabled with NO anon/authenticated policies, and anon/authenticated
-- privileges are revoked. Secrets and tokens are stored only as
-- HMAC-SHA256(pepper, value) lower-case hex (`*_hash`). Addresses are
-- lower-case hex. Union-valued text columns use kebab-case CHECKs.
--
-- Rollback (manual, run in a single transaction; drops all v2 data):
--   DROP TRIGGER IF EXISTS mbx_id_invalidate_discord_grants ON public.discord_wallet_links;
--   DROP VIEW IF EXISTS public.mbx_api_gauge_profiles;
--   DROP TABLE IF EXISTS
--     public.mbx_api_gauge_chain_state,
--     public.mbx_platform_audit_events,
--     public.mbx_id_access_tokens,
--     public.mbx_id_refresh_tokens,
--     public.mbx_id_authorization_codes,
--     public.mbx_id_authorization_requests,
--     public.mbx_id_grants,
--     public.mbx_id_pairwise_subjects,
--     public.mbx_id_sessions,
--     public.mbx_id_siwe_nonces,
--     public.mbx_id_accounts,
--     public.mbx_dev_staff,
--     public.mbx_dev_quota_overrides,
--     public.mbx_dev_reviews,
--     public.mbx_dev_api_keys,
--     public.mbx_dev_client_secrets,
--     public.mbx_dev_origins,
--     public.mbx_dev_redirect_uris,
--     public.mbx_dev_environments,
--     public.mbx_dev_apps,
--     public.mbx_dev_invitations,
--     public.mbx_dev_memberships,
--     public.mbx_dev_organizations,
--     public.mbx_dev_sessions,
--     public.mbx_dev_webauthn_challenges,
--     public.mbx_dev_email_challenges,
--     public.mbx_dev_passkeys,
--     public.mbx_dev_accounts
--   CASCADE;
--   DROP FUNCTION IF EXISTS public.mbx_id_invalidate_discord_grants();
--   DROP FUNCTION IF EXISTS public.mbx_platform_audit_events_immutable();
--   DROP FUNCTION IF EXISTS public.mbx_dev_check_environment_url();
--   DROP FUNCTION IF EXISTS public.mbx_dev_default_sector_id();
--   DROP FUNCTION IF EXISTS public.mbx_platform_set_updated_at();

-- gen_random_uuid() is core since Postgres 13; no extension required.

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mbx_platform_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===========================================================================
-- 4.2 Developer console (mbx_dev_*)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.mbx_dev_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  email_verified_at TIMESTAMPTZ,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disabled_at TIMESTAMPTZ,
  CONSTRAINT mbx_dev_accounts_email_key UNIQUE (email),
  CONSTRAINT mbx_dev_accounts_email_format CHECK (
    email = lower(email)
    AND char_length(email) BETWEEN 3 AND 254
    AND email ~ '^[^@\s]+@[^@\s]+$'
  ),
  CONSTRAINT mbx_dev_accounts_display_name_length CHECK (
    char_length(display_name) BETWEEN 1 AND 80
  )
);

CREATE TABLE IF NOT EXISTS public.mbx_dev_passkeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.mbx_dev_accounts(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[] NOT NULL DEFAULT '{}',
  device_type TEXT NOT NULL,
  backed_up BOOLEAN NOT NULL DEFAULT false,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  CONSTRAINT mbx_dev_passkeys_credential_id_key UNIQUE (credential_id),
  CONSTRAINT mbx_dev_passkeys_credential_id_format CHECK (
    credential_id ~ '^[A-Za-z0-9_-]+$'
  ),
  CONSTRAINT mbx_dev_passkeys_public_key_format CHECK (
    public_key ~ '^[A-Za-z0-9_-]+$'
  ),
  CONSTRAINT mbx_dev_passkeys_counter_non_negative CHECK (counter >= 0),
  CONSTRAINT mbx_dev_passkeys_device_type_valid CHECK (
    device_type IN ('single-device', 'multi-device')
  ),
  CONSTRAINT mbx_dev_passkeys_transports_valid CHECK (
    transports <@ ARRAY['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb']::TEXT[]
  ),
  CONSTRAINT mbx_dev_passkeys_name_length CHECK (
    name IS NULL OR char_length(name) BETWEEN 1 AND 64
  )
);

CREATE INDEX IF NOT EXISTS idx_mbx_dev_passkeys_account
  ON public.mbx_dev_passkeys(account_id);

CREATE TABLE IF NOT EXISTS public.mbx_dev_email_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mbx_dev_email_challenges_email_lower CHECK (email = lower(email)),
  CONSTRAINT mbx_dev_email_challenges_purpose_valid CHECK (
    purpose IN ('sign-up', 'recovery', 'invitation')
  ),
  CONSTRAINT mbx_dev_email_challenges_code_hash_format CHECK (
    code_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT mbx_dev_email_challenges_attempts_range CHECK (
    attempts BETWEEN 0 AND 10
  ),
  -- 15 min lifetime plus one minute of Worker/DB clock slack.
  CONSTRAINT mbx_dev_email_challenges_lifetime CHECK (
    expires_at <= created_at + INTERVAL '16 minutes'
  )
);

CREATE INDEX IF NOT EXISTS idx_mbx_dev_email_challenges_email
  ON public.mbx_dev_email_challenges(email, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mbx_dev_email_challenges_expires
  ON public.mbx_dev_email_challenges(expires_at);

CREATE TABLE IF NOT EXISTS public.mbx_dev_webauthn_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge TEXT NOT NULL,
  purpose TEXT NOT NULL,
  account_id UUID REFERENCES public.mbx_dev_accounts(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mbx_dev_webauthn_challenges_challenge_key UNIQUE (challenge),
  CONSTRAINT mbx_dev_webauthn_challenges_challenge_format CHECK (
    challenge ~ '^[A-Za-z0-9_-]{16,}$'
  ),
  CONSTRAINT mbx_dev_webauthn_challenges_purpose_valid CHECK (
    purpose IN ('register', 'authenticate', 'step-up')
  ),
  -- Discoverable sign-in has no account yet; registration and step-up do.
  CONSTRAINT mbx_dev_webauthn_challenges_account_required CHECK (
    purpose = 'authenticate' OR account_id IS NOT NULL
  ),
  CONSTRAINT mbx_dev_webauthn_challenges_lifetime CHECK (
    expires_at <= created_at + INTERVAL '6 minutes'
  )
);

CREATE INDEX IF NOT EXISTS idx_mbx_dev_webauthn_challenges_account
  ON public.mbx_dev_webauthn_challenges(account_id);
CREATE INDEX IF NOT EXISTS idx_mbx_dev_webauthn_challenges_expires
  ON public.mbx_dev_webauthn_challenges(expires_at);

CREATE TABLE IF NOT EXISTS public.mbx_dev_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.mbx_dev_accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  ip_prefix TEXT,
  stepped_up_at TIMESTAMPTZ,
  CONSTRAINT mbx_dev_sessions_token_hash_key UNIQUE (token_hash),
  CONSTRAINT mbx_dev_sessions_token_hash_format CHECK (
    token_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT mbx_dev_sessions_user_agent_length CHECK (
    user_agent IS NULL OR char_length(user_agent) <= 512
  ),
  CONSTRAINT mbx_dev_sessions_ip_prefix_length CHECK (
    ip_prefix IS NULL OR char_length(ip_prefix) <= 64
  )
);

CREATE INDEX IF NOT EXISTS idx_mbx_dev_sessions_account
  ON public.mbx_dev_sessions(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mbx_dev_sessions_expires
  ON public.mbx_dev_sessions(expires_at);

CREATE TABLE IF NOT EXISTS public.mbx_dev_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mbx_dev_organizations_slug_key UNIQUE (slug),
  CONSTRAINT mbx_dev_organizations_name_length CHECK (
    char_length(name) BETWEEN 1 AND 80
  ),
  CONSTRAINT mbx_dev_organizations_slug_format CHECK (
    char_length(slug) BETWEEN 2 AND 48
    AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  )
);

-- At least one owner per organization is enforced in application code.
CREATE TABLE IF NOT EXISTS public.mbx_dev_memberships (
  organization_id UUID NOT NULL REFERENCES public.mbx_dev_organizations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.mbx_dev_accounts(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, account_id),
  CONSTRAINT mbx_dev_memberships_role_valid CHECK (
    role IN ('owner', 'admin', 'developer')
  )
);

CREATE INDEX IF NOT EXISTS idx_mbx_dev_memberships_account
  ON public.mbx_dev_memberships(account_id);

CREATE TABLE IF NOT EXISTS public.mbx_dev_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbx_dev_organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  invited_by UUID REFERENCES public.mbx_dev_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT mbx_dev_invitations_token_hash_key UNIQUE (token_hash),
  CONSTRAINT mbx_dev_invitations_token_hash_format CHECK (
    token_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT mbx_dev_invitations_email_lower CHECK (email = lower(email)),
  CONSTRAINT mbx_dev_invitations_role_valid CHECK (
    role IN ('owner', 'admin', 'developer')
  ),
  CONSTRAINT mbx_dev_invitations_lifetime CHECK (
    expires_at <= created_at + INTERVAL '7 days 1 minute'
  )
);

CREATE INDEX IF NOT EXISTS idx_mbx_dev_invitations_organization
  ON public.mbx_dev_invitations(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mbx_dev_invitations_email_pending
  ON public.mbx_dev_invitations(email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.mbx_dev_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbx_dev_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  website_url TEXT,
  privacy_url TEXT,
  terms_url TEXT,
  support_email TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mbx_dev_apps_organization_slug_key UNIQUE (organization_id, slug),
  CONSTRAINT mbx_dev_apps_name_length CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT mbx_dev_apps_slug_format CHECK (
    char_length(slug) BETWEEN 2 AND 48
    AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  CONSTRAINT mbx_dev_apps_description_length CHECK (
    description IS NULL OR char_length(description) <= 500
  ),
  CONSTRAINT mbx_dev_apps_urls_https CHECK (
    (logo_url IS NULL OR logo_url ~ '^https://')
    AND (website_url IS NULL OR website_url ~ '^https://')
    AND (privacy_url IS NULL OR privacy_url ~ '^https://')
    AND (terms_url IS NULL OR terms_url ~ '^https://')
  ),
  CONSTRAINT mbx_dev_apps_support_email_format CHECK (
    support_email IS NULL
    OR (support_email = lower(support_email) AND support_email ~ '^[^@\s]+@[^@\s]+$')
  ),
  CONSTRAINT mbx_dev_apps_status_valid CHECK (
    status IN ('active', 'restricted', 'suspended', 'retired')
  )
);

CREATE INDEX IF NOT EXISTS idx_mbx_dev_apps_status
  ON public.mbx_dev_apps(status);

CREATE TABLE IF NOT EXISTS public.mbx_dev_environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES public.mbx_dev_apps(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  network TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_type TEXT NOT NULL DEFAULT 'confidential',
  review_state TEXT NOT NULL DEFAULT 'development',
  requested_scopes TEXT[] NOT NULL DEFAULT '{}',
  approved_scopes TEXT[] NOT NULL DEFAULT '{}',
  scope_version INTEGER NOT NULL DEFAULT 1,
  -- Pairwise-subject sector; defaults to the environment id (trigger below).
  sector_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mbx_dev_environments_app_kind_key UNIQUE (app_id, kind),
  CONSTRAINT mbx_dev_environments_client_id_key UNIQUE (client_id),
  CONSTRAINT mbx_dev_environments_kind_valid CHECK (kind IN ('test', 'live')),
  -- Test = Mezo testnet, live = Mezo mainnet. Enforced by policy.
  CONSTRAINT mbx_dev_environments_network_pairing CHECK (
    (kind = 'test' AND network = 'mezo-testnet')
    OR (kind = 'live' AND network = 'mezo')
  ),
  CONSTRAINT mbx_dev_environments_client_id_format CHECK (
    client_id ~ ('^mbx_' || kind || '_[0-9A-Za-z]{24}$')
  ),
  CONSTRAINT mbx_dev_environments_client_type_valid CHECK (
    client_type IN ('confidential', 'public')
  ),
  CONSTRAINT mbx_dev_environments_review_state_valid CHECK (
    review_state IN ('development', 'submitted', 'approved', 'changes-requested', 'rejected')
  ),
  CONSTRAINT mbx_dev_environments_requested_scopes_valid CHECK (
    requested_scopes <@ ARRAY['gauge-profiles:read', 'openid', 'wallet', 'discord:id', 'discord:profile']::TEXT[]
  ),
  CONSTRAINT mbx_dev_environments_approved_scopes_valid CHECK (
    approved_scopes <@ ARRAY['gauge-profiles:read', 'openid', 'wallet', 'discord:id', 'discord:profile']::TEXT[]
  ),
  CONSTRAINT mbx_dev_environments_scope_version_positive CHECK (scope_version > 0),
  CONSTRAINT mbx_dev_environments_sector_id_length CHECK (
    char_length(sector_id) BETWEEN 1 AND 128
  )
);

CREATE OR REPLACE FUNCTION public.mbx_dev_default_sector_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sector_id IS NULL OR NEW.sector_id = '' THEN
    NEW.sector_id = NEW.id::TEXT;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Exact-match redirect URIs (canonical URL.href). Live: https only (trigger
-- below); test additionally allows http://localhost and http://127.0.0.1.
CREATE TABLE IF NOT EXISTS public.mbx_dev_redirect_uris (
  environment_id UUID NOT NULL REFERENCES public.mbx_dev_environments(id) ON DELETE CASCADE,
  uri TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (environment_id, uri),
  CONSTRAINT mbx_dev_redirect_uris_format CHECK (
    char_length(uri) <= 2048
    AND uri !~ '[#*[:space:]]'
    AND uri ~ '^(https://[^/?#@]+|http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?)/'
  )
);

-- Exact-match origins (scheme://host[:port], no path).
CREATE TABLE IF NOT EXISTS public.mbx_dev_origins (
  environment_id UUID NOT NULL REFERENCES public.mbx_dev_environments(id) ON DELETE CASCADE,
  origin TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (environment_id, origin),
  CONSTRAINT mbx_dev_origins_format CHECK (
    char_length(origin) <= 2048
    AND origin !~ '[#*[:space:]]'
    AND origin ~ '^(https://[^/?#@]+|http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?)$'
  )
);

-- TG_ARGV[0] names the URL column; live environments accept https only.
CREATE OR REPLACE FUNCTION public.mbx_dev_check_environment_url()
RETURNS TRIGGER AS $$
DECLARE
  environment_kind TEXT;
  candidate TEXT;
BEGIN
  SELECT environment.kind INTO environment_kind
  FROM public.mbx_dev_environments AS environment
  WHERE environment.id = NEW.environment_id;

  candidate = to_jsonb(NEW) ->> TG_ARGV[0];
  IF environment_kind = 'live' AND candidate NOT LIKE 'https://%' THEN
    RAISE EXCEPTION '% must use https:// in live environments', TG_ARGV[0]
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.mbx_dev_client_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES public.mbx_dev_environments(id) ON DELETE CASCADE,
  secret_hash TEXT NOT NULL,
  prefix TEXT NOT NULL,
  created_by UUID REFERENCES public.mbx_dev_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT mbx_dev_client_secrets_prefix_key UNIQUE (prefix),
  CONSTRAINT mbx_dev_client_secrets_prefix_format CHECK (
    prefix ~ '^[0-9A-Za-z]{12}$'
  ),
  CONSTRAINT mbx_dev_client_secrets_secret_hash_format CHECK (
    secret_hash ~ '^[0-9a-f]{64}$'
  )
);

-- Up to two active secrets per environment (rotation overlap) is enforced in
-- application code.
CREATE INDEX IF NOT EXISTS idx_mbx_dev_client_secrets_environment_active
  ON public.mbx_dev_client_secrets(environment_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.mbx_dev_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES public.mbx_dev_environments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  allowed_cidrs TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES public.mbx_dev_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  rotated_from UUID REFERENCES public.mbx_dev_api_keys(id) ON DELETE SET NULL,
  CONSTRAINT mbx_dev_api_keys_prefix_key UNIQUE (prefix),
  CONSTRAINT mbx_dev_api_keys_kind_valid CHECK (kind IN ('publishable', 'secret')),
  CONSTRAINT mbx_dev_api_keys_name_length CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT mbx_dev_api_keys_prefix_format CHECK (prefix ~ '^[0-9A-Za-z]{12}$'),
  CONSTRAINT mbx_dev_api_keys_secret_hash_format CHECK (
    secret_hash ~ '^[0-9a-f]{64}$'
  ),
  -- CIDR allowlists only make sense for server-side secret keys.
  CONSTRAINT mbx_dev_api_keys_cidrs_secret_only CHECK (
    kind = 'secret' OR cardinality(allowed_cidrs) = 0
  ),
  CONSTRAINT mbx_dev_api_keys_cidrs_limit CHECK (cardinality(allowed_cidrs) <= 20)
);

CREATE INDEX IF NOT EXISTS idx_mbx_dev_api_keys_environment
  ON public.mbx_dev_api_keys(environment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mbx_dev_api_keys_rotated_from
  ON public.mbx_dev_api_keys(rotated_from)
  WHERE rotated_from IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.mbx_dev_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES public.mbx_dev_environments(id) ON DELETE CASCADE,
  requested_scopes TEXT[] NOT NULL,
  state TEXT NOT NULL DEFAULT 'open',
  submitter_id UUID REFERENCES public.mbx_dev_accounts(id) ON DELETE SET NULL,
  submitter_note TEXT,
  reviewer_id UUID REFERENCES public.mbx_dev_accounts(id) ON DELETE SET NULL,
  reviewer_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  CONSTRAINT mbx_dev_reviews_state_valid CHECK (
    state IN ('open', 'approved', 'changes-requested', 'rejected', 'withdrawn')
  ),
  CONSTRAINT mbx_dev_reviews_requested_scopes_valid CHECK (
    requested_scopes <@ ARRAY['gauge-profiles:read', 'openid', 'wallet', 'discord:id', 'discord:profile']::TEXT[]
  ),
  CONSTRAINT mbx_dev_reviews_decided_consistency CHECK (
    (state = 'open') = (decided_at IS NULL)
  ),
  CONSTRAINT mbx_dev_reviews_note_length CHECK (
    (submitter_note IS NULL OR char_length(submitter_note) <= 2000)
    AND (reviewer_note IS NULL OR char_length(reviewer_note) <= 2000)
  )
);

-- Review queue, one open review per environment.
CREATE INDEX IF NOT EXISTS idx_mbx_dev_reviews_queue
  ON public.mbx_dev_reviews(state, created_at);
CREATE INDEX IF NOT EXISTS idx_mbx_dev_reviews_environment
  ON public.mbx_dev_reviews(environment_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_mbx_dev_reviews_open_per_environment
  ON public.mbx_dev_reviews(environment_id)
  WHERE state = 'open';

CREATE TABLE IF NOT EXISTS public.mbx_dev_quota_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES public.mbx_dev_environments(id) ON DELETE CASCADE,
  endpoint_class TEXT NOT NULL,
  per_minute INTEGER NOT NULL,
  per_day INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_by UUID REFERENCES public.mbx_dev_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- NULL = no expiry.
  expires_at TIMESTAMPTZ,
  CONSTRAINT mbx_dev_quota_overrides_endpoint_class_valid CHECK (
    endpoint_class IN ('gauge-profiles', 'unauthenticated', 'oidc-token', 'siwe', 'userinfo')
  ),
  CONSTRAINT mbx_dev_quota_overrides_limits_positive CHECK (
    per_minute > 0 AND per_day > 0
  ),
  CONSTRAINT mbx_dev_quota_overrides_reason_length CHECK (
    char_length(reason) BETWEEN 1 AND 2000
  )
);

CREATE INDEX IF NOT EXISTS idx_mbx_dev_quota_overrides_environment
  ON public.mbx_dev_quota_overrides(environment_id, endpoint_class, created_at DESC);

-- Bootstrap staff with a manual INSERT.
CREATE TABLE IF NOT EXISTS public.mbx_dev_staff (
  account_id UUID PRIMARY KEY REFERENCES public.mbx_dev_accounts(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mbx_dev_staff_role_valid CHECK (role IN ('reviewer', 'operator'))
);

-- ===========================================================================
-- 4.1 Matchbox ID (mbx_id_*)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.mbx_id_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sign_in_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  CONSTRAINT mbx_id_accounts_wallet_address_key UNIQUE (wallet_address),
  CONSTRAINT mbx_id_accounts_wallet_address_format CHECK (
    wallet_address ~ '^0x[0-9a-f]{40}$'
  )
);

CREATE TABLE IF NOT EXISTS public.mbx_id_siwe_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mbx_id_siwe_nonces_nonce_format CHECK (nonce ~ '^[0-9A-Za-z]{8,64}$'),
  CONSTRAINT mbx_id_siwe_nonces_lifetime CHECK (
    expires_at <= created_at + INTERVAL '11 minutes'
  )
);

CREATE INDEX IF NOT EXISTS idx_mbx_id_siwe_nonces_expires
  ON public.mbx_id_siwe_nonces(expires_at);

CREATE TABLE IF NOT EXISTS public.mbx_id_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.mbx_id_accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  -- IPv4 /24 or IPv6 /48; never the full address.
  ip_prefix TEXT,
  CONSTRAINT mbx_id_sessions_token_hash_key UNIQUE (token_hash),
  CONSTRAINT mbx_id_sessions_token_hash_format CHECK (
    token_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT mbx_id_sessions_user_agent_length CHECK (
    user_agent IS NULL OR char_length(user_agent) <= 512
  ),
  CONSTRAINT mbx_id_sessions_ip_prefix_length CHECK (
    ip_prefix IS NULL OR char_length(ip_prefix) <= 64
  )
);

CREATE INDEX IF NOT EXISTS idx_mbx_id_sessions_account
  ON public.mbx_id_sessions(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mbx_id_sessions_expires
  ON public.mbx_id_sessions(expires_at);

CREATE TABLE IF NOT EXISTS public.mbx_id_pairwise_subjects (
  account_id UUID NOT NULL REFERENCES public.mbx_id_accounts(id) ON DELETE CASCADE,
  sector_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, sector_id),
  CONSTRAINT mbx_id_pairwise_subjects_subject_key UNIQUE (subject),
  CONSTRAINT mbx_id_pairwise_subjects_subject_format CHECK (
    subject ~ '^mbx_[A-Za-z0-9_-]{32}$'
  )
);

CREATE TABLE IF NOT EXISTS public.mbx_id_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.mbx_id_accounts(id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES public.mbx_dev_apps(id) ON DELETE CASCADE,
  environment_id UUID NOT NULL REFERENCES public.mbx_dev_environments(id) ON DELETE CASCADE,
  scopes TEXT[] NOT NULL,
  scope_version INTEGER NOT NULL,
  -- Field labels shown at consent; never claim values.
  claims_snapshot JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- Linked Discord at consent time, used for invalidation.
  discord_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  CONSTRAINT mbx_id_grants_scopes_valid CHECK (
    scopes <@ ARRAY['openid', 'wallet', 'discord:id', 'discord:profile']::TEXT[]
  ),
  CONSTRAINT mbx_id_grants_scope_version_positive CHECK (scope_version > 0),
  CONSTRAINT mbx_id_grants_claims_snapshot_shape CHECK (
    jsonb_typeof(claims_snapshot) IN ('array', 'object')
  ),
  CONSTRAINT mbx_id_grants_revoked_reason_valid CHECK (
    revoked_reason IS NULL
    OR revoked_reason IN (
      'user-revoked',
      'app-suspended',
      'discord-link-changed',
      'scope-changed',
      'account-disabled'
    )
  ),
  CONSTRAINT mbx_id_grants_revocation_consistency CHECK (
    (revoked_at IS NULL) = (revoked_reason IS NULL)
  )
);

-- One active grant per (account, environment).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_mbx_id_grants_active
  ON public.mbx_id_grants(account_id, environment_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mbx_id_grants_account
  ON public.mbx_id_grants(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mbx_id_grants_environment
  ON public.mbx_id_grants(environment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mbx_id_grants_app
  ON public.mbx_id_grants(app_id);
CREATE INDEX IF NOT EXISTS idx_mbx_id_grants_discord_active
  ON public.mbx_id_grants(discord_user_id)
  WHERE revoked_at IS NULL AND discord_user_id IS NOT NULL;

-- Validated /oauth/authorize requests awaiting consent (10 min).
CREATE TABLE IF NOT EXISTS public.mbx_id_authorization_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES public.mbx_dev_environments(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  state TEXT NOT NULL,
  scopes TEXT[] NOT NULL,
  code_challenge TEXT NOT NULL,
  nonce TEXT,
  prompt TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mbx_id_authorization_requests_redirect_uri_length CHECK (
    char_length(redirect_uri) <= 2048
  ),
  CONSTRAINT mbx_id_authorization_requests_state_length CHECK (
    char_length(state) BETWEEN 1 AND 1024
  ),
  CONSTRAINT mbx_id_authorization_requests_scopes_valid CHECK (
    scopes <@ ARRAY['openid', 'wallet', 'discord:id', 'discord:profile']::TEXT[]
  ),
  CONSTRAINT mbx_id_authorization_requests_code_challenge_format CHECK (
    code_challenge ~ '^[A-Za-z0-9_-]{43}$'
  ),
  CONSTRAINT mbx_id_authorization_requests_nonce_length CHECK (
    nonce IS NULL OR char_length(nonce) BETWEEN 1 AND 256
  ),
  CONSTRAINT mbx_id_authorization_requests_prompt_valid CHECK (
    prompt IS NULL OR prompt IN ('none', 'login', 'consent')
  ),
  CONSTRAINT mbx_id_authorization_requests_lifetime CHECK (
    expires_at <= created_at + INTERVAL '11 minutes'
  )
);

CREATE INDEX IF NOT EXISTS idx_mbx_id_authorization_requests_environment
  ON public.mbx_id_authorization_requests(environment_id);
CREATE INDEX IF NOT EXISTS idx_mbx_id_authorization_requests_expires
  ON public.mbx_id_authorization_requests(expires_at);

CREATE TABLE IF NOT EXISTS public.mbx_id_authorization_codes (
  code_hash TEXT PRIMARY KEY,
  grant_id UUID NOT NULL REFERENCES public.mbx_id_grants(id) ON DELETE CASCADE,
  environment_id UUID NOT NULL REFERENCES public.mbx_dev_environments(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256',
  nonce TEXT,
  scopes TEXT[] NOT NULL,
  -- When the wallet authenticated (ID token `auth_time`).
  auth_time TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mbx_id_authorization_codes_code_hash_format CHECK (
    code_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT mbx_id_authorization_codes_method_s256 CHECK (
    code_challenge_method = 'S256'
  ),
  CONSTRAINT mbx_id_authorization_codes_code_challenge_format CHECK (
    code_challenge ~ '^[A-Za-z0-9_-]{43}$'
  ),
  CONSTRAINT mbx_id_authorization_codes_scopes_valid CHECK (
    scopes <@ ARRAY['openid', 'wallet', 'discord:id', 'discord:profile']::TEXT[]
  ),
  -- 60 s lifetime plus one minute of clock slack.
  CONSTRAINT mbx_id_authorization_codes_lifetime CHECK (
    expires_at <= created_at + INTERVAL '2 minutes'
  )
);

CREATE INDEX IF NOT EXISTS idx_mbx_id_authorization_codes_grant
  ON public.mbx_id_authorization_codes(grant_id);
CREATE INDEX IF NOT EXISTS idx_mbx_id_authorization_codes_expires
  ON public.mbx_id_authorization_codes(expires_at);

-- Rotating refresh tokens. Reuse of a rotated token revokes the family.
CREATE TABLE IF NOT EXISTS public.mbx_id_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL,
  grant_id UUID NOT NULL REFERENCES public.mbx_id_grants(id) ON DELETE CASCADE,
  family_id UUID NOT NULL,
  parent_id UUID REFERENCES public.mbx_id_refresh_tokens(id) ON DELETE SET NULL,
  scopes TEXT[] NOT NULL,
  -- Carried through rotation so refreshed ID tokens keep `auth_time`.
  auth_time TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotated_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT mbx_id_refresh_tokens_token_hash_key UNIQUE (token_hash),
  CONSTRAINT mbx_id_refresh_tokens_token_hash_format CHECK (
    token_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT mbx_id_refresh_tokens_scopes_valid CHECK (
    scopes <@ ARRAY['openid', 'wallet', 'discord:id', 'discord:profile']::TEXT[]
  )
);

CREATE INDEX IF NOT EXISTS idx_mbx_id_refresh_tokens_family
  ON public.mbx_id_refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_mbx_id_refresh_tokens_grant
  ON public.mbx_id_refresh_tokens(grant_id);
CREATE INDEX IF NOT EXISTS idx_mbx_id_refresh_tokens_parent
  ON public.mbx_id_refresh_tokens(parent_id)
  WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mbx_id_refresh_tokens_expires
  ON public.mbx_id_refresh_tokens(expires_at);

-- ES256 access-token JWT ids; userinfo checks jti + grant.
CREATE TABLE IF NOT EXISTS public.mbx_id_access_tokens (
  jti TEXT PRIMARY KEY,
  grant_id UUID NOT NULL REFERENCES public.mbx_id_grants(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mbx_id_access_tokens_jti_format CHECK (
    jti ~ '^[A-Za-z0-9_-]{16,64}$'
  )
);

CREATE INDEX IF NOT EXISTS idx_mbx_id_access_tokens_grant
  ON public.mbx_id_access_tokens(grant_id);
CREATE INDEX IF NOT EXISTS idx_mbx_id_access_tokens_expires
  ON public.mbx_id_access_tokens(expires_at);

-- ===========================================================================
-- Platform audit log (immutable)
-- ===========================================================================

-- No foreign keys: events must outlive the rows they describe, and an
-- ON DELETE action would try to UPDATE rows the immutability trigger blocks.
CREATE TABLE IF NOT EXISTS public.mbx_platform_audit_events (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  organization_id UUID,
  app_id UUID,
  environment_id UUID,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  ip_prefix TEXT,
  request_id TEXT,
  CONSTRAINT mbx_platform_audit_events_actor_type_valid CHECK (
    actor_type IN ('developer', 'staff', 'wallet', 'system')
  ),
  CONSTRAINT mbx_platform_audit_events_action_format CHECK (
    char_length(action) <= 64 AND action ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  CONSTRAINT mbx_platform_audit_events_metadata_object CHECK (
    jsonb_typeof(metadata) = 'object'
  ),
  CONSTRAINT mbx_platform_audit_events_text_lengths CHECK (
    (actor_id IS NULL OR char_length(actor_id) <= 128)
    AND (target_type IS NULL OR char_length(target_type) <= 64)
    AND (target_id IS NULL OR char_length(target_id) <= 128)
    AND (ip_prefix IS NULL OR char_length(ip_prefix) <= 64)
    AND (request_id IS NULL OR char_length(request_id) <= 128)
  )
);

CREATE INDEX IF NOT EXISTS idx_mbx_platform_audit_events_occurred
  ON public.mbx_platform_audit_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_mbx_platform_audit_events_organization
  ON public.mbx_platform_audit_events(organization_id, occurred_at DESC)
  WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mbx_platform_audit_events_app
  ON public.mbx_platform_audit_events(app_id, occurred_at DESC)
  WHERE app_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mbx_platform_audit_events_environment
  ON public.mbx_platform_audit_events(environment_id, occurred_at DESC)
  WHERE environment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mbx_platform_audit_events_actor
  ON public.mbx_platform_audit_events(actor_type, actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_mbx_platform_audit_events_action
  ON public.mbx_platform_audit_events(action, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.mbx_platform_audit_events_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'mbx_platform_audit_events is append-only (% blocked)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

-- ===========================================================================
-- 4.3 Gauge Profile read model (mbx_api_*)
-- ===========================================================================

-- Live chain state written by the developer-api reconciliation cron
-- (*/10 * * * *). The API never calls RPC on the request path.
CREATE TABLE IF NOT EXISTS public.mbx_api_gauge_chain_state (
  network TEXT NOT NULL,
  gauge_address TEXT NOT NULL,
  is_alive BOOLEAN,
  vebtc_token_id TEXT,
  nft_owner TEXT,
  beneficiary TEXT,
  pool_address TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  block_number BIGINT,
  PRIMARY KEY (network, gauge_address),
  CONSTRAINT mbx_api_gauge_chain_state_network_valid CHECK (
    network IN ('mezo', 'mezo-testnet')
  ),
  CONSTRAINT mbx_api_gauge_chain_state_addresses_format CHECK (
    gauge_address ~ '^0x[0-9a-f]{40}$'
    AND (nft_owner IS NULL OR nft_owner ~ '^0x[0-9a-f]{40}$')
    AND (beneficiary IS NULL OR beneficiary ~ '^0x[0-9a-f]{40}$')
    AND (pool_address IS NULL OR pool_address ~ '^0x[0-9a-f]{40}$')
  ),
  CONSTRAINT mbx_api_gauge_chain_state_token_id_format CHECK (
    vebtc_token_id IS NULL OR vebtc_token_id ~ '^(0|[1-9][0-9]*)$'
  ),
  CONSTRAINT mbx_api_gauge_chain_state_block_non_negative CHECK (
    block_number IS NULL OR block_number >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_mbx_api_gauge_chain_state_token
  ON public.mbx_api_gauge_chain_state(network, vebtc_token_id)
  WHERE vebtc_token_id IS NOT NULL;

-- Read model over the existing profile tables. The API joins
-- mbx_api_gauge_chain_state on (network, gauge_address) and selects
-- `block_number::text` so block numbers stay decimal strings.
CREATE OR REPLACE VIEW public.mbx_api_gauge_profiles
WITH (security_invoker = true) AS
SELECT
  'mezo'::TEXT AS network,
  'boost-gauge'::TEXT AS profile_type,
  lower(gauge.gauge_address) AS gauge_address,
  gauge.vebtc_token_id AS vebtc_token_id,
  NULL::TEXT AS operator_address,
  gauge.display_name AS display_name,
  gauge.description AS description,
  gauge.profile_picture_url AS avatar_url,
  gauge.website_url AS website_url,
  CASE
    WHEN jsonb_typeof(gauge.social_links) = 'object' THEN gauge.social_links
    ELSE '{}'::JSONB
  END AS social_links,
  COALESCE(gauge.tags, ARRAY[]::TEXT[]) AS tags,
  gauge.incentive_strategy AS incentive_strategy,
  gauge.voting_strategy AS voting_strategy,
  COALESCE(gauge.is_featured, false) AS is_featured,
  COALESCE(gauge.created_at, gauge.updated_at, to_timestamp(0)) AS created_at,
  COALESCE(gauge.updated_at, gauge.created_at, to_timestamp(0)) AS updated_at,
  lower(gauge.owner_address) AS profile_updated_by
FROM public.gauge_profiles AS gauge
UNION ALL
SELECT
  CASE validator.chain_id WHEN 31612 THEN 'mezo' ELSE 'mezo-testnet' END,
  'validator-gauge'::TEXT,
  lower(validator.gauge_address),
  NULL::TEXT,
  lower(validator.operator_address),
  validator.display_name,
  validator.description,
  validator.profile_picture_url,
  validator.website_url,
  CASE
    WHEN jsonb_typeof(validator.social_links) = 'object' THEN validator.social_links
    ELSE '{}'::JSONB
  END,
  COALESCE(validator.tags, ARRAY[]::TEXT[]),
  validator.incentive_strategy,
  validator.voting_strategy,
  false,
  validator.created_at,
  validator.updated_at,
  lower(validator.last_editor_address)
FROM public.validator_profiles AS validator
WHERE validator.chain_id IN (31611, 31612);

COMMENT ON VIEW public.mbx_api_gauge_profiles IS
  'Gauge Profile API read model: boost gauges (gauge_profiles, Mezo mainnet) and validator gauges (validator_profiles, by chain_id).';

-- ===========================================================================
-- Triggers
-- ===========================================================================

DROP TRIGGER IF EXISTS trigger_mbx_dev_apps_updated_at ON public.mbx_dev_apps;
CREATE TRIGGER trigger_mbx_dev_apps_updated_at
  BEFORE UPDATE ON public.mbx_dev_apps
  FOR EACH ROW EXECUTE FUNCTION public.mbx_platform_set_updated_at();

DROP TRIGGER IF EXISTS trigger_mbx_dev_environments_updated_at ON public.mbx_dev_environments;
CREATE TRIGGER trigger_mbx_dev_environments_updated_at
  BEFORE UPDATE ON public.mbx_dev_environments
  FOR EACH ROW EXECUTE FUNCTION public.mbx_platform_set_updated_at();

DROP TRIGGER IF EXISTS trigger_mbx_id_grants_updated_at ON public.mbx_id_grants;
CREATE TRIGGER trigger_mbx_id_grants_updated_at
  BEFORE UPDATE ON public.mbx_id_grants
  FOR EACH ROW EXECUTE FUNCTION public.mbx_platform_set_updated_at();

DROP TRIGGER IF EXISTS trigger_mbx_dev_environments_sector_id ON public.mbx_dev_environments;
CREATE TRIGGER trigger_mbx_dev_environments_sector_id
  BEFORE INSERT OR UPDATE OF sector_id ON public.mbx_dev_environments
  FOR EACH ROW EXECUTE FUNCTION public.mbx_dev_default_sector_id();

DROP TRIGGER IF EXISTS trigger_mbx_dev_redirect_uris_scheme ON public.mbx_dev_redirect_uris;
CREATE TRIGGER trigger_mbx_dev_redirect_uris_scheme
  BEFORE INSERT OR UPDATE ON public.mbx_dev_redirect_uris
  FOR EACH ROW EXECUTE FUNCTION public.mbx_dev_check_environment_url('uri');

DROP TRIGGER IF EXISTS trigger_mbx_dev_origins_scheme ON public.mbx_dev_origins;
CREATE TRIGGER trigger_mbx_dev_origins_scheme
  BEFORE INSERT OR UPDATE ON public.mbx_dev_origins
  FOR EACH ROW EXECUTE FUNCTION public.mbx_dev_check_environment_url('origin');

DROP TRIGGER IF EXISTS trigger_mbx_platform_audit_events_immutable
  ON public.mbx_platform_audit_events;
CREATE TRIGGER trigger_mbx_platform_audit_events_immutable
  BEFORE UPDATE OR DELETE ON public.mbx_platform_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.mbx_platform_audit_events_immutable();

DROP TRIGGER IF EXISTS trigger_mbx_platform_audit_events_no_truncate
  ON public.mbx_platform_audit_events;
CREATE TRIGGER trigger_mbx_platform_audit_events_no_truncate
  BEFORE TRUNCATE ON public.mbx_platform_audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.mbx_platform_audit_events_immutable();

-- A Discord link change or removal must not carry discord:* consent over to
-- a different wallet/Discord pairing: revoke matching active grants (reason
-- discord-link-changed), their refresh and access tokens, and audit it.
CREATE OR REPLACE FUNCTION public.mbx_id_invalidate_discord_grants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.wallet_address IS NOT DISTINCT FROM OLD.wallet_address
    AND NEW.discord_user_id IS NOT DISTINCT FROM OLD.discord_user_id
  THEN
    RETURN NULL;
  END IF;

  WITH revoked_grants AS (
    UPDATE public.mbx_id_grants AS grant_row
    SET revoked_at = NOW(),
        revoked_reason = 'discord-link-changed'
    FROM public.mbx_id_accounts AS account
    WHERE account.id = grant_row.account_id
      AND grant_row.revoked_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM unnest(grant_row.scopes) AS granted(scope)
        WHERE granted.scope LIKE 'discord:%'
      )
      AND (
        account.wallet_address = lower(OLD.wallet_address)
        OR grant_row.discord_user_id = OLD.discord_user_id
      )
    RETURNING grant_row.id, grant_row.app_id, grant_row.environment_id
  ),
  revoked_refresh_tokens AS (
    UPDATE public.mbx_id_refresh_tokens AS token
    SET revoked_at = NOW()
    WHERE token.grant_id IN (SELECT revoked_grants.id FROM revoked_grants)
      AND token.revoked_at IS NULL
    RETURNING token.id
  ),
  revoked_access_tokens AS (
    UPDATE public.mbx_id_access_tokens AS token
    SET revoked_at = NOW()
    WHERE token.grant_id IN (SELECT revoked_grants.id FROM revoked_grants)
      AND token.revoked_at IS NULL
    RETURNING token.jti
  )
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
  SELECT
    'system',
    NULL,
    app.organization_id,
    revoked_grants.app_id,
    revoked_grants.environment_id,
    'grant-revoked',
    'grant',
    revoked_grants.id::TEXT,
    jsonb_build_object(
      'reason', 'discord-link-changed',
      'operation', lower(TG_OP)
    )
  FROM revoked_grants
  LEFT JOIN public.mbx_dev_apps AS app ON app.id = revoked_grants.app_id;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.mbx_id_invalidate_discord_grants() FROM PUBLIC;

DO $$
BEGIN
  IF to_regclass('public.discord_wallet_links') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS mbx_id_invalidate_discord_grants
      ON public.discord_wallet_links;
    CREATE TRIGGER mbx_id_invalidate_discord_grants
      AFTER UPDATE OF wallet_address, discord_user_id OR DELETE
      ON public.discord_wallet_links
      FOR EACH ROW EXECUTE FUNCTION public.mbx_id_invalidate_discord_grants();
  END IF;
END $$;

-- ===========================================================================
-- Row level security and privileges
-- ===========================================================================

-- RLS on, no anon/authenticated policies, and no anon/authenticated
-- privileges. The service role (Workers) bypasses RLS.
ALTER TABLE public.mbx_dev_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_dev_passkeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_dev_email_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_dev_webauthn_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_dev_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_dev_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_dev_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_dev_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_dev_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_dev_environments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_dev_redirect_uris ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_dev_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_dev_client_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_dev_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_dev_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_dev_quota_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_dev_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_id_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_id_siwe_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_id_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_id_pairwise_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_id_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_id_authorization_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_id_authorization_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_id_refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_id_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_platform_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_api_gauge_chain_state ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  relation_name TEXT;
  relation_names TEXT[] := ARRAY[
    'mbx_dev_accounts',
    'mbx_dev_passkeys',
    'mbx_dev_email_challenges',
    'mbx_dev_webauthn_challenges',
    'mbx_dev_sessions',
    'mbx_dev_organizations',
    'mbx_dev_memberships',
    'mbx_dev_invitations',
    'mbx_dev_apps',
    'mbx_dev_environments',
    'mbx_dev_redirect_uris',
    'mbx_dev_origins',
    'mbx_dev_client_secrets',
    'mbx_dev_api_keys',
    'mbx_dev_reviews',
    'mbx_dev_quota_overrides',
    'mbx_dev_staff',
    'mbx_id_accounts',
    'mbx_id_siwe_nonces',
    'mbx_id_sessions',
    'mbx_id_pairwise_subjects',
    'mbx_id_grants',
    'mbx_id_authorization_requests',
    'mbx_id_authorization_codes',
    'mbx_id_refresh_tokens',
    'mbx_id_access_tokens',
    'mbx_platform_audit_events',
    'mbx_api_gauge_chain_state'
  ];
  client_role TEXT;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      FOREACH relation_name IN ARRAY relation_names LOOP
        EXECUTE format('REVOKE ALL ON public.%I FROM %I', relation_name, client_role);
      END LOOP;
      EXECUTE format('REVOKE ALL ON public.mbx_api_gauge_profiles FROM %I', client_role);
      EXECUTE format(
        'REVOKE ALL ON SEQUENCE public.mbx_platform_audit_events_id_seq FROM %I',
        client_role
      );
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    FOREACH relation_name IN ARRAY relation_names LOOP
      EXECUTE format(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role',
        relation_name
      );
    END LOOP;
    -- Append-only for the audit log, even for the service role.
    REVOKE UPDATE, DELETE, TRUNCATE ON public.mbx_platform_audit_events FROM service_role;
    GRANT SELECT ON public.mbx_api_gauge_profiles TO service_role;
    GRANT USAGE, SELECT ON SEQUENCE public.mbx_platform_audit_events_id_seq TO service_role;
  END IF;
END $$;

COMMENT ON TABLE public.mbx_platform_audit_events IS
  'Immutable platform audit log (developer console, staff, Matchbox ID). UPDATE/DELETE/TRUNCATE are blocked by trigger.';
COMMENT ON TABLE public.mbx_id_grants IS
  'Matchbox ID consent grants. One active grant per (account_id, environment_id).';
COMMENT ON TABLE public.mbx_dev_api_keys IS
  'Gauge Profile API keys. secret_hash = HMAC-SHA256(API_KEY_PEPPER, full key) hex; prefix = 12-char base62 lookup id.';
