-- Stuart support reports (Matchbox Pro, Query frame 37).
--
-- A report is stored only after the user previewed it and pressed
-- "Submit report". The Pro Worker writes through create_support_report()
-- with the service role; anon and authenticated clients have no access.
-- Retention: 90 days. purge_expired_support_reports() deletes older rows;
-- scheduling it (pg_cron or an ops job) is an owner decision.
-- Feature flag: the Worker only accepts submissions when SUPABASE_URL and
-- SUPABASE_SERVICE_ROLE_KEY are set; GET /api/query/status reports it.

CREATE TABLE IF NOT EXISTS public.support_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_ref TEXT NOT NULL UNIQUE CHECK (public_ref ~ '^SR-[A-F0-9]{6}$'),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'triaged', 'replied', 'closed', 'spam')),
  kind TEXT NOT NULL
    CHECK (kind IN ('claim', 'vote', 'loan', 'zap', 'bridge', 'data', 'other')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  problem_statement TEXT NOT NULL
    CHECK (char_length(problem_statement) BETWEEN 10 AND 2000),
  chain_id INTEGER NOT NULL CHECK (chain_id IN (31611, 31612)),
  wallet_address TEXT CHECK (wallet_address ~ '^0x[0-9a-f]{40}$'),
  wallet_mode TEXT CHECK (wallet_mode IN ('connected', 'watching', 'inspecting')),
  -- Only the items the user kept in the preview.
  included JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- {email, consentedAt} only with explicit consent.
  contact JSONB,
  -- sha256 of the canonical JSON the user previewed and submitted.
  preview_hash TEXT NOT NULL CHECK (preview_hash ~ '^[0-9a-f]{64}$'),
  draft_id TEXT NOT NULL UNIQUE,
  -- HMAC of the client IP with a Worker secret; never the raw IP.
  ip_hash TEXT NOT NULL CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  reply TEXT,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_reports_wallet_created
  ON public.support_reports (wallet_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_reports_ip_created
  ON public.support_reports (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_reports_status_created
  ON public.support_reports (status, created_at);

-- RLS on with no policies: only the service role (which bypasses RLS) can
-- read or write.
ALTER TABLE public.support_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_reports FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_support_report(
  p_report JSONB,
  p_preview_hash TEXT,
  p_ip_hash TEXT
)
RETURNS TEXT AS $$
DECLARE
  v_wallet TEXT := lower(p_report -> 'wallet' ->> 'address');
  v_ref TEXT;
  v_attempt INTEGER := 0;
BEGIN
  -- Daily caps. SQLSTATE PT429 makes PostgREST answer HTTP 429.
  IF (
    SELECT count(*) FROM public.support_reports
    WHERE ip_hash = p_ip_hash AND created_at > NOW() - INTERVAL '24 hours'
  ) >= 10 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'PT429';
  END IF;
  IF v_wallet IS NOT NULL AND (
    SELECT count(*) FROM public.support_reports
    WHERE wallet_address = v_wallet AND created_at > NOW() - INTERVAL '24 hours'
  ) >= 5 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'PT429';
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_ref := 'SR-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.support_reports WHERE public_ref = v_ref
    );
    IF v_attempt >= 5 THEN
      RAISE EXCEPTION 'could not allocate a report reference';
    END IF;
  END LOOP;

  INSERT INTO public.support_reports (
    public_ref, kind, title, problem_statement, chain_id, wallet_address,
    wallet_mode, included, contact, preview_hash, draft_id, ip_hash
  ) VALUES (
    v_ref,
    p_report ->> 'kind',
    p_report ->> 'title',
    p_report ->> 'problemStatement',
    (p_report ->> 'chainId')::INTEGER,
    v_wallet,
    p_report -> 'wallet' ->> 'mode',
    COALESCE(p_report -> 'included', '[]'::jsonb),
    CASE WHEN jsonb_typeof(p_report -> 'contact') = 'object'
      THEN p_report -> 'contact' ELSE NULL END,
    p_preview_hash,
    p_report ->> 'draftId',
    p_ip_hash
  );
  RETURN v_ref;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.create_support_report(JSONB, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_support_report(JSONB, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_support_report(JSONB, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.purge_expired_support_reports()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.support_reports
  WHERE created_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.purge_expired_support_reports() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_support_reports() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_support_reports() TO service_role;
