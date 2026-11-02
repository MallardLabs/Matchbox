-- Legacy gauge tables: no more anonymous writes.
--
-- gauge_history's "Service role can insert gauge history" policy has no TO
-- clause, so it applies to anon (audit MBX-04). profile_transfers keeps a
-- WITH CHECK (true) insert policy (MBX-L06), and profile_resets never enabled
-- RLS (MBX-L07). With the public anon key anyone could forge APY history,
-- block a gauge's profile transfers for any epoch, forge reset records and
-- fill the database disk shared with Matchbox ID (MBX-05).
--
-- Every writer is a service-role edge function, which bypasses RLS and keeps
-- its own grants: record-gauge-history and backfill-gauge-history-prices
-- (gauge_history), transfer-gauge-profile (profile_transfers, gauge_profiles),
-- verify-gauge-ownership (profile_resets, gauge_profiles) and
-- upsert-gauge-profile (gauge_profiles). gauge_profiles lost its anon write
-- policies in 20260620000001 but kept the table grants; they go too, and the
-- old policies are dropped again in case that migration never reached the
-- live database.
--
-- Public reads stay where the webapp uses them: gauge_history (gauge charts),
-- profile_transfers (transfer limit and history) and gauge_profiles. Nothing
-- outside the service role reads profile_resets, so anon and authenticated
-- lose SELECT on it as well.
--
-- Rollback (manual, restores the old open access):
--   CREATE POLICY "Service role can insert gauge history" ON public.gauge_history
--     FOR INSERT WITH CHECK (true);
--   CREATE POLICY "Users can insert profile transfers" ON public.profile_transfers
--     FOR INSERT WITH CHECK (true);
--   ALTER TABLE public.profile_resets DISABLE ROW LEVEL SECURITY;
--   GRANT ALL ON public.gauge_history, public.profile_transfers,
--     public.profile_resets, public.gauge_profiles TO anon, authenticated;
--   GRANT USAGE, SELECT ON SEQUENCE public.gauge_history_id_seq,
--     public.profile_transfers_id_seq, public.profile_resets_id_seq
--     TO anon, authenticated;

DROP POLICY IF EXISTS "Service role can insert gauge history" ON public.gauge_history;
DROP POLICY IF EXISTS "Users can insert profile transfers" ON public.profile_transfers;
DROP POLICY IF EXISTS "Users can insert gauge profiles" ON public.gauge_profiles;
DROP POLICY IF EXISTS "Users can update gauge profiles" ON public.gauge_profiles;

DO $$
BEGIN
  IF to_regclass('public.profile_resets') IS NOT NULL THEN
    ALTER TABLE public.profile_resets ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

DO $$
DECLARE
  client_role TEXT;
  target_table TEXT;
  target_sequence TEXT;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role);

    FOREACH target_table IN ARRAY ARRAY[
      'gauge_history', 'profile_transfers', 'profile_resets', 'gauge_profiles'
    ] LOOP
      CONTINUE WHEN to_regclass('public.' || target_table) IS NULL;
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM %I',
        target_table,
        client_role
      );
    END LOOP;

    -- The SERIAL id sequences; gauge_profiles is keyed by gauge_address.
    FOREACH target_table IN ARRAY ARRAY[
      'gauge_history', 'profile_transfers', 'profile_resets'
    ] LOOP
      CONTINUE WHEN to_regclass('public.' || target_table) IS NULL;
      target_sequence := pg_get_serial_sequence('public.' || target_table, 'id');
      IF target_sequence IS NOT NULL THEN
        EXECUTE format(
          'REVOKE ALL ON SEQUENCE %s FROM %I',
          target_sequence,
          client_role
        );
      END IF;
    END LOOP;

    IF to_regclass('public.profile_resets') IS NOT NULL THEN
      EXECUTE format('REVOKE SELECT ON public.profile_resets FROM %I', client_role);
    END IF;
  END LOOP;
END $$;
