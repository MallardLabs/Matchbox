-- Saved profile templates
-- Users can save their gauge profile as a reusable template tied to their wallet.
-- Templates can be manually saved or auto-saved from expired gauges.

CREATE TABLE saved_profiles (
  id SERIAL PRIMARY KEY,
  owner_address TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  source_gauge_address TEXT,
  source_vebtc_token_id TEXT,
  profile_picture_url TEXT,
  display_name TEXT,
  description TEXT,
  website_url TEXT,
  social_links JSONB DEFAULT '{}',
  incentive_strategy TEXT,
  voting_strategy TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_address, name)
);

CREATE INDEX idx_saved_profiles_owner ON saved_profiles(owner_address);
CREATE INDEX idx_saved_profiles_source_gauge ON saved_profiles(source_gauge_address) WHERE source_gauge_address IS NOT NULL;

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_saved_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_saved_profiles_updated_at ON public.saved_profiles;
CREATE TRIGGER trigger_update_saved_profiles_updated_at
  BEFORE UPDATE ON saved_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_saved_profiles_updated_at();

-- RLS
ALTER TABLE saved_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read saved profiles" ON saved_profiles FOR SELECT USING (true);
CREATE POLICY "Anyone can insert saved profiles" ON saved_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update saved profiles" ON saved_profiles FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete saved profiles" ON saved_profiles FOR DELETE USING (true);
