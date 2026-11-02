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
-- still PNG/JPEG/GIF/WebP by magic bytes). Staff review this copy, not the
-- live URL, and an approval must name its `sha256`. When the logo was not
-- pinned the row holds `refusal_reason` instead of bytes, so staff see why.
--
-- `mbx_dev_verified_logos`: one row per approval, keyed by the environment
-- and the `verified_at` the approval grants, copied from the review row
-- before the review closes. Matchbox ID serves a verified environment's logo
-- only from the row for its current `verified_at`
-- (`GET /api/app-logos/:environmentId`), and only while its app's `logo_url`
-- still equals `source_url`; otherwise it shows the initial. A row from an
-- approval that lost the close (two staff approving at once, or a withdraw)
-- never shows and overwrites no other row; the winner prunes older rows.
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
  -- The bytes, or null with refusal_reason set.
  content_type TEXT CHECK (
    content_type IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp')
  ),
  -- Base64 of at most 64 KiB.
  data_base64 TEXT CHECK (char_length(data_base64) <= 87384),
  sha256 TEXT CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  -- Why the logo was not pinned: "animated", "too-large", "timeout", ...
  refusal_reason TEXT CHECK (char_length(refusal_reason) <= 64),
  source_url TEXT NOT NULL,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mbx_dev_review_logos_pinned_or_refused CHECK (
    (
      refusal_reason IS NULL
      AND content_type IS NOT NULL
      AND data_base64 IS NOT NULL
      AND sha256 IS NOT NULL
    )
    OR (
      refusal_reason IS NOT NULL
      AND content_type IS NULL
      AND data_base64 IS NULL
      AND sha256 IS NULL
    )
  )
);

-- Converge a table made by an earlier shape of this migration (bytes NOT
-- NULL, no refusal_reason).
ALTER TABLE public.mbx_dev_review_logos
  ADD COLUMN IF NOT EXISTS refusal_reason TEXT
    CHECK (char_length(refusal_reason) <= 64);
ALTER TABLE public.mbx_dev_review_logos
  ALTER COLUMN content_type DROP NOT NULL,
  ALTER COLUMN data_base64 DROP NOT NULL,
  ALTER COLUMN sha256 DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.mbx_dev_review_logos'::regclass
      AND conname = 'mbx_dev_review_logos_pinned_or_refused'
  ) THEN
    ALTER TABLE public.mbx_dev_review_logos
      ADD CONSTRAINT mbx_dev_review_logos_pinned_or_refused CHECK (
        (
          refusal_reason IS NULL
          AND content_type IS NOT NULL
          AND data_base64 IS NOT NULL
          AND sha256 IS NOT NULL
        )
        OR (
          refusal_reason IS NOT NULL
          AND content_type IS NULL
          AND data_base64 IS NULL
          AND sha256 IS NULL
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.mbx_dev_review_logos IS
  'Logo bytes fetched at review submission, or why not; staff review and approve this copy.';

CREATE TABLE IF NOT EXISTS public.mbx_dev_verified_logos (
  environment_id UUID NOT NULL
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
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mbx_dev_verified_logos_pkey
    PRIMARY KEY (environment_id, verified_at)
);

-- Converge a table made by an earlier shape of this migration (no
-- verified_at, or one row per environment). A row without verified_at
-- belongs to no approval and could never show, so it is dropped.
ALTER TABLE public.mbx_dev_verified_logos
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
DELETE FROM public.mbx_dev_verified_logos WHERE verified_at IS NULL;
ALTER TABLE public.mbx_dev_verified_logos
  ALTER COLUMN verified_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_row
    JOIN pg_attribute column_row
      ON column_row.attrelid = constraint_row.conrelid
      AND column_row.attnum = ANY (constraint_row.conkey)
    WHERE constraint_row.conrelid = 'public.mbx_dev_verified_logos'::regclass
      AND constraint_row.contype = 'p'
      AND column_row.attname = 'verified_at'
  ) THEN
    ALTER TABLE public.mbx_dev_verified_logos
      DROP CONSTRAINT IF EXISTS mbx_dev_verified_logos_pkey;
    ALTER TABLE public.mbx_dev_verified_logos
      ADD CONSTRAINT mbx_dev_verified_logos_pkey
        PRIMARY KEY (environment_id, verified_at);
  END IF;
END $$;

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
