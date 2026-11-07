-- Scheduled jobs also send the shared job secret.
--
-- The guarded jobs (`_shared/serviceRoleAuth.ts`) accept the service role key
-- as the bearer, or `x-matchbox-job-secret` matching the function secret
-- `MATCHBOX_JOB_SECRET`. The Vault `service_role_key` these jobs send is a
-- different service role JWT from the functions' `SUPABASE_SERVICE_ROLE_KEY`,
-- so each job now also sends the Vault secret `matchbox_job_secret`. The
-- bearer stays: it still passes the gateway's verify_jwt.
--
-- Create the secret before applying, with the same value as the function
-- secret (never commit it):
--   SELECT vault.create_secret('<value>', 'matchbox_job_secret');
-- Without it the header is empty and only the bearer check applies.
--
-- `verify-gauge-ownership-hourly` replaces `verify-gauge-ownership-daily` (it
-- has run at :30 every hour) and gets a 60 s timeout: pg_net's 5 s default
-- cut off every response, so failures were invisible in net._http_response.
--
-- Idempotent: unschedules any earlier job of the same name first.
-- Rollback: re-run the cron.schedule blocks without the
-- x-matchbox-job-secret header (20261105000002 for discord-reconcile-roles).

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN (
  'record-gauge-history-daily',
  'verify-gauge-ownership-daily',
  'verify-gauge-ownership-hourly',
  'discord-reconcile-roles-hourly'
);

SELECT cron.schedule(
  'record-gauge-history-daily',
  '30 19 * * 3',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
      || '/functions/v1/record-gauge-history',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'
      ),
      'x-matchbox-job-secret', coalesce((
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'matchbox_job_secret'
      ), ''),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

SELECT cron.schedule(
  'verify-gauge-ownership-hourly',
  '30 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
      || '/functions/v1/verify-gauge-ownership',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'
      ),
      'x-matchbox-job-secret', coalesce((
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'matchbox_job_secret'
      ), ''),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

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
      'x-matchbox-job-secret', coalesce((
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'matchbox_job_secret'
      ), ''),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
