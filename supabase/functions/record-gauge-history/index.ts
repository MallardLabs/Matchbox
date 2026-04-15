// Supabase Edge Function: record-gauge-history
// Runs daily to snapshot gauge metrics into gauge_history table
// Optimized with multicall to batch RPC requests and avoid CPU timeout

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  createPublicClient,
  formatUnits,
  http,
  type Address,
  type PublicClient,
} from "https://esm.sh/viem@2"
import {
  BRIBE_ABI,
  BOOST_VOTER_ABI,
  CHAINS,
  NON_STAKING_GAUGE_ABI,
  RPC_URLS,
  VOTING_ESCROW_ABI,
  getMezoNetworkConfig,
} from "../_shared/contracts.ts"
import { corsHeaders, handleCors } from "../_shared/cors.ts"

// Constants
const EPOCH_DURATION = 7 * 24 * 60 * 60 // 7 days in seconds

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address
const BTC_TOKEN_ADDRESS = "0x7b7c000000000000000000000000000000000000"
const MEZO_TOKEN_ADDRESS = "0x7b7c000000000000000000000000000000000001"
const BTC_ORACLE_ADDRESS = "0x7b7c000000000000000000000000000000000015"

const BASE_CHAIN = {
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        Deno.env.get("BASE_RPC_URL") ?? "https://mainnet.base.org",
        "https://base.llamarpc.com",
        "https://base-rpc.publicnode.com",
      ],
    },
  },
} as const

const BASE_RPC_URLS = BASE_CHAIN.rpcUrls.default.http

// Aerodrome Slipstream pool: MEZO / MUSD on Base.
const MEZO_MUSD_POOL_ADDRESS = "0xfCd3F5cA230E7c1Bd5b415eb85d5186346De0fec"
const Q96 = 2n ** 96n
const PERFECT_SUBSCRIPTION_TOLERANCE_BPS = 200n
const RATIO_SCALE = 100_000_000n

const CHAINLINK_AGGREGATOR_ABI = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { internalType: "uint80", name: "roundId", type: "uint80" },
      { internalType: "int256", name: "answer", type: "int256" },
      { internalType: "uint256", name: "startedAt", type: "uint256" },
      { internalType: "uint256", name: "updatedAt", type: "uint256" },
      { internalType: "uint80", name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const

const SLIPSTREAM_POOL_ABI = [
  {
    inputs: [],
    name: "slot0",
    outputs: [
      { internalType: "uint160", name: "sqrtPriceX96", type: "uint160" },
      { internalType: "int24", name: "tick", type: "int24" },
      { internalType: "uint16", name: "observationIndex", type: "uint16" },
      {
        internalType: "uint16",
        name: "observationCardinality",
        type: "uint16",
      },
      {
        internalType: "uint16",
        name: "observationCardinalityNext",
        type: "uint16",
      },
      { internalType: "bool", name: "unlocked", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "liquidity",
    outputs: [{ internalType: "uint128", name: "", type: "uint128" }],
    stateMutability: "view",
    type: "function",
  },
] as const

const STABLECOIN_ADDRESSES = new Set([
  "0x118917a40fa1cd7a13db0ef56c86de7973ac503",
  "0x118917a40faf1cd7a13db0ef56c86de7973ac503",
  "0xdd468a1ddc392dcdbef6db6e34e89aa338f9f186",
  "0x04671c72aab5ac02a03c1098314b1bb6b560c197",
  "0xeb5a5d39de4ea42c2aa6a57eca2894376683bb8e",
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "0xdac17f958d2ee523a2206206994597c13d831ec7",
  "0x6b175474e89094c44da98b954eedeac495271d0f",
])

const BTC_PEGGED_ADDRESSES = new Set([
  BTC_TOKEN_ADDRESS,
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
  "0x18084fba666a33d37592fa2633fd49a74dd93a88",
  "0x5c6a8ea1e714dd3de1a28de1a00f5d5289313822",
])

function sqrtPriceX96ToPrice(sqrtPriceX96: bigint): number {
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96)
  return sqrtPrice * sqrtPrice
}

function isUsablePrice(price: number): boolean {
  return price > 0 && price < 1_000_000 && Number.isFinite(price)
}

async function fetchBtcPrice(): Promise<number | null> {
  try {
    const client = createPublicClient({
      chain: CHAINS.mainnet,
      transport: http(Deno.env.get("BTC_PRICE_RPC_URL") ?? RPC_URLS.mainnet),
    })

    const [roundData, decimals] = await Promise.all([
      client.readContract({
        address: BTC_ORACLE_ADDRESS as Address,
        abi: CHAINLINK_AGGREGATOR_ABI,
        functionName: "latestRoundData",
      }),
      client.readContract({
        address: BTC_ORACLE_ADDRESS as Address,
        abi: CHAINLINK_AGGREGATOR_ABI,
        functionName: "decimals",
      }),
    ])

    const [, answer] = roundData
    const price = Number(answer) / 10 ** decimals
    return isUsablePrice(price) ? price : null
  } catch (e) {
    console.warn("Error fetching BTC price:", e)
    return null
  }
}

async function fetchMezoPrice(): Promise<number | null> {
  for (const rpcUrl of BASE_RPC_URLS) {
    try {
      const client = createPublicClient({
        chain: BASE_CHAIN,
        transport: http(rpcUrl),
      })

      const [slot0Result, liquidity] = await Promise.all([
        client.readContract({
          address: MEZO_MUSD_POOL_ADDRESS as Address,
          abi: SLIPSTREAM_POOL_ABI,
          functionName: "slot0",
        }),
        client.readContract({
          address: MEZO_MUSD_POOL_ADDRESS as Address,
          abi: SLIPSTREAM_POOL_ABI,
          functionName: "liquidity",
        }),
      ])

      const sqrtPriceX96 = slot0Result[0]
      if (liquidity === 0n || sqrtPriceX96 === 0n) {
        continue
      }

      const price = sqrtPriceX96ToPrice(sqrtPriceX96)
      if (isUsablePrice(price)) {
        return price
      }
    } catch (e) {
      console.warn(`Error fetching MEZO price from ${rpcUrl}:`, e)
    }
  }

  return null
}

function getTokenUsdPrice(
  tokenAddress: Address,
  btcPrice: number,
  mezoPrice: number,
): number | null {
  const address = tokenAddress.toLowerCase()

  if (address === MEZO_TOKEN_ADDRESS) return mezoPrice
  if (BTC_PEGGED_ADDRESSES.has(address)) return btcPrice
  if (STABLECOIN_ADDRESSES.has(address)) return 1

  return null
}

// Types
type GaugeData = {
  gauge_address: string
  epoch_start: number
  vemezo_weight: string | null
  vebtc_weight: string | null
  boost_multiplier: number | null
  total_incentives_usd: number | null
  apy: number | null
  optimal_vemezo_weight: string | null
  subscription_ratio: number | null
  subscription_delta_vemezo: string | null
  subscription_status: "under" | "perfect" | "over" | "unknown"
  apy_at_optimal: number | null
  oversubscription_dilution: number | null
  unique_voters: number | null
}

// Helper to get current epoch start
function getEpochStart(timestamp: number): bigint {
  return BigInt(Math.floor(timestamp / EPOCH_DURATION) * EPOCH_DURATION)
}

function calculateAPY(
  totalIncentivesUSD: number | null,
  vemezoWeight: bigint,
  mezoPrice: number,
): number | null {
  if (!totalIncentivesUSD || totalIncentivesUSD <= 0) return null

  if (vemezoWeight === 0n) {
    return 999999
  }

  const totalVeMEZOAmount = Number(vemezoWeight) / 1e18
  const totalVeMEZOValueUSD = totalVeMEZOAmount * mezoPrice
  if (totalVeMEZOValueUSD <= 0) return null

  const weeklyReturn = totalIncentivesUSD / totalVeMEZOValueUSD
  return weeklyReturn * 52 * 100
}

function calculateOptimalVeMEZO(
  unboostedVeBTCWeight: bigint,
  veMEZOSupply: bigint | null,
  veBTCSupply: bigint | null,
): bigint | null {
  if (
    unboostedVeBTCWeight <= 0n ||
    !veMEZOSupply ||
    veMEZOSupply <= 0n ||
    !veBTCSupply ||
    veBTCSupply <= 0n
  ) {
    return null
  }

  return (unboostedVeBTCWeight * veMEZOSupply) / veBTCSupply
}

function calculateSubscriptionRatio(
  actualWeight: bigint,
  optimalWeight: bigint | null,
): number | null {
  if (!optimalWeight || optimalWeight <= 0n) return null

  return (
    Number((actualWeight * RATIO_SCALE) / optimalWeight) / Number(RATIO_SCALE)
  )
}

function getSubscriptionStatus(
  actualWeight: bigint,
  optimalWeight: bigint | null,
): "under" | "perfect" | "over" | "unknown" {
  if (!optimalWeight || optimalWeight <= 0n) return "unknown"

  const lowerBound =
    (optimalWeight * (10_000n - PERFECT_SUBSCRIPTION_TOLERANCE_BPS)) / 10_000n
  const upperBound =
    (optimalWeight * (10_000n + PERFECT_SUBSCRIPTION_TOLERANCE_BPS)) / 10_000n

  if (actualWeight < lowerBound) return "under"
  if (actualWeight > upperBound) return "over"
  return "perfect"
}

async function fetchVeSupplyTotals(
  publicClient: PublicClient,
  veBTCAddress: Address,
  veMEZOAddress: Address,
): Promise<{ veBTCSupply: bigint | null; veMEZOSupply: bigint | null }> {
  try {
    const [veBTCSupply, veMEZOSupply] = await Promise.all([
      publicClient.readContract({
        address: veBTCAddress,
        abi: VOTING_ESCROW_ABI,
        functionName: "supply",
      }),
      publicClient.readContract({
        address: veMEZOAddress,
        abi: VOTING_ESCROW_ABI,
        functionName: "supply",
      }),
    ])

    return {
      veBTCSupply: veBTCSupply as bigint,
      veMEZOSupply: veMEZOSupply as bigint,
    }
  } catch (e) {
    console.warn("Error fetching ve supply totals:", e)
    return { veBTCSupply: null, veMEZOSupply: null }
  }
}

// Main function
Deno.serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    console.log("Starting gauge history snapshot (optimized)...")

    // Get environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    }

    const { chain, contracts, network, rpcUrl } = getMezoNetworkConfig()

    // Initialize clients
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    })

    const boostVoterAddress = contracts.boostVoter as Address
    const veBTCAddress = contracts.veBTC as Address
    const veMEZOAddress = contracts.veMEZO as Address
    console.log(`Recording gauge history on ${network} (${rpcUrl})`)

    // Get current epoch start
    const now = Math.floor(Date.now() / 1000)
    const epochStart = getEpochStart(now)
    console.log(`Epoch start: ${epochStart} (${new Date(Number(epochStart) * 1000).toISOString()})`)

    const [btcPrice, mezoPrice] = await Promise.all([
      fetchBtcPrice(),
      fetchMezoPrice(),
    ])
    if (btcPrice === null || mezoPrice === null) {
      return new Response(
        JSON.stringify({
          error: "Failed to fetch live BTC or MEZO price",
          btc_price_available: btcPrice !== null,
          mezo_price_available: mezoPrice !== null,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }
    console.log(`BTC price: $${btcPrice} (source: Mezo mainnet Skip oracle)`)
    console.log(`MEZO price: $${mezoPrice} (source: Base Aerodrome CL pool)`)

    const { veBTCSupply, veMEZOSupply } = await fetchVeSupplyTotals(
      publicClient,
      veBTCAddress,
      veMEZOAddress,
    )
    console.log(
      `ve supply totals: veBTC=${veBTCSupply?.toString() ?? "unavailable"}, veMEZO=${veMEZOSupply?.toString() ?? "unavailable"}`,
    )

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
      .map((r) => r.result as unknown as Address)

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
      bribeAddress:
        r.status === "success" ? (r.result as unknown as Address) : ZERO_ADDRESS,
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
            ? (tokenAddressResults[idx].result as unknown as Address)
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

          // Calculate USD values from the same live feeds used by the webapp.
          rewardAmountCalls.forEach((c, idx) => {
            const amount = amountResults[idx].status === "success"
              ? (amountResults[idx].result as bigint)
              : 0n

            if (amount > 0n) {
              const gaugeIdx = bribeInfoList[c.bribeIndex].gaugeIndex
              const price = getTokenUsdPrice(c.tokenAddress, btcPrice, mezoPrice)
              if (price === null) {
                console.warn(`Skipping unknown reward token: ${c.tokenAddress}`)
                return
              }

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
    const gaugeBoosts: Map<
      number,
      { boost: number; vebtcWeight: bigint; unboostedVebtcWeight: bigint }
    > = new Map()

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
              ? (mappedGaugeResults[idx].result as unknown as Address)
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
            const [
              boostResults,
              votingPowerResults,
              unboostedVotingPowerResults,
            ] = await Promise.all([
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
              publicClient.multicall({
                contracts: matchedTokens.map(([_, tokenId]) => ({
                  address: veBTCAddress,
                  abi: VOTING_ESCROW_ABI,
                  functionName: "unboostedVotingPowerOfNFT",
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
              const unboostedVebtcWeight =
                unboostedVotingPowerResults[idx].status === "success"
                  ? (unboostedVotingPowerResults[idx].result as bigint)
                  : 0n

              if (boost !== null) {
                gaugeBoosts.set(gaugeIdx, {
                  boost,
                  vebtcWeight,
                  unboostedVebtcWeight,
                })
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
      const optimalVeMEZOWeight = calculateOptimalVeMEZO(
        boostInfo?.unboostedVebtcWeight ?? 0n,
        veMEZOSupply,
        veBTCSupply,
      )
      const subscriptionRatio = calculateSubscriptionRatio(
        vemezoWeight,
        optimalVeMEZOWeight,
      )
      const subscriptionDelta =
        optimalVeMEZOWeight !== null ? vemezoWeight - optimalVeMEZOWeight : null
      const subscriptionStatus = getSubscriptionStatus(
        vemezoWeight,
        optimalVeMEZOWeight,
      )
      const apy = calculateAPY(totalIncentivesUSD, vemezoWeight, mezoPrice)
      const apyAtOptimal =
        optimalVeMEZOWeight !== null
          ? calculateAPY(totalIncentivesUSD, optimalVeMEZOWeight, mezoPrice)
          : null
      const oversubscriptionDilution =
        subscriptionRatio !== null && subscriptionRatio > 1
          ? 1 - 1 / subscriptionRatio
          : null

      return {
        gauge_address: gaugeAddress.toLowerCase(),
        epoch_start: Number(epochStart),
        vemezo_weight: vemezoWeight.toString(),
        vebtc_weight: boostInfo?.vebtcWeight?.toString() ?? null,
        boost_multiplier: boostInfo?.boost ?? null,
        total_incentives_usd: totalIncentivesUSD,
        apy,
        optimal_vemezo_weight: optimalVeMEZOWeight?.toString() ?? null,
        subscription_ratio: subscriptionRatio,
        subscription_delta_vemezo: subscriptionDelta?.toString() ?? null,
        subscription_status: subscriptionStatus,
        apy_at_optimal: apyAtOptimal,
        oversubscription_dilution: oversubscriptionDilution,
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
