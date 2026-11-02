// Secrets are not in wrangler.jsonc, so `wrangler types` cannot see them.
// Set with `wrangler secret put DATABASE_URL` (direct Neon URL, indexer role).
interface Env {
  DATABASE_URL: string
  // Optional dead man's switch pinged after each fresh tick
  // (`wrangler secret put HEARTBEAT_URL`, src/health.ts).
  HEARTBEAT_URL?: string
}
