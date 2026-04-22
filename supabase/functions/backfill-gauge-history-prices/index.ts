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
//   POST ?epochs=3                    // process up to 3 oldest still-missing epochs
//   POST ?epoch=1744156800            // re-backfill a specific epoch
//   POST ?dryRun=true                 // compute but don't write
//   POST ?refreshSubscription=true    // also sweep rows whose prices are set
//                                     // but optimal_vemezo_weight is null —
//                                     // lets historical rows pick up
//                                     // subscription/boost data recomputed
//                                     // against current chain state
//
// Subscription note: for historical epochs we read current chain state for
// veMEZO/veBTC supplies and the current boost NFT mapping. That's an
// approximation — boost NFTs can be transferred and supplies drift. The
// alternative (reconstructing historical NFT ownership + unboosted voting
// power per epoch) is a much heavier job; current state is "close enough" to
// surface under/over-subscription signals in the historical table.
//
// Env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   MEZO_COINGECKO_ID          (default: "mezo")
//   BTC_COINGECKO_ID           (default: "bitcoin")
//   COINGECKO_API_KEY          (optional; enables Pro endpoint + higher rate limit)
//   COINGECKO_API_TIER         ("demo" | "pro", default "demo")
//   MEZO_GECKOTERMINAL_POOL    (optional; Base-chain MEZO/MUSD pool address used
//                              as a secondary historical source when CoinGecko
//                              has no data. Default: the known Aerodrome pool.)
//
// Pre-market note: MEZO had no market anywhere before the Aerodrome pool was
// created on 2026-04-01 (~1743465600) and was only listed on CoinGecko around
// 2026-04-12. For epochs older than that, no source will return a MEZO price.
// The backfill still recomputes BTC- and stablecoin-denominated incentives for
// those epochs and tags the row with price_source = "mezo-premarket" so we
// don't keep retrying and don't falsely claim a placeholder MEZO price.

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
  NON_STAKING_GAUGE_ABI,
  VOTING_ESCROW_ABI,
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
  boost_multiplier: number | null
  price_source: string | null
  btc_price_usd: string | null
  mezo_price_usd: string | null
}

type GaugeBoostInfo = {
  boost: number
  vebtcWeight: bigint
  unboostedVebtcWeight: bigint
}

function getTokenUsdPrice(
  tokenAddress: string,
  btcPrice: number,
  mezoPrice: number | null,
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
  mezoPrice: number | null,
): number | null {
  if (!totalIncentivesUSD || totalIncentivesUSD <= 0) return null
  if (mezoPrice === null || mezoPrice <= 0) return null
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

// Walk the gauge → beneficiary → veBTC NFT → boostableTokenIdToGauge chain to
// recover the NFT currently boosting each gauge, plus the boost multiplier
// and unboosted voting power. Mirrors the equivalent flow in
// record-gauge-history. Reads live chain state only — historical epochs get
// an approximation since boost NFTs and their voting power drift over time.
async function fetchCurrentBoostInfo(
  publicClient: PublicClient,
  boostVoterAddress: Address,
  veBTCAddress: Address,
  gaugeAddresses: Address[],
): Promise<Map<string, GaugeBoostInfo>> {
  const result = new Map<string, GaugeBoostInfo>()
  if (gaugeAddresses.length === 0) return result

  const beneficiaryResults = await publicClient.multicall({
    contracts: gaugeAddresses.map((addr) => ({
      address: addr,
      abi: NON_STAKING_GAUGE_ABI,
      functionName: "rewardsBeneficiary",
    })),
  })

  const beneficiaryInfo = beneficiaryResults
    .map((r, i) => ({
      gaugeAddress: gaugeAddresses[i],
      beneficiary:
        r.status === "success" ? (r.result as Address) : ZERO_ADDRESS,
    }))
    .filter((b) => b.beneficiary !== ZERO_ADDRESS)

  if (beneficiaryInfo.length === 0) return result

  const balanceResults = await publicClient.multicall({
    contracts: beneficiaryInfo.map((b) => ({
      address: veBTCAddress,
      abi: VOTING_ESCROW_ABI,
      functionName: "balanceOf",
      args: [b.beneficiary],
    })),
  })

  // Cap per-beneficiary enumeration to avoid long multicalls for whales.
  const MAX_TOKENS_PER_BENEFICIARY = 5n
  const tokenIdCalls: { beneficiaryIdx: number; tokenIndex: bigint }[] = []
  beneficiaryInfo.forEach((_, bIdx) => {
    const balance =
      balanceResults[bIdx].status === "success"
        ? (balanceResults[bIdx].result as bigint)
        : 0n
    const maxTokens =
      balance > MAX_TOKENS_PER_BENEFICIARY
        ? MAX_TOKENS_PER_BENEFICIARY
        : balance
    for (let i = 0n; i < maxTokens; i++) {
      tokenIdCalls.push({ beneficiaryIdx: bIdx, tokenIndex: i })
    }
  })

  if (tokenIdCalls.length === 0) return result

  const tokenIdResults = await publicClient.multicall({
    contracts: tokenIdCalls.map((c) => ({
      address: veBTCAddress,
      abi: VOTING_ESCROW_ABI,
      functionName: "ownerToNFTokenIdList",
      args: [beneficiaryInfo[c.beneficiaryIdx].beneficiary, c.tokenIndex],
    })),
  })

  const tokenIds = tokenIdCalls
    .map((c, idx) => ({
      ...c,
      tokenId:
        tokenIdResults[idx].status === "success"
          ? (tokenIdResults[idx].result as bigint)
          : 0n,
    }))
    .filter((t) => t.tokenId > 0n)

  if (tokenIds.length === 0) return result

  const mappedGaugeResults = await publicClient.multicall({
    contracts: tokenIds.map((t) => ({
      address: boostVoterAddress,
      abi: BOOST_VOTER_ABI,
      functionName: "boostableTokenIdToGauge",
      args: [t.tokenId],
    })),
  })

  const gaugeToTokenId = new Map<string, bigint>()
  tokenIds.forEach((t, idx) => {
    const mappedGauge =
      mappedGaugeResults[idx].status === "success"
        ? (mappedGaugeResults[idx].result as unknown as Address)
        : ZERO_ADDRESS
    const expectedGauge = beneficiaryInfo[t.beneficiaryIdx].gaugeAddress
    if (mappedGauge.toLowerCase() === expectedGauge.toLowerCase()) {
      gaugeToTokenId.set(expectedGauge.toLowerCase(), t.tokenId)
    }
  })

  const matchedTokens = Array.from(gaugeToTokenId.entries())
  if (matchedTokens.length === 0) return result

  const [boostResults, votingPowerResults, unboostedVotingPowerResults] =
    await Promise.all([
      publicClient.multicall({
        contracts: matchedTokens.map(([, tokenId]) => ({
          address: boostVoterAddress,
          abi: BOOST_VOTER_ABI,
          functionName: "getBoost",
          args: [tokenId],
        })),
      }),
      publicClient.multicall({
        contracts: matchedTokens.map(([, tokenId]) => ({
          address: veBTCAddress,
          abi: VOTING_ESCROW_ABI,
          functionName: "votingPowerOfNFT",
          args: [tokenId],
        })),
      }),
      publicClient.multicall({
        contracts: matchedTokens.map(([, tokenId]) => ({
          address: veBTCAddress,
          abi: VOTING_ESCROW_ABI,
          functionName: "unboostedVotingPowerOfNFT",
          args: [tokenId],
        })),
      }),
    ])

  matchedTokens.forEach(([gauge], idx) => {
    const boost =
      boostResults[idx].status === "success"
        ? Number(boostResults[idx].result as bigint) / 1e18
        : null
    if (boost === null) return
    const vebtcWeight =
      votingPowerResults[idx].status === "success"
        ? (votingPowerResults[idx].result as bigint)
        : 0n
    const unboostedVebtcWeight =
      unboostedVotingPowerResults[idx].status === "success"
        ? (unboostedVotingPowerResults[idx].result as bigint)
        : 0n
    result.set(gauge, { boost, vebtcWeight, unboostedVebtcWeight })
  })

  return result
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

// GeckoTerminal exposes historical OHLCV per pool without requiring an API
// key. For MEZO we query the Base-chain MEZO/MUSD pool: MUSD is a USD
// stablecoin so the close price is effectively MEZO/USD for that day.
// Requesting `before_timestamp=epoch+1day` with `limit=1` returns the last
// daily candle that ends at or before the epoch boundary.
async function fetchGeckoTerminalDailyClose(
  poolAddress: string,
  epochSeconds: number,
): Promise<{ price: number | null; error: string | null }> {
  const before = epochSeconds + 24 * 60 * 60
  const url = `https://api.geckoterminal.com/api/v2/networks/base/pools/${poolAddress}/ohlcv/day?before_timestamp=${before}&limit=1&currency=usd`
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json;version=20230302" },
    })
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "")
      const snippet = bodyText.slice(0, 200)
      return {
        price: null,
        error: `${res.status} ${res.statusText}${snippet ? `: ${snippet}` : ""}`,
      }
    }
    const body = (await res.json()) as {
      data?: {
        attributes?: { ohlcv_list?: Array<[number, number, number, number, number, number]> }
      }
    }
    const list = body?.data?.attributes?.ohlcv_list ?? []
    if (list.length === 0) {
      return { price: null, error: "geckoterminal ohlcv_list empty" }
    }
    // ohlcv_list is [timestamp, open, high, low, close, volume], newest first.
    // Pick the candle at or before our epoch.
    const candle = list.find((c) => c[0] <= epochSeconds) ?? list[0]
    const close = candle?.[4]
    if (typeof close === "number" && Number.isFinite(close) && close > 0) {
      return { price: close, error: null }
    }
    return { price: null, error: "geckoterminal close missing" }
  } catch (e) {
    return { price: null, error: String(e) }
  }
}

async function recomputeEpoch(
  supabase: ReturnType<typeof createClient>,
  publicClient: PublicClient,
  boostVoterAddress: Address,
  veBTCAddress: Address,
  veMEZOSupply: bigint | null,
  veBTCSupply: bigint | null,
  rows: HistoryRow[],
  epochStart: number,
  btcPrice: number,
  mezoPrice: number | null,
  priceSource: string,
  dryRun: boolean,
): Promise<{
  updated: number
  gauges: number
  subscription_recomputed: number
}> {
  if (rows.length === 0)
    return { updated: 0, gauges: 0, subscription_recomputed: 0 }

  // Pull live boost/unboosted-vebtc data for every gauge in this batch so we
  // can fill in optimal_vemezo_weight, boost_multiplier, and all derived
  // subscription metrics for rows where the original recording missed them.
  const gaugeAddressesForBoost = rows.map((r) => r.gauge_address as Address)
  const boostInfoByGauge = await fetchCurrentBoostInfo(
    publicClient,
    boostVoterAddress,
    veBTCAddress,
    gaugeAddressesForBoost,
  )

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
  if (bribeEntries.length === 0) {
    // Deprecated/retired gauges may no longer have a bribe mapping. Still
    // stamp the price source + refreshed subscription data so the row isn't
    // re-picked on every run.
    return await writeRows({
      supabase,
      rows,
      breakdowns: new Map(),
      usdTotals: new Map(),
      boostInfoByGauge,
      veMEZOSupply,
      veBTCSupply,
      btcPrice,
      mezoPrice,
      priceSource,
      dryRun,
    })
  }

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
    // No bribe tokens to value; stamp prices and refreshed subscription data.
    return await writeRows({
      supabase,
      rows,
      breakdowns: new Map(),
      usdTotals: new Map(),
      boostInfoByGauge,
      veMEZOSupply,
      veBTCSupply,
      btcPrice,
      mezoPrice,
      priceSource,
      dryRun,
    })
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

  return await writeRows({
    supabase,
    rows,
    breakdowns,
    usdTotals,
    boostInfoByGauge,
    veMEZOSupply,
    veBTCSupply,
    btcPrice,
    mezoPrice,
    priceSource,
    dryRun,
  })
}

async function writeRows(params: {
  supabase: ReturnType<typeof createClient>
  rows: HistoryRow[]
  breakdowns: Map<string, IncentiveEntry[]>
  usdTotals: Map<string, number>
  boostInfoByGauge: Map<string, GaugeBoostInfo>
  veMEZOSupply: bigint | null
  veBTCSupply: bigint | null
  btcPrice: number
  mezoPrice: number | null
  priceSource: string
  dryRun: boolean
}): Promise<{
  updated: number
  gauges: number
  subscription_recomputed: number
}> {
  const {
    supabase,
    rows,
    breakdowns,
    usdTotals,
    boostInfoByGauge,
    veMEZOSupply,
    veBTCSupply,
    btcPrice,
    mezoPrice,
    priceSource,
    dryRun,
  } = params

  let updated = 0
  let subscriptionRecomputed = 0

  for (const row of rows) {
    const gauge = row.gauge_address.toLowerCase()
    const breakdown = breakdowns.get(gauge) ?? []
    const totalUsd = usdTotals.get(gauge) ?? 0
    const vemezoWeight = row.vemezo_weight ? BigInt(row.vemezo_weight) : 0n

    // Prefer live-chain boost data; fall back to whatever was previously
    // recorded. If neither is available, optimal stays null.
    const liveBoost = boostInfoByGauge.get(gauge)
    const recordedOptimal = row.optimal_vemezo_weight
      ? BigInt(row.optimal_vemezo_weight)
      : null
    const liveOptimal = liveBoost
      ? calculateOptimalVeMEZO(
          liveBoost.unboostedVebtcWeight,
          veMEZOSupply,
          veBTCSupply,
        )
      : null
    const optimalWeight = liveOptimal ?? recordedOptimal
    const boostMultiplier = liveBoost?.boost ?? row.boost_multiplier ?? null
    const vebtcWeight = liveBoost?.vebtcWeight ?? null

    const apy = calculateAPY(totalUsd || null, vemezoWeight, mezoPrice)
    const apyAtOptimal =
      optimalWeight !== null
        ? calculateAPY(totalUsd || null, optimalWeight, mezoPrice)
        : null
    const subscriptionRatio = calculateSubscriptionRatio(
      vemezoWeight,
      optimalWeight,
    )
    const subscriptionStatus = getSubscriptionStatus(
      vemezoWeight,
      optimalWeight,
    )
    const subscriptionDelta =
      optimalWeight !== null ? vemezoWeight - optimalWeight : null
    const oversubscriptionDilution =
      subscriptionRatio !== null && subscriptionRatio > 1
        ? 1 - 1 / subscriptionRatio
        : null

    const gotNewSubscription =
      recordedOptimal === null && optimalWeight !== null

    const update: Record<string, unknown> = {
      btc_price_usd: btcPrice,
      mezo_price_usd: mezoPrice,
      price_source: priceSource,
      incentive_breakdown: breakdown,
      total_incentives_usd: totalUsd || null,
      apy,
      apy_at_optimal: apyAtOptimal,
      subscription_ratio: subscriptionRatio,
      subscription_status: subscriptionStatus,
      subscription_delta_vemezo:
        subscriptionDelta !== null ? subscriptionDelta.toString() : null,
      oversubscription_dilution: oversubscriptionDilution,
      optimal_vemezo_weight:
        optimalWeight !== null ? optimalWeight.toString() : null,
      boost_multiplier: boostMultiplier,
    }
    if (vebtcWeight !== null) {
      update.vebtc_weight = vebtcWeight.toString()
    }

    if (dryRun) {
      console.log(`[dry-run] would update id=${row.id}`, update)
      updated++
      if (gotNewSubscription) subscriptionRecomputed++
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
    if (gotNewSubscription) subscriptionRecomputed++
  }

  return {
    updated,
    gauges: rows.length,
    subscription_recomputed: subscriptionRecomputed,
  }
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
    // When set, also sweeps rows that already have prices but are missing
    // optimal_vemezo_weight (so historical rows get subscription/boost data
    // recomputed against current chain state).
    const refreshSubscription =
      url.searchParams.get("refreshSubscription") === "true"

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
    const mezoGeckoTerminalPool = (
      Deno.env.get("MEZO_GECKOTERMINAL_POOL") ??
      "0xfCd3F5cA230E7c1Bd5b415eb85d5186346De0fec"
    ).toLowerCase()

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { chain, contracts, rpcUrl } = getMezoNetworkConfig()
    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    })

    // Fetch current veMEZO and veBTC supplies once so every epoch's recompute
    // can derive optimal_vemezo_weight without re-querying.
    const supplyResults = await publicClient.multicall({
      contracts: [
        {
          address: contracts.veMEZO as Address,
          abi: VOTING_ESCROW_ABI,
          functionName: "supply",
        },
        {
          address: contracts.veBTC as Address,
          abi: VOTING_ESCROW_ABI,
          functionName: "supply",
        },
      ],
    })
    const veMEZOSupply =
      supplyResults[0].status === "success"
        ? (supplyResults[0].result as bigint)
        : null
    const veBTCSupply =
      supplyResults[1].status === "success"
        ? (supplyResults[1].result as bigint)
        : null

    // Pick target epochs. By default: oldest epochs whose price_source is null
    // or 'live-oracle-pre-backfill' or a legacy placeholder tag. With
    // refreshSubscription, also include rows that have prices but lack
    // optimal_vemezo_weight (which means no subscription data was recorded).
    let targetEpochs: number[]
    if (singleEpoch) {
      targetEpochs = [Number.parseInt(singleEpoch, 10)]
    } else {
      const filter = refreshSubscription
        ? "price_source.is.null,price_source.eq.live-oracle-pre-backfill,price_source.eq.placeholder,optimal_vemezo_weight.is.null"
        : "price_source.is.null,price_source.eq.live-oracle-pre-backfill,price_source.eq.placeholder"
      const { data, error } = await supabase
        .from("gauge_history")
        .select("epoch_start")
        .or(filter)
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
      mezo_price_source: string | null
      price_source: string
      updated: number
      gauges: number
      subscription_recomputed?: number
      skipped_reason?: string
      btc_error?: string
      mezo_coingecko_error?: string
      mezo_geckoterminal_error?: string
    }> = []

    for (const epochStart of targetEpochs) {
      const { data: rows, error: rowsError } = await supabase
        .from("gauge_history")
        .select(
          "id, gauge_address, epoch_start, vemezo_weight, optimal_vemezo_weight, boost_multiplier, price_source, btc_price_usd, mezo_price_usd",
        )
        .eq("epoch_start", epochStart)
      if (rowsError) throw rowsError

      const typedRows = (rows ?? []) as HistoryRow[]

      const [btcResult, mezoCoingeckoResult] = await Promise.all([
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

      // MEZO has no pre-market CoinGecko data, so fall through to
      // GeckoTerminal for the Aerodrome MEZO/MUSD pool. That pool itself
      // was created 2026-04-01, so epochs before that will still come back
      // null — handled below as "mezo-premarket".
      let mezoPrice = mezoCoingeckoResult.price
      let mezoPriceSource: string | null =
        mezoPrice !== null ? "coingecko-historical" : null
      let mezoGeckoTerminalError: string | null = null
      if (mezoPrice === null) {
        const gt = await fetchGeckoTerminalDailyClose(
          mezoGeckoTerminalPool,
          epochStart,
        )
        if (gt.price !== null) {
          mezoPrice = gt.price
          mezoPriceSource = "geckoterminal-historical"
        } else {
          mezoGeckoTerminalError = gt.error
        }
      }

      if (btcPrice === null) {
        results.push({
          epoch_start: epochStart,
          btc_price: btcPrice,
          mezo_price: mezoPrice,
          mezo_price_source: mezoPriceSource,
          price_source: "skipped",
          updated: 0,
          gauges: typedRows.length,
          skipped_reason: "missing-btc-price",
          btc_error: btcResult.error ?? undefined,
          mezo_coingecko_error: mezoCoingeckoResult.error ?? undefined,
          mezo_geckoterminal_error: mezoGeckoTerminalError ?? undefined,
        })
        continue
      }

      // BTC known, MEZO unknown -> still a useful backfill: MEZO-denominated
      // incentives get usd_value=null, but BTC/stablecoin ones are valued
      // correctly. Tag the row so we don't retry endlessly.
      const priceSource = dryRun
        ? "dry-run"
        : mezoPrice === null
          ? "mezo-premarket"
          : mezoPriceSource === "geckoterminal-historical"
            ? "geckoterminal-historical"
            : "coingecko-historical"

      const { updated, gauges, subscription_recomputed } = await recomputeEpoch(
        supabase,
        publicClient,
        contracts.boostVoter as Address,
        contracts.veBTC as Address,
        veMEZOSupply,
        veBTCSupply,
        typedRows,
        epochStart,
        btcPrice,
        mezoPrice,
        priceSource,
        dryRun,
      )

      results.push({
        epoch_start: epochStart,
        btc_price: btcPrice,
        mezo_price: mezoPrice,
        mezo_price_source: mezoPriceSource,
        price_source: priceSource,
        updated,
        gauges,
        subscription_recomputed,
        mezo_coingecko_error:
          mezoPrice === null || mezoPriceSource !== "coingecko-historical"
            ? mezoCoingeckoResult.error ?? undefined
            : undefined,
        mezo_geckoterminal_error:
          mezoPrice === null ? mezoGeckoTerminalError ?? undefined : undefined,
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
