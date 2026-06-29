# Matchbox Developer API

Cloudflare Worker for `api.matchbox.markets`. The Worker authenticates named API keys, enforces per-key Durable Object quotas, and serves mainnet gauge data plus explicitly consented profiles.

For the comprehensive setup, deployment, DNS, rollout, and operations guide, start here:

- [../../docs/developer-platform.md](../../docs/developer-platform.md)

## Local development

Copy `.dev.vars.example` to `.dev.vars`, supply a Supabase service-role key and the same `API_KEY_PEPPER` used by the developer portal, then run `pnpm dev`.

Both feature flags default to `false`. Do not enable profile access until the consent flow, app approval, and grant revocation have been verified in the deployed environment.

## Deployment

Configure Worker secrets with `wrangler secret put` for `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `API_KEY_PEPPER`, `API_GATEWAY_SECRET`, and `MEZO_RPC_URL`. The `API_QUOTAS` Durable Object migration is declared in `wrangler.jsonc`.
