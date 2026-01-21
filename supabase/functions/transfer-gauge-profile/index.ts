// Supabase Edge Function: transfer-gauge-profile
// Transfers gauge profile metadata from one gauge to another
// Limited to once per epoch per owner

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  createPublicClient,
  http,
  type Address,
  type Chain,
} from "https://esm.sh/viem@2"
import {
  BOOST_VOTER_ABI,
  VOTING_ESCROW_ABI,
  NON_STAKING_GAUGE_ABI,
  CONTRACTS,
  RPC_URLS,
} from "../_shared/contracts.ts"
import { corsHeaders, handleCors } from "../_shared/cors.ts"

// Define Mezo testnet chain
const mezoTestnet: Chain = {
  id: 31611,
  name: "Mezo Testnet",
  nativeCurrency: { name: "BTC", symbol: "BTC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.test.mezo.org"] },
  },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
    },
  },
}

// Constants
const EPOCH_DURATION = 7 * 24 * 60 * 60 // 7 days in seconds
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

// Helper to get current epoch start
function getEpochStart(timestamp: number): number {
  return Math.floor(timestamp / EPOCH_DURATION) * EPOCH_DURATION
}

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

type TransferRequest = {
  fromGaugeAddress: string
  toGaugeAddress: string
  ownerAddress: string
  toVeBTCTokenId: string // The veBTC token ID for the destination gauge
}

// Verify that an address owns a gauge by checking:
// 1. The gauge's rewardsBeneficiary matches the owner
// 2. OR the owner has a veBTC token mapped to this gauge
async function verifyGaugeOwnership(
  publicClient: ReturnType<typeof createPublicClient>,
  gaugeAddress: Address,
  ownerAddress: Address,
  contracts: typeof CONTRACTS.testnet
): Promise<{ isOwner: boolean; tokenId: bigint | null }> {
  const boostVoterAddress = contracts.boostVoter as Address
  const veBTCAddress = contracts.veBTC as Address

  try {
    // Check if owner is the rewards beneficiary
    const beneficiary = await publicClient.readContract({
      address: gaugeAddress,
      abi: NON_STAKING_GAUGE_ABI,
      functionName: "rewardsBeneficiary",
    }) as Address

    if (beneficiary.toLowerCase() === ownerAddress.toLowerCase()) {
      // Now find the veBTC token that maps to this gauge
      const balance = await publicClient.readContract({
        address: veBTCAddress,
        abi: VOTING_ESCROW_ABI,
        functionName: "balanceOf",
        args: [ownerAddress],
      }) as bigint

      for (let i = 0n; i < balance && i < 20n; i++) {
        const tokenId = await publicClient.readContract({
          address: veBTCAddress,
          abi: VOTING_ESCROW_ABI,
          functionName: "ownerToNFTokenIdList",
          args: [ownerAddress, i],
        }) as bigint

        const mappedGauge = await publicClient.readContract({
          address: boostVoterAddress,
          abi: BOOST_VOTER_ABI,
          functionName: "boostableTokenIdToGauge",
          args: [tokenId],
        }) as Address

        if (mappedGauge.toLowerCase() === gaugeAddress.toLowerCase()) {
          return { isOwner: true, tokenId }
        }
      }
      
      // Owner is beneficiary but no token mapped - still allow (gauge owner)
      return { isOwner: true, tokenId: null }
    }

    return { isOwner: false, tokenId: null }
  } catch (error) {
    console.error("Error verifying gauge ownership:", error)
    return { isOwner: false, tokenId: null }
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  // Only allow POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }

  try {
    const body: TransferRequest = await req.json()
    const { fromGaugeAddress, toGaugeAddress, ownerAddress, toVeBTCTokenId } = body

    // Validate required fields
    if (!fromGaugeAddress || !toGaugeAddress || !ownerAddress || !toVeBTCTokenId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Missing required fields: fromGaugeAddress, toGaugeAddress, ownerAddress, toVeBTCTokenId" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Normalize addresses
    const fromAddr = fromGaugeAddress.toLowerCase()
    const toAddr = toGaugeAddress.toLowerCase()
    const ownerAddr = ownerAddress.toLowerCase()

    // Can't transfer to the same gauge
    if (fromAddr === toAddr) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Cannot transfer profile to the same gauge" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    console.log(`Transfer request: ${fromAddr} -> ${toAddr} by ${ownerAddr}`)

    // Get environment variables
    const rpcUrl = Deno.env.get("MEZO_RPC_URL") || RPC_URLS.testnet
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    }

    // Initialize clients
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const publicClient = createPublicClient({
      chain: mezoTestnet,
      transport: http(rpcUrl),
    })

    const contracts = CONTRACTS.testnet

    // Get current epoch
    const now = Math.floor(Date.now() / 1000)
    const epochStart = getEpochStart(now)

    // Check if owner has already transferred this epoch
    const { data: existingTransfer, error: transferCheckError } = await supabase
      .from("profile_transfers")
      .select("id")
      .eq("owner_address", ownerAddr)
      .eq("epoch_start", epochStart)
      .single()

    if (transferCheckError && transferCheckError.code !== "PGRST116") {
      // PGRST116 = no rows found, which is what we want
      console.error("Error checking existing transfer:", transferCheckError)
      throw new Error("Failed to check transfer history")
    }

    if (existingTransfer) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "You have already transferred a profile this epoch. You can transfer again next epoch.",
          epoch_start: epochStart,
          next_epoch: epochStart + EPOCH_DURATION
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Verify ownership of both gauges
    const [fromOwnership, toOwnership] = await Promise.all([
      verifyGaugeOwnership(publicClient, fromAddr as Address, ownerAddr as Address, contracts),
      verifyGaugeOwnership(publicClient, toAddr as Address, ownerAddr as Address, contracts),
    ])

    if (!fromOwnership.isOwner) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "You do not own the source gauge" 
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    if (!toOwnership.isOwner) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "You do not own the destination gauge" 
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Fetch the source profile
    const { data: sourceProfile, error: sourceError } = await supabase
      .from("gauge_profiles")
      .select("*")
      .eq("gauge_address", fromAddr)
      .single()

    if (sourceError) {
      if (sourceError.code === "PGRST116") {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Source gauge has no profile to transfer" 
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }
      console.error("Error fetching source profile:", sourceError)
      throw new Error("Failed to fetch source profile")
    }

    // Build the profile data for the destination
    const profileData: Record<string, unknown> = {
      gauge_address: toAddr,
      vebtc_token_id: toVeBTCTokenId,
      owner_address: ownerAddr,
    }

    // Copy transferable fields
    for (const field of PROFILE_FIELDS) {
      if (sourceProfile[field] !== null && sourceProfile[field] !== undefined) {
        profileData[field] = sourceProfile[field]
      }
    }

    // Upsert the destination profile
    const { data: destProfile, error: upsertError } = await supabase
      .from("gauge_profiles")
      .upsert(profileData, {
        onConflict: "gauge_address",
      })
      .select()
      .single()

    if (upsertError) {
      console.error("Error upserting destination profile:", upsertError)
      throw new Error("Failed to update destination profile")
    }

    // Clear the source profile (keep the row but clear the transferable fields)
    const clearData: Record<string, null> = {}
    for (const field of PROFILE_FIELDS) {
      clearData[field] = null
    }

    const { error: clearError } = await supabase
      .from("gauge_profiles")
      .update(clearData)
      .eq("gauge_address", fromAddr)

    if (clearError) {
      console.error("Error clearing source profile:", clearError)
      // Don't fail the request, the transfer was successful
    }

    // Record the transfer
    const { error: recordError } = await supabase
      .from("profile_transfers")
      .insert({
        owner_address: ownerAddr,
        from_gauge_address: fromAddr,
        to_gauge_address: toAddr,
        epoch_start: epochStart,
      })

    if (recordError) {
      console.error("Error recording transfer:", recordError)
      // Don't fail the request, the transfer was successful
    }

    console.log(`Profile transferred successfully: ${fromAddr} -> ${toAddr}`)

    return new Response(
      JSON.stringify({
        success: true,
        message: "Profile transferred successfully",
        from_gauge: fromAddr,
        to_gauge: toAddr,
        epoch_start: epochStart,
        transferred_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (error) {
    console.error("Error:", error)
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
