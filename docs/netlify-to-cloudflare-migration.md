# Netlify → Cloudflare Migration Plan

Status: proposed. This is the working runbook for moving the Matchbox frontends
off Netlify and onto Cloudflare Workers, moving DNS to Cloudflare, and the
decision record on Hyperdrive.

Related: [developer-platform.md](developer-platform.md) describes the current
production topology this plan supersedes.

## 0. Why

- **Cost.** Cloudflare Workers has no bandwidth/egress charge. On Netlify the
  cost risk is the 100 GB/mo free bandwidth cap, past which you land on Pro
  ($19/user/mo) plus ~$55 per extra 100 GB. Cloudflare Workers is $0 on the free
  tier (100k req/day) or $5/mo (10M req/mo) with no egress metering.
- **Consolidation.** The Developer API (`matchbox-developer-api`) already runs on
  Cloudflare Workers with a Durable Object quota limiter. Both Next.js apps are
  already scaffolded for Cloudflare via `@opennextjs/cloudflare`
  (`open-next.config.ts`, `wrangler.jsonc`, `cloudflare:build`/`deploy` scripts).
  The hard part is done.

## 1. Current state (verified 2026-07-15)

| Thing | State |
| --- | --- |
| Netlify account | Free tier (`nf_team_dev`) |
| Webapp (`apps/webapp`, Next.js 14) | Netlify `matchb0x` → `matchbox.markets`, `app.matchbox.markets` |
| Developer platform (`apps/developer-platform`) | Netlify `matchboxdeveloper` → `id.matchbox.markets` |
| Docs (Astro) | Netlify `matchdocs` → proxied via `/docs/*`, `/_astro/*`, `/pagefind/*` rewrites |
| Developer API (`apps/developer-api`) | Already Cloudflare Worker `matchbox-developer-api` (+ Durable Object) |
| Supabase | `us-east-2` (Ohio), Postgres 17, free plan |
| DB access | 100% `@supabase/supabase-js` (PostgREST/HTTPS). No `pg`/`postgres.js`/Drizzle/Prisma |
| ISR usage in webapp | None (no `revalidate`/`getStaticProps`/`generateStaticParams`) |

Decisions locked in:

- Docs (`matchdocs`) **stay on Netlify** for now; keep proxying to them.
- OG image generation (`/api/og`) is already non-functional, so it is not a
  migration blocker.
- No ISR → OpenNext incremental cache / R2 bucket is **not needed** initially.

## 2. Hyperdrive decision — do NOT adopt

Hyperdrive accelerates **direct Postgres wire-protocol connections** (TCP 5432 /
6543) by pooling and caching them at Cloudflare's edge. Every database call in
this repo goes through `@supabase/supabase-js`, which speaks **PostgREST over
HTTPS**. There is no Postgres connection for Hyperdrive to sit in front of, so it
provides zero benefit here.

Revisit only if a direct-Postgres client (e.g. Drizzle/postgres.js) is ever added
inside a Worker. The latency lever that *does* apply — Supabase in `us-east-2`
vs. Cloudflare's global edge — is edge-caching read-heavy API responses
(Cache API / KV), not Hyperdrive.

## 3. Migration phases

### Phase 0 — Prep & baseline

1. Export Netlify env vars for `matchb0x` and `matchboxdeveloper`. The full list
   of expected keys is `turbo.json` `globalEnv` (`NEXT_PUBLIC_*`,
   `SUPABASE_SERVICE_ROLE_KEY`, `API_KEY_PEPPER`, `API_GATEWAY_SECRET`, etc.).
2. Record every current DNS record. **Do not skip MX / TXT / SPF / DKIM** — email
   breaks if these are not carried over.
3. Confirm `pnpm build`, `pnpm lint`, `pnpm typecheck` are green.

### Phase 1 — Deploy webapp to Workers (alongside Netlify, no cutover)

> **Windows build caveat (verified 2026-07-15).** Running `pnpm cloudflare:build`
> on Windows fails: the Next.js compile succeeds (14/14 pages) but the OpenNext
> standalone-packaging step dies with `EPERM: operation not permitted, symlink`
> (Next standalone symlinks `node_modules`; Windows blocks non-elevated symlink
> creation). This is environment-only, not a code issue. Fixes: (a) rely on
> **Workers Builds (Linux CI)** for real deploys — recommended; (b) enable Windows
> Developer Mode; or (c) build under WSL. Do not attempt to deploy the OpenNext
> bundle straight from a plain Windows shell.

1. `cd apps/webapp && pnpm cloudflare:build` — validate `.open-next/worker.js`
   (on Linux/WSL/CI per the caveat above).
2. Set server secrets with `wrangler secret put` (`SUPABASE_SERVICE_ROLE_KEY`,
   `API_KEY_PEPPER`, `API_GATEWAY_SECRET`). Put `NEXT_PUBLIC_*` in build env.
   Never commit secrets to `wrangler.jsonc` `vars`.
3. `pnpm cloudflare:deploy`; smoke-test on the `*.workers.dev` URL.
4. Re-implement the docs proxies as Next.js `rewrites()` in `next.config.mjs`
   (destinations on `https://matchdocs.netlify.app/...`) for `/docs/*`,
   `/_astro/*`, `/pagefind/*`, `/favicon.svg`.
5. Connect Workers Builds (see Phase 1b) for auto-deploy on push.

### Phase 1b — Workers Builds configuration (both apps)

One-time interactive step (dashboard/OAuth, cannot be scripted): **Cloudflare
dashboard → Workers & Pages → Builds → Connect GitHub**, authorize
`MallardLabs/MatchBox`. Then create a build project per app with the settings
below.

> **Critical monorepo gotcha (verified 2026-07-15).** `@repo/shared` is a
> `tsup`-compiled package — its `package.json` `exports` point at `./dist/*.js`,
> which does not exist in a fresh checkout. A bare `opennextjs-cloudflare build`
> (→ `next build`) will fail to resolve `@repo/shared`. **The build command must
> build `@repo/shared` first** (this is why Netlify used `turbo run build`). The
> local Windows build only passed `next build` because `dist/` was already
> present from a prior `pnpm build`.

| Setting | webapp | developer-platform |
| --- | --- | --- |
| Worker name | `matchbox` | `matchbox-developer-platform` |
| Git repo / branch | `MallardLabs/MatchBox` / `main` | same |
| Root directory | repo root | repo root |
| Build command | `pnpm turbo run cloudflare:build --filter @repo/webapp` | `pnpm turbo run cloudflare:build --filter @repo/developer-platform` |
| Deploy command | `pnpm --filter @repo/webapp exec opennextjs-cloudflare deploy` | `pnpm --filter @repo/developer-platform exec opennextjs-cloudflare deploy` |

**Environment split** — get the exact values from the Netlify sites (Phase 0):

- **Build-time vars** (inlined by Next; set in Workers Builds "Build variables"):
  all `NEXT_PUBLIC_*` keys the app reads (see `turbo.json` `globalEnv` and each
  `netlify.toml` — webapp needs `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`,
  plus `ID`/`DEVELOPER`/`WALLET_CONNECT` URLs where used).
- **Runtime secrets** (set via `wrangler secret put`, never in `vars` or build
  vars): `SUPABASE_SERVICE_ROLE_KEY`, `API_KEY_PEPPER`, `API_GATEWAY_SECRET`,
  `DEVELOPER_API_ORIGIN`.

Both Workers deploy to `*.workers.dev` on first build (no DNS dependency).

### Phase 2 — Developer platform (`id.matchbox.markets`)

Config is deploy-ready (own `wrangler.jsonc`, Worker `matchbox-developer-platform`).
Its `custom_domain` routes are **commented out** until DNS is on Cloudflare —
re-enable them at Phase 4 cutover. Otherwise identical to Phase 1/1b.

### Phase 3 — DNS to Cloudflare

> **Verify authority first.** [developer-platform.md](developer-platform.md) §1
> states Spaceship is authoritative DNS (records point at Netlify targets); the
> operator recalls nameservers delegated to Netlify DNS. Check the live NS
> records for `matchbox.markets` before touching anything — the cutover differs:
> - Netlify DNS (NS delegated to Netlify): change NS at Spaceship → Cloudflare.
> - Spaceship DNS: change NS at Spaceship → Cloudflare (cleanest for Workers
>   custom domains, which expect a Cloudflare-managed zone).

1. Add `matchbox.markets` as a Cloudflare zone; import records, then audit
   against the Phase 0 list (especially MX/TXT/SPF/DKIM).
2. Change nameservers at **Spaceship** to Cloudflare's pair. Registrar stays
   Spaceship. Allow up to 24–48h propagation.
3. Netlify sites stay live throughout — nothing points at Cloudflare yet.

### Phase 4 — Cutover (per hostname, reversible)

1. Add Custom Domains / Routes on the Workers: `matchbox.markets` + `www` +
   `app.matchbox.markets` → webapp Worker; `id.matchbox.markets` →
   developer-platform Worker.
2. Cloudflare auto-provisions SSL. Verify HTTPS, `/docs` proxy, wallet/auth
   flows, and Supabase reads/writes on the live domain.
3. Do apex + `app` first; verify; then `id`. Roll back any hostname instantly by
   repointing its DNS record at Netlify.

### Phase 5 — Decommission

After a few stable days: remove custom domains from `matchb0x` /
`matchboxdeveloper` on Netlify; keep the sites as warm rollback, then delete.
Developer API is unchanged.

## 4. Repo-specific gotchas

- `nodejs_compat` is already set in both `wrangler.jsonc` (needed by viem,
  passport). Good.
- Server secrets via `wrangler secret put`, never `vars`. Worker glue follows
  `agent-instructions/server.md` (log details, return high-level errors, use
  `@repo/logger`).
- Docs stay on Netlify; simplest path is rewrite-to-Netlify, no Astro move.

## 5. Rollback

Every phase before Phase 5 is non-destructive. DNS records can be repointed back
to Netlify per hostname; Netlify sites remain deployed until explicitly deleted.
