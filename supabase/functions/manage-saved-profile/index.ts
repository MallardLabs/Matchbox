// Saved profile templates: signed writes only.
//
// `nonce` issues a single-use message for the owner's wallet to sign;
// `save-template` and `delete-template` verify that signature (EOA or
// ERC-1271/6492 contract wallet), consume the nonce and write `saved_profiles`
// with the service role. Anonymous writes are revoked by
// 20261024000004_lock_saved_profile_writes.sql.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  createPublicClient,
  getAddress,
  http,
  isHex,
} from "https://esm.sh/viem@2"
import { z } from "https://esm.sh/zod@4.1.12"
import { getMezoNetworkConfigForChain } from "../_shared/contracts.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { sha256 } from "../_shared/gaugeProfileAuthorization.ts"
import {
  parseSavedProfileMessage,
  savedProfileAuthorizationMessage,
} from "../_shared/savedProfileAuthorization.ts"
import { structuredLogger } from "../_shared/structuredLogger.ts"

const nonceLifetimeMs = 5 * 60_000

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
const actionSchema = z.enum(["save-template", "delete-template"])
const identitySchema = z.object({
  chainId: z.union([z.literal(31611), z.literal(31612)]).default(31612),
  ownerAddress: addressSchema,
})
const proofSchema = z.object({
  message: z.string().min(50).max(1000),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
})
const httpsUrl = z
  .string()
  .url()
  .max(2048)
  .regex(/^https:\/\//)

const nonceSchema = identitySchema.extend({
  action: z.literal("nonce"),
  operation: actionSchema,
})
const saveSchema = identitySchema.extend({
  action: z.literal("save-template"),
  proof: proofSchema,
  template: z.object({
    name: z.string().trim().min(1).max(80),
    profilePictureUrl: httpsUrl.nullable(),
    displayName: z.string().max(80).nullable(),
    description: z.string().max(2000).nullable(),
    websiteUrl: z.string().url().max(2048).nullable(),
    socialLinks: z.record(z.string(), z.string().url()).nullable(),
    incentiveStrategy: z.string().max(2000).nullable(),
    votingStrategy: z.string().max(2000).nullable(),
    tags: z.array(z.string().max(40)).max(12).nullable(),
  }),
})
const deleteSchema = identitySchema.extend({
  action: z.literal("delete-template"),
  proof: proofSchema,
  templateId: z.number().int().positive(),
})
const requestSchema = z.union([nonceSchema, saveSchema, deleteSchema])

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  if (request.method !== "POST") {
    return json({ error: "method-not-allowed" }, 405)
  }

  try {
    const parsed = requestSchema.safeParse(await request.json())
    if (!parsed.success) return json({ error: "invalid-request" }, 400)
    const body = parsed.data
    const owner = body.ownerAddress.toLowerCase()
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    if (body.action === "nonce") {
      const nonce = crypto.randomUUID().replaceAll("-", "")
      const expiresAt = new Date(Date.now() + nonceLifetimeMs).toISOString()
      const { error } = await supabase
        .from("saved_profile_write_nonces")
        .insert({
          nonce_hash: await sha256(nonce),
          owner_address: owner,
          action: body.operation,
          expires_at: expiresAt,
        })
      if (error) throw new Error("Unable to issue write nonce")
      return json({
        message: savedProfileAuthorizationMessage({
          action: body.operation,
          chainId: body.chainId,
          ownerAddress: owner,
          nonce,
          expiresAt,
        }),
      })
    }

    const fields = parseSavedProfileMessage(body.proof.message)
    if (fields === null || !isHex(body.proof.signature)) {
      return json({ error: "invalid-proof" }, 401)
    }
    const expected = savedProfileAuthorizationMessage({
      action: body.action,
      chainId: body.chainId,
      ownerAddress: owner,
      nonce: fields.nonce,
      expiresAt: fields.expiresAt,
    })
    if (expected !== body.proof.message) {
      return json({ error: "invalid-proof" }, 401)
    }
    const network = getMezoNetworkConfigForChain(body.chainId)
    const publicClient = createPublicClient({
      chain: network.chain,
      transport: http(network.rpcUrl),
    })
    const signatureValid = await publicClient.verifyMessage({
      address: getAddress(body.ownerAddress),
      message: body.proof.message,
      signature: body.proof.signature,
    })
    if (!signatureValid) {
      return json({ error: "template-authorization-failed" }, 403)
    }

    const now = new Date().toISOString()
    const { data: consumed } = await supabase
      .from("saved_profile_write_nonces")
      .update({ used_at: now })
      .eq("nonce_hash", await sha256(fields.nonce))
      .eq("owner_address", owner)
      .eq("action", body.action)
      .eq("expires_at", fields.expiresAt)
      .is("used_at", null)
      .gt("expires_at", now)
      .select("nonce_hash")
      .maybeSingle()
    if (!consumed) return json({ error: "expired-or-used-proof" }, 401)

    if (body.action === "delete-template") {
      const { data, error } = await supabase
        .from("saved_profiles")
        .delete()
        .eq("id", body.templateId)
        .eq("owner_address", owner)
        .select("id")
      if (error) throw new Error("Unable to delete saved profile")
      if ((data ?? []).length === 0) return json({ error: "not-found" }, 404)
      return json({ deleted: body.templateId })
    }

    const template = body.template
    const { data, error } = await supabase
      .from("saved_profiles")
      .upsert(
        {
          owner_address: owner,
          name: template.name,
          source: "manual",
          source_gauge_address: null,
          source_vebtc_token_id: null,
          profile_picture_url: template.profilePictureUrl,
          display_name: template.displayName,
          description: template.description,
          website_url: template.websiteUrl,
          social_links: template.socialLinks,
          incentive_strategy: template.incentiveStrategy,
          voting_strategy: template.votingStrategy,
          tags: template.tags,
        },
        { onConflict: "owner_address,name" },
      )
      .select()
      .single()
    if (error) throw new Error("Unable to save saved profile")
    structuredLogger.info({
      message: "Saved profile template written after signer authorization",
      ownerAddress: owner,
    })
    return json({ template: data })
  } catch (error) {
    structuredLogger.error({
      message: "Saved profile write failed",
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return json({ error: "request-failed" }, 500)
  }
})
