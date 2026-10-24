-- Developer console: Google profile picture on accounts
-- (docs/developer-platform/ARCHITECTURE.md §8.1).
--
-- `mbx_dev_accounts.avatar_url`: the `picture` claim from the Google ID token,
-- refreshed at each sign-in. https only; NULL when Google sent none.
--
-- Additive only. Rollback (manual, single transaction):
--   ALTER TABLE public.mbx_dev_accounts
--     DROP CONSTRAINT IF EXISTS mbx_dev_accounts_avatar_url_format,
--     DROP COLUMN IF EXISTS avatar_url;

ALTER TABLE public.mbx_dev_accounts
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mbx_dev_accounts_avatar_url_format'
  ) THEN
    ALTER TABLE public.mbx_dev_accounts
      ADD CONSTRAINT mbx_dev_accounts_avatar_url_format CHECK (
        avatar_url IS NULL
        OR (avatar_url ~ '^https://' AND char_length(avatar_url) <= 2048)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.mbx_dev_accounts.avatar_url IS
  'Google profile picture URL (ID token picture claim), refreshed at sign-in.';
