import type { SupabaseClient } from "@supabase/supabase-js"
import { getAddress, isAddress } from "viem"
import { discordProfileSchema, grantRowSchema } from "./schemas"
import type { ApiKeyContext } from "./types"

export function discordAvatarUrl(
  discordUserId: string,
  avatarHash: string | null,
): string | null {
  if (!avatarHash) return null
  const extension = avatarHash.startsWith("a_") ? "gif" : "png"
  return `https://cdn.discordapp.com/avatars/${discordUserId}/${avatarHash}.${extension}?size=256`
}

export async function getConsentedProfile(
  walletAddress: string,
  context: ApiKeyContext,
  database: SupabaseClient,
) {
  if (!isAddress(walletAddress) || context.keyType !== "secret") return null
  const normalizedWallet = walletAddress.toLowerCase()

  const { data: rawGrant, error: grantError } = await database
    .from("developer_app_grants")
    .select("id,app_id,wallet_address,scopes,scope_version,revoked_at")
    .eq("app_id", context.appId)
    .eq("wallet_address", normalizedWallet)
    .is("revoked_at", null)
    .maybeSingle()
  if (grantError || !rawGrant) return null
  const parsedGrant = grantRowSchema.safeParse(rawGrant)
  if (
    !parsedGrant.success ||
    !parsedGrant.data.scopes.includes("profile:read") ||
    parsedGrant.data.scope_version !== context.app.scopeVersion
  ) {
    return null
  }

  const { data: rawProfile, error: profileError } = await database
    .from("discord_wallet_links")
    .select(
      "discord_user_id,wallet_address,discord_username,discord_global_name,discord_avatar,verified_at",
    )
    .eq("wallet_address", normalizedWallet)
    .maybeSingle()
  if (profileError || !rawProfile) return null
  const parsedProfile = discordProfileSchema.safeParse(rawProfile)
  if (!parsedProfile.success) return null

  await database
    .from("developer_app_grants")
    .update({ last_accessed_at: new Date().toISOString() })
    .eq("id", parsedGrant.data.id)

  return {
    object: "profile",
    walletAddress: getAddress(parsedProfile.data.wallet_address),
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
  }
}
