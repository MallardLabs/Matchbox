import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  createPublicClient,
  getAddress,
  http,
  isHex,
} from "https://esm.sh/viem@2"
import { z } from "https://esm.sh/zod@4.1.12"
import {
  editorAuthorizationMessage,
  resolveGaugeController,
  sha256,
} from "../_shared/gaugeProfileAuthorization.ts"
import { getMezoNetworkConfigForChain } from "../_shared/contracts.ts"
import { corsHeaders } from "../_shared/cors.ts"
import { structuredLogger } from "../_shared/structuredLogger.ts"

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
const identitySchema = z.object({
  chainId: z.union([z.literal(31611), z.literal(31612)]),
  gaugeAddress: addressSchema,
  veBtcTokenId: z.string().regex(/^\d+$/),
})
const editorSchema = identitySchema.extend({
  editorAddress: addressSchema,
  operation: z.enum(["grant-editor", "revoke-editor"]),
})
const proofSchema = z.object({
  message: z.string().min(100).max(1600),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
})
const requestSchema = z.union([
  identitySchema.extend({ action: z.literal("resolve") }),
  editorSchema.extend({ action: z.literal("nonce") }),
  editorSchema.extend({
    action: z.literal("apply"),
    proof: proofSchema,
  }),
])

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
    if (Deno.env.get("ENABLE_MANAGED_GAUGE_EDITORS") !== "true") {
      return json({ error: "feature-disabled" }, 404)
    }

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    if (parsed.data.action === "resolve") {
      const { data, error } = await supabase
        .from("gauge_profile_editors")
        .select("editor_address,granted_at")
        .eq("chain_id", parsed.data.chainId)
        .eq("gauge_address", controller.gaugeAddress.toLowerCase())
        .eq("vebtc_token_id", parsed.data.veBtcTokenId)
        .eq("nft_owner_address", controller.nftOwnerAddress.toLowerCase())
        .eq("controller_address", controller.controllerAddress.toLowerCase())
        .is("revoked_at", null)
        .order("granted_at", { ascending: true })
      if (error) throw new Error("Unable to load gauge profile editors")
      return json({
        controller: {
          chainId: controller.chainId,
          gaugeAddress: controller.gaugeAddress,
          veBtcTokenId: controller.veBtcTokenId.toString(),
          nftOwnerAddress: controller.nftOwnerAddress,
          controllerAddress: controller.controllerAddress,
          controllerKind: controller.controllerKind,
        },
        editors: data ?? [],
      })
    }

    if (controller.controllerKind === "direct-eoa") {
      return json({ error: "contract-owned-gauge-required" }, 400)
    }

    const editorAddress = getAddress(parsed.data.editorAddress)
    const authorization = {
      action: parsed.data.operation,
      chainId: parsed.data.chainId,
      gaugeAddress: controller.gaugeAddress,
      veBtcTokenId: controller.veBtcTokenId.toString(),
      nftOwnerAddress: controller.nftOwnerAddress,
      controllerAddress: controller.controllerAddress,
      editorAddress,
    }

    if (parsed.data.action === "nonce") {
      const nonce = crypto.randomUUID().replaceAll("-", "")
      const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString()
      const { error } = await supabase
        .from("gauge_profile_editor_nonces")
        .insert({
          nonce_hash: await sha256(nonce),
          chain_id: authorization.chainId,
          gauge_address: authorization.gaugeAddress.toLowerCase(),
          vebtc_token_id: authorization.veBtcTokenId,
          nft_owner_address: authorization.nftOwnerAddress.toLowerCase(),
          controller_address: authorization.controllerAddress.toLowerCase(),
          editor_address: authorization.editorAddress.toLowerCase(),
          action: authorization.action,
          expires_at: expiresAt,
        })
      if (error) throw new Error("Unable to issue editor authorization nonce")
      return json({
        message: editorAuthorizationMessage({
          ...authorization,
          nonce,
          expiresAt,
        }),
        controllerAddress: authorization.controllerAddress,
      })
    }

    const nonceLine = parsed.data.proof.message
      .split("\n")
      .find((line) => line.startsWith("Nonce: "))
    const expiresLine = parsed.data.proof.message
      .split("\n")
      .find((line) => line.startsWith("Expires at: "))
    const nonce = nonceLine?.slice("Nonce: ".length)
    const expiresAt = expiresLine?.slice("Expires at: ".length)
    if (!nonce || !expiresAt || !Number.isFinite(Date.parse(expiresAt))) {
      return json({ error: "invalid-proof" }, 401)
    }

    const expectedMessage = editorAuthorizationMessage({
      ...authorization,
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
      address: controller.controllerAddress,
      message: parsed.data.proof.message,
      signature: parsed.data.proof.signature,
    })
    if (!signatureValid) {
      return json({ error: "controller-authorization-failed" }, 403)
    }

    const now = new Date().toISOString()
    const { data: consumedNonce } = await supabase
      .from("gauge_profile_editor_nonces")
      .update({ used_at: now })
      .eq("nonce_hash", await sha256(nonce))
      .eq("chain_id", authorization.chainId)
      .eq("gauge_address", authorization.gaugeAddress.toLowerCase())
      .eq("vebtc_token_id", authorization.veBtcTokenId)
      .eq("nft_owner_address", authorization.nftOwnerAddress.toLowerCase())
      .eq("controller_address", authorization.controllerAddress.toLowerCase())
      .eq("editor_address", authorization.editorAddress.toLowerCase())
      .eq("action", authorization.action)
      .eq("expires_at", expiresAt)
      .is("used_at", null)
      .gt("expires_at", now)
      .select("nonce_hash")
      .maybeSingle()
    if (!consumedNonce) {
      return json({ error: "expired-or-used-proof" }, 401)
    }

    if (authorization.action === "grant-editor") {
      const { error } = await supabase.from("gauge_profile_editors").upsert(
        {
          chain_id: authorization.chainId,
          gauge_address: authorization.gaugeAddress.toLowerCase(),
          vebtc_token_id: authorization.veBtcTokenId,
          nft_owner_address: authorization.nftOwnerAddress.toLowerCase(),
          controller_address: authorization.controllerAddress.toLowerCase(),
          editor_address: authorization.editorAddress.toLowerCase(),
          controller_kind: controller.controllerKind,
          proof_hash: await sha256(parsed.data.proof.message),
          granted_at: now,
          revoked_at: null,
          updated_at: now,
        },
        { onConflict: "chain_id,gauge_address,editor_address" },
      )
      if (error) throw new Error("Unable to grant gauge profile editor")
    } else {
      const { data, error } = await supabase
        .from("gauge_profile_editors")
        .update({ revoked_at: now, updated_at: now })
        .eq("chain_id", authorization.chainId)
        .eq("gauge_address", authorization.gaugeAddress.toLowerCase())
        .eq("vebtc_token_id", authorization.veBtcTokenId)
        .eq("nft_owner_address", authorization.nftOwnerAddress.toLowerCase())
        .eq("controller_address", authorization.controllerAddress.toLowerCase())
        .eq("editor_address", authorization.editorAddress.toLowerCase())
        .is("revoked_at", null)
        .select("editor_address")
        .maybeSingle()
      if (error) throw new Error("Unable to revoke gauge profile editor")
      if (!data) return json({ error: "active-editor-not-found" }, 404)
    }

    structuredLogger.info({
      message: "Gauge profile editor authorization updated",
      action: authorization.action,
      chainId: authorization.chainId,
      gaugeAddress: authorization.gaugeAddress.toLowerCase(),
      editorAddress: authorization.editorAddress.toLowerCase(),
    })
    return json({ success: true })
  } catch (error) {
    structuredLogger.error({
      message: "Gauge profile editor request failed",
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return json({ error: "request-failed" }, 500)
  }
})
