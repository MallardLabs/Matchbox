-- Hourly `discord-reconcile-roles` run (pg_cron + pg_net).
--
-- Backfills `discord_wallet_links.discord_joined_at` (50 links per run) and,
-- while Academy is on, re-checks managed roles. Same Vault secrets as
-- `verify-gauge-ownership-daily`: `project_url` and `service_role_key`.
-- The function is deployed with verify_jwt, so the service role JWT is the
-- only caller check. A 60 s timeout covers a full 50-member backfill.
--
-- Idempotent: unschedules any earlier job of the same name first.
-- Rollback: SELECT cron.unschedule('discord-reconcile-roles-hourly');

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'discord-reconcile-roles-hourly';

SELECT cron.schedule(
  'discord-reconcile-roles-hourly',
  '7 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
      || '/functions/v1/discord-reconcile-roles',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'
      ),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
