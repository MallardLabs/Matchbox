import type { SupabaseClient } from "@supabase/supabase-js"
import { getAddress } from "viem"
import { sha256Base64Url } from "./crypto"
import { discordAvatarUrl } from "./profiles"
import {
  authorizationCodeSchema,
  discordProfileSchema,
  exchangeRequestSchema,
  grantRowSchema,
} from "./schemas"
import type { ApiKeyContext } from "./types"

export async function exchangeAuthorizationCode(
  rawBody: unknown,
  context: ApiKeyContext,
  database: SupabaseClient,
) {
  if (context.keyType !== "secret") return { type: "invalid" as const }
  const parsedBody = exchangeRequestSchema.safeParse(rawBody)
  if (!parsedBody.success) return { type: "malformed" as const }
  const codeHash = await sha256Base64Url(parsedBody.data.code)
  const consumedAt = new Date().toISOString()

  const { data: rawCode, error: codeError } = await database
    .from("developer_authorization_codes")
    .update({ consumed_at: consumedAt })
    .eq("code_hash", codeHash)
    .eq("app_id", context.appId)
    .eq("redirect_uri", parsedBody.data.redirectUri)
    .is("consumed_at", null)
    .gt("expires_at", consumedAt)
    .select(
      "id,app_id,grant_id,wallet_address,redirect_uri,expires_at,consumed_at",
    )
    .maybeSingle()
  if (codeError || !rawCode) return { type: "invalid" as const }
  const parsedCode = authorizationCodeSchema.safeParse(rawCode)
  if (!parsedCode.success) return { type: "invalid" as const }

  const [{ data: rawGrant }, { data: rawProfile }] = await Promise.all([
    database
      .from("developer_app_grants")
      .select("id,app_id,wallet_address,scopes,scope_version,revoked_at")
      .eq("id", parsedCode.data.grant_id)
      .is("revoked_at", null)
      .maybeSingle(),
    database
      .from("discord_wallet_links")
      .select(
        "discord_user_id,wallet_address,discord_username,discord_global_name,discord_avatar,verified_at",
      )
      .eq("wallet_address", parsedCode.data.wallet_address)
      .maybeSingle(),
  ])
  const parsedGrant = grantRowSchema.safeParse(rawGrant)
  const parsedProfile = discordProfileSchema.safeParse(rawProfile)
  if (
    !parsedGrant.success ||
    !parsedProfile.success ||
    parsedGrant.data.scope_version !== context.app.scopeVersion
  ) {
    return { type: "invalid" as const }
  }

  return {
    type: "success" as const,
    data: {
      object: "authorization",
      walletAddress: getAddress(parsedProfile.data.wallet_address),
      scopes: parsedGrant.data.scopes,
      profile: {
        discord: {
          userId: parsedProfile.data.discord_user_id,
          username: parsedProfile.data.discord_username,
          displayName: parsedProfile.data.discord_global_name,
          avatarUrl: discordAvatarUrl(
            parsedProfile.data.discord_user_id,
            parsedProfile.data.discord_avatar,
          ),
        },
        verifiedAt: parsedProfile.data.verified_at,
      },
    },
  }
}
