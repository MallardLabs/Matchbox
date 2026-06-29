import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  createPublicClient,
  getAddress,
  http,
  verifyMessage,
  type Address,
} from "https://esm.sh/viem@2"
import { z } from "https://esm.sh/zod@4.1.12"
import { corsHeaders } from "../_shared/cors.ts"
import { structuredLogger } from "../_shared/structuredLogger.ts"

const BOOST_VOTER = "0x2Ba614a598Cffa5a19d683cDCA97bac3a49313d1" as Address
const VEBTC = "0x3D4b1b884A7a1E59fE8589a3296EC8f8cBB6f279" as Address
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

const tokenSchema = z.object({
  action: z.literal("nonce"),
  operation: z.enum(["upsert-profile", "upload-avatar"]),
  gaugeAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  veBtcTokenId: z.string().regex(/^\d+$/),
  ownerAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
})

const proofSchema = z.object({
  message: z.string().min(50).max(1000),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
})

const profileSchema = z.object({
  action: z.literal("upsert-profile"),
  gaugeAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  veBtcTokenId: z.string().regex(/^\d+$/),
  ownerAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
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

const avatarSchema = z.object({
  action: z.literal("upload-avatar"),
  gaugeAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  veBtcTokenId: z.string().regex(/^\d+$/),
  ownerAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
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

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function messageFor(input: {
  operation: "upsert-profile" | "upload-avatar"
  gaugeAddress: string
  veBtcTokenId: string
  ownerAddress: string
  nonce: string
}): string {
  return [
    "Matchbox gauge profile authorization",
    `Action: ${input.operation}`,
    `Gauge: ${input.gaugeAddress.toLowerCase()}`,
    `veBTC token: ${input.veBtcTokenId}`,
    `Owner: ${input.ownerAddress.toLowerCase()}`,
    `Nonce: ${input.nonce}`,
    "This signature is gasless and cannot submit a transaction.",
  ].join("\n")
}

async function verifyOwnership(input: {
  gaugeAddress: string
  veBtcTokenId: string
  ownerAddress: string
}): Promise<boolean> {
  const client = createPublicClient({
    transport: http(Deno.env.get("MEZO_RPC_URL") ?? "https://mezo-mainnet.boar.network"),
  })
  const [onchainOwner, mappedGauge] = await Promise.all([
    client.readContract({
      address: VEBTC,
      abi: [{
        type: "function",
        name: "ownerOf",
        stateMutability: "view",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [{ type: "address" }],
      }] as const,
      functionName: "ownerOf",
      args: [BigInt(input.veBtcTokenId)],
    }),
    client.readContract({
      address: BOOST_VOTER,
      abi: [{
        type: "function",
        name: "boostableTokenIdToGauge",
        stateMutability: "view",
        inputs: [{ name: "tokenId", type: "uint256" }],
        outputs: [{ type: "address" }],
      }] as const,
      functionName: "boostableTokenIdToGauge",
      args: [BigInt(input.veBtcTokenId)],
    }),
  ])
  return (
    mappedGauge.toLowerCase() !== ZERO_ADDRESS &&
    mappedGauge.toLowerCase() === input.gaugeAddress.toLowerCase() &&
    onchainOwner.toLowerCase() === input.ownerAddress.toLowerCase()
  )
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "method-not-allowed" }, 405)

  try {
    const rawBody: unknown = await request.json()
    const parsed = requestSchema.safeParse(rawBody)
    if (!parsed.success) return json({ error: "invalid-request" }, 400)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    if (parsed.data.action === "nonce") {
      const nonce = crypto.randomUUID().replaceAll("-", "")
      const { error } = await supabase.from("gauge_profile_write_nonces").insert({
        nonce_hash: await sha256(nonce),
        gauge_address: parsed.data.gaugeAddress.toLowerCase(),
        vebtc_token_id: parsed.data.veBtcTokenId,
        owner_address: parsed.data.ownerAddress.toLowerCase(),
        action: parsed.data.operation,
        expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      })
      if (error) throw new Error("Unable to issue write nonce")
      return json({
        message: messageFor({ ...parsed.data, nonce }),
      })
    }

    const operation = parsed.data.action
    const lines = parsed.data.proof.message.split("\n")
    const nonceLine = lines.find((line) => line.startsWith("Nonce: "))
    const nonce = nonceLine?.slice("Nonce: ".length)
    if (!nonce) return json({ error: "invalid-proof" }, 401)
    const expectedMessage = messageFor({
      operation,
      gaugeAddress: parsed.data.gaugeAddress,
      veBtcTokenId: parsed.data.veBtcTokenId,
      ownerAddress: parsed.data.ownerAddress,
      nonce,
    })
    if (expectedMessage !== parsed.data.proof.message) {
      return json({ error: "invalid-proof" }, 401)
    }
    const now = new Date().toISOString()
    const { data: consumedNonce } = await supabase
      .from("gauge_profile_write_nonces")
      .update({ used_at: now })
      .eq("nonce_hash", await sha256(nonce))
      .eq("gauge_address", parsed.data.gaugeAddress.toLowerCase())
      .eq("vebtc_token_id", parsed.data.veBtcTokenId)
      .eq("owner_address", parsed.data.ownerAddress.toLowerCase())
      .eq("action", operation)
      .is("used_at", null)
      .gt("expires_at", now)
      .select("nonce_hash")
      .maybeSingle()
    if (!consumedNonce) return json({ error: "expired-or-used-proof" }, 401)

    const [signatureValid, ownershipValid] = await Promise.all([
      verifyMessage({
        address: getAddress(parsed.data.ownerAddress),
        message: parsed.data.proof.message,
        signature: parsed.data.proof.signature as `0x${string}`,
      }),
      verifyOwnership(parsed.data),
    ])
    if (!signatureValid || !ownershipValid) {
      return json({ error: "ownership-verification-failed" }, 403)
    }

    if (operation === "upload-avatar") {
      const path = `${parsed.data.gaugeAddress.toLowerCase()}.${parsed.data.extension}`
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
          owner_address: parsed.data.ownerAddress.toLowerCase(),
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
      message: "Gauge profile updated after ownership verification",
      gaugeAddress: parsed.data.gaugeAddress.toLowerCase(),
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
