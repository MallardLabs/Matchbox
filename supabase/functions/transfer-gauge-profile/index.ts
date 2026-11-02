// Supabase Edge Function: transfer-gauge-profile
// Moves gauge profile metadata from one veBTC boost gauge to another and
// clears the source. Limited to once per epoch per source gauge.
//
// `nonce` issues a single-use message naming the chain, both gauges and both
// veBTC token ids; `transfer` verifies the signature (ECDSA locally, or
// ERC-1271/6492 for a contract signer), consumes the nonce and moves the
// profile with the service role. Each token must map to its gauge in the boost
// voter, and one signer must control both NFTs. Delegated profile editors
// cannot transfer: a transfer clears the source, which only its controller may
// authorize.

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
import { purgeExpiredNonces } from "../_shared/expiredNonces.ts"
import {
  isGaugeController,
  parseAuthorizationNonce,
  profileTransferAuthorizationMessage,
  resolveGaugeController,
  sha256,
  signedBy,
  signerIsContract,
} from "../_shared/gaugeProfileAuthorization.ts"
import { structuredLogger } from "../_shared/structuredLogger.ts"

const EPOCH_DURATION = 7 * 24 * 60 * 60 // 7 days in seconds
const nonceLifetimeMs = 5 * 60_000

// Profile fields to transfer
const PROFILE_FIELDS = [
  "profile_picture_url",
  "description",
  "display_name",
  "website_url",
  "social_links",
  "incentive_strategy",
  "voting_strategy",
  "tags",
] as const

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
const tokenIdSchema = z.string().regex(/^\d{1,78}$/)
const identitySchema = z.object({
  chainId: z.union([z.literal(31611), z.literal(31612)]),
  fromGaugeAddress: addressSchema,
  fromVeBtcTokenId: tokenIdSchema,
  toGaugeAddress: addressSchema,
  toVeBtcTokenId: tokenIdSchema,
  signerAddress: addressSchema,
})
const proofSchema = z.object({
  message: z.string().min(100).max(1600),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
})
const requestSchema = z.union([
  identitySchema.extend({ action: z.literal("nonce") }),
  identitySchema.extend({
    action: z.literal("transfer"),
    proof: proofSchema,
  }),
])

function getEpochStart(timestamp: number): number {
  return Math.floor(timestamp / EPOCH_DURATION) * EPOCH_DURATION
}

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
    const fromGauge = body.fromGaugeAddress.toLowerCase()
    const toGauge = body.toGaugeAddress.toLowerCase()
    const signer = body.signerAddress.toLowerCase()
    if (fromGauge === toGauge) return json({ error: "same-gauge" }, 400)

    const authorization = {
      chainId: body.chainId,
      fromGaugeAddress: fromGauge,
      fromVeBtcTokenId: BigInt(body.fromVeBtcTokenId).toString(),
      toGaugeAddress: toGauge,
      toVeBtcTokenId: BigInt(body.toVeBtcTokenId).toString(),
      signerAddress: signer,
    }
    const network = getMezoNetworkConfigForChain(body.chainId)
    const publicClient = createPublicClient({
      chain: network.chain,
      transport: http(network.rpcUrl),
    })
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Each lookup throws unless boostableTokenIdToGauge(token) is that gauge,
    // so neither side can be an arbitrary contract. Null when the signer does
    // not control both NFTs.
    const resolveControllers = async () => {
      const veBtcAddress = getAddress(network.contracts.veBTC)
      const boostVoterAddress = getAddress(network.contracts.boostVoter)
      const [fromController, toController] = await Promise.all([
        resolveGaugeController(publicClient, {
          chainId: body.chainId,
          gaugeAddress: fromGauge,
          veBtcTokenId: authorization.fromVeBtcTokenId,
          veBtcAddress,
          boostVoterAddress,
        }),
        resolveGaugeController(publicClient, {
          chainId: body.chainId,
          gaugeAddress: toGauge,
          veBtcTokenId: authorization.toVeBtcTokenId,
          veBtcAddress,
          boostVoterAddress,
        }),
      ])
      const managedEditorsEnabled =
        Deno.env.get("ENABLE_MANAGED_GAUGE_EDITORS") === "true"
      if (
        !isGaugeController(fromController, signer, managedEditorsEnabled) ||
        !isGaugeController(toController, signer, managedEditorsEnabled)
      ) {
        return null
      }
      return { fromController, toController }
    }

    if (body.action === "nonce") {
      if (!(await resolveControllers())) {
        return json({ error: "transfer-authorization-failed" }, 403)
      }
      const nonce = crypto.randomUUID().replaceAll("-", "")
      const expiresAt = new Date(Date.now() + nonceLifetimeMs).toISOString()
      const [{ error }] = await Promise.all([
        supabase.from("gauge_profile_transfer_nonces").insert({
          nonce_hash: await sha256(nonce),
          chain_id: authorization.chainId,
          from_gauge_address: fromGauge,
          from_vebtc_token_id: authorization.fromVeBtcTokenId,
          to_gauge_address: toGauge,
          to_vebtc_token_id: authorization.toVeBtcTokenId,
          signer_address: signer,
          expires_at: expiresAt,
        }),
        purgeExpiredNonces(supabase, "gauge_profile_transfer_nonces"),
      ])
      if (error) throw new Error("Unable to issue transfer nonce")
      return json({
        message: profileTransferAuthorizationMessage({
          ...authorization,
          nonce,
          expiresAt,
        }),
      })
    }

    // A malformed or mismatched proof is refused before any RPC read.
    const fields = parseAuthorizationNonce(body.proof.message)
    if (fields === null || !isHex(body.proof.signature)) {
      return json({ error: "invalid-proof" }, 401)
    }
    const expected = profileTransferAuthorizationMessage({
      ...authorization,
      nonce: fields.nonce,
      expiresAt: fields.expiresAt,
    })
    if (expected !== body.proof.message) {
      return json({ error: "invalid-proof" }, 401)
    }

    const controllers = await resolveControllers()
    if (!controllers) {
      return json({ error: "transfer-authorization-failed" }, 403)
    }
    const { toController } = controllers
    const signatureValid = await signedBy(publicClient, {
      address: getAddress(signer),
      message: body.proof.message,
      signature: body.proof.signature,
      contractSigner:
        signerIsContract(controllers.fromController, signer) ||
        signerIsContract(toController, signer),
    })
    if (!signatureValid) {
      return json({ error: "transfer-authorization-failed" }, 403)
    }

    const now = new Date().toISOString()
    const { data: consumedNonce } = await supabase
      .from("gauge_profile_transfer_nonces")
      .update({ used_at: now })
      .eq("nonce_hash", await sha256(fields.nonce))
      .eq("chain_id", authorization.chainId)
      .eq("from_gauge_address", fromGauge)
      .eq("from_vebtc_token_id", authorization.fromVeBtcTokenId)
      .eq("to_gauge_address", toGauge)
      .eq("to_vebtc_token_id", authorization.toVeBtcTokenId)
      .eq("signer_address", signer)
      .eq("expires_at", fields.expiresAt)
      .is("used_at", null)
      .gt("expires_at", now)
      .select("nonce_hash")
      .maybeSingle()
    if (!consumedNonce) return json({ error: "expired-or-used-proof" }, 401)

    const { data: sourceProfile, error: sourceError } = await supabase
      .from("gauge_profiles")
      .select("*")
      .eq("gauge_address", fromGauge)
      .maybeSingle()
    if (sourceError) throw new Error("Unable to load source profile")
    if (!sourceProfile) return json({ error: "source-profile-not-found" }, 404)

    // Claim this epoch's transfer of the source before moving anything. The
    // unique (from_gauge_address, epoch_start) index admits one claim, even
    // for concurrent requests.
    const epochStart = getEpochStart(Math.floor(Date.now() / 1000))
    const { data: claim, error: claimError } = await supabase
      .from("profile_transfers")
      .insert({
        owner_address: signer,
        from_gauge_address: fromGauge,
        to_gauge_address: toGauge,
        epoch_start: epochStart,
      })
      .select("id")
      .single()
    if (claimError?.code === "23505") {
      return json(
        {
          error: "already-transferred-this-epoch",
          epoch_start: epochStart,
          next_epoch: epochStart + EPOCH_DURATION,
        },
        429,
      )
    }
    if (claimError || !claim) throw new Error("Unable to claim the transfer")

    try {
      const destination: Record<string, unknown> = {
        gauge_address: toGauge,
        vebtc_token_id: authorization.toVeBtcTokenId,
        owner_address: toController.nftOwnerAddress.toLowerCase(),
      }
      for (const field of PROFILE_FIELDS) {
        const value = sourceProfile[field]
        if (value !== null && value !== undefined) destination[field] = value
      }
      const { error: upsertError } = await supabase
        .from("gauge_profiles")
        .upsert(destination, { onConflict: "gauge_address" })
      if (upsertError) throw new Error("Unable to write destination profile")

      const cleared: Record<string, null> = {}
      for (const field of PROFILE_FIELDS) cleared[field] = null
      const { error: clearError } = await supabase
        .from("gauge_profiles")
        .update(cleared)
        .eq("gauge_address", fromGauge)
      if (clearError) throw new Error("Unable to clear source profile")
    } catch (error) {
      // Release the claim so the controller can retry this epoch.
      await supabase.from("profile_transfers").delete().eq("id", claim.id)
      throw error
    }

    structuredLogger.info({
      message: "Gauge profile transferred after signer authorization",
      chainId: authorization.chainId,
      fromGaugeAddress: fromGauge,
      toGaugeAddress: toGauge,
      signerAddress: signer,
    })
    return json({
      success: true,
      from_gauge: fromGauge,
      to_gauge: toGauge,
      epoch_start: epochStart,
      transferred_at: now,
    })
  } catch (error) {
    structuredLogger.error({
      message: "Gauge profile transfer failed",
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return json({ error: "request-failed" }, 500)
  }
})
