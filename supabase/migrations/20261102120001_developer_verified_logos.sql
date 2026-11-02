-- Developer platform: the app logo staff saw, pinned at verification
-- (audit ID-03, follow-up).
--
-- `logo_url` is any HTTPS URL the developer controls. Matchbox ID rendered
-- it beside the consent "Verified" badge, so after approval the developer
-- could serve a different image at the same URL and keep the badge.
--
-- `mbx_dev_verified_logos`: one row per environment, written by the
-- console's staff approval. The console fetches `logo_url` server-side
-- (HTTPS, 5 s, 64 KiB, PNG/JPEG/GIF/WebP by magic bytes) and stores the
-- bytes. Matchbox ID serves a verified environment's logo only from this
-- copy (`GET /api/app-logos/:environmentId`), and only while `source_url`
-- still equals the app's `logo_url`; otherwise it shows the initial. The row
-- is replaced or deleted on every approval and is ignored while the
-- environment is unverified.
--
-- Service role only, like every mbx_dev_* table: RLS on, no policies, no
-- anon/authenticated privileges.
--
-- Deploy order: apply this before the console and Matchbox ID Workers.
--
-- Rollback (manual):
--   DROP TABLE IF EXISTS public.mbx_dev_verified_logos;

CREATE TABLE IF NOT EXISTS public.mbx_dev_verified_logos (
  environment_id UUID PRIMARY KEY
    REFERENCES public.mbx_dev_environments(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (
    content_type IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp')
  ),
  -- Base64 of at most 64 KiB.
  data_base64 TEXT NOT NULL CHECK (char_length(data_base64) <= 87384),
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  source_url TEXT NOT NULL,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mbx_dev_verified_logos IS
  'Logo bytes fetched at staff approval; Matchbox ID shows a verified app''s logo only from this copy.';

ALTER TABLE public.mbx_dev_verified_logos ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  client_role TEXT;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format(
        'REVOKE ALL ON public.mbx_dev_verified_logos FROM %I',
        client_role
      );
    END IF;
  END LOOP;
END $$;
