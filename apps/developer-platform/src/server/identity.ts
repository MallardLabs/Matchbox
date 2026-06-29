import { createHash, randomBytes } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

export const authorizationInputSchema = z.object({
  clientId: z.string().startsWith("mbx_app_").max(96),
  redirectUri: z.url().startsWith("https://"),
  state: z.string().max(1024).default(""),
})

export const appSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  client_id: z.string(),
  name: z.string(),
  description: z.string(),
  purpose: z.string(),
  logo_url: z.string().nullable(),
  website_url: z.string().nullable(),
  privacy_policy_url: z.string().nullable(),
  terms_url: z.string().nullable(),
  status: z.enum(["draft", "pending-review", "approved", "suspended"]),
  approved_scopes: z.array(z.enum(["gauges:read", "profile:read"])),
  scope_version: z.number().int().positive(),
})

export const discordLinkSchema = z.object({
  discord_user_id: z.string(),
  wallet_address: z.string(),
  discord_username: z.string().nullable(),
  discord_global_name: z.string().nullable(),
  discord_avatar: z.string().nullable(),
  verified_at: z.string(),
})

export async function resolveApprovedApp(
  database: SupabaseClient,
  clientId: string,
  redirectUri: string,
) {
  const [{ data: rawApp }, { data: rawRedirect }] = await Promise.all([
    database
      .from("developer_apps")
      .select(
        "id,organization_id,client_id,name,description,purpose,logo_url,website_url,privacy_policy_url,terms_url,status,approved_scopes,scope_version",
      )
      .eq("client_id", clientId)
      .eq("status", "approved")
      .maybeSingle(),
    database
      .from("developer_app_redirect_uris")
      .select("id")
      .eq("redirect_uri", redirectUri)
      .maybeSingle(),
  ])
  const parsedApp = appSchema.safeParse(rawApp)
  if (!parsedApp.success || !rawRedirect) return null

  const { data: redirectForApp } = await database
    .from("developer_app_redirect_uris")
    .select("id")
    .eq("app_id", parsedApp.data.id)
    .eq("redirect_uri", redirectUri)
    .maybeSingle()
  return redirectForApp ? parsedApp.data : null
}

export async function createAuthorizationCode(
  database: SupabaseClient,
  app: z.infer<typeof appSchema>,
  walletAddress: string,
  redirectUri: string,
  profile: z.infer<typeof discordLinkSchema>,
) {
  const consentSnapshot = {
    version: app.scope_version,
    app: { clientId: app.client_id, name: app.name },
    fields: [
      "wallet-address",
      "discord-user-id",
      "discord-username",
      "discord-display-name",
      "discord-avatar",
      "verified-at",
    ],
    authorizedAt: new Date().toISOString(),
  }
  const { data: rawGrant, error: grantError } = await database
    .from("developer_app_grants")
    .upsert(
      {
        app_id: app.id,
        wallet_address: walletAddress,
        scopes: ["profile:read"],
        scope_version: app.scope_version,
        consent_snapshot: consentSnapshot,
        authorized_at: new Date().toISOString(),
        revoked_at: null,
        revoked_reason: null,
      },
      { onConflict: "app_id,wallet_address" },
    )
    .select("id")
    .single()
  const grantSchema = z.object({ id: z.uuid() })
  const grant = grantSchema.safeParse(rawGrant)
  if (grantError || !grant.success)
    throw new Error("Unable to record app consent")

  const code = randomBytes(32).toString("base64url")
  const codeHash = createHash("sha256").update(code).digest("base64url")
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString()
  const { error: codeError } = await database
    .from("developer_authorization_codes")
    .insert({
      code_hash: codeHash,
      app_id: app.id,
      grant_id: grant.data.id,
      wallet_address: walletAddress,
      redirect_uri: redirectUri,
      expires_at: expiresAt,
    })
  if (codeError) throw new Error("Unable to create authorization code")

  await database.from("developer_audit_events").insert({
    organization_id: app.organization_id,
    app_id: app.id,
    actor_wallet_address: walletAddress,
    action: "app-grant-authorized",
    metadata: {
      scopes: ["profile:read"],
      discordUserId: profile.discord_user_id,
    },
  })
  return code
}

export function discordAvatarUrl(
  discordUserId: string,
  avatarHash: string | null,
): string | null {
  if (!avatarHash) return null
  const extension = avatarHash.startsWith("a_") ? "gif" : "png"
  return `https://cdn.discordapp.com/avatars/${discordUserId}/${avatarHash}.${extension}?size=256`
}
