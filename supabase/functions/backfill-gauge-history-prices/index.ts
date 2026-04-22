// Supabase Edge Function: backfill-gauge-history-prices
//
// Re-computes historical gauge_history rows that were recorded with placeholder
// prices (e.g. MEZO = $0.22, BTC = $100k). For each missing epoch it:
//   1. Fetches historical BTC and MEZO prices from CoinGecko (/coins/{id}/history)
//   2. Re-reads tokenRewardsPerEpoch(token, epochStart) from the bribe contracts
//      (past-epoch reward data is immutable and still queryable at head)
//   3. Rebuilds incentive_breakdown with correct decimals / symbols
//   4. Recalculates total_incentives_usd, apy, apy_at_optimal
//   5. Writes the updated row back with price_source = 'coingecko-historical'
//
// Call with:
//   POST ?epochs=3                 // process up to 3 oldest still-missing epochs
//   POST ?epoch=1744156800         // re-backfill a specific epoch
//   POST ?dryRun=true              // compute but don't write
//
// Env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   MEZO_COINGECKO_ID          (default: "mezo")
//   BTC_COINGECKO_ID           (default: "bitcoin")
//   COINGECKO_API_KEY          (optional; enables Pro endpoint + higher rate limit)

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
  getMezoNetworkConfig,
} from "../_shared/contracts.ts"
import { corsHeaders, handleCors } from "../_shared/cors.ts"

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address
const BTC_TOKEN_ADDRESS = "0x7b7c000000000000000000000000000000000000"
const MEZO_TOKEN_ADDRESS = "0x7b7c000000000000000000000000000000000001"
const RATIO_SCALE = 100_000_000n
const PERFECT_SUBSCRIPTION_TOLERANCE_BPS = 200n

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

const ERC20_METADATA_ABI = [
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const

type IncentiveEntry = {
  token_address: string
  symbol: string | null
  decimals: number
  amount_raw: string
  amount: number
  usd_value: number | null
  price_used: number | null
}

type HistoryRow = {
  id: number
  gauge_address: string
  epoch_start: number
  vemezo_weight: string | null
  optimal_vemezo_weight: string | null
  price_source: string | null
  btc_price_usd: string | null
  mezo_price_usd: string | null
}

function getTokenUsdPrice(
  tokenAddress: string,
  btcPrice: number,
  mezoPrice: number,
): number | null {
  const address = tokenAddress.toLowerCase()
  if (address === MEZO_TOKEN_ADDRESS) return mezoPrice
  if (BTC_PEGGED_ADDRESSES.has(address)) return btcPrice
  if (STABLECOIN_ADDRESSES.has(address)) return 1
  return null
}

function calculateAPY(
  totalIncentivesUSD: number | null,
  vemezoWeight: bigint,
  mezoPrice: number,
): number | null {
  if (!totalIncentivesUSD || totalIncentivesUSD <= 0) return null
  if (vemezoWeight === 0n) return 999999
  const totalVeMEZOAmount = Number(vemezoWeight) / 1e18
  const totalVeMEZOValueUSD = totalVeMEZOAmount * mezoPrice
  if (totalVeMEZOValueUSD <= 0) return null
  const weeklyReturn = totalIncentivesUSD / totalVeMEZOValueUSD
  return weeklyReturn * 52 * 100
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

function epochDateString(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000)
  const dd = String(d.getUTCDate()).padStart(2, "0")
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  const yyyy = d.getUTCFullYear()
  return `${dd}-${mm}-${yyyy}`
}

type CoingeckoTier = "demo" | "pro"

// Demo vs Pro keys route through different hosts + headers. Get this wrong
// and every request 401s — which looks like "missing historical price" but
// is actually an auth failure. Default to demo because that's what
// CoinGecko issues to free-tier users and what most projects have.
async function fetchCoingeckoHistorical(
  coinId: string,
  epochSeconds: number,
  apiKey: string | null,
  tier: CoingeckoTier,
): Promise<{ price: number | null; error: string | null }> {
  const date = epochDateString(epochSeconds)
  const base =
    tier === "pro"
      ? "https://pro-api.coingecko.com/api/v3"
      : "https://api.coingecko.com/api/v3"
  const headerName = tier === "pro" ? "x-cg-pro-api-key" : "x-cg-demo-api-key"
  const url = `${base}/coins/${coinId}/history?date=${date}&localization=false`

  try {
    const res = await fetch(url, {
      headers: apiKey ? { [headerName]: apiKey } : {},
    })
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "")
      const snippet = bodyText.slice(0, 200)
      const msg = `${res.status} ${res.statusText}${snippet ? `: ${snippet}` : ""}`
      console.warn(
        `CoinGecko historical fetch failed for ${coinId} @ ${date}: ${msg}`,
      )
      return { price: null, error: msg }
    }
    const body = (await res.json()) as {
      market_data?: { current_price?: { usd?: number } }
    }
    const price = body?.market_data?.current_price?.usd
    if (typeof price === "number" && Number.isFinite(price) && price > 0) {
      return { price, error: null }
    }
    return { price: null, error: "empty market_data.current_price.usd" }
  } catch (e) {
    const msg = String(e)
    console.warn(`CoinGecko fetch error for ${coinId} @ ${date}:`, e)
    return { price: null, error: msg }
  }
}

async function recomputeEpoch(
  supabase: ReturnType<typeof createClient>,
  publicClient: PublicClient,
  boostVoterAddress: Address,
  rows: HistoryRow[],
  epochStart: number,
  btcPrice: number,
  mezoPrice: number,
  priceSource: string,
  dryRun: boolean,
): Promise<{ updated: number; gauges: number }> {
  if (rows.length === 0) return { updated: 0, gauges: 0 }

  const gaugeAddresses = rows.map((r) => r.gauge_address as Address)

  // Need the bribe address for each gauge (current mapping — bribe addresses
  // are stable for a given gauge once assigned).
  const bribeResults = await publicClient.multicall({
    contracts: gaugeAddresses.map((addr) => ({
      address: boostVoterAddress,
      abi: BOOST_VOTER_ABI,
      functionName: "gaugeToBribe",
      args: [addr],
    })),
  })

  const bribeByGauge = new Map<string, Address>()
  bribeResults.forEach((r, i) => {
    if (r.status === "success") {
      const bribe = r.result as unknown as Address
      if (bribe !== ZERO_ADDRESS)
        bribeByGauge.set(gaugeAddresses[i].toLowerCase(), bribe)
    }
  })

  // Per-bribe: fetch token list length
  const bribeEntries = Array.from(bribeByGauge.entries())
  if (bribeEntries.length === 0) return { updated: 0, gauges: 0 }

  const lengthResults = await publicClient.multicall({
    contracts: bribeEntries.map(([, bribe]) => ({
      address: bribe,
      abi: BRIBE_ABI,
      functionName: "rewardsListLength",
    })),
  })

  const tokenIndexCalls: {
    gaugeAddress: string
    bribeAddress: Address
    tokenIndex: bigint
  }[] = []
  bribeEntries.forEach(([gauge, bribe], i) => {
    const length =
      lengthResults[i].status === "success"
        ? (lengthResults[i].result as bigint)
        : 0n
    for (let k = 0n; k < length; k++) {
      tokenIndexCalls.push({
        gaugeAddress: gauge,
        bribeAddress: bribe,
        tokenIndex: k,
      })
    }
  })

  if (tokenIndexCalls.length === 0) {
    // No bribe tokens to value; just stamp prices on rows and clear incentives.
    if (!dryRun) {
      for (const row of rows) {
        await supabase
          .from("gauge_history")
          .update({
            btc_price_usd: btcPrice,
            mezo_price_usd: mezoPrice,
            price_source: priceSource,
            incentive_breakdown: [],
            total_incentives_usd: 0,
            apy: null,
            apy_at_optimal: null,
          })
          .eq("id", row.id)
      }
    }
    return { updated: rows.length, gauges: rows.length }
  }

  const tokenAddressResults = await publicClient.multicall({
    contracts: tokenIndexCalls.map((c) => ({
      address: c.bribeAddress,
      abi: BRIBE_ABI,
      functionName: "rewards",
      args: [c.tokenIndex],
    })),
  })

  const tokenEntries = tokenIndexCalls
    .map((c, i) => ({
      ...c,
      tokenAddress:
        tokenAddressResults[i].status === "success"
          ? (tokenAddressResults[i].result as unknown as Address)
          : ZERO_ADDRESS,
    }))
    .filter((t) => t.tokenAddress !== ZERO_ADDRESS)

  // Historical amounts at epoch + token metadata (decimals/symbol are
  // immutable so fetching at head is fine).
  const uniqueTokens = Array.from(
    new Set(tokenEntries.map((t) => t.tokenAddress.toLowerCase())),
  ) as Address[]

  const [amountResults, decimalsResults, symbolResults] = await Promise.all([
    publicClient.multicall({
      contracts: tokenEntries.map((t) => ({
        address: t.bribeAddress,
        abi: BRIBE_ABI,
        functionName: "tokenRewardsPerEpoch",
        args: [t.tokenAddress, BigInt(epochStart)],
      })),
    }),
    publicClient.multicall({
      contracts: uniqueTokens.map((addr) => ({
        address: addr,
        abi: ERC20_METADATA_ABI,
        functionName: "decimals",
      })),
    }),
    publicClient.multicall({
      contracts: uniqueTokens.map((addr) => ({
        address: addr,
        abi: ERC20_METADATA_ABI,
        functionName: "symbol",
      })),
    }),
  ])

  const tokenMetadata = new Map<
    string,
    { decimals: number; symbol: string | null }
  >()
  uniqueTokens.forEach((addr, i) => {
    const decimals =
      decimalsResults[i].status === "success"
        ? Number(decimalsResults[i].result as number)
        : 18
    const symbol =
      symbolResults[i].status === "success"
        ? (symbolResults[i].result as string)
        : null
    tokenMetadata.set(addr, { decimals, symbol })
  })

  // Aggregate per gauge
  const breakdowns = new Map<string, IncentiveEntry[]>()
  const usdTotals = new Map<string, number>()
  tokenEntries.forEach((t, i) => {
    const amount =
      amountResults[i].status === "success"
        ? (amountResults[i].result as bigint)
        : 0n
    if (amount <= 0n) return

    const tokenKey = t.tokenAddress.toLowerCase()
    const meta = tokenMetadata.get(tokenKey) ?? {
      decimals: 18,
      symbol: null,
    }
    const price = getTokenUsdPrice(tokenKey, btcPrice, mezoPrice)
    const tokenAmount = Number(formatUnits(amount, meta.decimals))
    const usdValue = price !== null ? tokenAmount * price : null

    const entry: IncentiveEntry = {
      token_address: tokenKey,
      symbol: meta.symbol,
      decimals: meta.decimals,
      amount_raw: amount.toString(),
      amount: tokenAmount,
      usd_value: usdValue,
      price_used: price,
    }

    const existing = breakdowns.get(t.gaugeAddress) ?? []
    existing.push(entry)
    breakdowns.set(t.gaugeAddress, existing)

    if (usdValue !== null) {
      usdTotals.set(t.gaugeAddress, (usdTotals.get(t.gaugeAddress) ?? 0) + usdValue)
    }
  })

  // Write updates
  let updated = 0
  for (const row of rows) {
    const gauge = row.gauge_address.toLowerCase()
    const breakdown = breakdowns.get(gauge) ?? []
    const totalUsd = usdTotals.get(gauge) ?? 0
    const vemezoWeight = row.vemezo_weight ? BigInt(row.vemezo_weight) : 0n
    const optimalWeight = row.optimal_vemezo_weight
      ? BigInt(row.optimal_vemezo_weight)
      : null

    const apy = calculateAPY(totalUsd || null, vemezoWeight, mezoPrice)
    const apyAtOptimal =
      optimalWeight !== null
        ? calculateAPY(totalUsd || null, optimalWeight, mezoPrice)
        : null
    const subscriptionRatio = calculateSubscriptionRatio(
      vemezoWeight,
      optimalWeight,
    )
    const subscriptionStatus = getSubscriptionStatus(vemezoWeight, optimalWeight)
    const oversubscriptionDilution =
      subscriptionRatio !== null && subscriptionRatio > 1
        ? 1 - 1 / subscriptionRatio
        : null

    const update = {
      btc_price_usd: btcPrice,
      mezo_price_usd: mezoPrice,
      price_source: priceSource,
      incentive_breakdown: breakdown,
      total_incentives_usd: totalUsd || null,
      apy,
      apy_at_optimal: apyAtOptimal,
      subscription_ratio: subscriptionRatio,
      subscription_status: subscriptionStatus,
      oversubscription_dilution: oversubscriptionDilution,
    }

    if (dryRun) {
      console.log(`[dry-run] would update id=${row.id}`, update)
      updated++
      continue
    }

    const { error } = await supabase
      .from("gauge_history")
      .update(update)
      .eq("id", row.id)

    if (error) {
      console.error(`Failed to update row id=${row.id}:`, error)
      continue
    }
    updated++
  }

  return { updated, gauges: rows.length }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const url = new URL(req.url)
    const epochsLimit = Math.min(
      Math.max(Number.parseInt(url.searchParams.get("epochs") ?? "2", 10), 1),
      10,
    )
    const singleEpoch = url.searchParams.get("epoch")
    const dryRun = url.searchParams.get("dryRun") === "true"

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    }

    const mezoCoinId = Deno.env.get("MEZO_COINGECKO_ID") ?? "mezo"
    const btcCoinId = Deno.env.get("BTC_COINGECKO_ID") ?? "bitcoin"
    const coingeckoKey = Deno.env.get("COINGECKO_API_KEY") ?? null
    const tierEnv = (
      Deno.env.get("COINGECKO_API_TIER") ?? "demo"
    ).toLowerCase()
    const coingeckoTier: CoingeckoTier = tierEnv === "pro" ? "pro" : "demo"

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { chain, contracts, rpcUrl } = getMezoNetworkConfig()
    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    })

    // Pick target epochs. By default: oldest epochs whose price_source is null
    // or 'live-oracle-pre-backfill' or a legacy placeholder tag.
    let targetEpochs: number[]
    if (singleEpoch) {
      targetEpochs = [Number.parseInt(singleEpoch, 10)]
    } else {
      const { data, error } = await supabase
        .from("gauge_history")
        .select("epoch_start")
        .or(
          "price_source.is.null,price_source.eq.live-oracle-pre-backfill,price_source.eq.placeholder",
        )
        .order("epoch_start", { ascending: true })
      if (error) throw error
      targetEpochs = Array.from(
        new Set((data ?? []).map((r) => Number(r.epoch_start))),
      ).slice(0, epochsLimit)
    }

    if (targetEpochs.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No epochs need backfill",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      )
    }

    const results: Array<{
      epoch_start: number
      btc_price: number | null
      mezo_price: number | null
      updated: number
      gauges: number
      skipped_reason?: string
      btc_error?: string
      mezo_error?: string
    }> = []

    for (const epochStart of targetEpochs) {
      const { data: rows, error: rowsError } = await supabase
        .from("gauge_history")
        .select(
          "id, gauge_address, epoch_start, vemezo_weight, optimal_vemezo_weight, price_source, btc_price_usd, mezo_price_usd",
        )
        .eq("epoch_start", epochStart)
      if (rowsError) throw rowsError

      const typedRows = (rows ?? []) as HistoryRow[]

      const [btcResult, mezoResult] = await Promise.all([
        fetchCoingeckoHistorical(
          btcCoinId,
          epochStart,
          coingeckoKey,
          coingeckoTier,
        ),
        fetchCoingeckoHistorical(
          mezoCoinId,
          epochStart,
          coingeckoKey,
          coingeckoTier,
        ),
      ])
      const btcPrice = btcResult.price
      const mezoPrice = mezoResult.price

      if (btcPrice === null || mezoPrice === null) {
        results.push({
          epoch_start: epochStart,
          btc_price: btcPrice,
          mezo_price: mezoPrice,
          updated: 0,
          gauges: typedRows.length,
          skipped_reason: "missing-historical-price",
          btc_error: btcResult.error ?? undefined,
          mezo_error: mezoResult.error ?? undefined,
        })
        continue
      }

      const { updated, gauges } = await recomputeEpoch(
        supabase,
        publicClient,
        contracts.boostVoter as Address,
        typedRows,
        epochStart,
        btcPrice,
        mezoPrice,
        dryRun ? "dry-run" : "coingecko-historical",
        dryRun,
      )

      results.push({
        epoch_start: epochStart,
        btc_price: btcPrice,
        mezo_price: mezoPrice,
        updated,
        gauges,
      })
    }

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: dryRun,
        coingecko_tier: coingeckoTier,
        coingecko_key_present: coingeckoKey !== null,
        mezo_coin_id: mezoCoinId,
        btc_coin_id: btcCoinId,
        epochs_processed: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (error) {
    console.error("Backfill error:", error)
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }
})
