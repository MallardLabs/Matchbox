# Supabase Edge Functions

This directory contains Supabase Edge Functions for the Matchbox application.

## Functions

### `record-gauge-history`

Records daily snapshots of gauge performance metrics into the `gauge_history` table. This enables historical data visualization on gauge detail pages.

**Metrics captured:**
- veMEZO voting weight
- veBTC voting power
- Boost multiplier
- Total incentives (USD)
- Calculated APY

## Setup & Deployment

### Prerequisites

1. Install the Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

3. Link your project:
   ```bash
   cd /path/to/Matchbox
   supabase link --project-ref YOUR_PROJECT_REF
   ```

### Environment Variables

Set the required secrets:

```bash
# Mezo RPC endpoint (optional, defaults to testnet)
supabase secrets set MEZO_RPC_URL=https://rpc.test.mezo.org

# These are auto-provided by Supabase:
# - SUPABASE_URL
# - SUPABASE_SERVICE_ROLE_KEY
```

### Deploy the Function

```bash
supabase functions deploy record-gauge-history
```

### Configure Daily Cron Job

#### Option 1: Supabase Dashboard Schedule (EASIEST)

1. Deploy your function: `supabase functions deploy record-gauge-history`
2. Go to **Supabase Dashboard** → **Edge Functions**
3. Find `record-gauge-history` in the list
4. Click the **...** menu → **Schedule**
5. Set the cron expression: `0 0 * * *` (daily at midnight UTC)

This method automatically handles authentication - no service key needed!

#### Option 2: Using pg_cron with Vault (Advanced)

If you prefer SQL-based scheduling:

1. **Enable Extensions** in Dashboard → Database → Extensions:
   - Enable `pg_cron`
   - Enable `pg_net` 

2. **Store your service role key in Vault:**
   - Go to Dashboard → Settings → Vault
   - Add a new secret named `service_role_key` with your service role key value
   - (Find your service role key in Settings → API)

3. **Schedule the job** via SQL Editor:

```sql
SELECT cron.schedule(
  'record-gauge-history-daily',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/record-gauge-history',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret 
        FROM vault.decrypted_secrets 
        WHERE name = 'service_role_key'
      ),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

4. **Verify the job was created:**
```sql
SELECT * FROM cron.job;
```

### Manual Testing

You can manually invoke the function via HTTP:

```bash
curl -X POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/record-gauge-history' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json'
```

Or locally:

```bash
supabase functions serve record-gauge-history --env-file .env.local
```

## Local Development

1. Create a `.env.local` file:
   ```
   MEZO_RPC_URL=https://rpc.test.mezo.org
   SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

2. Run the function locally:
   ```bash
   supabase functions serve --env-file .env.local
   ```

3. Test with curl:
   ```bash
   curl -X POST http://localhost:54321/functions/v1/record-gauge-history
   ```

## Troubleshooting

### Function not triggering

- Ensure `pg_cron` and `pg_net` extensions are enabled
- Check the cron job exists: `SELECT * FROM cron.job;`
- Check cron job history: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`

### Service role key issues with pg_cron

If you get authentication errors when using pg_cron:

1. **Use Dashboard scheduling instead** (Option 1 above) - it handles auth automatically
2. Or store the key in Vault and reference it:
   ```sql
   -- First add 'service_role_key' to Vault via Dashboard
   -- Then use this in your cron job:
   (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
   ```
3. Check the vault secret exists:
   ```sql
   SELECT name FROM vault.decrypted_secrets;
   ```

### RPC errors

- Verify `MEZO_RPC_URL` is set correctly
- Check RPC endpoint is accessible from Supabase's network

### Database errors

- Ensure the `gauge_history` table exists (run migrations)
- Check service role key has write permissions

### Checking cron job results

```sql
-- See recent job runs and their status
SELECT 
  jobid,
  runid,
  job_pid,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 20;
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│   pg_cron       │────▶│  Edge Function   │────▶│  Mezo RPC   │
│  (daily 00:00)  │     │                  │     │             │
└─────────────────┘     │  1. Fetch gauges │     └─────────────┘
                        │  2. Read metrics │
                        │  3. Calculate APY│
                        │  4. Write to DB  │────▶ gauge_history
                        └──────────────────┘
```

