import { authenticatedUser, createAdminClient } from "@/server/supabase"
import type { User } from "@supabase/supabase-js"
import type { NextApiRequest, NextApiResponse } from "next"
import { z } from "zod"

const createAppSchema = z.object({
  name: z.string().trim().min(1).max(80),
  purpose: z.string().trim().min(20).max(1000),
  websiteUrl: z.url().startsWith("https://"),
  privacyPolicyUrl: z.url().startsWith("https://"),
  termsUrl: z.url().startsWith("https://"),
  redirectUri: z.url().startsWith("https://"),
  origin: z.url().startsWith("https://"),
  profileAccess: z.boolean(),
})

const membershipSchema = z.object({
  organization_id: z.uuid(),
  role: z.enum(["owner", "admin", "developer"]),
})

function accountName(user: User): string {
  const metadataName = user.user_metadata.full_name
  if (typeof metadataName === "string" && metadataName.trim())
    return metadataName.trim()
  return user.email?.split("@")[0] ?? "Developer"
}

async function ensureOrganization(user: User) {
  const database = createAdminClient()
  const { data: existing } = await database
    .from("developer_organization_memberships")
    .select("organization_id,role")
    .eq("auth_user_id", user.id)
    .limit(1)
    .maybeSingle()
  const parsedExisting = membershipSchema.safeParse(existing)
  if (parsedExisting.success) return parsedExisting.data

  const displayName = accountName(user)
  const suffix = user.id.slice(0, 8)
  const baseSlug =
    displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "developer"
  const { data: rawOrganization, error: organizationError } = await database
    .from("developer_organizations")
    .insert({
      name: `${displayName}'s organization`,
      slug: `${baseSlug}-${suffix}`,
    })
    .select("id")
    .single()
  const organization = z.object({ id: z.uuid() }).safeParse(rawOrganization)
  if (organizationError || !organization.success)
    throw new Error("Unable to create organization")
  await database.from("developer_accounts").upsert({
    auth_user_id: user.id,
    display_name: displayName,
  })
  await database.from("developer_organization_memberships").insert({
    organization_id: organization.data.id,
    auth_user_id: user.id,
    role: "owner",
  })
  return { organization_id: organization.data.id, role: "owner" as const }
}

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
  if (!user || !user.email) {
    response.status(401).json({ error: "authentication-required" })
    return
  }
  const database = createAdminClient()
  const membership = await ensureOrganization(user)

  if (request.method === "GET") {
    const [{ data: organization }, { data: apps }] = await Promise.all([
      database
        .from("developer_organizations")
        .select("id,name,slug")
        .eq("id", membership.organization_id)
        .single(),
      database
        .from("developer_apps")
        .select(
          "id,client_id,name,status,approved_scopes,requested_scopes,created_at,website_url",
        )
        .eq("organization_id", membership.organization_id)
        .order("created_at", { ascending: false }),
    ])
    response.status(200).json({ organization, apps: apps ?? [] })
    return
  }

  if (request.method === "POST") {
    if (membership.role !== "owner" && membership.role !== "admin") {
      response.status(403).json({ error: "admin-role-required" })
      return
    }
    const body = createAppSchema.safeParse(request.body)
    if (!body.success) {
      response
        .status(400)
        .json({ error: "invalid-app", details: body.error.flatten() })
      return
    }
    const requestedScopes = body.data.profileAccess
      ? ["gauges:read", "profile:read"]
      : ["gauges:read"]
    const { data: rawApp, error } = await database
      .from("developer_apps")
      .insert({
        organization_id: membership.organization_id,
        name: body.data.name,
        purpose: body.data.purpose,
        description: body.data.purpose.slice(0, 500),
        website_url: body.data.websiteUrl,
        privacy_policy_url: body.data.privacyPolicyUrl,
        terms_url: body.data.termsUrl,
        requested_scopes: requestedScopes,
        status: "pending-review",
      })
      .select("id,client_id,name,status")
      .single()
    const app = z
      .object({
        id: z.uuid(),
        client_id: z.string(),
        name: z.string(),
        status: z.string(),
      })
      .safeParse(rawApp)
    if (error || !app.success) {
      response.status(500).json({ error: "unable-to-create-app" })
      return
    }
    await Promise.all([
      database.from("developer_app_redirect_uris").insert({
        app_id: app.data.id,
        redirect_uri: body.data.redirectUri,
      }),
      database.from("developer_app_origins").insert({
        app_id: app.data.id,
        origin: new URL(body.data.origin).origin,
      }),
      database.from("developer_audit_events").insert({
        organization_id: membership.organization_id,
        app_id: app.data.id,
        actor_auth_user_id: user.id,
        action: "application-submitted-for-review",
      }),
    ])
    response.status(201).json({ app: app.data })
    return
  }

  response.setHeader("Allow", "GET, POST")
  response.status(405).json({ error: "method-not-allowed" })
}
