import { appSchema } from "@/server/identity"
import {
  authenticatedUser,
  createAdminClient,
  walletAddressForUser,
} from "@/server/supabase"
import type { NextApiRequest, NextApiResponse } from "next"
import { z } from "zod"

const grantSchema = z.object({
  id: z.uuid(),
  app_id: z.uuid(),
  scopes: z.array(z.string()),
  authorized_at: z.string(),
  last_accessed_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
})

const revokeSchema = z.object({ grantId: z.uuid() })

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse,
): Promise<void> {
  response.setHeader("Cache-Control", "private, no-store, max-age=0")
  if (process.env.DEVELOPER_PLATFORM_ENABLED !== "true") {
    response.status(503).json({ error: "platform-disabled" })
    return
  }
  const user = await authenticatedUser(request)
  const walletAddress = user ? walletAddressForUser(user) : null
  if (!user || !walletAddress) {
    response.status(401).json({ error: "wallet-authentication-required" })
    return
  }
  const database = createAdminClient()

  if (request.method === "GET") {
    const { data: rawGrants, error } = await database
      .from("developer_app_grants")
      .select("id,app_id,scopes,authorized_at,last_accessed_at,revoked_at")
      .eq("wallet_address", walletAddress)
      .is("revoked_at", null)
      .order("authorized_at", { ascending: false })
    if (error) {
      response.status(500).json({ error: "unable-to-load-apps" })
      return
    }
    const grants = z.array(grantSchema).safeParse(rawGrants)
    if (!grants.success) {
      response.status(500).json({ error: "invalid-app-data" })
      return
    }
    const appIds = grants.data.map((grant) => grant.app_id)
    const { data: rawApps } = appIds.length
      ? await database
          .from("developer_apps")
          .select(
            "id,organization_id,client_id,name,description,purpose,logo_url,website_url,privacy_policy_url,terms_url,status,approved_scopes,scope_version",
          )
          .in("id", appIds)
      : { data: [] }
    const apps = z.array(appSchema).safeParse(rawApps)
    if (!apps.success) {
      response.status(500).json({ error: "invalid-app-data" })
      return
    }
    const appsById = new Map(apps.data.map((app) => [app.id, app]))
    response.status(200).json({
      walletAddress,
      grants: grants.data.flatMap((grant) => {
        const app = appsById.get(grant.app_id)
        return app
          ? [
              {
                id: grant.id,
                scopes: grant.scopes,
                authorizedAt: grant.authorized_at,
                lastAccessedAt: grant.last_accessed_at,
                app: {
                  name: app.name,
                  logoUrl: app.logo_url,
                  websiteUrl: app.website_url,
                  privacyPolicyUrl: app.privacy_policy_url,
                },
              },
            ]
          : []
      }),
    })
    return
  }

  if (request.method === "DELETE") {
    const body = revokeSchema.safeParse(request.body)
    if (!body.success) {
      response.status(400).json({ error: "invalid-request" })
      return
    }
    const revokedAt = new Date().toISOString()
    const { data, error } = await database
      .from("developer_app_grants")
      .update({ revoked_at: revokedAt, revoked_reason: "user-revoked" })
      .eq("id", body.data.grantId)
      .eq("wallet_address", walletAddress)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle()
    if (error || !data) {
      response.status(404).json({ error: "grant-not-found" })
      return
    }
    await database.from("developer_audit_events").insert({
      actor_wallet_address: walletAddress,
      action: "app-grant-revoked",
      metadata: { grantId: body.data.grantId },
    })
    response.status(204).end()
    return
  }

  response.setHeader("Allow", "GET, DELETE")
  response.status(405).json({ error: "method-not-allowed" })
}
