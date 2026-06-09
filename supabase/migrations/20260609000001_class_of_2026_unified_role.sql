-- Unify all Academy semester roles into a single "Class of 2026" Discord role.
--
-- Qualification is two-tier:
--   Semester 0 (Apr 2 – May 28): must survive the ≥20 MEZO reward-floor cull.
--   Semester 1 (May 28 – Jul 23): any participation (pointsWad > 0) qualifies.
-- Both semesters grant the same role_id (set it below once the Discord role is ready).
--
-- The `require_floor` column drives which leaderboard filter and which role check
-- the edge functions apply per semester.

ALTER TABLE discord_semesters
  ADD COLUMN IF NOT EXISTS require_floor boolean NOT NULL DEFAULT true;

-- Re-activate Semester 0 with floor enforced; rename to "Class of 2026".
UPDATE discord_semesters
   SET active        = true,
       require_floor = true,
       label         = 'Class of 2026'
 WHERE semester_id = '0';

-- Semester 1: no floor on roles or leaderboard; same unified label.
UPDATE discord_semesters
   SET require_floor = false,
       label         = 'Class of 2026'
 WHERE semester_id = '1';

-- Set both semesters to share the same Discord role snowflake once it is created:
--   UPDATE discord_semesters SET role_id = '<CLASS_OF_2026_ROLE_SNOWFLAKE>'
--    WHERE semester_id IN ('0', '1');
