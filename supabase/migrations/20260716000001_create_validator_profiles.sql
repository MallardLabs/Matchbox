CREATE TABLE IF NOT EXISTS public.validator_profiles (
  chain_id BIGINT NOT NULL,
  gauge_address TEXT NOT NULL,
  operator_address TEXT NOT NULL,
  last_editor_address TEXT NOT NULL,
  profile_picture_url TEXT,
  display_name TEXT,
  description TEXT,
  website_url TEXT,
  social_links JSONB NOT NULL DEFAULT '{}',
  incentive_strategy TEXT,
  voting_strategy TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, gauge_address)
);

CREATE INDEX IF NOT EXISTS idx_validator_profiles_operator
  ON public.validator_profiles(chain_id, operator_address);
CREATE INDEX IF NOT EXISTS idx_validator_profiles_tags
  ON public.validator_profiles USING GIN(tags);

ALTER TABLE public.validator_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read validator profiles"
  ON public.validator_profiles;
CREATE POLICY "Anyone can read validator profiles"
  ON public.validator_profiles FOR SELECT USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.validator_profiles FROM anon, authenticated;

-- Avatar mutations are authorized with single-use signed upload URLs from the
-- validator-profile edge service. Keep the bucket readable, but remove every
-- legacy direct-write policy.
DROP POLICY IF EXISTS "Anyone can upload gauge avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update gauge avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete gauge avatars" ON storage.objects;

CREATE TABLE IF NOT EXISTS public.validator_profile_write_nonces (
  nonce_hash TEXT PRIMARY KEY,
  chain_id BIGINT NOT NULL,
  gauge_address TEXT NOT NULL,
  operator_address TEXT NOT NULL,
  editor_address TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('upsert-profile', 'upload-avatar')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_validator_profile_nonces_expires
  ON public.validator_profile_write_nonces(expires_at);
ALTER TABLE public.validator_profile_write_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.validator_profile_write_nonces FROM anon, authenticated;

CREATE OR REPLACE FUNCTION update_validator_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_validator_profiles_updated_at
  ON public.validator_profiles;
CREATE TRIGGER trigger_update_validator_profiles_updated_at
  BEFORE UPDATE ON public.validator_profiles
  FOR EACH ROW EXECUTE FUNCTION update_validator_profiles_updated_at();
