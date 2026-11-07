// Supabase Edge Function: discord-reconcile-roles
// Scheduled job that re-checks every linked member's Academy allocation per
// semester and adds/removes Discord roles so they stay correct between /matchbox
// runs (points drift as the live window slides and members keep earning).
//
// Unlike the interaction functions, this is NOT public — schedule it with pg_cron
// using the service-role key (see functions/README.md). It fetches each window's
// leaderboard once and reconciles all members against those sets.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders, handleCors } from "../_shared/cors.ts"
import { getGuildMember } from "../_shared/discord.ts"
import {
  type SupabaseClient,
  academyEnabled,
  buildSetQualifier,
  getActiveSemesters,
  linkGuildId,
  reconcileRoles,
} from "../_shared/discordLink.ts"
import { requireServiceRole } from "../_shared/serviceRoleAuth.ts"

const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" }

// Links read per run for the guild join-time backfill.
const JOINED_AT_BACKFILL_LIMIT = 50

type JoinedAtBackfill = { backfilled: number; skipped: number; failed: number }

// Fill discord_joined_at for links that lack it, oldest updated_at first, one
// Discord read at a time. Members who left the guild (or links with no guild
// to ask) are written null anyway: the updated_at trigger then moves them to
// the back of the queue. Failed reads are left for the next run.
async function backfillJoinedAt(
  supabase: SupabaseClient,
): Promise<JoinedAtBackfill> {
  const counts: JoinedAtBackfill = { backfilled: 0, skipped: 0, failed: 0 }
  const { data: links, error } = await supabase
    .from("discord_wallet_links")
    .select("discord_user_id, guild_id")
    .is("discord_joined_at", null)
    .order("updated_at", { ascending: true, nullsFirst: true })
    .limit(JOINED_AT_BACKFILL_LIMIT)
  if (error) {
    console.error("joined_at backfill query error:", error)
    return counts
  }

  for (const link of links ?? []) {
    try {
      const guildId = linkGuildId(link.guild_id)
      const member = guildId
        ? await getGuildMember({ guildId, userId: link.discord_user_id })
        : null
      const joinedAt = member?.joinedAt ?? null
      const { error: updateError } = await supabase
        .from("discord_wallet_links")
        .update({ discord_joined_at: joinedAt })
        .eq("discord_user_id", link.discord_user_id)
      if (updateError) throw updateError
      if (joinedAt) counts.backfilled += 1
      else counts.skipped += 1
    } catch (err) {
      counts.failed += 1
      console.error(`joined_at backfill failed for ${link.discord_user_id}:`, err)
    }
  }
  return counts
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors
  const unauthorized = await requireServiceRole(req)
  if (unauthorized) return unauthorized

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Runs whether or not Academy is on; never stops the role sync.
  let joinedAt: JoinedAtBackfill = { backfilled: 0, skipped: 0, failed: 0 }
  try {
    joinedAt = await backfillJoinedAt(supabase)
  } catch (err) {
    console.error("joined_at backfill error:", err)
  }

  // Nothing to score while Academy points are off; granted roles stay put.
  if (!academyEnabled()) {
    return new Response(
      JSON.stringify({ success: true, skipped: "academy_off", joinedAt }),
      { headers: JSON_HEADERS },
    )
  }

  try {
    const semesters = await getActiveSemesters(supabase)
    const includeLive = Boolean(Deno.env.get("DISCORD_ROLE_ID"))
    // One leaderboard fetch per distinct window (+ live), then pure set lookups.
    const qualifier = await buildSetQualifier({ semesters, includeLive })

    const { data: links } = await supabase
      .from("discord_wallet_links")
      .select("discord_user_id, wallet_address, guild_id, granted_roles")

    let processed = 0
    let failed = 0
    for (const link of links ?? []) {
      try {
        await reconcileRoles({ supabase, link, semesters, qualifier })
        processed += 1
      } catch (err) {
        failed += 1
        console.error(`reconcile failed for ${link.discord_user_id}:`, err)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        failed,
        semesters: semesters.length,
        includeLive,
        joinedAt,
      }),
      { headers: JSON_HEADERS },
    )
  } catch (err) {
    console.error("discord-reconcile-roles error:", err)
    return new Response(
      JSON.stringify({ success: false, error: String(err), joinedAt }),
      { status: 500, headers: JSON_HEADERS },
    )
  }
})
