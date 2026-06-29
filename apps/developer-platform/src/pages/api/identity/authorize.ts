import {
  authorizationInputSchema,
  createAuthorizationCode,
  discordAvatarUrl,
  discordLinkSchema,
  resolveApprovedApp,
} from "@/server/identity"
import {
  authenticatedUser,
  createAdminClient,
  walletAddressForUser,
} from "@/server/supabase"
import type { NextApiRequest, NextApiResponse } from "next"

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse,
): Promise<void> {
  response.setHeader("Cache-Control", "private, no-store, max-age=0")
  if (process.env.DEVELOPER_PLATFORM_ENABLED !== "true") {
    response.status(503).json({ error: "platform-disabled" })
    return
  }
  const database = createAdminClient()

  if (request.method === "GET") {
    const parsedQuery = authorizationInputSchema.safeParse({
      clientId: request.query.client_id,
      redirectUri: request.query.redirect_uri,
      state: request.query.state ?? "",
    })
    if (!parsedQuery.success) {
      response.status(400).json({ error: "invalid-authorization-request" })
      return
    }
    const app = await resolveApprovedApp(
      database,
      parsedQuery.data.clientId,
      parsedQuery.data.redirectUri,
    )
    if (!app || !app.approved_scopes.includes("profile:read")) {
      response.status(404).json({ error: "application-not-available" })
      return
    }

    const user = await authenticatedUser(request)
    const walletAddress = user ? walletAddressForUser(user) : null
    let profile = null
    if (walletAddress) {
      const { data } = await database
        .from("discord_wallet_links")
        .select(
          "discord_user_id,wallet_address,discord_username,discord_global_name,discord_avatar,verified_at",
        )
        .eq("wallet_address", walletAddress)
        .maybeSingle()
      const parsedProfile = discordLinkSchema.safeParse(data)
      if (parsedProfile.success) {
        profile = {
          walletAddress: parsedProfile.data.wallet_address,
          discordUserId: parsedProfile.data.discord_user_id,
          username: parsedProfile.data.discord_username,
          displayName: parsedProfile.data.discord_global_name,
          avatarUrl: discordAvatarUrl(
            parsedProfile.data.discord_user_id,
            parsedProfile.data.discord_avatar,
          ),
          verifiedAt: parsedProfile.data.verified_at,
        }
      }
    }
    response.status(200).json({
      app: {
        clientId: app.client_id,
        name: app.name,
        description: app.description,
        purpose: app.purpose,
        logoUrl: app.logo_url,
        websiteUrl: app.website_url,
        privacyPolicyUrl: app.privacy_policy_url,
        termsUrl: app.terms_url,
      },
      profile,
    })
    return
  }

  if (request.method === "POST") {
    const parsedBody = authorizationInputSchema.safeParse(request.body)
    const user = await authenticatedUser(request)
    if (!parsedBody.success || !user) {
      response.status(401).json({ error: "wallet-authentication-required" })
      return
    }
    const walletAddress = walletAddressForUser(user)
    const app = await resolveApprovedApp(
      database,
      parsedBody.data.clientId,
      parsedBody.data.redirectUri,
    )
    if (
      !walletAddress ||
      !app ||
      !app.approved_scopes.includes("profile:read")
    ) {
      response.status(400).json({ error: "invalid-authorization-request" })
      return
    }
    const { data: rawProfile } = await database
      .from("discord_wallet_links")
      .select(
        "discord_user_id,wallet_address,discord_username,discord_global_name,discord_avatar,verified_at",
      )
      .eq("wallet_address", walletAddress)
      .maybeSingle()
    const profile = discordLinkSchema.safeParse(rawProfile)
    if (!profile.success) {
      response.status(409).json({ error: "wallet-profile-not-linked" })
      return
    }
    const code = await createAuthorizationCode(
      database,
      app,
      walletAddress,
      parsedBody.data.redirectUri,
      profile.data,
    )
    const redirect = new URL(parsedBody.data.redirectUri)
    redirect.searchParams.set("code", code)
    if (parsedBody.data.state)
      redirect.searchParams.set("state", parsedBody.data.state)
    response.status(200).json({ redirectTo: redirect.toString() })
    return
  }

  response.setHeader("Allow", "GET, POST")
  response.status(405).json({ error: "method-not-allowed" })
}
