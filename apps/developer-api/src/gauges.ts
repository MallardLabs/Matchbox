import {
  BOOST_VOTER_ABI,
  BRIBE_ABI,
  CHAIN_ID,
  CONTRACTS,
} from "@repo/shared/contracts"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  http,
  type Address,
  createPublicClient,
  formatUnits,
  getAddress,
  isAddress,
} from "viem"
import { gaugeProfileSchema } from "./schemas"
import type { Environment } from "./types"

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
const ERC20_METADATA_ABI = [
  {
    inputs: [],
    name: "symbol",
    outputs: [{ type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const

export type GaugeLookup =
  | { type: "address"; value: string }
  | { type: "token-id"; value: string }

function createMezoClient(environment: Environment) {
  return createPublicClient({
    chain: {
      id: CHAIN_ID.mainnet,
      name: "Mezo",
      nativeCurrency: { decimals: 18, name: "Bitcoin", symbol: "BTC" },
      rpcUrls: { default: { http: [environment.MEZO_RPC_URL] } },
    },
    transport: http(environment.MEZO_RPC_URL, {
      batch: true,
      retryCount: 1,
      timeout: 10_000,
    }),
  })
}

async function resolveGaugeAddress(
  lookup: GaugeLookup,
  environment: Environment,
): Promise<Address | null> {
  if (lookup.type === "address") {
    return isAddress(lookup.value) ? getAddress(lookup.value) : null
  }
  if (!/^\d+$/.test(lookup.value)) return null
  const client = createMezoClient(environment)
  const address = await client.readContract({
    address: CONTRACTS.mainnet.boostVoter,
    abi: BOOST_VOTER_ABI,
    functionName: "boostableTokenIdToGauge",
    args: [BigInt(lookup.value)],
  })
  return address === ZERO_ADDRESS ? null : getAddress(address)
}

async function fetchRewardTokens(
  bribeAddress: Address,
  epochStart: bigint,
  environment: Environment,
) {
  const client = createMezoClient(environment)
  const length = await client.readContract({
    address: bribeAddress,
    abi: BRIBE_ABI,
    functionName: "rewardsListLength",
  })
  if (length === 0n) return []

  const addressResults = await client.multicall({
    allowFailure: true,
    contracts: Array.from({ length: Number(length) }, (_, index) => ({
      address: bribeAddress,
      abi: BRIBE_ABI,
      functionName: "rewards" as const,
      args: [BigInt(index)],
    })),
  })
  const tokenAddresses = addressResults
    .map((result) => (result.status === "success" ? result.result : null))
    .filter((address): address is Address => address !== null)

  const detailResults = await client.multicall({
    allowFailure: true,
    contracts: tokenAddresses.flatMap((tokenAddress) => [
      {
        address: tokenAddress,
        abi: ERC20_METADATA_ABI,
        functionName: "symbol" as const,
      },
      {
        address: tokenAddress,
        abi: ERC20_METADATA_ABI,
        functionName: "decimals" as const,
      },
      {
        address: bribeAddress,
        abi: BRIBE_ABI,
        functionName: "tokenRewardsPerEpoch" as const,
        args: [tokenAddress, epochStart],
      },
    ]),
  })

  return tokenAddresses.map((tokenAddress, index) => {
    const symbolResult = detailResults[index * 3]
    const decimalsResult = detailResults[index * 3 + 1]
    const amountResult = detailResults[index * 3 + 2]
    const symbol =
      symbolResult?.status === "success" &&
      typeof symbolResult.result === "string"
        ? symbolResult.result
        : "UNKNOWN"
    const decimals =
      decimalsResult?.status === "success" &&
      typeof decimalsResult.result === "number"
        ? decimalsResult.result
        : 18
    const amount =
      amountResult?.status === "success" &&
      typeof amountResult.result === "bigint"
        ? amountResult.result
        : 0n
    return {
      tokenAddress: getAddress(tokenAddress),
      symbol,
      decimals,
      epochAmountRaw: amount.toString(),
      epochAmount: formatUnits(amount, decimals),
    }
  })
}

export async function getGauge(
  lookup: GaugeLookup,
  database: SupabaseClient,
  environment: Environment,
) {
  const gaugeAddress = await resolveGaugeAddress(lookup, environment)
  if (!gaugeAddress) return null

  const { data: rawProfile, error: profileError } = await database
    .from("gauge_profiles")
    .select("*")
    .eq("gauge_address", gaugeAddress.toLowerCase())
    .maybeSingle()
  if (profileError) throw new Error("Unable to load gauge profile")
  const parsedProfile = rawProfile
    ? gaugeProfileSchema.safeParse(rawProfile)
    : null
  const profile = parsedProfile?.success ? parsedProfile.data : null

  const client = createMezoClient(environment)
  const now = BigInt(Math.floor(Date.now() / 1000))
  const [isAlive, bribeAddress, epochStart] = await Promise.all([
    client.readContract({
      address: CONTRACTS.mainnet.boostVoter,
      abi: BOOST_VOTER_ABI,
      functionName: "isAlive",
      args: [gaugeAddress],
    }),
    client.readContract({
      address: CONTRACTS.mainnet.boostVoter,
      abi: BOOST_VOTER_ABI,
      functionName: "gaugeToBribe",
      args: [gaugeAddress],
    }),
    client.readContract({
      address: CONTRACTS.mainnet.boostVoter,
      abi: BOOST_VOTER_ABI,
      functionName: "epochStart",
      args: [now],
    }),
  ])
  const normalizedBribe =
    bribeAddress === ZERO_ADDRESS ? null : getAddress(bribeAddress)
  if (!profile && !normalizedBribe && !isAlive) return null
  const rewardTokens = normalizedBribe
    ? await fetchRewardTokens(normalizedBribe, epochStart, environment)
    : []
  const generatedAt = new Date().toISOString()

  return {
    object: "gauge",
    id: gaugeAddress,
    chainId: CHAIN_ID.mainnet,
    gaugeAddress,
    veBtcTokenId:
      lookup.type === "token-id"
        ? lookup.value
        : (profile?.vebtc_token_id ?? null),
    ownerAddress: profile?.owner_address
      ? getAddress(profile.owner_address)
      : null,
    profile: profile
      ? {
          displayName: profile.display_name,
          avatarUrl: profile.profile_picture_url,
          description: profile.description,
          websiteUrl: profile.website_url,
          socialLinks: profile.social_links,
          incentiveStrategy: profile.incentive_strategy,
          votingStrategy: profile.voting_strategy,
          tags: profile.tags ?? [],
          featured: profile.is_featured,
          updatedAt: profile.updated_at,
        }
      : null,
    state: {
      isAlive,
      bribeAddress: normalizedBribe,
      epochStart: epochStart.toString(),
      rewardTokens,
    },
    generatedAt,
  }
}
