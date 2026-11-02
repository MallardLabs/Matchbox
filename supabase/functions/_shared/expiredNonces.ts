import type { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// biome-ignore lint/suspicious/noExplicitAny: untyped DB schema, matches supabase-js default
type SupabaseClient = ReturnType<typeof createClient<any, "public">>

// Keeps the `in` filter's URL short; each issue still removes far more rows
// than it adds.
const PURGE_BATCH = 50

/**
 * Deletes up to PURGE_BATCH expired nonces. Anyone can request a nonce that
 * names a real controller, so every issue runs this and cleanup keeps pace
 * with issuance without a scheduled job. Failures are ignored: an expired row
 * can never be consumed and only takes space.
 */
export async function purgeExpiredNonces(
  supabase: SupabaseClient,
  table: "gauge_profile_transfer_nonces" | "gauge_profile_write_nonces",
  now = new Date(),
): Promise<void> {
  try {
    const { data } = await supabase
      .from(table)
      .select("nonce_hash")
      .lt("expires_at", now.toISOString())
      .order("expires_at", { ascending: true })
      .limit(PURGE_BATCH)
    const hashes: string[] = (data ?? []).map(
      (row: { nonce_hash: string }) => row.nonce_hash,
    )
    if (hashes.length === 0) return
    await supabase.from(table).delete().in("nonce_hash", hashes)
  } catch {
    // Housekeeping only; never fail the request over it.
  }
}
