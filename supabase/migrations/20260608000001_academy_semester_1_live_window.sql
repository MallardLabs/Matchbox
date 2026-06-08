-- Switch the /academy window to the live "current space of 8 epochs":
-- 2026-05-28 .. 2026-07-23 (Thursday-aligned, 8 epochs). This redefines
-- Semester 1 as that window and retires Season 0 from the displayed union.
-- The /academy page unions all rows with active = true and labels the cohort
-- "Class of 2026" (no semester name is shown). role_id stays NULL, so Discord
-- role assignment is unaffected.
--
--   from_ts 1779926400 = 2026-05-28 00:00 UTC (Thursday)
--   to_ts   1784764800 = 2026-07-23 00:00 UTC (Thursday, = from_ts + 8 * 604800s)

-- Retire Season 0 (reversible; preserves the row and its history).
UPDATE discord_semesters SET active = false WHERE semester_id = '0';

-- Redefine Semester 1 as the live 8-epoch window. Upsert so this is robust even
-- if Semester 1 was never seeded in a given environment. Only the window +
-- active flag change; label/role_id are left intact on conflict.
INSERT INTO discord_semesters (semester_id, label, from_ts, to_ts, role_id, active)
VALUES ('1', 'Semester 1', 1779926400, 1784764800, NULL, true)
ON CONFLICT (semester_id) DO UPDATE
  SET from_ts = EXCLUDED.from_ts,
      to_ts   = EXCLUDED.to_ts,
      active  = true;
