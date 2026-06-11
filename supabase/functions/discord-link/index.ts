// Supabase Edge Function: discord-link
// Backs the web /link page. Resolves a link token to the Discord profile shown on
// the page, hands back the exact message to sign, and verifies the signature to
// store the wallet <-> Discord link + reconcile Academy allocation roles.
// Deploy with --no-verify-jwt: the link token is the capability and the wallet
// signature is the proof; no Supabase JWT is involved.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  type Hex,
  getAddress,
  isAddress,
  verifyMessage,
} from "https://esm.sh/viem@2"
import { z } from "https://esm.sh/zod@3"
import { corsHeaders } from "../_shared/cors.ts"
import { avatarUrl } from "../_shared/discord.ts"
import {
  type SupabaseClient,
  buildLinkMessage,
  buildUnlinkMessage,
  getActiveSemesters,
  pointsFromWad,
  reconcileRoles,
  revokeAllRoles,
} from "../_shared/discordLink.ts"

const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function linkDomain(): string {
  const explicit = Deno.env.get("LINK_MESSAGE_DOMAIN")
  if (explicit) return explicit
  const webappUrl = Deno.env.get("MATCHBOX_WEBAPP_URL")
  if (webappUrl) {
    try {
      return new URL(webappUrl).host
    } catch (_err) {
      // fall through
    }
  }
  return "Matchbox"
}

type LinkToken = {
  token: string
  discord_user_id: string
  discord_username: string | null
  discord_global_name: string | null
  discord_avatar: string | null
  guild_id: string | null
  nonce: string
  status: string
  expires_at: string
}

// Load a token and check it is still usable. Returns a discriminated result so
// callers can map to the right HTTP status / message.
async function loadToken(
  supabase: SupabaseClient,
  token: string,
): Promise<
  | { ok: true; row: LinkToken }
  | { ok: false; reason: "not_found" | "expired" | "used" }
> {
  const { data } = await supabase
    .from("discord_link_tokens")
    .select("*")
    .eq("token", token)
    .maybeSingle()

  if (!data) return { ok: false, reason: "not_found" }
  const row: LinkToken = data
  if (row.status === "completed") return { ok: false, reason: "used" }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" }
  }
  return { ok: true, row }
}

const verifySchema = z.object({
  token: z.string().min(1),
  address: z.string().min(1),
  signature: z.custom<Hex>(
    (v) => typeof v === "string" && /^0x[0-9a-fA-F]+$/.test(v),
    "invalid signature",
  ),
})

const unlinkSchema = z.object({
  address: z.string().min(1),
  signature: z.custom<Hex>(
    (v) => typeof v === "string" && /^0x[0-9a-fA-F]+$/.test(v),
    "invalid signature",
  ),
})

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const url = new URL(req.url)
  const action = url.searchParams.get("action")

  // --- Resolve token -> Discord profile for the link screen. ---
  if (req.method === "GET" && action === "session") {
    const token = url.searchParams.get("token") ?? ""
    const result = await loadToken(supabase, token)
    if (!result.ok) return json({ success: false, reason: result.reason }, 404)
    const { row } = result
    return json({
      success: true,
      discordUserId: row.discord_user_id,
      discordUsername: row.discord_username,
      discordGlobalName: row.discord_global_name,
      avatarUrl: avatarUrl(row.discord_user_id, row.discord_avatar),
      expiresAt: row.expires_at,
    })
  }

  // --- Look up an existing link by wallet address (for the /academy card). ---
  // Read-only, keyed by a single address; returns only display name + avatar.
  if (req.method === "GET" && action === "profile") {
    const address = url.searchParams.get("address") ?? ""
    if (!isAddress(address)) {
      return json({ success: false, reason: "bad_address" }, 400)
    }
    const { data } = await supabase
      .from("discord_wallet_links")
      .select(
        "discord_user_id, discord_username, discord_global_name, discord_avatar",
      )
      .eq("wallet_address", address.toLowerCase())
      .maybeSingle()
    if (!data) return json({ success: true, linked: false })
    return json({
      success: true,
      linked: true,
      discordUsername: data.discord_username,
      discordGlobalName: data.discord_global_name,
      avatarUrl: avatarUrl(data.discord_user_id, data.discord_avatar),
    })
  }

  // --- Return the message a wallet signs to unlink itself. ---
  if (req.method === "GET" && action === "unlink-message") {
    const address = url.searchParams.get("address") ?? ""
    if (!isAddress(address)) {
      return json({ success: false, reason: "bad_address" }, 400)
    }
    return json({
      success: true,
      message: buildUnlinkMessage({ domain: linkDomain(), address }),
    })
  }

  // --- Verify a wallet signature, then remove its Discord link + roles. ---
  if (req.method === "POST" && action === "unlink") {
    let body: unknown
    try {
      body = await req.json()
    } catch (_err) {
      return json({ success: false, reason: "bad_request" }, 400)
    }
    const parsed = unlinkSchema.safeParse(body)
    if (!parsed.success) {
      return json({ success: false, reason: "bad_request" }, 400)
    }
    if (!isAddress(parsed.data.address)) {
      return json({ success: false, reason: "bad_address" }, 400)
    }
    const address = getAddress(parsed.data.address)
    const walletLower = address.toLowerCase()

    const validSig = await verifyMessage({
      address,
      message: buildUnlinkMessage({ domain: linkDomain(), address }),
      signature: parsed.data.signature,
    })
    if (!validSig) {
      return json({ success: false, reason: "bad_signature" }, 401)
    }

    const { data: link } = await supabase
      .from("discord_wallet_links")
      .select("discord_user_id, wallet_address, guild_id, granted_roles")
      .eq("wallet_address", walletLower)
      .maybeSingle()
    if (link) {
      const semesters = await getActiveSemesters(supabase)
      await revokeAllRoles({ supabase, link, semesters })
      await supabase
        .from("discord_wallet_links")
        .delete()
        .eq("wallet_address", walletLower)
    }
    return json({ success: true })
  }

  // --- List all defined seasons (for the /academy season switcher). ---
  if (req.method === "GET" && action === "semesters") {
    const now = Math.floor(Date.now() / 1000)
    const { data } = await supabase
      .from("discord_semesters")
      .select("semester_id, label, from_ts, to_ts, require_floor")
      .eq("active", true)
      .order("from_ts", { ascending: true })
    const semesters = (data ?? []).map((r) => {
      const fromTs = Number(r.from_ts)
      const toTs = Number(r.to_ts)
      return {
        semesterId: r.semester_id as string,
        label: r.label as string,
        fromTs,
        toTs,
        isCurrent: now >= fromTs && now < toTs,
        requireFloor: r.require_floor ?? true,
      }
    })
    return json({ success: true, semesters })
  }

  // --- Resolve the semester window the /academy leaderboard should display. ---
  // Returns the semester containing now, else the next upcoming season, else the
  // most recent (concluded) one. Preferring the upcoming season over an ended one
  // keeps a finished window from being presented as if it were live. No role_id
  // filter: the academy window is wanted even before a Discord role is
  // configured. Server-side clock.
  if (req.method === "GET" && action === "current-semester") {
    const now = Math.floor(Date.now() / 1000)
    const { data } = await supabase
      .from("discord_semesters")
      .select("semester_id, label, from_ts, to_ts, require_floor")
      .eq("active", true)
      .order("from_ts", { ascending: true })
    const rows = (data ?? []).map((r) => ({
      semesterId: r.semester_id as string,
      label: r.label as string,
      fromTs: Number(r.from_ts),
      toTs: Number(r.to_ts),
      requireFloor: r.require_floor ?? true,
    }))
    if (rows.length === 0) return json({ success: true, semester: null })
    // Pin to a specific semester when asked (e.g. the inaugural Season 0 banner),
    // independent of which semester is currently active.
    const requestedId = url.searchParams.get("semesterId")
    if (requestedId !== null) {
      const found = rows.find((s) => s.semesterId === requestedId)
      return json({
        success: true,
        semester: found
          ? { ...found, isCurrent: now >= found.fromTs && now < found.toTs }
          : null,
      })
    }
    const current = rows.find((s) => now >= s.fromTs && now < s.toTs)
    const upcoming = rows.filter((s) => s.fromTs > now)
    const chosen = current ?? upcoming[0] ?? rows[rows.length - 1]
    return json({
      success: true,
      semester: { ...chosen, isCurrent: chosen === current },
    })
  }

  // --- Return the exact message the connected wallet should sign. ---
  if (req.method === "GET" && action === "message") {
    const token = url.searchParams.get("token") ?? ""
    const address = url.searchParams.get("address") ?? ""
    if (!isAddress(address)) {
      return json({ success: false, reason: "bad_address" }, 400)
    }
    const result = await loadToken(supabase, token)
    if (!result.ok) return json({ success: false, reason: result.reason }, 404)
    const message = buildLinkMessage({
      domain: linkDomain(),
      discordUserId: result.row.discord_user_id,
      address,
      nonce: result.row.nonce,
      expiresAt: result.row.expires_at,
    })
    return json({ success: true, message })
  }

  // --- Verify signature, store the link, reconcile the role. ---
  if (req.method === "POST" && action === "verify") {
    let body: unknown
    try {
      body = await req.json()
    } catch (_err) {
      return json({ success: false, reason: "bad_request" }, 400)
    }
    const parsed = verifySchema.safeParse(body)
    if (!parsed.success) {
      return json({ success: false, reason: "bad_request" }, 400)
    }
    const { token, signature } = parsed.data
    if (!isAddress(parsed.data.address)) {
      return json({ success: false, reason: "bad_address" }, 400)
    }
    const address = getAddress(parsed.data.address)
    const walletLower = address.toLowerCase()

    const result = await loadToken(supabase, token)
    if (!result.ok) return json({ success: false, reason: result.reason }, 404)
    const tokenRow = result.row

    const message = buildLinkMessage({
      domain: linkDomain(),
      discordUserId: tokenRow.discord_user_id,
      address,
      nonce: tokenRow.nonce,
      expiresAt: tokenRow.expires_at,
    })

    const validSig = await verifyMessage({
      address,
      message,
      signature,
    })
    if (!validSig) {
      return json({ success: false, reason: "bad_signature" }, 401)
    }

    // Enforce strict one-to-one: a wallet may only belong to one Discord account.
    const { data: existingByWallet } = await supabase
      .from("discord_wallet_links")
      .select("discord_user_id")
      .eq("wallet_address", walletLower)
      .maybeSingle()
    if (
      existingByWallet &&
      existingByWallet.discord_user_id !== tokenRow.discord_user_id
    ) {
      return json({ success: false, reason: "wallet_taken" }, 409)
    }

    // Preserve currently-granted roles so reconcile can revoke any the new wallet
    // no longer qualifies for.
    const { data: existingByUser } = await supabase
      .from("discord_wallet_links")
      .select("granted_roles")
      .eq("discord_user_id", tokenRow.discord_user_id)
      .maybeSingle()
    const priorGrantedRoles: string[] = existingByUser?.granted_roles ?? []

    const { error: upsertError } = await supabase
      .from("discord_wallet_links")
      .upsert(
        {
          discord_user_id: tokenRow.discord_user_id,
          wallet_address: walletLower,
          discord_username: tokenRow.discord_username,
          discord_global_name: tokenRow.discord_global_name,
          discord_avatar: tokenRow.discord_avatar,
          guild_id: tokenRow.guild_id,
          granted_roles: priorGrantedRoles,
          verified_at: new Date().toISOString(),
        },
        { onConflict: "discord_user_id" },
      )
    if (upsertError) {
      console.error("link upsert error:", upsertError)
      return json({ success: false, reason: "server_error" }, 500)
    }

    // Mark the token used so it can't be replayed.
    await supabase
      .from("discord_link_tokens")
      .update({ status: "completed" })
      .eq("token", token)

    // Reconcile semester (+ optional live) roles. If points are momentarily
    // unavailable, keep the link and report it; a later run will reconcile.
    let semesterResults: {
      semesterId: string
      label: string
      qualifies: boolean
      points: number
    }[] = []
    let pointsAvailable = false
    try {
      const semesters = await getActiveSemesters(supabase)
      const result = await reconcileRoles({
        supabase,
        link: {
          discord_user_id: tokenRow.discord_user_id,
          wallet_address: walletLower,
          guild_id: tokenRow.guild_id,
          granted_roles: priorGrantedRoles,
        },
        semesters,
      })
      // Merge semester results that share the same role_id (e.g. the two
      // "Class of 2026" windows) into a single display row: union of qualifies,
      // sum of points. This keeps the link confirmation page clean.
      const mergedByRole = new Map<
        string,
        { semesterId: string; label: string; qualifies: boolean; points: number }
      >()
      for (const s of result.semesters) {
        const existing = mergedByRole.get(s.role_id)
        if (existing) {
          existing.qualifies = existing.qualifies || s.qualifies
          existing.points += pointsFromWad(s.pointsWad)
        } else {
          mergedByRole.set(s.role_id, {
            semesterId: s.semester_id,
            label: s.label,
            qualifies: s.qualifies,
            points: pointsFromWad(s.pointsWad),
          })
        }
      }
      semesterResults = [...mergedByRole.values()]
      pointsAvailable = true
    } catch (err) {
      console.error("points/role reconcile error:", err)
    }

    return json({
      success: true,
      wallet: address,
      semesters: semesterResults,
      pointsAvailable,
    })
  }

  return json({ success: false, reason: "not_found" }, 404)
})
