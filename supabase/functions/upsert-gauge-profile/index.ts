import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  createPublicClient,
  getAddress,
  http,
  isHex,
} from "https://esm.sh/viem@2"
import { z } from "https://esm.sh/zod@4.1.12"
import {
  profileWriteAuthorizationMessage,
  resolveGaugeController,
  sha256,
} from "../_shared/gaugeProfileAuthorization.ts"
import { getMezoNetworkConfigForChain } from "../_shared/contracts.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { structuredLogger } from "../_shared/structuredLogger.ts"

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
const identitySchema = z.object({
  chainId: z.union([z.literal(31611), z.literal(31612)]).default(31612),
  gaugeAddress: addressSchema,
  veBtcTokenId: z.string().regex(/^\d+$/),
  ownerAddress: addressSchema,
})
const tokenSchema = identitySchema.extend({
  action: z.literal("nonce"),
  operation: z.enum(["upsert-profile", "upload-avatar"]),
})

const proofSchema = z.object({
  message: z.string().min(50).max(1000),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
})

const profileSchema = identitySchema.extend({
  action: z.literal("upsert-profile"),
  proof: proofSchema,
  profile: z.object({
    profilePictureUrl: z.string().url().nullable(),
    description: z.string().max(2000).nullable(),
    displayName: z.string().max(80).nullable(),
    websiteUrl: z.string().url().nullable(),
    socialLinks: z.record(z.string(), z.string().url()).nullable(),
    incentiveStrategy: z.string().max(2000).nullable(),
    votingStrategy: z.string().max(2000).nullable(),
    tags: z.array(z.string().max(40)).max(12).nullable(),
  }),
})

const avatarSchema = identitySchema.extend({
  action: z.literal("upload-avatar"),
  proof: proofSchema,
  extension: z.enum(["jpg", "jpeg", "png", "gif", "webp"]),
})

const requestSchema = z.union([tokenSchema, profileSchema, avatarSchema])

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST")
    return json({ error: "method-not-allowed" }, 405)

  try {
    const rawBody: unknown = await request.json()
    const parsed = requestSchema.safeParse(rawBody)
    if (!parsed.success) return json({ error: "invalid-request" }, 400)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const network = getMezoNetworkConfigForChain(parsed.data.chainId)
    const publicClient = createPublicClient({
      chain: network.chain,
      transport: http(network.rpcUrl),
    })
    const controller = await resolveGaugeController(publicClient, {
      chainId: parsed.data.chainId,
      gaugeAddress: parsed.data.gaugeAddress,
      veBtcTokenId: parsed.data.veBtcTokenId,
      veBtcAddress: getAddress(network.contracts.veBTC),
      boostVoterAddress: getAddress(network.contracts.boostVoter),
    })
    const signer = parsed.data.ownerAddress.toLowerCase()
    let signerAuthorized = signer === controller.nftOwnerAddress.toLowerCase()
    if (
      !signerAuthorized &&
      Deno.env.get("ENABLE_MANAGED_GAUGE_EDITORS") === "true" &&
      controller.controllerKind !== "direct-eoa"
    ) {
      if (signer === controller.controllerAddress.toLowerCase()) {
        signerAuthorized = true
      } else {
        const { data: editor, error: editorError } = await supabase
          .from("gauge_profile_editors")
          .select("editor_address")
          .eq("chain_id", controller.chainId)
          .eq("gauge_address", controller.gaugeAddress.toLowerCase())
          .eq("vebtc_token_id", controller.veBtcTokenId.toString())
          .eq("nft_owner_address", controller.nftOwnerAddress.toLowerCase())
          .eq("controller_address", controller.controllerAddress.toLowerCase())
          .eq("editor_address", signer)
          .is("revoked_at", null)
          .maybeSingle()
        if (editorError)
          throw new Error("Unable to verify gauge profile editor")
        signerAuthorized = editor !== null
      }
    }
    if (!signerAuthorized) {
      return json({ error: "profile-authorization-failed" }, 403)
    }

    if (parsed.data.action === "nonce") {
      const nonce = crypto.randomUUID().replaceAll("-", "")
      const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString()
      const { error } = await supabase
        .from("gauge_profile_write_nonces")
        .insert({
          nonce_hash: await sha256(nonce),
          chain_id: parsed.data.chainId,
          gauge_address: parsed.data.gaugeAddress.toLowerCase(),
          vebtc_token_id: parsed.data.veBtcTokenId,
          owner_address: parsed.data.ownerAddress.toLowerCase(),
          action: parsed.data.operation,
          expires_at: expiresAt,
        })
      if (error) throw new Error("Unable to issue write nonce")
      return json({
        message: profileWriteAuthorizationMessage({
          operation: parsed.data.operation,
          chainId: parsed.data.chainId,
          gaugeAddress: parsed.data.gaugeAddress,
          veBtcTokenId: parsed.data.veBtcTokenId,
          signerAddress: parsed.data.ownerAddress,
          nonce,
          expiresAt,
        }),
      })
    }

    const operation = parsed.data.action
    const lines = parsed.data.proof.message.split("\n")
    const nonceLine = lines.find((line) => line.startsWith("Nonce: "))
    const expiresLine = lines.find((line) => line.startsWith("Expires at: "))
    const nonce = nonceLine?.slice("Nonce: ".length)
    const expiresAt = expiresLine?.slice("Expires at: ".length)
    if (!nonce || !expiresAt || !Number.isFinite(Date.parse(expiresAt))) {
      return json({ error: "invalid-proof" }, 401)
    }
    const expectedMessage = profileWriteAuthorizationMessage({
      operation,
      chainId: parsed.data.chainId,
      gaugeAddress: parsed.data.gaugeAddress,
      veBtcTokenId: parsed.data.veBtcTokenId,
      signerAddress: parsed.data.ownerAddress,
      nonce,
      expiresAt,
    })
    if (expectedMessage !== parsed.data.proof.message) {
      return json({ error: "invalid-proof" }, 401)
    }
    if (!isHex(parsed.data.proof.signature)) {
      return json({ error: "invalid-proof" }, 401)
    }
    const signatureValid = await publicClient.verifyMessage({
      address: getAddress(parsed.data.ownerAddress),
      message: parsed.data.proof.message,
      signature: parsed.data.proof.signature,
    })
    if (!signatureValid) {
      return json({ error: "profile-authorization-failed" }, 403)
    }

    const now = new Date().toISOString()
    const { data: consumedNonce } = await supabase
      .from("gauge_profile_write_nonces")
      .update({ used_at: now })
      .eq("nonce_hash", await sha256(nonce))
      .eq("chain_id", parsed.data.chainId)
      .eq("gauge_address", parsed.data.gaugeAddress.toLowerCase())
      .eq("vebtc_token_id", parsed.data.veBtcTokenId)
      .eq("owner_address", parsed.data.ownerAddress.toLowerCase())
      .eq("action", operation)
      .eq("expires_at", expiresAt)
      .is("used_at", null)
      .gt("expires_at", now)
      .select("nonce_hash")
      .maybeSingle()
    if (!consumedNonce) return json({ error: "expired-or-used-proof" }, 401)

    if (operation === "upload-avatar") {
      const path = `${parsed.data.chainId}/${parsed.data.gaugeAddress.toLowerCase()}.${parsed.data.extension}`
      const { data, error } = await supabase.storage
        .from("gauge-avatars")
        .createSignedUploadUrl(path, { upsert: true })
      if (error) throw new Error("Unable to authorize avatar upload")
      return json({ path, token: data.token })
    }

    const { data, error } = await supabase
      .from("gauge_profiles")
      .upsert(
        {
          gauge_address: parsed.data.gaugeAddress.toLowerCase(),
          vebtc_token_id: parsed.data.veBtcTokenId,
          owner_address: controller.nftOwnerAddress.toLowerCase(),
          profile_picture_url: parsed.data.profile.profilePictureUrl,
          description: parsed.data.profile.description,
          display_name: parsed.data.profile.displayName,
          website_url: parsed.data.profile.websiteUrl,
          social_links: parsed.data.profile.socialLinks,
          incentive_strategy: parsed.data.profile.incentiveStrategy,
          voting_strategy: parsed.data.profile.votingStrategy,
          tags: parsed.data.profile.tags,
        },
        { onConflict: "gauge_address" },
      )
      .select()
      .single()
    if (error) throw new Error("Unable to save gauge profile")
    structuredLogger.info({
      message: "Gauge profile updated after signer authorization",
      chainId: parsed.data.chainId,
      gaugeAddress: parsed.data.gaugeAddress.toLowerCase(),
      signerAddress: parsed.data.ownerAddress.toLowerCase(),
    })
    return json({ profile: data })
  } catch (error) {
    structuredLogger.error({
      message: "Gauge profile write failed",
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return json({ error: "request-failed" }, 500)
  }
})
