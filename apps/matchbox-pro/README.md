# Matchbox Pro Preview

Vite + TanStack Router app for Matchbox Pro Preview. Desktop-first Overview and Vote.

## Local

```bash
pnpm install
Copy-Item apps/matchbox-pro/.env.example apps/matchbox-pro/.env.local
pnpm --filter @repo/matchbox-pro dev
```

Open <http://localhost:3002>.

The app boots without WalletConnect or Supabase, but Preview needs both for a real publish:

- `VITE_WALLET_CONNECT_PROJECT_ID` — WalletConnect wallets (injected wallets still work without it)
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — gauge names, veBTC token IDs, profile writes
- `VITE_APP_URL` — set to `https://pro.matchbox.markets` for the production build

`.env.local` is baked into the Vite client at build time. Wrangler `vars` only cover Worker BFF (`BASE_RPC_URL`).

## Deploy (your Cloudflare account)

Logged-in CLI accounts: Mallard Labs and Mergence Labs. This is not Mezo's Cloudflare.

```bash
pnpm --filter @repo/matchbox-pro exec vite build
pnpm --filter @repo/matchbox-pro exec wrangler deploy --account-id df8279c833d38dca96f9a091ca3a9219
```

Then attach `pro.matchbox.markets` on Worker `matchbox-pro` when DNS for that hostname is on the same account.
