import { createHmac, randomBytes } from "node:crypto"
import { authenticatedUser, createAdminClient } from "@/server/supabase"
import type { NextApiRequest, NextApiResponse } from "next"
import { z } from "zod"

const querySchema = z.object({ appId: z.uuid() })
const revokeKeySchema = z.object({ appId: z.uuid(), keyId: z.uuid() })
const createKeySchema = z.object({
  appId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  keyType: z.enum(["publishable", "secret"]),
  scopes: z.array(z.enum(["gauges:read", "profile:read"])).min(1),
  allowedCidrs: z.array(z.string().trim().min(3).max(64)).max(20).default([]),
})
const membershipSchema = z.object({
  role: z.enum(["owner", "admin", "developer"]),
})
const appSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  status: z.enum(["draft", "pending-review", "approved", "suspended"]),
  approved_scopes: z.array(z.enum(["gauges:read", "profile:read"])),
})

async function authorizedApp(appId: string, userId: string) {
  const database = createAdminClient()
  const { data: rawApp } = await database
    .from("developer_apps")
    .select("id,organization_id,status,approved_scopes")
    .eq("id", appId)
    .maybeSingle()
  const app = appSchema.safeParse(rawApp)
  if (!app.success) return null
  const { data: rawMembership } = await database
    .from("developer_organization_memberships")
    .select("role")
    .eq("organization_id", app.data.organization_id)
    .eq("auth_user_id", userId)
    .maybeSingle()
  const membership = membershipSchema.safeParse(rawMembership)
  return membership.success
    ? { app: app.data, membership: membership.data }
    : null
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

  if (request.method === "GET") {
    const query = querySchema.safeParse(request.query)
    if (!query.success || !(await authorizedApp(query.data.appId, user.id))) {
      response.status(404).json({ error: "application-not-found" })
      return
    }
    const { data } = await database
      .from("developer_api_keys")
      .select(
        "id,name,key_type,key_prefix,scopes,allowed_cidrs,expires_at,last_used_at,revoked_at,created_at",
      )
      .eq("app_id", query.data.appId)
      .order("created_at", { ascending: false })
    const keys = data ?? []
    const from = new Date()
    from.setUTCDate(from.getUTCDate() - 29)
    const keyIds = keys.map((key) => key.id)
    const { data: usageRows } = keyIds.length
      ? await database
          .from("developer_usage_daily")
          .select("gauge_requests,profile_requests,error_requests")
          .in("key_id", keyIds)
          .gte("usage_date", from.toISOString().slice(0, 10))
      : { data: [] }
    const usage = (usageRows ?? []).reduce(
      (totals, row) => ({
        gaugeRequests: totals.gaugeRequests + Number(row.gauge_requests),
        profileRequests: totals.profileRequests + Number(row.profile_requests),
        errorRequests: totals.errorRequests + Number(row.error_requests),
      }),
      { gaugeRequests: 0, profileRequests: 0, errorRequests: 0 },
    )
    response.status(200).json({ keys, usage, usageDays: 30 })
    return
  }

  if (request.method === "POST") {
    const body = createKeySchema.safeParse(request.body)
    if (!body.success) {
      response.status(400).json({ error: "invalid-key-request" })
      return
    }
    if (!process.env.API_KEY_PEPPER) {
      response.status(503).json({ error: "key-service-not-configured" })
      return
    }
    const authorization = await authorizedApp(body.data.appId, user.id)
    if (
      !authorization ||
      !(["owner", "admin"] as string[]).includes(
        authorization.membership.role,
      ) ||
      authorization.app.status !== "approved"
    ) {
      response.status(403).json({ error: "approved-application-required" })
      return
    }
    if (
      body.data.scopes.some(
        (scope) => !authorization.app.approved_scopes.includes(scope),
      ) ||
      (body.data.keyType === "publishable" &&
        body.data.scopes.some((scope) => scope !== "gauges:read"))
    ) {
      response.status(403).json({ error: "scope-not-approved" })
      return
    }
    const keyId = randomBytes(8).toString("hex")
    const prefix = `mbx_${body.data.keyType === "secret" ? "sk" : "pk"}_live_${keyId}`
    const rawKey = `${prefix}_${randomBytes(32).toString("base64url")}`
    const secretHash = createHmac("sha256", process.env.API_KEY_PEPPER)
      .update(rawKey)
      .digest("base64url")
    const { data, error } = await database
      .from("developer_api_keys")
      .insert({
        app_id: body.data.appId,
        name: body.data.name,
        key_type: body.data.keyType,
        key_prefix: prefix,
        secret_hash: secretHash,
        scopes: body.data.scopes,
        allowed_cidrs:
          body.data.keyType === "secret" ? body.data.allowedCidrs : [],
        created_by: user.id,
      })
      .select("id,name,key_type,key_prefix,scopes,created_at")
      .single()
    if (error) {
      response.status(500).json({ error: "unable-to-create-key" })
      return
    }
    await database.from("developer_audit_events").insert({
      organization_id: authorization.app.organization_id,
      app_id: authorization.app.id,
      actor_auth_user_id: user.id,
      action: "api-key-created",
      metadata: { keyPrefix: prefix, keyType: body.data.keyType },
    })
    response.status(201).json({ key: data, secret: rawKey })
    return
  }

  if (request.method === "DELETE") {
    const body = revokeKeySchema.safeParse(request.body)
    if (!body.success) {
      response.status(400).json({ error: "invalid-key-request" })
      return
    }
    const authorization = await authorizedApp(body.data.appId, user.id)
    if (
      !authorization ||
      (authorization.membership.role !== "owner" &&
        authorization.membership.role !== "admin")
    ) {
      response.status(403).json({ error: "admin-role-required" })
      return
    }
    const revokedAt = new Date().toISOString()
    const { data: revokedKey, error } = await database
      .from("developer_api_keys")
      .update({ revoked_at: revokedAt })
      .eq("id", body.data.keyId)
      .eq("app_id", body.data.appId)
      .is("revoked_at", null)
      .select("id,key_prefix")
      .maybeSingle()
    const parsedKey = z
      .object({ id: z.uuid(), key_prefix: z.string() })
      .safeParse(revokedKey)
    if (error) {
      response.status(500).json({ error: "unable-to-revoke-key" })
      return
    }
    if (!parsedKey.success) {
      response.status(404).json({ error: "active-key-not-found" })
      return
    }
    await database.from("developer_audit_events").insert({
      organization_id: authorization.app.organization_id,
      app_id: authorization.app.id,
      actor_auth_user_id: user.id,
      action: "api-key-revoked",
      metadata: { keyPrefix: parsedKey.data.key_prefix },
    })
    response.status(200).json({ revokedAt })
    return
  }

  response.setHeader("Allow", "GET, POST, DELETE")
  response.status(405).json({ error: "method-not-allowed" })
}
