-- Contract-owned veBTC gauges can delegate Matchbox profile editing to a
-- wallet without granting any onchain authority. The controller proof is
-- verified by the manage-gauge-profile-editor edge function; public clients
-- never write these tables directly.

CREATE TABLE IF NOT EXISTS public.gauge_profile_editors (
  chain_id INTEGER NOT NULL CHECK (chain_id IN (31611, 31612)),
  gauge_address TEXT NOT NULL CHECK (gauge_address ~ '^0x[0-9a-f]{40}$'),
  vebtc_token_id TEXT NOT NULL CHECK (vebtc_token_id ~ '^[0-9]+$'),
  nft_owner_address TEXT NOT NULL CHECK (nft_owner_address ~ '^0x[0-9a-f]{40}$'),
  controller_address TEXT NOT NULL CHECK (controller_address ~ '^0x[0-9a-f]{40}$'),
  editor_address TEXT NOT NULL CHECK (editor_address ~ '^0x[0-9a-f]{40}$'),
  controller_kind TEXT NOT NULL
    CHECK (controller_kind IN ('direct-eoa', 'direct-contract', 'ownable-eoa', 'ownable-contract')),
  proof_hash TEXT NOT NULL CHECK (proof_hash ~ '^[0-9a-f]{64}$'),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, gauge_address, editor_address)
);

CREATE INDEX IF NOT EXISTS idx_gauge_profile_editors_active
  ON public.gauge_profile_editors(chain_id, gauge_address)
  WHERE revoked_at IS NULL;

ALTER TABLE public.gauge_profile_editors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gauge_profile_editors FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.gauge_profile_editor_nonces (
  nonce_hash TEXT PRIMARY KEY CHECK (nonce_hash ~ '^[0-9a-f]{64}$'),
  chain_id INTEGER NOT NULL CHECK (chain_id IN (31611, 31612)),
  gauge_address TEXT NOT NULL CHECK (gauge_address ~ '^0x[0-9a-f]{40}$'),
  vebtc_token_id TEXT NOT NULL CHECK (vebtc_token_id ~ '^[0-9]+$'),
  nft_owner_address TEXT NOT NULL CHECK (nft_owner_address ~ '^0x[0-9a-f]{40}$'),
  controller_address TEXT NOT NULL CHECK (controller_address ~ '^0x[0-9a-f]{40}$'),
  editor_address TEXT NOT NULL CHECK (editor_address ~ '^0x[0-9a-f]{40}$'),
  action TEXT NOT NULL CHECK (action IN ('grant-editor', 'revoke-editor')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gauge_profile_editor_nonces_expires
  ON public.gauge_profile_editor_nonces(expires_at);

ALTER TABLE public.gauge_profile_editor_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gauge_profile_editor_nonces FROM anon, authenticated;

COMMENT ON TABLE public.gauge_profile_editors IS
  'Offchain-only Matchbox profile editors authorized by the live controller of a contract-owned veBTC NFT.';
COMMENT ON COLUMN public.gauge_profile_editors.proof_hash IS
  'SHA-256 hash of the exact one-time authorization message; signatures are not retained.';

-- Bind existing profile-write proofs to a Mezo chain. Existing unconsumed
-- nonces were issued by the former mainnet-only function, so 31612 is the safe
-- compatibility value during the migration.
ALTER TABLE public.gauge_profile_write_nonces
  ADD COLUMN IF NOT EXISTS chain_id INTEGER NOT NULL DEFAULT 31612;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gauge_profile_write_nonces_chain_id_check'
      AND conrelid = 'public.gauge_profile_write_nonces'::regclass
  ) THEN
    ALTER TABLE public.gauge_profile_write_nonces
      ADD CONSTRAINT gauge_profile_write_nonces_chain_id_check
      CHECK (chain_id IN (31611, 31612));
  END IF;
END $$;
