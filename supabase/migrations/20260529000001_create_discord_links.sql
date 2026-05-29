-- Discord <-> wallet linking for the Matchbox Discord bot.
--
-- discord_wallet_links holds confirmed links (one wallet per Discord account AND
-- one Discord account per wallet -- strict one-to-one, anti-sybil).
-- discord_link_tokens holds short-lived linking sessions: the unguessable token
-- is the capability embedded in the link URL handed to the user in Discord.
-- discord_semesters holds the per-semester (a.k.a. season) point windows and the
-- Discord role granted to members who earned points during that window.
--
-- All access happens through the service-role edge functions (discord-interactions,
-- discord-link, discord-reconcile-roles). RLS is enabled with no anon/authenticated
-- policies so these tables are unreadable with the public anon key; the service role
-- bypasses RLS.

CREATE TABLE IF NOT EXISTS discord_wallet_links (
  discord_user_id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  discord_username TEXT,
  discord_global_name TEXT,
  discord_avatar TEXT,
  guild_id TEXT,
  -- Discord role IDs the bot has currently assigned to this member (semester roles
  -- plus the optional live role). Reconciliation diffs against this set.
  granted_roles TEXT[] NOT NULL DEFAULT '{}',
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discord_wallet_links_wallet
  ON discord_wallet_links(wallet_address);

CREATE TABLE IF NOT EXISTS discord_link_tokens (
  token TEXT PRIMARY KEY,
  discord_user_id TEXT NOT NULL,
  discord_username TEXT,
  discord_global_name TEXT,
  discord_avatar TEXT,
  guild_id TEXT,
  nonce TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discord_link_tokens_user
  ON discord_link_tokens(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_discord_link_tokens_expires
  ON discord_link_tokens(expires_at);

-- Per-semester point windows + the role to grant for earning points in that window.
-- from_ts/to_ts are unix seconds (Thursday-aligned epoch boundaries). role_id is
-- filled in once you create the Discord role; rows with a NULL role_id are ignored
-- by role assignment. Add future semesters with INSERTs -- no redeploy needed.
CREATE TABLE IF NOT EXISTS discord_semesters (
  semester_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  from_ts BIGINT NOT NULL,
  to_ts BIGINT NOT NULL,
  role_id TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Semester 0: 2026-04-02 00:00 UTC .. 2026-05-28 00:00 UTC (8 epochs).
-- Set role_id after creating the "Semester 0" role in your server, e.g.:
--   UPDATE discord_semesters SET role_id = '123...' WHERE semester_id = '0';
INSERT INTO discord_semesters (semester_id, label, from_ts, to_ts, role_id, active)
VALUES ('0', 'Semester 0', 1775088000, 1779926400, NULL, true)
ON CONFLICT (semester_id) DO NOTHING;

-- Keep updated_at fresh on the mutable tables.
CREATE OR REPLACE FUNCTION update_discord_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_discord_wallet_links_updated_at
  ON public.discord_wallet_links;
CREATE TRIGGER trigger_update_discord_wallet_links_updated_at
  BEFORE UPDATE ON discord_wallet_links
  FOR EACH ROW
  EXECUTE FUNCTION update_discord_updated_at();

DROP TRIGGER IF EXISTS trigger_update_discord_semesters_updated_at
  ON public.discord_semesters;
CREATE TRIGGER trigger_update_discord_semesters_updated_at
  BEFORE UPDATE ON discord_semesters
  FOR EACH ROW
  EXECUTE FUNCTION update_discord_updated_at();

-- RLS: enabled with no policies => only the service role (edge functions) can touch
-- these tables. The public anon key gets nothing.
ALTER TABLE discord_wallet_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE discord_link_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE discord_semesters ENABLE ROW LEVEL SECURITY;
