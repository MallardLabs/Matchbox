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

### Matchbox Discord bot (`discord-interactions`, `discord-link`, `discord-reconcile-roles`)

These functions implement the Matchbox Discord bot, which links a Discord account to
a wallet and grants **per-semester roles** based on Mezo Academy points. A member
holds a semester's role iff they earned **> 0 points** during that semester's window.

- **`discord-interactions`** — Discord's HTTP Interactions endpoint. Handles the
  `/matchbox` slash command and the Unlink / Re-link buttons. Authenticates every
  request via the Ed25519 signature Discord attaches (no Supabase JWT), so deploy
  with `--no-verify-jwt`.
- **`discord-link`** — backs the web `/link` page. Resolves a link token to the
  Discord profile shown on the page, returns the message to sign, and verifies the
  wallet signature to store the link + reconcile semester roles. Also deploy with
  `--no-verify-jwt` (the link token + wallet signature are the proof).
- **`discord-reconcile-roles`** — scheduled job that re-checks every linked member's
  points per semester and adds/removes roles so they stay correct between `/matchbox`
  runs. **Not public** — schedule with pg_cron using the service-role key (default
  `verify_jwt`). Fetches each window's leaderboard once for efficiency.

Shared helpers live in `_shared/discord.ts` (Ed25519 verify, REST, role add/remove,
avatar URL) and `_shared/discordLink.ts` (signed-message format, token/nonce, points
lookup, semester role reconciliation). Data lives in `discord_wallet_links`,
`discord_link_tokens`, and `discord_semesters` (see
`supabase/migrations/20260529000001_create_discord_links.sql`).

**Semesters (seasons):** each row in `discord_semesters` defines a fixed point window
(`from_ts`/`to_ts`, unix seconds, Thursday-aligned) and the `role_id` to grant.
Semester 0 (2026-04-02 → 2026-05-28) is seeded with `role_id = NULL`. Add seasons /
fill in role IDs with SQL — no redeploy:
```sql
UPDATE discord_semesters SET role_id = '<S0 role id>' WHERE semester_id = '0';
INSERT INTO discord_semesters (semester_id, label, from_ts, to_ts, role_id)
VALUES ('1', 'Semester 1', <from>, <to>, '<S1 role id>');
```
Setting the optional `DISCORD_ROLE_ID` secret additionally grants a "current" role
based on the live rolling 8-epoch window. Leave it unset for semester-only roles.

**Flow:** `/matchbox` → bot replies with an ephemeral link to `/link?token=…` → user
connects a wallet and signs → `discord-link` verifies, stores the link, and grants a
role for each qualifying semester. Re-running `/matchbox` shows per-semester points +
an Unlink button.

#### Setup

1. **Create the Discord app/bot** in the
   [Developer Portal](https://discord.com/developers/applications). Note the
   **Application ID** and **Public Key** (General Information) and create a **Bot**
   to get the **Bot Token**. Invite the bot with the `applications.commands` scope
   and a bot scope that includes **Manage Roles**.
2. **Create one Discord role per semester** (e.g. "Semester 0"). The bot's own role
   must sit **above** them in the role list, or Discord will refuse to assign them.
   Record each role ID into `discord_semesters` (SQL above).
3. **Set function secrets:**
   ```bash
   supabase secrets set \
     DISCORD_APP_ID=... \
     DISCORD_PUBLIC_KEY=... \
     DISCORD_BOT_TOKEN=... \
     DISCORD_GUILD_ID=...   `# your server (guild) ID` \
     MATCHBOX_WEBAPP_URL=https://app.matchbox.markets \
     ACADEMY_NETWORK=mainnet
   # optional: also grant a live "current points" role
   # DISCORD_ROLE_ID=...
   ```
   `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are auto-provided.
4. **Deploy:**
   ```bash
   supabase functions deploy discord-interactions --no-verify-jwt
   supabase functions deploy discord-link --no-verify-jwt
   supabase functions deploy discord-reconcile-roles
   ```
5. **Set the Interactions Endpoint URL** in the Developer Portal (General
   Information) to:
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/discord-interactions`
   Discord sends a signed PING to validate it — it should save successfully.
6. **Register the `/matchbox` command** (guild-scoped, appears instantly):
   ```bash
   DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... \
     deno run --allow-env --allow-net \
     supabase/functions/discord-interactions/register-commands.ts
   ```
7. **Schedule reconciliation** (keeps roles current as points change). Use the
   Dashboard schedule on `discord-reconcile-roles`, or pg_cron (see Option 2 below)
   pointed at `.../functions/v1/discord-reconcile-roles`, e.g. hourly `0 * * * *`.

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

