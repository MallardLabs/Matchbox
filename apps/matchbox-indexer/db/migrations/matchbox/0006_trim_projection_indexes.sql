-- Keep only the activity_events indexes the webapp activity queries use; the
-- dev branch is capped at 1 GB. The block index served no reader, and source
-- is filtered in-query after action_type narrows the rows.
-- Kept: (timestamp desc, id), actor, recipient, gauge and action_type, each
-- with timestamp desc, all from 0004.

DROP INDEX IF EXISTS matchbox.activity_events_block_idx;
DROP INDEX IF EXISTS matchbox.activity_events_source_idx;
