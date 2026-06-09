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
import {
  buildSetQualifier,
  getActiveSemesters,
  reconcileRoles,
} from "../_shared/discordLink.ts"

const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" }

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

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
      }),
      { headers: JSON_HEADERS },
    )
  } catch (err) {
    console.error("discord-reconcile-roles error:", err)
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: JSON_HEADERS },
    )
  }
})
