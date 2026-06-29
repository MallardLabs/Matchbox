# Matchbox ID and Developer Portal

One isolated Next.js application serves `id.matchbox.markets` and `developer.matchbox.markets` through host-aware routing.

For the comprehensive setup, deployment, DNS, rollout, and operations guide, start here:

- [../../docs/developer-platform.md](../../docs/developer-platform.md)

- Matchbox ID uses Supabase Web3 authentication and an EIP-4361 signature.
- Developer accounts use Google OAuth or email magic links.
- Server routes hold the Supabase service-role key and API-key pepper; neither is exposed to the browser.
- `api.matchbox.markets` is served through this app as a Netlify-hosted proxy to the separate Cloudflare Worker, which keeps Spaceship DNS authoritative.

Configure Supabase redirect URLs for both production hosts and localhost. Enable the Google, email, and Web3 Ethereum providers. A real WalletConnect project ID is required in deployed environments.

Copy `.env.example` to `.env.local` for development. Both feature flags remain off by default.
