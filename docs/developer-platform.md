# Matchbox Developer Platform README

This is the step-by-step guide for running, deploying, and operating the Matchbox Developer Platform:

- `id.matchbox.markets` - Matchbox ID, wallet-first sign-in, OAuth-style consent, and Connected Apps.
- `developer.matchbox.markets` - developer organizations, registered apps, API keys, docs, and usage.
- `api.matchbox.markets/v1` - the public Developer API for gauges and consent-protected profile data.

The important mental model: developer accounts use Google or email magic links, but end-user identity is wallet-first. Discord is profile data and a path into the web flow; it is not the authority that grants API access.

## 0. What was implemented

The implementation spans the existing app, a new identity/developer frontend, a new Cloudflare Worker API, a Supabase schema migration, and a TypeScript SDK.

| Area | Location | Purpose |
| --- | --- | --- |
| Matchbox ID and developer portal | `apps/developer-platform` | Next.js app serving `id.matchbox.markets`, `developer.matchbox.markets`, and a Netlify proxy for `api.matchbox.markets` |
| Developer API | `apps/developer-api` | Cloudflare Worker with Durable Object rate limits |
| TypeScript SDK | `packages/developer-sdk` | `@matchbox-markets/sdk` client for partners |
| Supabase schema | `supabase/migrations/20260620000001_create_developer_platform.sql` | Developer orgs, apps, keys, grants, auth codes, audit events, and profile hardening |
| Gauge profile write function | `supabase/functions/upsert-gauge-profile` | Ownership-gated gauge profile updates |
| Wallet continuity bridge | `apps/webapp/src/pages/id-bridge.tsx` | Lets Matchbox ID detect a wallet already connected on `app.matchbox.markets` |
| Existing app hook updates | `apps/webapp/src/hooks/useGaugeProfiles.ts` | Routes profile writes through the ownership-gated function |

The public v1 API exposes:

- `GET /v1/gauges/{gaugeAddress}`
- `GET /v1/vebtc/{tokenId}/gauge`
- `GET /v1/profiles/by-wallet/{walletAddress}`
- `POST /v1/authorizations/exchange`

Profile access is consent-protected. There is intentionally no Discord-to-wallet lookup endpoint, no bulk profile export, no fuzzy search, and no listing endpoint.

## 1. Production topology

The recommended topology keeps Spaceship authoritative for DNS and keeps the existing Matchbox app on Netlify.

```text
app.matchbox.markets
  Existing Matchbox Netlify site
  Includes /id-bridge for best-effort wallet continuity

id.matchbox.markets
developer.matchbox.markets
api.matchbox.markets
  New developer-platform Netlify site
  id/developers render Next.js pages
  api reverse-proxies requests to the Worker

matchbox-developer-api.<cloudflare-account>.workers.dev
  Cloudflare Worker + Durable Object quota limiter
  Talks to Supabase and Mezo RPC
```

Yes: the API itself is a separate Cloudflare Workers deployment.

Because the domain stays on Spaceship DNS, `api.matchbox.markets` should be attached to the new Netlify site and proxied to the Worker's `workers.dev` URL by the developer-platform middleware. Cloudflare's direct Worker custom-domain flow expects a Cloudflare-managed zone. You do not need to move nameservers to Cloudflare.

Do not point a Spaceship CNAME directly at a `workers.dev` hostname. Use the Netlify custom-domain target for `api.matchbox.markets`, same as `id` and `developers`.

## 2. Feature flags and safety model

There are two independent kill switches:

| Flag | Where | Effect |
| --- | --- | --- |
| `DEVELOPER_PLATFORM_ENABLED` | Netlify developer-platform site and Cloudflare Worker | Enables the portal and public API operations |
| `DEVELOPER_PROFILE_API_ENABLED` | Netlify developer-platform site and Cloudflare Worker | Enables consent-protected profile reads |

Default both to `false` for first deployment.

Recommended rollout:

1. Deploy schema, functions, frontend, Worker, and DNS with both flags disabled.
2. Internally test wallet sign-in, app registration, exact redirect validation, and consent.
3. Enable `DEVELOPER_PLATFORM_ENABLED` for developer signup and approved-app gauge access.
4. Keep `DEVELOPER_PROFILE_API_ENABLED=false` until the consent flow has been reviewed.
5. Enable profile access only for selected partners.
6. Expand the private beta while monitoring quota pressure, denied access, revocations, RPC health, and latency.

## 3. Required accounts and credentials

You need:

- Supabase project access.
- Supabase service-role key.
- Supabase anon key.
- Google OAuth credentials for developer sign-in.
- Supabase Web3/Ethereum auth enabled for Matchbox ID.
- WalletConnect/Reown project ID.
- Cloudflare account for the Worker.
- Netlify access for:
  - the existing Matchbox app site;
  - a new developer-platform site.
- Spaceship DNS access for `matchbox.markets`.

Generate two high-entropy secrets:

- `API_KEY_PEPPER` - shared by the developer portal and Worker; used to HMAC API keys.
- `API_GATEWAY_SECRET` - shared by the Netlify proxy and Worker; lets the Worker trust forwarded client IPs from `api.matchbox.markets`.

Generate each secret separately:

```powershell
$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Keep both in a password manager. Never expose either as a `NEXT_PUBLIC_*` value.

## 4. Local development

Install dependencies from the repository root:

```powershell
pnpm install
```

Create local environment files.

For the developer portal:

```powershell
Copy-Item apps\developer-platform\.env.example apps\developer-platform\.env.local
```

Fill in:

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
API_KEY_PEPPER=...same value as Worker...
DEVELOPER_API_ORIGIN=http://127.0.0.1:8787
API_GATEWAY_SECRET=...same value as Worker...
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ID_URL=http://localhost:3001
NEXT_PUBLIC_DEVELOPER_URL=http://localhost:3001
DEVELOPER_PLATFORM_ENABLED=false
DEVELOPER_PROFILE_API_ENABLED=false
```

For the Worker:

```powershell
Copy-Item apps\developer-api\.dev.vars.example apps\developer-api\.dev.vars
```

Fill in:

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
API_KEY_PEPPER=...same value as portal...
API_GATEWAY_SECRET=...same value as portal...
MEZO_RPC_URL=https://mezo-mainnet.boar.network
DEVELOPER_PLATFORM_ENABLED=false
DEVELOPER_PROFILE_API_ENABLED=false
```

Run the surfaces in separate terminals:

```powershell
pnpm --filter @repo/webapp dev
pnpm --filter @repo/developer-platform dev
pnpm --filter @repo/developer-api dev
```

Expected local ports:

- Existing Matchbox app: usually `http://localhost:3000`.
- Matchbox ID/developer portal: `http://localhost:3001`.
- Developer API Worker: usually `http://127.0.0.1:8787`.

Useful local checks:

```powershell
pnpm --filter @repo/developer-platform typecheck
pnpm --filter @repo/developer-platform lint
pnpm --filter @repo/developer-platform test

pnpm --filter @repo/developer-api typecheck
pnpm --filter @repo/developer-api lint
pnpm --filter @repo/developer-api test
pnpm --filter @repo/developer-api build

pnpm --filter @matchbox-markets/sdk typecheck
pnpm --filter @matchbox-markets/sdk lint
pnpm --filter @matchbox-markets/sdk test
pnpm --filter @matchbox-markets/sdk build
```

## 5. Supabase setup

### 5.1 Apply the migration

Apply:

```text
supabase/migrations/20260620000001_create_developer_platform.sql
```

If the project is linked to the Supabase CLI:

```powershell
supabase db push
```

Otherwise:

1. Open Supabase Dashboard.
2. Go to SQL Editor.
3. Paste the migration.
4. Run it once.

The migration is designed defensively, but treat this as a production security migration. It creates the developer-platform tables and hardens existing gauge profile writes.

Important: this migration removes permissive anonymous gauge-profile and avatar writes. Deploy the replacement Edge Function before relying on production profile editing.

### 5.2 Deploy the ownership-gated gauge profile function

Deploy:

```powershell
supabase functions deploy upsert-gauge-profile --no-verify-jwt
supabase secrets set MEZO_RPC_URL=https://mezo-mainnet.boar.network
```

The function performs its own nonce, wallet signature, and on-chain ownership checks. It intentionally does not rely on Supabase's gateway JWT check.

### 5.3 Configure Supabase Auth

In Supabase Dashboard -> Authentication:

1. Enable email magic links.
2. Configure Google OAuth for developer accounts.
3. Enable Web3/Ethereum sign-in for Matchbox ID.
4. Set the production site URL to:

   ```text
   https://id.matchbox.markets
   ```

5. Add allowed redirect URLs:

   ```text
   https://id.matchbox.markets/**
   https://developer.matchbox.markets/**
   http://localhost:3001/**
   ```

6. Add the Supabase Google callback URL from the dashboard to your Google OAuth client.

## 6. Redeploy the existing Matchbox app

The existing app now includes:

```text
https://app.matchbox.markets/id-bridge
```

This route is used by Matchbox ID in a hidden iframe to discover whether the user already has a connected wallet on the existing Matchbox app origin.

The bridge:

- can see the existing app's wallet state because it runs on `app.matchbox.markets`;
- reports only the connected address to `id.matchbox.markets`;
- forwards only narrowly allowlisted wallet methods needed for SIWE:
  - `eth_requestAccounts`
  - `eth_accounts`
  - `eth_chainId`
  - `personal_sign`
- never signs automatically;
- never submits a transaction;
- falls back cleanly to normal wallet connection when browser privacy settings block the bridge.

Add this variable to the existing Matchbox Netlify site:

```text
NEXT_PUBLIC_ID_URL=https://id.matchbox.markets
```

Confirm the existing app also has:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=...
```

Redeploy the existing Matchbox app.

Smoke test:

```powershell
curl.exe https://app.matchbox.markets/id-bridge
```

In a browser, visiting the route directly should show a protected bridge explanation. In an iframe under `id.matchbox.markets`, it should act as the wallet continuity bridge.

## 7. Deploy the Cloudflare Worker API

The Worker lives at:

```text
apps/developer-api
```

Authenticate Wrangler:

```powershell
pnpm --filter @repo/developer-api exec wrangler login
```

Set Worker secrets:

```powershell
pnpm --filter @repo/developer-api exec wrangler secret put SUPABASE_URL
pnpm --filter @repo/developer-api exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY
pnpm --filter @repo/developer-api exec wrangler secret put API_KEY_PEPPER
pnpm --filter @repo/developer-api exec wrangler secret put API_GATEWAY_SECRET
pnpm --filter @repo/developer-api exec wrangler secret put MEZO_RPC_URL
```

Deploy:

```powershell
pnpm --filter @repo/developer-api deploy
```

The first deployment also creates the Durable Object migration for per-key quotas.

Record the resulting `workers.dev` URL, for example:

```text
https://matchbox-developer-api.YOUR_ACCOUNT.workers.dev
```

Smoke test the Worker directly:

```powershell
curl.exe https://matchbox-developer-api.YOUR_ACCOUNT.workers.dev/health
curl.exe https://matchbox-developer-api.YOUR_ACCOUNT.workers.dev/openapi.json
```

With both feature flags disabled, `/health` should respond and report disabled state. Protected API operations should not be usable yet.

## 8. Deploy the developer-platform Netlify site

Create a new Netlify site from the same Git repository. This must be separate from the existing Matchbox app site.

Use these Netlify build settings:

| Setting | Value |
| --- | --- |
| Base directory | `apps/developer-platform` |
| Build command | use the included `netlify.toml` command |
| Publish directory | `.next` |
| Production branch | same production branch used for Matchbox |

Add these environment variables to the new Netlify site:

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
API_KEY_PEPPER=...same value as Worker...
DEVELOPER_API_ORIGIN=https://matchbox-developer-api.YOUR_ACCOUNT.workers.dev
API_GATEWAY_SECRET=...same value as Worker...
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=...
NEXT_PUBLIC_APP_URL=https://app.matchbox.markets
NEXT_PUBLIC_ID_URL=https://id.matchbox.markets
NEXT_PUBLIC_DEVELOPER_URL=https://developer.matchbox.markets
DEVELOPER_PLATFORM_ENABLED=false
DEVELOPER_PROFILE_API_ENABLED=false
```

Deploy once before adding custom domains. Confirm the generated `*.netlify.app` URL loads.

The app uses host-aware routing:

- `id.matchbox.markets` routes to Matchbox ID.
- `developer.matchbox.markets` routes to the developer console.
- `api.matchbox.markets` proxies to `DEVELOPER_API_ORIGIN`.

## 9. Configure Spaceship DNS and Netlify domains

In the new Netlify site, add three custom domains:

```text
id.matchbox.markets
developer.matchbox.markets
api.matchbox.markets
```

Netlify will show the DNS target for the site. It is usually a hostname ending in `netlify.app`.

In Spaceship DNS, create three records:

| Type | Host | Value |
| --- | --- | --- |
| CNAME | `id` | Netlify-provided target for the new site |
| CNAME | `developers` | same Netlify target |
| CNAME | `api` | same Netlify target |

Before adding them, remove any conflicting A, AAAA, or CNAME records for those hosts.

Leave TTL on Automatic/default unless you have a specific reason to lower it temporarily.

Do not change the domain nameservers.

Wait for Netlify to verify DNS and provision TLS for all three hosts.

## 10. Disabled-state smoke test

With both feature flags still disabled, verify:

```powershell
curl.exe https://api.matchbox.markets/health
curl.exe https://api.matchbox.markets/openapi.json
```

Then check in the browser:

- `https://id.matchbox.markets/apps`
- `https://developer.matchbox.markets/developers`
- `https://developer.matchbox.markets/docs`

Expected behavior:

- The surfaces render.
- Operations that require the platform flag are disabled.
- The API health response reports `platformEnabled: false`.
- The Netlify proxy reaches the Worker.
- Logs do not expose service-role keys, API keys, profile response bodies, or authorization codes.

## 11. Enable internal platform testing

Enable:

```text
DEVELOPER_PLATFORM_ENABLED=true
```

Set it in two places:

1. The new Netlify developer-platform site, then redeploy.
2. The Worker environment, then redeploy.

If you are using the checked-in Worker config for the flag, update `apps/developer-api/wrangler.jsonc` and run:

```powershell
pnpm --filter @repo/developer-api deploy
```

Keep this disabled:

```text
DEVELOPER_PROFILE_API_ENABLED=false
```

Now test the developer path:

1. Go to `https://developer.matchbox.markets/developers`.
2. Sign in with Google or email magic link.
3. Confirm a personal organization is created.
4. Register an app.
5. Add exact redirect URIs.
6. Add app origins.
7. Submit for review.

Approve a private-beta app manually in Supabase after review:

```sql
UPDATE public.developer_apps
SET status = 'approved',
    approved_scopes = ARRAY['gauges:read']::TEXT[]
WHERE client_id = 'mbx_client_REPLACE_ME';
```

Create a publishable or server key in the developer console.

Test gauge access:

```powershell
curl.exe `
  -H "Authorization: Bearer mbx_sk_live_REPLACE_ME" `
  https://api.matchbox.markets/v1/gauges/0xREPLACE_GAUGE_ADDRESS
```

Test key rotation:

1. Create a second key.
2. Switch the test client to the second key.
3. Revoke the first key.
4. Confirm the first key immediately fails.

## 12. Test Matchbox ID authorization

Build a test authorization URL:

```text
https://id.matchbox.markets/authorize?client_id=mbx_client_REPLACE_ME&redirect_uri=https%3A%2F%2Fpartner.example%2Fcallback&state=test-state-123
```

The `redirect_uri` must exactly match one of the app's registered redirect URIs. No partial matching, wildcard matching, or "close enough" matching should pass.

Test flow:

1. Connect a wallet at `https://app.matchbox.markets`.
2. Open the authorization URL in the same browser.
3. Matchbox ID should best-effort detect the connected wallet through `/id-bridge`.
4. Click Continue.
5. Confirm the wallet prompt is an EIP-4361 message bound to `id.matchbox.markets`.
6. Confirm it is gasless and not a transaction.
7. Reject once and verify recovery.
8. Sign successfully.
9. Review the exact fields shown on the consent screen.
10. Authorize the app.
11. Confirm redirect preserves `state`.
12. Confirm the redirect includes a short-lived authorization `code`.

Then exchange the code from a server-side context:

```powershell
curl.exe `
  -X POST https://api.matchbox.markets/v1/authorizations/exchange `
  -H "Authorization: Bearer mbx_sk_live_REPLACE_ME" `
  -H "Content-Type: application/json" `
  --data '{ "code": "REPLACE_CODE", "redirectUri": "https://partner.example/callback" }'
```

Expected:

- First exchange succeeds.
- Second exchange with the same code fails.
- Expired codes fail.
- Codes exchanged with the wrong app key fail.
- Codes exchanged with the wrong redirect URI fail.

## 13. Test Connected Apps and revocation

Go to:

```text
https://id.matchbox.markets/apps
```

Test:

1. Sign in with the same wallet.
2. Confirm authorized apps are listed.
3. Confirm granted fields are visible.
4. Confirm app website, privacy policy, and terms links are visible where configured.
5. Revoke a grant.
6. Confirm the confirmation dialog is keyboard accessible.
7. Confirm revocation takes effect immediately.
8. Confirm profile reads for that wallet/app now return:

   ```json
   {
     "error": {
       "code": "profile_not_available"
     }
   }
   ```

Unknown wallets, unlinked wallets, and non-consenting wallets should all return the same 404 shape. This is deliberate privacy behavior.

## 14. Enable selected profile partners

Only after consent-flow review, enable:

```text
DEVELOPER_PROFILE_API_ENABLED=true
```

Set it in both:

1. The new Netlify developer-platform site, followed by redeploy.
2. The Worker environment, followed by redeploy.

Approve `profile:read` only for reviewed apps:

```sql
UPDATE public.developer_apps
SET approved_scopes = ARRAY['gauges:read', 'profile:read']::TEXT[]
WHERE client_id = 'mbx_client_REPLACE_ME';
```

Changing approved scopes increments the app scope version, so existing grants do not silently gain additional access. Users must consent again to the new scope version.

Test profile access:

```powershell
curl.exe `
  -H "Authorization: Bearer mbx_sk_live_REPLACE_ME" `
  https://api.matchbox.markets/v1/profiles/by-wallet/0xREPLACE_WALLET
```

Expected access requirements:

- Secret key only.
- App must be approved.
- Key must include `profile:read`.
- App must include approved `profile:read`.
- Wallet must have an active grant for that app and scope version.
- Profile API flag must be enabled.

Publishable keys must not access profile endpoints.

## 15. Partner-facing quickstart

Once private beta partners are approved, the partner flow is:

1. Sign in at `https://developer.matchbox.markets/developers`.
2. Create or select an organization.
3. Register an app.
4. Add exact redirect URIs.
5. Add browser origins if using publishable gauge keys from a browser.
6. Submit the app for review.
7. After approval, create an API key.
8. For public gauge reads, call gauge endpoints with a key that has `gauges:read`.
9. For profile reads, send users through:

   ```text
   https://id.matchbox.markets/authorize?client_id=...&redirect_uri=...&state=...
   ```

10. Exchange the returned code server-side:

    ```text
    POST https://api.matchbox.markets/v1/authorizations/exchange
    ```

11. Store the returned wallet/profile association in the partner app only as permitted by their privacy policy and Matchbox's beta terms.

Example SDK usage:

```ts
import { MatchboxClient } from "@matchbox-markets/sdk";

const matchbox = new MatchboxClient({
  apiKey: process.env.MATCHBOX_API_KEY!,
});

const gauge = await matchbox.getGauge("0x...");
```

Profile lookup:

```ts
const profile = await matchbox.getProfileByWallet("0x...");
```

SDK package:

```text
packages/developer-sdk
```

OpenAPI contract:

```text
apps/developer-api/openapi.json
```

Interactive docs:

```text
https://developer.matchbox.markets/docs
```

## 16. Security checklist

Before widening the beta, verify:

- Service-role key is only present server-side.
- `API_KEY_PEPPER` is only present in server environments.
- `API_GATEWAY_SECRET` matches between Netlify and Worker.
- No secrets are `NEXT_PUBLIC_*`.
- Supabase redirect URLs are exact and production-safe.
- App redirect URI validation is exact.
- Authorization codes are single-use and expire within five minutes.
- Profile responses use `Cache-Control: private, no-store`.
- Authorization exchange responses use `Cache-Control: private, no-store`.
- Gauge responses may be edge cached briefly and include ETags.
- Logs contain request IDs but no profile response bodies.
- Publishable keys are origin restricted and `gauges:read` only.
- Secret keys are rejected from browser origins.
- Optional CIDR allowlists are enforced against the true client IP.
- Suspended apps cannot use keys or grants.
- Revoked grants take effect immediately.
- Wallet/Discord relinking revokes affected grants.
- CSP, clickjacking protection, CSRF protection, secure cookies, and API-key redaction are active.

## 17. Test checklist

### Wallet and SIWE

- Nonce replay fails.
- Wrong domain fails.
- Expired SIWE message fails.
- Wallet switching is handled.
- Rejected signatures recover cleanly.
- Unsupported networks show clear errors.
- Mobile-wallet return paths work.
- Existing Matchbox wallet continuity works where browser policy allows.
- Normal Connect Wallet fallback works where continuity is blocked.

### OAuth-style authorization

- Exact redirect matching.
- `state` preservation.
- Cancel redirects correctly.
- Authorization code is short-lived.
- Authorization code is single-use.
- Code is bound to app, redirect URI, and wallet.
- App suspension invalidates use.
- Scope change requires fresh consent.
- Revocation immediately blocks profile access.

### API keys and quotas

- Publishable keys can only access gauge endpoints.
- Publishable keys require approved browser origins.
- Secret keys cannot be used from unapproved browser origins.
- CIDR allowlist works for secret keys.
- Revoked keys fail immediately.
- Expired keys fail.
- Per-minute and daily quota failures are shaped consistently.
- Usage metadata and last-used metadata update.

### API contracts

- Gauge responses match OpenAPI.
- Profile responses match OpenAPI.
- Error responses match OpenAPI.
- SDK contract tests pass.
- ETags work for gauge endpoints.
- Profile and authorization responses are not cached.

### Accessibility and UI

- Consent flow works with keyboard only.
- Connected Apps revocation dialog restores focus.
- Screen-reader labels describe wallet, app, scopes, and actions.
- Reduced motion is respected.
- Loading skeletons do not shift layout.
- Inline errors are visible and actionable.
- Color contrast passes WCAG expectations.

### Supabase and data integrity

- Migration can run on populated data.
- Migration can be defensively rerun.
- RLS boundaries hold for anonymous and authenticated users.
- Direct anonymous gauge profile writes fail.
- Direct anonymous avatar writes fail.
- Ownership-gated Edge Function accepts the owner.
- Ownership-gated Edge Function rejects non-owners.

## 18. Emergency controls

Use the narrowest control that solves the incident.

| Incident | Action |
| --- | --- |
| Profile API concern | Set `DEVELOPER_PROFILE_API_ENABLED=false` in Netlify and Worker, redeploy both |
| Whole platform concern | Set `DEVELOPER_PLATFORM_ENABLED=false` in Netlify and Worker, redeploy both |
| Bad partner app | Set app status to `suspended` |
| Leaked API key | Revoke that key |
| Bad user grant | Revoke that grant |
| Pepper compromise | Rotate `API_KEY_PEPPER`; this invalidates all existing API keys |
| Gateway secret compromise | Rotate `API_GATEWAY_SECRET` in both Netlify and Worker |

Useful suspension SQL:

```sql
UPDATE public.developer_apps
SET status = 'suspended'
WHERE client_id = 'mbx_client_REPLACE_ME';
```

## 19. Troubleshooting

### `api.matchbox.markets` returns a Netlify page instead of API JSON

Check:

- The custom domain is attached to the developer-platform Netlify site, not the existing app.
- `DEVELOPER_API_ORIGIN` is set to the Worker `workers.dev` URL.
- `API_GATEWAY_SECRET` is set in Netlify and Worker.
- The developer-platform middleware is deployed.

### Worker direct URL works, but `api.matchbox.markets` fails

This is usually Netlify proxy configuration or DNS.

Check:

- Spaceship CNAME for `api` points to the Netlify target.
- Netlify TLS is provisioned for `api.matchbox.markets`.
- `DEVELOPER_API_ORIGIN` has no trailing path.
- Netlify function/edge logs show the proxy request.

### Wallet continuity does not auto-detect the existing wallet

This is best effort. It can fail when:

- the user is in a different browser/profile;
- third-party iframe storage is blocked;
- the wallet session expired;
- WalletConnect requires a fresh pairing;
- extension policy blocks provider access in iframes.

This is okay. The normal Connect Wallet button remains the fallback. The user must always sign the EIP-4361 message explicitly.

### Authorization says redirect URI is invalid

Check that the URL in the request exactly matches a registered redirect URI. Exact means:

- same scheme;
- same host;
- same path;
- same trailing slash behavior;
- same query string if one was registered.

### Profile endpoint returns 404 for a wallet that "should work"

This is the expected privacy-preserving failure for many cases. Check:

- `DEVELOPER_PROFILE_API_ENABLED=true` in both deployments.
- App is approved.
- App has `profile:read` in approved scopes.
- Secret key has `profile:read`.
- Key is not revoked or expired.
- Grant exists for the wallet and app.
- Grant scope version matches the app's current scope version.
- Wallet is still linked to the verified Discord association referenced by the grant.

The API intentionally does not distinguish unknown, unlinked, and non-consenting wallets.

### Key works locally but not in production

Check:

- The portal and Worker share the exact same `API_KEY_PEPPER`.
- You copied the full secret once when it was created.
- The key prefix matches the database identifier.
- The key has the required scopes.
- The app is approved and not suspended.
- The key has not expired.
- CIDR allowlist includes the request source.

### Gauge endpoint returns stale or missing data

Check:

- Mezo RPC health.
- Gauge address casing and chain.
- v1 is Mezo mainnet-only.
- Edge cache TTL.
- ETag behavior.
- Supabase records for gauge profiles.

## 20. Known v1 boundaries

These are intentional for v1:

- Gauge v1 is Mezo mainnet-only.
- A wallet may authorize multiple apps.
- Each app sees only the fields presented during consent.
- Grants remain active until revoked or invalidated by relinking/scope changes.
- Billing is out of scope.
- Webhooks are out of scope.
- Bulk export is out of scope.
- Additional SDK languages are out of scope.
- Full teammate invite UX is not complete yet, though organizations, memberships, and roles are represented in the schema.

## 21. Vendor references

- [Cloudflare Workers custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Cloudflare Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [Netlify external DNS](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/)
- [Netlify monorepo configuration](https://docs.netlify.com/configure-builds/monorepos/)
- [Supabase Web3 authentication](https://supabase.com/docs/guides/auth/auth-web3)
- [Supabase CLI migrations](https://supabase.com/docs/reference/cli/supabase-db-push)
- [EIP-4361: Sign-In with Ethereum](https://eips.ethereum.org/EIPS/eip-4361)
