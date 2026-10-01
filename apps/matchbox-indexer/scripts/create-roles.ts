import { createLogger } from "@repo/shared/logger"
import { createDatabasePool } from "./database"

const logger = createLogger("matchbox-indexer-roles")

const roleSql = `
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'matchbox_api_ro') THEN
    CREATE ROLE matchbox_api_ro NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'matchbox_pro_rw') THEN
    CREATE ROLE matchbox_pro_rw NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'matchbox_indexer') THEN
    CREATE ROLE matchbox_indexer NOLOGIN;
  END IF;
  -- The Goldsky sink role from the pipeline spike. Ingest is RPC now, so it
  -- keeps no privileges where it still exists.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'goldsink') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA matchbox_raw FROM goldsink;
    REVOKE USAGE ON SCHEMA matchbox_raw FROM goldsink;
  END IF;
END
$roles$;

REVOKE CREATE ON SCHEMA matchbox_raw, matchbox, matchbox_pro, matchbox_scan FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA matchbox_raw, matchbox, matchbox_pro, matchbox_scan FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA matchbox_raw, matchbox, matchbox_pro, matchbox_scan FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA matchbox_raw, matchbox, matchbox_pro, matchbox_scan FROM PUBLIC;

GRANT USAGE ON SCHEMA matchbox_raw, matchbox, matchbox_pro TO matchbox_api_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA matchbox_raw, matchbox, matchbox_pro TO matchbox_api_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA matchbox_raw GRANT SELECT ON TABLES TO matchbox_api_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA matchbox GRANT SELECT ON TABLES TO matchbox_api_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA matchbox_pro GRANT SELECT ON TABLES TO matchbox_api_ro;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA matchbox, matchbox_pro FROM matchbox_api_ro;

GRANT USAGE ON SCHEMA matchbox_raw, matchbox, matchbox_pro TO matchbox_pro_rw;
GRANT SELECT ON ALL TABLES IN SCHEMA matchbox_raw, matchbox, matchbox_pro TO matchbox_pro_rw;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA matchbox_raw, matchbox, matchbox_pro FROM matchbox_pro_rw;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA matchbox, matchbox_pro FROM matchbox_pro_rw;

GRANT USAGE ON SCHEMA matchbox_raw, matchbox TO matchbox_indexer;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA matchbox_raw, matchbox TO matchbox_indexer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA matchbox TO matchbox_indexer;
ALTER DEFAULT PRIVILEGES IN SCHEMA matchbox_raw GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO matchbox_indexer;
ALTER DEFAULT PRIVILEGES IN SCHEMA matchbox GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO matchbox_indexer;
ALTER DEFAULT PRIVILEGES IN SCHEMA matchbox GRANT USAGE, SELECT ON SEQUENCES TO matchbox_indexer;
REVOKE ALL ON matchbox.schema_migrations FROM matchbox_indexer;

ALTER ROLE matchbox_api_ro SET statement_timeout = '2s';
ALTER ROLE matchbox_indexer SET statement_timeout = '10s';

DO $assertions$
BEGIN
  IF NOT has_table_privilege('matchbox_api_ro', 'matchbox_raw.logs', 'SELECT') THEN
    RAISE EXCEPTION 'matchbox_api_ro must be able to SELECT raw logs';
  END IF;
  IF has_table_privilege('matchbox_api_ro', 'matchbox_raw.logs', 'INSERT') THEN
    RAISE EXCEPTION 'matchbox_api_ro unexpectedly has INSERT on raw logs';
  END IF;
  IF NOT has_table_privilege('matchbox_indexer', 'matchbox_raw.logs', 'INSERT') THEN
    RAISE EXCEPTION 'matchbox_indexer must be able to INSERT raw logs';
  END IF;
  IF to_regclass('matchbox.contracts') IS NOT NULL
    AND NOT has_table_privilege('matchbox_indexer', 'matchbox.contracts', 'INSERT') THEN
    RAISE EXCEPTION 'matchbox_indexer must be able to INSERT contracts';
  END IF;
END
$assertions$;
`

async function main(): Promise<void> {
  const pool = createDatabasePool()
  try {
    await pool.query(roleSql)
    logger.info({ message: "Warehouse roles and privilege assertions passed" })
  } finally {
    await pool.end()
  }
}

main().catch((error: unknown) => {
  logger.error({
    message: "Role setup failed",
    error: error instanceof Error ? error.message : String(error),
  })
  process.exitCode = 1
})
