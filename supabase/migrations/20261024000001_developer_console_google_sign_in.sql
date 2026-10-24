-- Developer console: Sign in with Google replaces email codes and passkeys
-- (docs/developer-platform/ARCHITECTURE.md §8.1).
--
-- 1. `mbx_dev_accounts.google_sub`: the Google account id (`sub`) an account
--    signs in with. Unique; NULL only for accounts created before this
--    migration (linked by verified email on their first Google sign-in).
-- 2. Drops the passkey and email/WebAuthn challenge tables. Nothing reads
--    them once the Google console is deployed. Apply before deploying it.
--
-- Staff by domain (STAFF_EMAIL_DOMAINS) upserts `mbx_dev_staff` rows at
-- sign-in; no schema change is needed for that.
--
-- Rollback (manual, single transaction): re-run the passkey, email challenge
-- and WebAuthn challenge sections of 20260930000001 and the step-up block of
-- 20260930000002, then:
--   ALTER TABLE public.mbx_dev_accounts
--     DROP CONSTRAINT IF EXISTS mbx_dev_accounts_google_sub_key,
--     DROP CONSTRAINT IF EXISTS mbx_dev_accounts_google_sub_length,
--     DROP COLUMN IF EXISTS google_sub;

-- ---------------------------------------------------------------------------
-- 1. Google identity
-- ---------------------------------------------------------------------------

ALTER TABLE public.mbx_dev_accounts
  ADD COLUMN IF NOT EXISTS google_sub TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mbx_dev_accounts_google_sub_key'
  ) THEN
    ALTER TABLE public.mbx_dev_accounts
      ADD CONSTRAINT mbx_dev_accounts_google_sub_key UNIQUE (google_sub);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mbx_dev_accounts_google_sub_length'
  ) THEN
    ALTER TABLE public.mbx_dev_accounts
      ADD CONSTRAINT mbx_dev_accounts_google_sub_length CHECK (
        google_sub IS NULL OR char_length(google_sub) BETWEEN 1 AND 255
      );
  END IF;
END $$;

COMMENT ON COLUMN public.mbx_dev_accounts.google_sub IS
  'Google account id (ID token sub) used to sign in. NULL until the first Google sign-in.';

-- ---------------------------------------------------------------------------
-- 2. Retired passkey and email-code tables
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS public.mbx_dev_webauthn_challenges;
DROP TABLE IF EXISTS public.mbx_dev_email_challenges;
DROP TABLE IF EXISTS public.mbx_dev_passkeys;
