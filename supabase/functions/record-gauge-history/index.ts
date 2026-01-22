// Supabase Edge Function: record-gauge-history
// Runs daily to snapshot gauge metrics into gauge_history table
// Optimized with multicall to batch RPC requests and avoid CPU timeout

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  createPublicClient,
  http,
  type Address,
  type Chain,
  formatUnits,
} from "https://esm.sh/viem@2"
import {
  BOOST_VOTER_ABI,
  VOTING_ESCROW_ABI,
  NON_STAKING_GAUGE_ABI,
  BRIBE_ABI,
  CONTRACTS,
  RPC_URLS,
} from "../_shared/contracts.ts"
import { corsHeaders, handleCors } from "../_shared/cors.ts"

// Define Mezo testnet chain with multicall3 address
const mezoTestnet: Chain = {
  id: 31611,
  name: "Mezo Testnet",
  nativeCurrency: { name: "BTC", symbol: "BTC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.test.mezo.org"] },
  },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11", // Standard multicall3 address
    },
  },
}

// Constants
const EPOCH_DURATION = 7 * 24 * 60 * 60 // 7 days in seconds
// MEZO pricing config - mirrors packages/shared/src/pricing/index.ts
// Toggle to use Pyth oracle (requires fetching price from Pyth Hermes API)
const USE_PYTH_ORACLE = false
const MEZO_FALLBACK_PRICE = 0.22
const MEZO_TOKEN_ADDRESS = "0x7b7c000000000000000000000000000000000001"
// Pyth price feed ID for MEZO - TODO: replace with actual feed ID
const MEZO_PYTH_PRICE_FEED_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000000"

// Fetch MEZO price from Pyth Hermes API (for server-side use)
async function fetchMezoPriceFromPyth(): Promise<number | null> {
  if (!USE_PYTH_ORACLE) {
    return MEZO_FALLBACK_PRICE
  }

  try {
    const response = await fetch(
      `https://hermes.pyth.network/api/latest_price_feeds?ids[]=${MEZO_PYTH_PRICE_FEED_ID}`,
    )
    if (!response.ok) {
      console.warn("Failed to fetch Pyth price:", response.statusText)
      return null
    }
    const data = await response.json()
    if (data.length > 0 && data[0].price) {
      const priceData = data[0].price
      const price = Number(priceData.price) * Math.pow(10, priceData.expo)
      return price
    }
    return null
  } catch (e) {
    console.warn("Error fetching Pyth price:", e)
    return null
  }
}
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

// Types
type GaugeData = {
  gauge_address: string
  epoch_start: number
  vemezo_weight: string | null
  vebtc_weight: string | null
  boost_multiplier: number | null
  total_incentives_usd: number | null
  apy: number | null
  unique_voters: number | null
}

// Helper to get current epoch start
function getEpochStart(timestamp: number): bigint {
  return BigInt(Math.floor(timestamp / EPOCH_DURATION) * EPOCH_DURATION)
}

// Main function
Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    console.log("Starting gauge history snapshot (optimized)...")

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
    const boostVoterAddress = contracts.boostVoter as Address

    // Get current epoch start
    const now = Math.floor(Date.now() / 1000)
    const epochStart = getEpochStart(now)
    console.log(`Epoch start: ${epochStart} (${new Date(Number(epochStart) * 1000).toISOString()})`)

    // Fetch MEZO price (from Pyth or fallback)
    const mezoPrice = await fetchMezoPriceFromPyth()
    if (mezoPrice === null) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch MEZO price from oracle" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }
    console.log(`MEZO price: $${mezoPrice} (source: ${USE_PYTH_ORACLE ? "Pyth" : "fallback"})`)

    // 1. Get gauge count
    const gaugeCount = await publicClient.readContract({
      address: boostVoterAddress,
      abi: BOOST_VOTER_ABI,
      functionName: "length",
    }) as bigint

    console.log(`Found ${gaugeCount} gauges`)

    if (gaugeCount === 0n) {
      return new Response(
        JSON.stringify({ success: true, message: "No gauges to process" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // 2. Batch fetch all gauge addresses using multicall
    const gaugeIndexes = Array.from({ length: Number(gaugeCount) }, (_, i) => BigInt(i))

    const gaugeAddressResults = await publicClient.multicall({
      contracts: gaugeIndexes.map((i) => ({
        address: boostVoterAddress,
        abi: BOOST_VOTER_ABI,
        functionName: "gauges",
        args: [i],
      })),
    })

    const gaugeAddresses = gaugeAddressResults
      .filter((r) => r.status === "success")
      .map((r) => r.result as Address)

    console.log(`Fetched ${gaugeAddresses.length} gauge addresses`)

    // 3. Batch fetch weights and bribe addresses for all gauges
    const [weightsResults, bribeResults, beneficiaryResults] = await Promise.all([
      publicClient.multicall({
        contracts: gaugeAddresses.map((addr) => ({
          address: boostVoterAddress,
          abi: BOOST_VOTER_ABI,
          functionName: "weights",
          args: [addr],
        })),
      }),
      publicClient.multicall({
        contracts: gaugeAddresses.map((addr) => ({
          address: boostVoterAddress,
          abi: BOOST_VOTER_ABI,
          functionName: "gaugeToBribe",
          args: [addr],
        })),
      }),
      publicClient.multicall({
        contracts: gaugeAddresses.map((addr) => ({
          address: addr,
          abi: NON_STAKING_GAUGE_ABI,
          functionName: "rewardsBeneficiary",
        })),
      }),
    ])

    // 4. Get bribe rewards for gauges that have bribes
    const bribeInfoList = bribeResults.map((r, i) => ({
      gaugeIndex: i,
      bribeAddress: r.status === "success" ? (r.result as Address) : ZERO_ADDRESS,
    })).filter((b) => b.bribeAddress !== ZERO_ADDRESS)

    // Map to store incentives per gauge index
    const gaugeIncentives: Map<number, number> = new Map()

    if (bribeInfoList.length > 0) {
      // Get rewards list length for each bribe
      const lengthResults = await publicClient.multicall({
        contracts: bribeInfoList.map((b) => ({
          address: b.bribeAddress,
          abi: BRIBE_ABI,
          functionName: "rewardsListLength",
        })),
      })

      // Build list of reward token calls
      const rewardTokenCalls: { bribeIndex: number; tokenIndex: bigint; bribeAddress: Address }[] = []
      bribeInfoList.forEach((b, bribeIdx) => {
        const length = lengthResults[bribeIdx].status === "success"
          ? (lengthResults[bribeIdx].result as bigint)
          : 0n
        for (let i = 0n; i < length; i++) {
          rewardTokenCalls.push({ bribeIndex: bribeIdx, tokenIndex: i, bribeAddress: b.bribeAddress })
        }
      })

      if (rewardTokenCalls.length > 0) {
        // Get all reward token addresses
        const tokenAddressResults = await publicClient.multicall({
          contracts: rewardTokenCalls.map((c) => ({
            address: c.bribeAddress,
            abi: BRIBE_ABI,
            functionName: "rewards",
            args: [c.tokenIndex],
          })),
        })

        // Build calls to get reward amounts for current epoch
        const rewardAmountCalls = rewardTokenCalls.map((c, idx) => {
          const tokenAddress = tokenAddressResults[idx].status === "success"
            ? (tokenAddressResults[idx].result as Address)
            : ZERO_ADDRESS
          return {
            ...c,
            tokenAddress,
          }
        }).filter((c) => c.tokenAddress !== ZERO_ADDRESS)

        if (rewardAmountCalls.length > 0) {
          const amountResults = await publicClient.multicall({
            contracts: rewardAmountCalls.map((c) => ({
              address: c.bribeAddress,
              abi: BRIBE_ABI,
              functionName: "tokenRewardsPerEpoch",
              args: [c.tokenAddress, epochStart],
            })),
          })

          // Calculate USD values (assuming 18 decimals, using MEZO price)
          rewardAmountCalls.forEach((c, idx) => {
            const amount = amountResults[idx].status === "success"
              ? (amountResults[idx].result as bigint)
              : 0n

            if (amount > 0n) {
              const gaugeIdx = bribeInfoList[c.bribeIndex].gaugeIndex
              const isMezo = c.tokenAddress.toLowerCase() === MEZO_TOKEN_ADDRESS
              const price = isMezo ? mezoPrice : 100000 // MEZO or assume BTC ~100k
              const tokenAmount = Number(formatUnits(amount, 18))
              const usdValue = tokenAmount * price

              const current = gaugeIncentives.get(gaugeIdx) || 0
              gaugeIncentives.set(gaugeIdx, current + usdValue)
            }
          })
        }
      }
    }

    console.log(`Calculated incentives for ${gaugeIncentives.size} gauges`)

    // 5. Get boost multipliers for gauges with beneficiaries
    const veBTCAddress = contracts.veBTC as Address
    const gaugeBoosts: Map<number, { boost: number; vebtcWeight: bigint }> = new Map()

    // Get beneficiaries that have valid addresses
    const beneficiaryInfo = beneficiaryResults.map((r, i) => ({
      gaugeIndex: i,
      gaugeAddress: gaugeAddresses[i],
      beneficiary: r.status === "success" ? (r.result as Address) : ZERO_ADDRESS,
    })).filter((b) => b.beneficiary !== ZERO_ADDRESS)

    if (beneficiaryInfo.length > 0) {
      // Get veBTC balances for all beneficiaries
      const veBTCBalanceResults = await publicClient.multicall({
        contracts: beneficiaryInfo.map((b) => ({
          address: veBTCAddress,
          abi: VOTING_ESCROW_ABI,
          functionName: "balanceOf",
          args: [b.beneficiary],
        })),
      })

      // Build calls to get token IDs for beneficiaries with balance
      const tokenIdCalls: { beneficiaryIdx: number; tokenIndex: bigint }[] = []
      beneficiaryInfo.forEach((b, bIdx) => {
        const balance = veBTCBalanceResults[bIdx].status === "success"
          ? (veBTCBalanceResults[bIdx].result as bigint)
          : 0n
        // Limit to first 5 tokens per beneficiary to avoid timeout
        const maxTokens = balance > 5n ? 5n : balance
        for (let i = 0n; i < maxTokens; i++) {
          tokenIdCalls.push({ beneficiaryIdx: bIdx, tokenIndex: i })
        }
      })

      if (tokenIdCalls.length > 0) {
        // Get all token IDs
        const tokenIdResults = await publicClient.multicall({
          contracts: tokenIdCalls.map((c) => ({
            address: veBTCAddress,
            abi: VOTING_ESCROW_ABI,
            functionName: "ownerToNFTokenIdList",
            args: [beneficiaryInfo[c.beneficiaryIdx].beneficiary, c.tokenIndex],
          })),
        })

        // Get mapped gauges for all token IDs
        const tokenIds = tokenIdCalls.map((c, idx) => ({
          ...c,
          tokenId: tokenIdResults[idx].status === "success"
            ? (tokenIdResults[idx].result as bigint)
            : 0n,
        })).filter((t) => t.tokenId > 0n)

        if (tokenIds.length > 0) {
          const mappedGaugeResults = await publicClient.multicall({
            contracts: tokenIds.map((t) => ({
              address: boostVoterAddress,
              abi: BOOST_VOTER_ABI,
              functionName: "boostableTokenIdToGauge",
              args: [t.tokenId],
            })),
          })

          // Find which token IDs map to which gauges
          const gaugeToTokenId: Map<number, bigint> = new Map()
          tokenIds.forEach((t, idx) => {
            const mappedGauge = mappedGaugeResults[idx].status === "success"
              ? (mappedGaugeResults[idx].result as Address)
              : ZERO_ADDRESS

            const gaugeIdx = beneficiaryInfo[t.beneficiaryIdx].gaugeIndex
            const expectedGauge = beneficiaryInfo[t.beneficiaryIdx].gaugeAddress

            if (mappedGauge.toLowerCase() === expectedGauge.toLowerCase()) {
              gaugeToTokenId.set(gaugeIdx, t.tokenId)
            }
          })

          // Get boosts and veBTC weights for matched tokens
          const matchedTokens = Array.from(gaugeToTokenId.entries())
          if (matchedTokens.length > 0) {
            const [boostResults, votingPowerResults] = await Promise.all([
              publicClient.multicall({
                contracts: matchedTokens.map(([_, tokenId]) => ({
                  address: boostVoterAddress,
                  abi: BOOST_VOTER_ABI,
                  functionName: "getBoost",
                  args: [tokenId],
                })),
              }),
              publicClient.multicall({
                contracts: matchedTokens.map(([_, tokenId]) => ({
                  address: veBTCAddress,
                  abi: VOTING_ESCROW_ABI,
                  functionName: "votingPowerOfNFT",
                  args: [tokenId],
                })),
              }),
            ])

            matchedTokens.forEach(([gaugeIdx], idx) => {
              const boost = boostResults[idx].status === "success"
                ? Number(boostResults[idx].result as bigint) / 1e18
                : null
              const vebtcWeight = votingPowerResults[idx].status === "success"
                ? (votingPowerResults[idx].result as bigint)
                : 0n

              if (boost !== null) {
                gaugeBoosts.set(gaugeIdx, { boost, vebtcWeight })
              }
            })
          }
        }
      }
    }

    console.log(`Calculated boosts for ${gaugeBoosts.size} gauges`)

    // 6. Build gauge data
    const gaugeDataList: GaugeData[] = gaugeAddresses.map((gaugeAddress, i) => {
      const vemezoWeight = weightsResults[i].status === "success"
        ? (weightsResults[i].result as bigint)
        : 0n

      const totalIncentivesUSD = gaugeIncentives.get(i) || null
      const boostInfo = gaugeBoosts.get(i)

      // Calculate APY if we have incentives and votes
      let apy: number | null = null
      if (totalIncentivesUSD && totalIncentivesUSD > 0 && vemezoWeight > 0n) {
        const totalVeMEZOAmount = Number(vemezoWeight) / 1e18
        const totalVeMEZOValueUSD = totalVeMEZOAmount * mezoPrice
        if (totalVeMEZOValueUSD > 0) {
          const weeklyReturn = totalIncentivesUSD / totalVeMEZOValueUSD
          apy = weeklyReturn * 52 * 100
        }
      } else if (totalIncentivesUSD && totalIncentivesUSD > 0) {
        apy = 999999 // Infinite APY when no votes
      }

      return {
        gauge_address: gaugeAddress.toLowerCase(),
        epoch_start: Number(epochStart),
        vemezo_weight: vemezoWeight.toString(),
        vebtc_weight: boostInfo?.vebtcWeight?.toString() ?? null,
        boost_multiplier: boostInfo?.boost ?? null,
        total_incentives_usd: totalIncentivesUSD,
        apy,
        unique_voters: null,
      }
    })

    console.log(`Processed ${gaugeDataList.length} gauges`)

    // 7. Upsert to database
    if (gaugeDataList.length > 0) {
      const { error } = await supabase
        .from("gauge_history")
        .upsert(gaugeDataList, {
          onConflict: "gauge_address,epoch_start",
          ignoreDuplicates: false,
        })

      if (error) {
        console.error("Upsert error:", error)
        throw error
      }

      console.log(`Recorded ${gaugeDataList.length} gauge snapshots`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Recorded ${gaugeDataList.length} gauge snapshots`,
        epoch_start: Number(epochStart),
        gauges_processed: gaugeDataList.length,
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

