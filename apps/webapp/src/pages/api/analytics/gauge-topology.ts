import type { GaugeTopologyResponse } from "@/types/gaugeTopology"
import { chunkArray } from "@/utils/chunk"
import {
  BOOST_VOTER_ABI,
  CHAIN_ID,
  CONTRACTS,
  type SupportedChainId,
} from "@repo/shared/contracts"
import type { NextRequest } from "next/server"
import { type Address, createPublicClient, http } from "viem"

export const config = {
  runtime: "edge",
}

const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11"
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
const MULTICALL_CHUNK_SIZE = 200

const BRIBE_ABI = [
  {
    inputs: [],
    name: "rewardsListLength",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "rewards",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "uint256", name: "epochStart", type: "uint256" },
    ],
    name: "tokenRewardsPerEpoch",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const

const ERC20_METADATA_ABI = [
  {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
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

function getRpcUrl(chainId: SupportedChainId): string {
  if (chainId === CHAIN_ID.mainnet) {
    return process.env.NEXT_PUBLIC_RPC_MAINNET_URL ?? "https://rpc-internal.mezo.org"
  }

  return process.env.NEXT_PUBLIC_RPC_TESTNET_URL ??
    process.env.NEXT_PUBLIC_RPC_URL ??
    "https://rpc.test.mezo.org"
}

function getChain(chainId: SupportedChainId) {
  return {
    id: chainId,
    name: chainId === CHAIN_ID.mainnet ? "Mezo" : "Mezo Testnet",
    nativeCurrency: {
      decimals: 18,
      name: "Bitcoin",
      symbol: "BTC",
    },
    rpcUrls: {
      default: { http: [getRpcUrl(chainId)] },
    },
    contracts: {
      multicall3: {
        address: MULTICALL3_ADDRESS as Address,
      },
    },
  }
}

async function multicallInChunks(
  client: ReturnType<typeof createPublicClient>,
  contracts: readonly unknown[],
) {
  const chunks = chunkArray([...contracts], MULTICALL_CHUNK_SIZE)
  const results: Array<{ status: "success" | "failure"; result?: unknown }> = []

  for (const chunk of chunks) {
    const chunkResults = (await client.multicall({
      contracts: chunk as never,
      allowFailure: true,
    })) as Array<{ status: "success" | "failure"; result?: unknown }>

    results.push(...chunkResults)
  }

  return results
}

function isSupportedChainId(value: number): value is SupportedChainId {
  return value === CHAIN_ID.mainnet || value === CHAIN_ID.testnet
}

export default async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const rawChainId = Number(searchParams.get("chainId") ?? CHAIN_ID.testnet)

  if (!isSupportedChainId(rawChainId)) {
    return new Response("Invalid chainId", { status: 400 })
  }

  const chainId = rawChainId as SupportedChainId
  const contractAddresses =
    chainId === CHAIN_ID.mainnet ? CONTRACTS.mainnet : CONTRACTS.testnet

  const client = createPublicClient({
    chain: getChain(chainId),
    transport: http(),
  })

  try {
    const now = BigInt(Math.floor(Date.now() / 1000))
    const [lengthData, epochStartData] = await Promise.all([
      client.readContract({
        address: contractAddresses.boostVoter,
        abi: BOOST_VOTER_ABI,
        functionName: "length",
      }),
      client.readContract({
        address: contractAddresses.boostVoter,
        abi: BOOST_VOTER_ABI,
        functionName: "epochStart",
        args: [now],
      }),
    ])

    const gaugeCount = Number(lengthData ?? 0n)
    const epochStart = (epochStartData as bigint | undefined) ?? 0n

    const gaugeContracts = Array.from({ length: gaugeCount }, (_, index) => ({
      address: contractAddresses.boostVoter,
      abi: BOOST_VOTER_ABI,
      functionName: "gauges" as const,
      args: [BigInt(index)],
    }))

    const gaugeResults = await multicallInChunks(client, gaugeContracts)
    const gaugeAddresses = gaugeResults
      .map((result) =>
        result.status === "success" ? (result.result as Address | undefined) : undefined,
      )
      .filter((value): value is Address => !!value && value !== ZERO_ADDRESS)

    const bribeContracts = gaugeAddresses.map((gaugeAddress) => ({
      address: contractAddresses.boostVoter,
      abi: BOOST_VOTER_ABI,
      functionName: "gaugeToBribe" as const,
      args: [gaugeAddress],
    }))

    const bribeResults = await multicallInChunks(client, bribeContracts)
    const gaugeToBribe = new Map<string, Address | null>()
    const uniqueBribes = new Set<Address>()

    gaugeAddresses.forEach((gaugeAddress, index) => {
      const bribeAddress =
        bribeResults[index]?.status === "success"
          ? (bribeResults[index]?.result as Address | undefined)
          : undefined

      if (bribeAddress && bribeAddress !== ZERO_ADDRESS) {
        const normalized = bribeAddress.toLowerCase() as Address
        gaugeToBribe.set(gaugeAddress.toLowerCase(), normalized)
        uniqueBribes.add(normalized)
      } else {
        gaugeToBribe.set(gaugeAddress.toLowerCase(), null)
      }
    })

    const bribeAddresses = Array.from(uniqueBribes)

    const rewardLengthContracts = bribeAddresses.map((bribeAddress) => ({
      address: bribeAddress,
      abi: BRIBE_ABI,
      functionName: "rewardsListLength" as const,
    }))

    const rewardLengthResults = await multicallInChunks(client, rewardLengthContracts)

    const rewardTokenQueries: Array<{ bribeAddress: Address; index: number }> = []
    bribeAddresses.forEach((bribeAddress, index) => {
      const rewardsLength =
        rewardLengthResults[index]?.status === "success"
          ? Number(rewardLengthResults[index]?.result ?? 0n)
          : 0

      for (let rewardIndex = 0; rewardIndex < rewardsLength; rewardIndex += 1) {
        rewardTokenQueries.push({
          bribeAddress,
          index: rewardIndex,
        })
      }
    })

    const rewardTokenContracts = rewardTokenQueries.map((query) => ({
      address: query.bribeAddress,
      abi: BRIBE_ABI,
      functionName: "rewards" as const,
      args: [BigInt(query.index)],
    }))

    const rewardTokenResults = await multicallInChunks(client, rewardTokenContracts)

    const bribeToRewardTokens = new Map<string, Address[]>()
    rewardTokenQueries.forEach((query, index) => {
      const tokenAddress =
        rewardTokenResults[index]?.status === "success"
          ? (rewardTokenResults[index]?.result as Address | undefined)
          : undefined

      if (!tokenAddress || tokenAddress === ZERO_ADDRESS) return

      const bribeKey = query.bribeAddress.toLowerCase()
      const existing = bribeToRewardTokens.get(bribeKey) ?? []
      existing.push(tokenAddress.toLowerCase() as Address)
      bribeToRewardTokens.set(bribeKey, existing)
    })

    const uniqueRewardTokens = Array.from(
      new Set(
        Array.from(bribeToRewardTokens.values())
          .flat()
          .map((tokenAddress) => tokenAddress.toLowerCase() as Address),
      ),
    )

    const tokenMetadataContracts = uniqueRewardTokens.flatMap((tokenAddress) => [
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
    ])

    const tokenMetadataResults = await multicallInChunks(client, tokenMetadataContracts)

    const tokenMetadata = new Map<string, { symbol: string; decimals: number }>()
    uniqueRewardTokens.forEach((tokenAddress, index) => {
      const symbolResult = tokenMetadataResults[index * 2]
      const decimalsResult = tokenMetadataResults[index * 2 + 1]

      const symbol =
        symbolResult?.status === "success"
          ? (symbolResult.result as string | undefined)
          : undefined
      const decimals =
        decimalsResult?.status === "success"
          ? Number(decimalsResult.result ?? 18)
          : 18

      tokenMetadata.set(tokenAddress.toLowerCase(), {
        symbol: symbol ?? "???",
        decimals,
      })
    })

    const epochAmountQueries: Array<{ bribeAddress: Address; tokenAddress: Address }> = []
    for (const [bribeKey, tokens] of bribeToRewardTokens.entries()) {
      for (const tokenAddress of tokens) {
        epochAmountQueries.push({
          bribeAddress: bribeKey as Address,
          tokenAddress,
        })
      }
    }

    const epochAmountContracts = epochAmountQueries.map((query) => ({
      address: query.bribeAddress,
      abi: BRIBE_ABI,
      functionName: "tokenRewardsPerEpoch" as const,
      args: [query.tokenAddress, epochStart],
    }))

    const epochAmountResults = await multicallInChunks(client, epochAmountContracts)
    const bribeTokenToAmount = new Map<string, bigint>()

    epochAmountQueries.forEach((query, index) => {
      const amount =
        epochAmountResults[index]?.status === "success"
          ? (epochAmountResults[index]?.result as bigint | undefined)
          : undefined

      bribeTokenToAmount.set(
        `${query.bribeAddress.toLowerCase()}-${query.tokenAddress.toLowerCase()}`,
        amount ?? 0n,
      )
    })

    const response: GaugeTopologyResponse = {
      chainId,
      generatedAt: new Date().toISOString(),
      epochStart: epochStart.toString(),
      gauges: gaugeAddresses.map((gaugeAddress) => {
        const gaugeKey = gaugeAddress.toLowerCase()
        const bribeAddress = gaugeToBribe.get(gaugeKey) ?? null
        const rewardTokens =
          bribeAddress !== null
            ? (bribeToRewardTokens.get(bribeAddress.toLowerCase()) ?? []).map(
                (tokenAddress) => {
                  const tokenKey = tokenAddress.toLowerCase()
                  const metadata = tokenMetadata.get(tokenKey)
                  const amount =
                    bribeTokenToAmount.get(
                      `${bribeAddress.toLowerCase()}-${tokenKey}`,
                    ) ?? 0n

                  return {
                    tokenAddress,
                    symbol: metadata?.symbol ?? "???",
                    decimals: metadata?.decimals ?? 18,
                    epochAmount: amount.toString(),
                  }
                },
              )
            : []

        return {
          gaugeAddress: gaugeAddress.toLowerCase() as Address,
          bribeAddress,
          rewardTokens,
        }
      }),
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30",
      },
    })
  } catch (error) {
    console.error("gauge-topology api error", error)
    return new Response("Failed to fetch gauge topology", { status: 500 })
  }
}
