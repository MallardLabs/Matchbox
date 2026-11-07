// Supabase Edge Function: discord-link
// Backs the web /link page. Resolves a link token to the Discord profile shown on
// the page, hands back the exact message to sign, and verifies the signature to
// store the wallet <-> Discord link + reconcile Academy allocation roles.
// Deploy with --no-verify-jwt: the link token is the capability, a Discord OAuth2
// sign-in proves the browser belongs to the token's member, and the wallet
// signature proves the wallet; no Supabase JWT is involved.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  type Address,
  type Hex,
  createPublicClient,
  getAddress,
  http,
  isAddress,
  verifyMessage,
} from "https://esm.sh/viem@2"
import { z } from "https://esm.sh/zod@3"
import { getMezoNetworkConfigForChain } from "../_shared/contracts.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { avatarUrl } from "../_shared/discord.ts"
import {
  type SupabaseClient,
  academyEnabled,
  checkDiscordMember,
  getActiveSemesters,
  heldManagedRoles,
  lookupGuildMember,
  pointsFromWad,
  randomNonce,
  reconcileRoles,
  revokeAllRoles,
  unlinkChallengeExpiry,
  webappBaseUrl,
} from "../_shared/discordLink.ts"
import {
  buildLinkMessage,
  buildUnlinkMessage,
} from "../_shared/discordLinkMessage.ts"
import { sha256 } from "../_shared/gaugeProfileAuthorization.ts"

const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

// Mezo Passport (Bitcoin) wallets sign as Mezo smart accounts, which an
// ecrecover alone refuses. Plain keys keep the local check; anything else is
// checked on Mezo mainnet, where the public client accepts ERC-1271 and
// ERC-6492 signatures.
async function walletSigned(args: {
  address: Address
  message: string
  signature: Hex
}): Promise<boolean> {
  if (await verifyMessage(args).catch(() => false)) return true
  try {
    const network = getMezoNetworkConfigForChain(31612)
    const client = createPublicClient({
      chain: network.chain,
      transport: http(network.rpcUrl),
    })
    return await client.verifyMessage(args)
  } catch (err) {
    console.error("contract signature check failed:", err)
    return false
  }
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
  created_at: string | null
}

// The message the wallet signs for a link token, rebuilt from the row each time.
function linkMessage(row: LinkToken, address: string): string {
  return buildLinkMessage({
    webappUrl: webappBaseUrl(),
    discordUserId: row.discord_user_id,
    discordUsername: row.discord_username,
    address,
    nonce: row.nonce,
    // The database stamps created_at when the bot mints the token.
    issuedAt: row.created_at ?? row.expires_at,
    expiresAt: row.expires_at,
  })
}

// Refuses (with the response to send) unless the browser finishing /link is
// signed in to Discord, through this app's OAuth2, as the member the link token
// was minted for. Without it a token handed to someone else would bind their
// wallet to that member's Discord account.
async function discordMemberRefusal(
  supabase: SupabaseClient,
  row: LinkToken,
  accessToken: string,
): Promise<Response | null> {
  const appId = Deno.env.get("DISCORD_APP_ID")
  if (!appId) {
    console.error("Missing DISCORD_APP_ID")
    return json({ success: false, reason: "server_error" }, 500)
  }
  const check = await checkDiscordMember({
    supabase,
    token: row.token,
    accessToken,
    discordUserId: row.discord_user_id,
    appId,
  })
  if (check === "member") return null
  if (check === "locked") {
    return json({ success: false, reason: "expired" }, 404)
  }
  if (check === "unavailable") {
    return json({ success: false, reason: "server_error" }, 502)
  }
  return json({ success: false, reason: "discord_auth" }, 403)
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

// A Discord OAuth2 access token from the /link page's implicit-grant sign-in.
const accessTokenSchema = z.string().min(1).max(512)

const messageSchema = z.object({
  token: z.string().min(1),
  address: z.string().min(1),
  accessToken: accessTokenSchema,
})

const verifySchema = z.object({
  token: z.string().min(1),
  address: z.string().min(1),
  accessToken: accessTokenSchema,
  signature: z.custom<Hex>(
    (v) => typeof v === "string" && /^0x[0-9a-fA-F]+$/.test(v),
    "invalid signature",
  ),
})

const unlinkMessageSchema = z.object({
  address: z.string().min(1),
})

const unlinkSchema = z.object({
  address: z.string().min(1),
  nonce: z.string().regex(/^[0-9a-f]{32}$/),
  signature: z.custom<Hex>(
    (v) => typeof v === "string" && /^0x[0-9a-fA-F]+$/.test(v),
    "invalid signature",
  ),
})

type UnlinkChallenge = {
  discord_user_id: string
  issued_at: string
  expires_at: string
}

// Spends a wallet's open unlink challenges once its link is gone or replaced,
// so one signed earlier can't remove a later link to the same Discord account.
async function retireUnlinkChallenges(
  supabase: SupabaseClient,
  walletLower: string,
): Promise<void> {
  const { error } = await supabase
    .from("discord_unlink_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("wallet_address", walletLower)
    .is("consumed_at", null)
  if (error) console.error("unlink challenge retire error:", error)
}

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
  // Also hands the page the OAuth2 client ID and the one redirect URI it signs
  // in with, so the webapp needs no Discord configuration of its own.
  if (req.method === "GET" && action === "session") {
    const token = url.searchParams.get("token") ?? ""
    const result = await loadToken(supabase, token)
    if (!result.ok) return json({ success: false, reason: result.reason }, 404)
    const appId = Deno.env.get("DISCORD_APP_ID")
    if (!appId) {
      console.error("Missing DISCORD_APP_ID")
      return json({ success: false, reason: "server_error" }, 500)
    }
    const { row } = result
    return json({
      success: true,
      discordUserId: row.discord_user_id,
      discordUsername: row.discord_username,
      discordGlobalName: row.discord_global_name,
      avatarUrl: avatarUrl(row.discord_user_id, row.discord_avatar),
      expiresAt: row.expires_at,
      academy: academyEnabled(),
      discordClientId: appId,
      discordRedirectUri: `${webappBaseUrl()}/link`,
    })
  }

  // --- Whether a wallet has a link (for the /academy card). ---
  // Unauthenticated, so it never says which Discord account: that goes only to
  // apps the user approves in Matchbox ID.
  if (req.method === "GET" && action === "profile") {
    const address = url.searchParams.get("address") ?? ""
    if (!isAddress(address)) {
      return json({ success: false, reason: "bad_address" }, 400)
    }
    const { data } = await supabase
      .from("discord_wallet_links")
      .select("wallet_address")
      .eq("wallet_address", address.toLowerCase())
      .maybeSingle()
    return json({ success: true, linked: data !== null })
  }

  // --- Issue a single-use challenge a wallet signs to unlink itself. ---
  // It is bound to the wallet and the Discord account linked right now, so a
  // signature can't be replayed later or against a relink.
  if (req.method === "POST" && action === "unlink-message") {
    let body: unknown
    try {
      body = await req.json()
    } catch (_err) {
      return json({ success: false, reason: "bad_request" }, 400)
    }
    const parsed = unlinkMessageSchema.safeParse(body)
    if (!parsed.success) {
      return json({ success: false, reason: "bad_request" }, 400)
    }
    if (!isAddress(parsed.data.address)) {
      return json({ success: false, reason: "bad_address" }, 400)
    }
    const address = getAddress(parsed.data.address)
    const walletLower = address.toLowerCase()

    const { data: link } = await supabase
      .from("discord_wallet_links")
      .select("discord_user_id")
      .eq("wallet_address", walletLower)
      .maybeSingle()
    if (!link) return json({ success: false, reason: "not_linked" }, 404)

    const nowMs = Date.now()
    const nonce = randomNonce()
    const issuedAt = new Date(nowMs).toISOString()
    const expiresAt = unlinkChallengeExpiry(nowMs)

    // Anyone can ask, so a wallet keeps only its 3 newest open challenges.
    const { error: insertError } = await supabase.rpc(
      "issue_discord_unlink_challenge",
      {
        p_nonce_hash: await sha256(nonce),
        p_wallet_address: walletLower,
        p_discord_user_id: link.discord_user_id,
        p_issued_at: issuedAt,
        p_expires_at: expiresAt,
      },
    )
    if (insertError) {
      console.error("unlink challenge insert error:", insertError)
      return json({ success: false, reason: "server_error" }, 500)
    }

    return json({
      success: true,
      nonce,
      message: buildUnlinkMessage({
        webappUrl: webappBaseUrl(),
        address,
        nonce,
        issuedAt,
        expiresAt,
      }),
    })
  }

  // --- Consume a signed challenge, then remove that Discord link (+ roles). ---
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
    const nonceHash = await sha256(parsed.data.nonce)

    // Counts this attempt, so one challenge can't be retried forever.
    const { data: challenge, error: claimError } = await supabase
      .rpc("claim_discord_unlink_attempt", {
        p_nonce_hash: nonceHash,
        p_wallet_address: walletLower,
      })
      .maybeSingle<UnlinkChallenge>()
    if (claimError) {
      console.error("unlink challenge claim error:", claimError)
      return json({ success: false, reason: "server_error" }, 500)
    }
    if (!challenge) return json({ success: false, reason: "expired" }, 401)

    const validSig = await walletSigned({
      address,
      message: buildUnlinkMessage({
        webappUrl: webappBaseUrl(),
        address,
        nonce: parsed.data.nonce,
        issuedAt: challenge.issued_at,
        expiresAt: challenge.expires_at,
      }),
      signature: parsed.data.signature,
    })
    if (!validSig) {
      return json({ success: false, reason: "bad_signature" }, 401)
    }

    // Consume the challenge in one conditional update so concurrent replays
    // of the same signature can't both pass.
    const now = new Date().toISOString()
    const { data: consumed } = await supabase
      .from("discord_unlink_challenges")
      .update({ consumed_at: now })
      .eq("nonce_hash", nonceHash)
      .is("consumed_at", null)
      .gt("expires_at", now)
      .select("nonce_hash")
      .maybeSingle()
    if (!consumed) return json({ success: false, reason: "expired" }, 401)

    const { data: link } = await supabase
      .from("discord_wallet_links")
      .select("discord_user_id, wallet_address, guild_id, granted_roles")
      .eq("wallet_address", walletLower)
      .maybeSingle()
    if (!link) {
      await retireUnlinkChallenges(supabase, walletLower)
      return json({ success: true })
    }
    if (link.discord_user_id !== challenge.discord_user_id) {
      return json({ success: false, reason: "link_changed" }, 409)
    }

    // With Academy points off nothing could grant the roles back, so they stay.
    if (academyEnabled()) {
      const semesters = await getActiveSemesters(supabase)
      await revokeAllRoles({ supabase, link, semesters })
    }
    const { error: deleteError } = await supabase
      .from("discord_wallet_links")
      .delete()
      .eq("wallet_address", walletLower)
      .eq("discord_user_id", challenge.discord_user_id)
    if (deleteError) {
      console.error("unlink delete error:", deleteError)
      return json({ success: false, reason: "server_error" }, 500)
    }
    await retireUnlinkChallenges(supabase, walletLower)
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
  // Checked against the Discord sign-in first, so a member who opens someone
  // else's link is stopped before their wallet is asked to sign anything.
  if (req.method === "POST" && action === "message") {
    let body: unknown
    try {
      body = await req.json()
    } catch (_err) {
      return json({ success: false, reason: "bad_request" }, 400)
    }
    const parsed = messageSchema.safeParse(body)
    if (!parsed.success) {
      return json({ success: false, reason: "bad_request" }, 400)
    }
    if (!isAddress(parsed.data.address)) {
      return json({ success: false, reason: "bad_address" }, 400)
    }
    const result = await loadToken(supabase, parsed.data.token)
    if (!result.ok) return json({ success: false, reason: result.reason }, 404)
    const refusal = await discordMemberRefusal(
      supabase,
      result.row,
      parsed.data.accessToken,
    )
    if (refusal) return refusal
    return json({
      success: true,
      message: linkMessage(result.row, parsed.data.address),
    })
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

    const refusal = await discordMemberRefusal(
      supabase,
      tokenRow,
      parsed.data.accessToken,
    )
    if (refusal) return refusal

    const validSig = await walletSigned({
      address,
      message: linkMessage(tokenRow, address),
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

    // Use the token up in one conditional update, so concurrent verifies of
    // the same token can't both link.
    const { data: claimed } = await supabase
      .from("discord_link_tokens")
      .update({ status: "completed" })
      .eq("token", token)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .select("token")
      .maybeSingle()
    if (!claimed) return json({ success: false, reason: "used" }, 404)

    // Carry over the member's roles (from the old link, or kept through an unlink
    // while Academy was off) so reconcile can revoke any the new wallet no longer
    // qualifies for.
    const { data: existingByUser } = await supabase
      .from("discord_wallet_links")
      .select("granted_roles")
      .eq("discord_user_id", tokenRow.discord_user_id)
      .maybeSingle()
    // One member read serves the held roles and the guild join time.
    const memberLookup = await lookupGuildMember({
      guildId: tokenRow.guild_id,
      userId: tokenRow.discord_user_id,
    })
    const heldRoles = heldManagedRoles({
      lookup: memberLookup,
      semesters: await getActiveSemesters(supabase),
    })
    const priorGrantedRoles: string[] = [
      ...new Set([...(existingByUser?.granted_roles ?? []), ...heldRoles]),
    ]

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
          // Null if they're not in the guild. Left out when Discord couldn't
          // say, so a stored join time survives; the reconcile cron backfills.
          ...(memberLookup.ok
            ? { discord_joined_at: memberLookup.member?.joinedAt ?? null }
            : {}),
        },
        { onConflict: "discord_user_id" },
      )
    if (upsertError) {
      // 23505: the wallet was linked to another account since the check above.
      if (upsertError.code === "23505") {
        return json({ success: false, reason: "wallet_taken" }, 409)
      }
      console.error("link upsert error:", upsertError)
      return json({ success: false, reason: "server_error" }, 500)
    }
    // Challenges issued before this link (it may have been unlinked in Discord
    // meanwhile) can't unlink it.
    await retireUnlinkChallenges(supabase, walletLower)

    // Expired link sessions still hold a Discord profile but are never read
    // again, so clear them out whenever a link completes.
    const { error: purgeError } = await supabase
      .from("discord_link_tokens")
      .delete()
      .lt("expires_at", new Date().toISOString())
    if (purgeError) console.error("link token purge error:", purgeError)

    // While Academy points are off there is nothing to score or grant.
    if (!academyEnabled()) {
      return json({
        success: true,
        wallet: address,
        semesters: [],
        pointsAvailable: false,
      })
    }

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
