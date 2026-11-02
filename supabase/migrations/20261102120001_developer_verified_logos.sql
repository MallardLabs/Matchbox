-- Developer platform: the app logo staff saw, pinned for review and
-- verification (audit ID-03, follow-up).
--
-- `logo_url` is any HTTPS URL the developer controls. Matchbox ID rendered
-- it beside the consent "Verified" badge, so after approval the developer
-- could serve a different image at the same URL and keep the badge, and a
-- server could show staff one image and the console Worker another.
--
-- `mbx_dev_review_logos`: one row per open review, written when the review
-- is submitted. The console fetches `logo_url` server-side (HTTPS, manual
-- redirects re-checked per hop, 5 s for every hop and the body, 64 KiB,
-- PNG/JPEG/GIF/WebP by magic bytes). Staff review this copy, not the live
-- URL, and an approval must name its `sha256`.
--
-- `mbx_dev_verified_logos`: one row per environment, copied from the review
-- row by the staff approval before the review closes. Matchbox ID serves a
-- verified environment's logo only from this copy
-- (`GET /api/app-logos/:environmentId`), and only while the environment's
-- `verified_at` equals this row's `verified_at` and its app's `logo_url`
-- still equals `source_url`; otherwise it shows the initial. A row from an
-- approval that did not complete, or an earlier one, therefore never shows.
--
-- Service role only, like every mbx_dev_* table: RLS on, no policies, no
-- anon/authenticated privileges.
--
-- Deploy order: apply this before the console and Matchbox ID Workers.
--
-- Rollback (manual):
--   DROP TABLE IF EXISTS public.mbx_dev_verified_logos;
--   DROP TABLE IF EXISTS public.mbx_dev_review_logos;

CREATE TABLE IF NOT EXISTS public.mbx_dev_review_logos (
  review_id UUID PRIMARY KEY
    REFERENCES public.mbx_dev_reviews(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (
    content_type IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp')
  ),
  -- Base64 of at most 64 KiB.
  data_base64 TEXT NOT NULL CHECK (char_length(data_base64) <= 87384),
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  source_url TEXT NOT NULL,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mbx_dev_review_logos IS
  'Logo bytes fetched at review submission; staff review and approve this copy.';

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
  -- The environment's verified_at this copy belongs to; ignored otherwise.
  verified_at TIMESTAMPTZ NOT NULL,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mbx_dev_verified_logos IS
  'Logo bytes staff approved; Matchbox ID shows a verified app''s logo only from this copy.';

ALTER TABLE public.mbx_dev_review_logos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbx_dev_verified_logos ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  client_role TEXT;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format(
        'REVOKE ALL ON public.mbx_dev_review_logos FROM %I',
        client_role
      );
      EXECUTE format(
        'REVOKE ALL ON public.mbx_dev_verified_logos FROM %I',
        client_role
      );
    END IF;
  END LOOP;
END $$;
