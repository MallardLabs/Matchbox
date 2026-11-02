-- Developer platform: staff verification behind the Matchbox ID consent
-- "Verified" badge (audit ID-03).
--
-- `mbx_dev_environments.verified_at`: when staff last approved a review of
-- the environment as it stands. Only the console's staff review decision
-- sets it; auto-approval (`gauge-profiles:read`) never does. The console
-- clears it when the app's consent profile (name, logo, website, privacy and
-- terms URLs), the environment's redirect URIs, origins or requested scopes,
-- or the app's status change, and on a reject / request-changes decision.
-- Matchbox ID shows "Verified" only for a live environment of an active app
-- with `verified_at` set. Before this, the badge followed
-- `review_state = 'approved'`, which auto-approval also produces.
--
-- Additive and nullable. Existing rows start NULL: no environment keeps the
-- old badge (it could have been earned without review). An app regains it
-- when staff approve a review submitted after deploy.
--
-- Deploy order: apply this before the console Worker, which writes the
-- column. Matchbox ID reads it as optional, so either order works there.
--
-- Rollback (manual):
--   ALTER TABLE public.mbx_dev_environments DROP COLUMN IF EXISTS verified_at;

ALTER TABLE public.mbx_dev_environments
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.mbx_dev_environments.verified_at IS
  'When staff last approved a review of the environment as it stands; cleared when a reviewed attribute changes. Drives the Matchbox ID consent "Verified" badge.';
