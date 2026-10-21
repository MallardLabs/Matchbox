// Secrets are not in wrangler.jsonc, so `wrangler types` cannot see them.
// Set with `wrangler secret put DATABASE_URL` (direct Neon URL, indexer role).
interface Env {
  DATABASE_URL: string
}
