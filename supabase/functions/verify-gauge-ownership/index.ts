// Supabase Edge Function: verify-gauge-ownership
// Periodic function that:
// 1. Detects confirmed NFT transfers and resets gauge profiles
// 2. Auto-saves expired gauge profiles to saved_profiles before clearing
// Only performs destructive resets when the token still maps to the stored
// gauge on the active chain and ownerOf returns a non-zero owner.
// Run alongside record-gauge-history (daily or per-epoch)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  createPublicClient,
  http,
  type Address,
} from "https://esm.sh/viem@2"
import {
  BOOST_VOTER_ABI,
  VOTING_ESCROW_ABI,
  getMezoNetworkConfig,
} from "../_shared/contracts.ts"
import { corsHeaders, handleCors } from "../_shared/cors.ts"

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    }

    const { chain, contracts, network, rpcUrl } = getMezoNetworkConfig()

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    })

    const veBTCAddress = contracts.veBTC as Address
    const boostVoterAddress = contracts.boostVoter as Address
    console.log(`Checking gauge ownership on ${network} (${rpcUrl})`)

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
    let skippedUnverifiable = 0

    for (const profile of profilesWithContent) {
      const tokenId = BigInt(profile.vebtc_token_id)

      try {
        const mappedGauge = (await publicClient.readContract({
          address: boostVoterAddress,
          abi: BOOST_VOTER_ABI,
          functionName: "boostableTokenIdToGauge",
          args: [tokenId],
        })) as Address

        if (
          mappedGauge === ZERO_ADDRESS ||
          mappedGauge.toLowerCase() !== profile.gauge_address.toLowerCase()
        ) {
          console.warn(
            `Skipping reset for gauge ${profile.gauge_address}: token ${tokenId} maps to ${mappedGauge} on ${network}`,
          )
          skippedUnverifiable++
          continue
        }

        // Check current on-chain owner
        const currentOwner = (await publicClient.readContract({
          address: veBTCAddress,
          abi: VOTING_ESCROW_ABI,
          functionName: "ownerOf",
          args: [tokenId],
        })) as Address

        if (currentOwner === ZERO_ADDRESS) {
          console.warn(
            `Skipping reset for gauge ${profile.gauge_address}: ownerOf(${tokenId}) returned zero address on ${network}`,
          )
          skippedUnverifiable++
          continue
        }

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
      } catch (error) {
        console.warn(
          `Skipping reset for gauge ${profile.gauge_address}: could not verify token ${tokenId} on ${network}`,
          error,
        )
        skippedUnverifiable++
      }
    }

    const summary = {
      success: true,
      checked: profilesWithContent.length,
      transfer_resets: transferResets,
      burned_resets: burnedResets,
      expired_auto_saves: expiredAutoSaves,
      skipped_unverifiable: skippedUnverifiable,
      network,
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
