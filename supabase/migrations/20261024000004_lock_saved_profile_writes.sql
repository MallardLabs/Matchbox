-- Saved profile templates: no more anonymous writes.
--
-- 20250330000001 let anyone insert, update or delete any saved_profiles row
-- through the anon key. Writes now go through the `manage-saved-profile` edge
-- function, which checks a wallet signature from the template's owner and
-- writes with the service role (as does the `verify-gauge-ownership` cron).
-- Templates stay publicly readable; the privacy policy says they are not
-- private.
--
-- Apply after the webapp that calls `manage-saved-profile` is deployed.
--
-- Rollback (manual, restores the old open access):
--   CREATE POLICY "Anyone can insert saved profiles" ON public.saved_profiles
--     FOR INSERT WITH CHECK (true);
--   CREATE POLICY "Anyone can update saved profiles" ON public.saved_profiles
--     FOR UPDATE USING (true);
--   CREATE POLICY "Anyone can delete saved profiles" ON public.saved_profiles
--     FOR DELETE USING (true);
--   GRANT INSERT, UPDATE, DELETE ON public.saved_profiles TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can insert saved profiles" ON public.saved_profiles;
DROP POLICY IF EXISTS "Anyone can update saved profiles" ON public.saved_profiles;
DROP POLICY IF EXISTS "Anyone can delete saved profiles" ON public.saved_profiles;

DO $$
DECLARE
  client_role TEXT;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.saved_profiles FROM %I',
        client_role
      );
      IF to_regclass('public.saved_profiles_id_seq') IS NOT NULL THEN
        EXECUTE format(
          'REVOKE USAGE, UPDATE ON SEQUENCE public.saved_profiles_id_seq FROM %I',
          client_role
        );
      END IF;
    END IF;
  END LOOP;
END $$;
