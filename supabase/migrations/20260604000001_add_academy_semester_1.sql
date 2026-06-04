-- Add Mezo Academy Semester 1 so /academy has a live season.
--
-- Window is Thursday-aligned (epoch boundaries), 8 epochs long:
--   from_ts 1780531200 = 2026-06-04 00:00 UTC (Thursday)
--   to_ts   1785369600 = 2026-07-30 00:00 UTC (Thursday, +8 * 604800s)
--
-- role_id is left NULL for now: the /academy leaderboard window does not need a
-- Discord role, and the role can be filled in later (the discord-link role
-- reconciler ignores semesters without a role_id). Defensive ON CONFLICT keeps
-- this idempotent if Semester 1 already exists.
INSERT INTO discord_semesters (semester_id, label, from_ts, to_ts, role_id, active)
VALUES ('1', 'Semester 1', 1780531200, 1785369600, NULL, true)
ON CONFLICT (semester_id) DO NOTHING;
