// Supabase Edge Function: verify-gauge-ownership
// Periodic function that:
// 1. Detects NFT transfers and resets gauge profiles
// 2. Auto-saves expired gauge profiles to saved_profiles before clearing
// Run alongside record-gauge-history (daily or per-epoch)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  createPublicClient,
  http,
  type Address,
  type Chain,
} from "https://esm.sh/viem@2"
import {
  VOTING_ESCROW_ABI,
  CONTRACTS,
  RPC_URLS,
} from "../_shared/contracts.ts"
import { corsHeaders, handleCors } from "../_shared/cors.ts"

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

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

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

type GaugeProfile = {
  gauge_address: string
  vebtc_token_id: string
  owner_address: string
  profile_picture_url: string | null
  display_name: string | null
  description: string | null
  website_url: string | null
  social_links: Record<string, string> | null
  incentive_strategy: string | null
  voting_strategy: string | null
  tags: string[] | null
}

function profileHasContent(profile: GaugeProfile): boolean {
  return !!(
    profile.display_name ??
    profile.profile_picture_url ??
    profile.description
  )
}

async function autoSaveToTemplates(
  supabase: ReturnType<typeof createClient>,
  profile: GaugeProfile,
  reason: string,
): Promise<void> {
  // Check if already auto-saved for this gauge
  const { data: existing } = await supabase
    .from("saved_profiles")
    .select("id")
    .eq("source_gauge_address", profile.gauge_address)
    .eq("owner_address", profile.owner_address)
    .single()

  if (existing) {
    console.log(
      `Template already exists for gauge ${profile.gauge_address}, skipping auto-save`,
    )
    return
  }

  const templateName = `From veBTC #${profile.vebtc_token_id}`

  const { error } = await supabase.from("saved_profiles").insert({
    owner_address: profile.owner_address,
    name: templateName,
    source: "expired_gauge",
    source_gauge_address: profile.gauge_address,
    source_vebtc_token_id: profile.vebtc_token_id,
    profile_picture_url: profile.profile_picture_url,
    display_name: profile.display_name,
    description: profile.description,
    website_url: profile.website_url,
    social_links: profile.social_links ?? {},
    incentive_strategy: profile.incentive_strategy,
    voting_strategy: profile.voting_strategy,
    tags: profile.tags ?? [],
  })

  if (error) {
    // Unique constraint violation means template already exists with that name
    if (error.code === "23505") {
      console.log(
        `Template name "${templateName}" already exists for ${profile.owner_address}`,
      )
    } else {
      console.error("Error auto-saving template:", error)
    }
  } else {
    console.log(
      `Auto-saved template for gauge ${profile.gauge_address} (${reason})`,
    )
  }
}

async function clearGaugeProfile(
  supabase: ReturnType<typeof createClient>,
  gaugeAddress: string,
  newOwner: string,
): Promise<void> {
  const clearData: Record<string, null | string> = { owner_address: newOwner }
  for (const field of PROFILE_FIELDS) {
    clearData[field] = null
  }

  const { error } = await supabase
    .from("gauge_profiles")
    .update(clearData)
    .eq("gauge_address", gaugeAddress)

  if (error) {
    console.error(`Error clearing profile for ${gaugeAddress}:`, error)
  }
}

async function recordReset(
  supabase: ReturnType<typeof createClient>,
  gaugeAddress: string,
  vebtcTokenId: string,
  previousOwner: string,
  newOwner: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase.from("profile_resets").insert({
    gauge_address: gaugeAddress,
    vebtc_token_id: vebtcTokenId,
    previous_owner: previousOwner,
    new_owner: newOwner,
    reset_reason: reason,
  })

  if (error) {
    console.error("Error recording profile reset:", error)
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const rpcUrl = Deno.env.get("MEZO_RPC_URL") || RPC_URLS.testnet
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const publicClient = createPublicClient({
      chain: mezoTestnet,
      transport: http(rpcUrl),
    })

    const contracts = CONTRACTS.testnet
    const veBTCAddress = contracts.veBTC as Address

    // Fetch all gauge profiles with content
    const { data: profiles, error: fetchError } = await supabase
      .from("gauge_profiles")
      .select("*")

    if (fetchError) {
      throw new Error(`Failed to fetch profiles: ${fetchError.message}`)
    }

    const profilesWithContent = (profiles as unknown as GaugeProfile[]).filter(
      profileHasContent,
    )
    console.log(
      `Checking ownership for ${profilesWithContent.length} profiles with content`,
    )

    let transferResets = 0
    let burnedResets = 0
    let expiredAutoSaves = 0

    for (const profile of profilesWithContent) {
      const tokenId = BigInt(profile.vebtc_token_id)

      try {
        // Check current on-chain owner
        const currentOwner = (await publicClient.readContract({
          address: veBTCAddress,
          abi: VOTING_ESCROW_ABI,
          functionName: "ownerOf",
          args: [tokenId],
        })) as Address

        if (
          currentOwner.toLowerCase() !== profile.owner_address.toLowerCase()
        ) {
          // NFT was transferred to a different wallet
          console.log(
            `NFT transfer detected for gauge ${profile.gauge_address}: ${profile.owner_address} -> ${currentOwner}`,
          )

          // Reset profile immediately (no auto-save for transfers -- old owner loses branding)
          await clearGaugeProfile(
            supabase,
            profile.gauge_address,
            currentOwner.toLowerCase(),
          )
          await recordReset(
            supabase,
            profile.gauge_address,
            profile.vebtc_token_id,
            profile.owner_address,
            currentOwner.toLowerCase(),
            "nft_transfer",
          )
          transferResets++
        } else {
          // Owner matches -- check if lock is expired (preemptive auto-save)
          try {
            const lockData = (await publicClient.readContract({
              address: veBTCAddress,
              abi: VOTING_ESCROW_ABI,
              functionName: "locked",
              args: [tokenId],
            })) as [bigint, bigint, boolean, bigint]

            const lockEnd = lockData[1]
            const isPermanent = lockData[2]
            const now = BigInt(Math.floor(Date.now() / 1000))

            if (!isPermanent && lockEnd > 0n && lockEnd <= now) {
              // Lock is expired -- preemptively auto-save
              await autoSaveToTemplates(supabase, profile, "lock_expired")
              expiredAutoSaves++
            }
          } catch (lockError) {
            console.warn(
              `Could not read lock data for token ${tokenId}:`,
              lockError,
            )
          }
        }
      } catch {
        // ownerOf reverted -- token is burned/withdrawn
        console.log(
          `NFT burned/withdrawn for gauge ${profile.gauge_address} (token ${tokenId})`,
        )

        // Auto-save before clearing
        await autoSaveToTemplates(supabase, profile, "nft_burned")
        await clearGaugeProfile(
          supabase,
          profile.gauge_address,
          ZERO_ADDRESS,
        )
        await recordReset(
          supabase,
          profile.gauge_address,
          profile.vebtc_token_id,
          profile.owner_address,
          ZERO_ADDRESS,
          "nft_burned",
        )
        burnedResets++
      }
    }

    const summary = {
      success: true,
      checked: profilesWithContent.length,
      transfer_resets: transferResets,
      burned_resets: burnedResets,
      expired_auto_saves: expiredAutoSaves,
    }

    console.log("Verification complete:", summary)

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("Error:", error)
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }
})
