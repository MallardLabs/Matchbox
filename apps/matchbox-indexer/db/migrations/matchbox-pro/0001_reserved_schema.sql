-- matchbox_pro is reserved for API-cron-owned read models in Phase B.
-- Its checksummed migration ledger is created by scripts/migrate.ts.

COMMENT ON SCHEMA matchbox_pro IS
  'API-cron-owned Matchbox Pro read models. No runtime tables in Phase A.';
