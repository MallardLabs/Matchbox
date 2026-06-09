// Supabase Edge Function: discord-interactions
// Discord's HTTP Interactions endpoint for the Matchbox bot. Handles the
// /matchbox and /poke-roles slash commands and the Unlink / Re-link buttons. Deploy with
// --no-verify-jwt: Discord can't send a Supabase JWT, so we authenticate every
// request with the Ed25519 signature instead.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders, handleCors } from "../_shared/cors.ts"
import {
  ButtonStyle,
  editOriginalInteraction,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  verifyDiscordSignature,
} from "../_shared/discord.ts"
import {
  buildSetQualifier,
  type DiscordWalletLink,
  getActiveSemesters,
  linkTokenExpiry,
  pointsFromWad,
  randomNonce,
  randomToken,
  reconcileRoles,
  revokeAllRoles,
  type SupabaseClient,
} from "../_shared/discordLink.ts"

// EdgeRuntime is provided by the Supabase edge runtime; lets background work
// outlive the (already-sent) deferred interaction response.
declare const EdgeRuntime:
  | { waitUntil(promise: Promise<unknown>): void }
  | undefined

type DiscordUser = {
  id: string
  username?: string
  global_name?: string | null
  avatar?: string | null
}

const ADMINISTRATOR_PERMISSION = 1n << 3n
const MANAGE_ROLES_PERMISSION = 1n << 28n
const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" }

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: JSON_HEADERS })
}

function ephemeral(content: string, components?: unknown[]): unknown {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: MessageFlags.EPHEMERAL,
      content,
      components: components ?? [],
    },
  }
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

function hasRoleManagerPermission(permissions: string | undefined): boolean {
  if (!permissions) return false
  try {
    const bits = BigInt(permissions)
    return (
      (bits & ADMINISTRATOR_PERMISSION) !== 0n ||
      (bits & MANAGE_ROLES_PERMISSION) !== 0n
    )
  } catch (_err) {
    return false
  }
}

function linkButtonRow(url: string, label = "Link wallet"): unknown {
  return {
    type: 1,
    components: [{ type: 2, style: ButtonStyle.LINK, label, url }],
  }
}

function manageButtonsRow(): unknown {
  return {
    type: 1,
    components: [
      {
        type: 2,
        style: ButtonStyle.DANGER,
        label: "Unlink",
        custom_id: "mb_unlink",
      },
      {
        type: 2,
        style: ButtonStyle.SECONDARY,
        label: "Link a different wallet",
        custom_id: "mb_relink",
      },
    ],
  }
}

// Create a short-lived linking session and return the URL the user opens.
async function createLinkUrl(
  supabase: SupabaseClient,
  user: DiscordUser,
  guildId: string | null,
): Promise<string> {
  const token = randomToken()
  const nonce = randomNonce()
  const expiresAt = linkTokenExpiry(Date.now())

  await supabase.from("discord_link_tokens").insert({
    token,
    discord_user_id: user.id,
    discord_username: user.username ?? null,
    discord_global_name: user.global_name ?? null,
    discord_avatar: user.avatar ?? null,
    guild_id: guildId,
    nonce,
    status: "pending",
    expires_at: expiresAt,
  })

  const webappUrl = (Deno.env.get("MATCHBOX_WEBAPP_URL") ?? "").replace(
    /\/$/,
    "",
  )
  return `${webappUrl}/link?token=${token}`
}

// Background work for an already-linked user running /matchbox: look up points
// per semester, reconcile the roles, and edit the deferred reply with the result.
async function followupLinkedStatus(args: {
  supabase: SupabaseClient
  appId: string
  interactionToken: string
  link: DiscordWalletLink
}): Promise<void> {
  const { supabase, appId, interactionToken, link } = args
  let content: string
  try {
    const semesters = await getActiveSemesters(supabase)
    const result = await reconcileRoles({ supabase, link, semesters })

    const lines = [
      "🔗 **Your Matchbox link**",
      `Wallet: \`${truncateAddress(link.wallet_address)}\``,
      "",
    ]
    if (result.semesters.length === 0 && !result.liveRoleId) {
      lines.push("No semester roles are configured yet.")
    } else {
      for (const s of result.semesters) {
        const pts = pointsFromWad(s.pointsWad).toLocaleString()
        lines.push(
          `${s.qualifies ? "✅" : "⬜"} **${s.label}** — ${pts} pts${
            s.qualifies ? " · role granted" : ""
          }`,
        )
      }
      if (result.liveRoleId) {
        const pts = pointsFromWad(result.livePointsWad ?? 0n).toLocaleString()
        lines.push(
          `${result.liveQualifies ? "✅" : "⬜"} **Current** — ${pts} pts${
            result.liveQualifies ? " · role granted" : ""
          }`,
        )
      }
    }
    content = lines.join("\n")
  } catch (err) {
    console.error("followupLinkedStatus error:", err)
    content = [
      "🔗 **Your Matchbox link**",
      `Wallet: \`${truncateAddress(link.wallet_address)}\``,
      "Couldn't fetch your Academy points right now — please try again shortly.",
    ].join("\n")
  }

  await editOriginalInteraction({
    appId,
    interactionToken,
    payload: { content, components: [manageButtonsRow()] },
  })
}

async function followupUnlink(args: {
  supabase: SupabaseClient
  appId: string
  interactionToken: string
  user: DiscordUser
  guildId: string | null
}): Promise<void> {
  const { supabase, appId, interactionToken, user, guildId } = args
  const { data: link } = await supabase
    .from("discord_wallet_links")
    .select("discord_user_id, wallet_address, guild_id, granted_roles")
    .eq("discord_user_id", user.id)
    .maybeSingle()

  if (link) {
    const semesters = await getActiveSemesters(supabase)
    await revokeAllRoles({ supabase, link, semesters })
  }

  await supabase
    .from("discord_wallet_links")
    .delete()
    .eq("discord_user_id", user.id)

  const url = await createLinkUrl(supabase, user, guildId)
  await editOriginalInteraction({
    appId,
    interactionToken,
    payload: {
      content:
        "✅ Your wallet has been unlinked and any Matchbox roles removed.\nYou can link a new wallet below.",
      components: [linkButtonRow(url)],
    },
  })
}

async function followupRelink(args: {
  supabase: SupabaseClient
  appId: string
  interactionToken: string
  user: DiscordUser
  guildId: string | null
}): Promise<void> {
  const { supabase, appId, interactionToken, user, guildId } = args
  const url = await createLinkUrl(supabase, user, guildId)
  await editOriginalInteraction({
    appId,
    interactionToken,
    payload: {
      content:
        "Open the link below to connect and verify a different wallet. Linking a new wallet replaces your current one.",
      components: [linkButtonRow(url, "Link a different wallet")],
    },
  })
}

async function followupPokeRoles(args: {
  supabase: SupabaseClient
  appId: string
  interactionToken: string
}): Promise<void> {
  const { supabase, appId, interactionToken } = args
  let content: string
  try {
    const semesters = await getActiveSemesters(supabase)
    const includeLive = Boolean(Deno.env.get("DISCORD_ROLE_ID"))
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
        console.error(`poke-roles failed for ${link.discord_user_id}:`, err)
      }
    }

    content = [
      "Role sync complete.",
      `Processed: ${processed.toLocaleString()}`,
      `Failed: ${failed.toLocaleString()}`,
      `Semester role windows: ${semesters.length.toLocaleString()}`,
      `Live role: ${includeLive ? "enabled" : "disabled"}`,
    ].join("\n")
  } catch (err) {
    console.error("followupPokeRoles error:", err)
    content = [
      "Role sync failed.",
      "I couldn't reconcile Academy roles right now. Check function logs for details.",
    ].join("\n")
  }

  await editOriginalInteraction({
    appId,
    interactionToken,
    payload: { content },
  })
}

function runBackground(promise: Promise<unknown>): void {
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) {
    EdgeRuntime.waitUntil(promise)
  } else {
    // Fallback for local/dev runtimes without waitUntil.
    promise.catch((err) => console.error("background task error:", err))
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  const publicKey = Deno.env.get("DISCORD_PUBLIC_KEY")
  const appId = Deno.env.get("DISCORD_APP_ID")
  if (!publicKey || !appId) {
    return new Response("Server misconfigured", { status: 500 })
  }

  const rawBody = await req.text()
  const valid = await verifyDiscordSignature({
    rawBody,
    signature: req.headers.get("x-signature-ed25519"),
    timestamp: req.headers.get("x-signature-timestamp"),
    publicKey,
  })
  if (!valid) {
    return new Response("invalid request signature", { status: 401 })
  }

  const interaction = JSON.parse(rawBody)

  if (interaction.type === InteractionType.PING) {
    return jsonResponse({ type: InteractionResponseType.PONG })
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const user: DiscordUser | undefined = interaction.member?.user ??
    interaction.user
  const guildId: string | null = interaction.guild_id ?? null
  const interactionToken: string = interaction.token
  const commandName: string | undefined = interaction.data?.name

  if (!user?.id) {
    return jsonResponse(ephemeral("Couldn't identify your Discord account."))
  }

  // Slash commands.
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    if (commandName === "poke-roles") {
      if (!hasRoleManagerPermission(interaction.member?.permissions)) {
        return jsonResponse(
          ephemeral("You need Manage Roles permission to run `/poke-roles`."),
        )
      }

      runBackground(followupPokeRoles({ supabase, appId, interactionToken }))
      return jsonResponse({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        data: { flags: MessageFlags.EPHEMERAL },
      })
    }

    if (commandName !== "matchbox") {
      return jsonResponse(ephemeral("Unsupported command."))
    }

    const { data: link } = await supabase
      .from("discord_wallet_links")
      .select("discord_user_id, wallet_address, guild_id, granted_roles")
      .eq("discord_user_id", user.id)
      .maybeSingle()

    if (!link) {
      const url = await createLinkUrl(supabase, user, guildId)
      return jsonResponse(
        ephemeral(
          "👋 Link your wallet to Matchbox to track your Mezo Academy points.\nOpen the link below, connect your wallet, and sign to verify ownership.",
          [linkButtonRow(url)],
        ),
      )
    }

    // Linked: defer (fetching points is slow), then edit with the result.
    runBackground(
      followupLinkedStatus({ supabase, appId, interactionToken, link }),
    )
    return jsonResponse({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: { flags: MessageFlags.EPHEMERAL },
    })
  }

  // Button clicks.
  if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    const customId: string = interaction.data?.custom_id ?? ""
    if (customId === "mb_unlink") {
      runBackground(
        followupUnlink({ supabase, appId, interactionToken, user, guildId }),
      )
    } else if (customId === "mb_relink") {
      runBackground(
        followupRelink({ supabase, appId, interactionToken, user, guildId }),
      )
    }
    // Acknowledge by deferring an update to the existing ephemeral message.
    return jsonResponse({ type: 6 })
  }

  return jsonResponse(ephemeral("Unsupported interaction."))
})
