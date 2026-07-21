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

const NETWORKS = {
  31611: {
    voter: "0xac1bA4627d2Ec488bEdd562bB857275C45003844",
    rpcEnv: "MEZO_TESTNET_RPC_URL",
    fallbackRpc: "https://rpc.test.mezo.org",
  },
  31612: {
    voter: "0xe99a9ad5Ed26BD30e4DB25397f378817e9b9515a",
    rpcEnv: "MEZO_RPC_URL",
    fallbackRpc: "https://rpc-internal.mezo.org",
  },
} as const

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
const operationSchema = z.enum(["upsert-profile", "upload-avatar"])
const identitySchema = z.object({
  chainId: z.union([z.literal(31611), z.literal(31612)]),
  gaugeAddress: addressSchema,
  operatorAddress: addressSchema,
  editorAddress: addressSchema,
})
const proofSchema = z.object({
  message: z.string().min(80).max(1200),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
})
const profileSchema = z.object({
  displayName: z.string().max(80).nullable(),
  profilePictureUrl: z.string().url().nullable(),
  description: z.string().max(2000).nullable(),
  websiteUrl: z.string().url().nullable(),
  socialLinks: z.record(z.string(), z.string().url()).nullable(),
  incentiveStrategy: z.string().max(2000).nullable(),
  votingStrategy: z.string().max(2000).nullable(),
  tags: z.array(z.string().max(40)).max(12).nullable(),
})
const requestSchema = z.union([
  identitySchema.extend({
    action: z.literal("nonce"),
    operation: operationSchema,
  }),
  identitySchema.extend({
    action: z.literal("upsert-profile"),
    proof: proofSchema,
    profile: profileSchema,
  }),
  identitySchema.extend({
    action: z.literal("upload-avatar"),
    proof: proofSchema,
    extension: z.enum(["jpg", "jpeg", "png", "gif", "webp"]),
  }),
])

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function messageFor(input: {
  operation: z.infer<typeof operationSchema>
  chainId: 31611 | 31612
  gaugeAddress: string
  operatorAddress: string
  editorAddress: string
  nonce: string
}): string {
  return [
    "Matchbox validator profile authorization",
    `Action: ${input.operation}`,
    `Chain: ${input.chainId}`,
    `Gauge: ${input.gaugeAddress.toLowerCase()}`,
    `Operator: ${input.operatorAddress.toLowerCase()}`,
    `Editor: ${input.editorAddress.toLowerCase()}`,
    `Nonce: ${input.nonce}`,
    "This signature is gasless and cannot submit a transaction.",
  ].join("\n")
}

async function verifyAuthority(input: z.infer<typeof identitySchema>) {
  const network = NETWORKS[input.chainId]
  const client = createPublicClient({
    transport: http(Deno.env.get(network.rpcEnv) ?? network.fallbackRpc),
  })
  const [mappedGauge, beneficiary] = await Promise.all([
    client.readContract({
      address: network.voter as Address,
      abi: [{
        type: "function",
        name: "validatorToGauge",
        stateMutability: "view",
        inputs: [{ name: "operator", type: "address" }],
        outputs: [{ type: "address" }],
      }] as const,
      functionName: "validatorToGauge",
      args: [getAddress(input.operatorAddress)],
    }),
    client.readContract({
      address: getAddress(input.gaugeAddress),
      abi: [{
        type: "function",
        name: "rewardsBeneficiary",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "address" }],
      }] as const,
      functionName: "rewardsBeneficiary",
    }),
  ])
  const editor = input.editorAddress.toLowerCase()
  return (
    mappedGauge.toLowerCase() === input.gaugeAddress.toLowerCase() &&
    (editor === input.operatorAddress.toLowerCase() ||
      editor === beneficiary.toLowerCase())
  )
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "method-not-allowed" }, 405)

  try {
    const parsed = requestSchema.safeParse(await request.json())
    if (!parsed.success) return json({ error: "invalid-request" }, 400)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    if (parsed.data.action === "nonce") {
      const nonce = crypto.randomUUID().replaceAll("-", "")
      const { error } = await supabase
        .from("validator_profile_write_nonces")
        .insert({
          nonce_hash: await sha256(nonce),
          chain_id: parsed.data.chainId,
          gauge_address: parsed.data.gaugeAddress.toLowerCase(),
          operator_address: parsed.data.operatorAddress.toLowerCase(),
          editor_address: parsed.data.editorAddress.toLowerCase(),
          action: parsed.data.operation,
          expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        })
      if (error) throw new Error("Unable to issue write nonce")
      return json({
        message: messageFor({ ...parsed.data, nonce }),
      })
    }

    const operation = parsed.data.action
    const nonceLine = parsed.data.proof.message
      .split("\n")
      .find((line) => line.startsWith("Nonce: "))
    const nonce = nonceLine?.slice("Nonce: ".length)
    if (!nonce) return json({ error: "invalid-proof" }, 401)
    const expectedMessage = messageFor({ ...parsed.data, operation, nonce })
    if (expectedMessage !== parsed.data.proof.message) {
      return json({ error: "invalid-proof" }, 401)
    }

    const now = new Date().toISOString()
    const { data: consumedNonce } = await supabase
      .from("validator_profile_write_nonces")
      .update({ used_at: now })
      .eq("nonce_hash", await sha256(nonce))
      .eq("chain_id", parsed.data.chainId)
      .eq("gauge_address", parsed.data.gaugeAddress.toLowerCase())
      .eq("operator_address", parsed.data.operatorAddress.toLowerCase())
      .eq("editor_address", parsed.data.editorAddress.toLowerCase())
      .eq("action", operation)
      .is("used_at", null)
      .gt("expires_at", now)
      .select("nonce_hash")
      .maybeSingle()
    if (!consumedNonce) return json({ error: "expired-or-used-proof" }, 401)

    const [signatureValid, authorityValid] = await Promise.all([
      verifyMessage({
        address: getAddress(parsed.data.editorAddress),
        message: parsed.data.proof.message,
        signature: parsed.data.proof.signature as `0x${string}`,
      }),
      verifyAuthority(parsed.data),
    ])
    if (!signatureValid || !authorityValid) {
      return json({ error: "validator-authorization-failed" }, 403)
    }

    if (operation === "upload-avatar") {
      const path = `validators/${parsed.data.chainId}/${parsed.data.gaugeAddress.toLowerCase()}.${parsed.data.extension}`
      const { data, error } = await supabase.storage
        .from("gauge-avatars")
        .createSignedUploadUrl(path, { upsert: true })
      if (error) throw new Error("Unable to authorize avatar upload")
      return json({ path, token: data.token })
    }

    const { data, error } = await supabase
      .from("validator_profiles")
      .upsert(
        {
          chain_id: parsed.data.chainId,
          gauge_address: parsed.data.gaugeAddress.toLowerCase(),
          operator_address: parsed.data.operatorAddress.toLowerCase(),
          last_editor_address: parsed.data.editorAddress.toLowerCase(),
          profile_picture_url: parsed.data.profile.profilePictureUrl,
          display_name: parsed.data.profile.displayName,
          description: parsed.data.profile.description,
          website_url: parsed.data.profile.websiteUrl,
          social_links: parsed.data.profile.socialLinks ?? {},
          incentive_strategy: parsed.data.profile.incentiveStrategy,
          voting_strategy: parsed.data.profile.votingStrategy,
          tags: parsed.data.profile.tags ?? [],
        },
        { onConflict: "chain_id,gauge_address" },
      )
      .select()
      .single()
    if (error) throw new Error("Unable to save validator profile")
    return json({ profile: data })
  } catch (error) {
    structuredLogger.error({
      message: "Validator profile write failed",
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return json({ error: "request-failed" }, 500)
  }
})

