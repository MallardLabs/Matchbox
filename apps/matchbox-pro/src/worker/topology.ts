import {
  BOOST_VOTER_ABI,
  CHAIN_ID,
  CONTRACTS,
  type SupportedChainId,
} from "@repo/shared/contracts"
import type { Address } from "viem"
import { chunkArray } from "../lib/chunk"
import type { GaugeTopologyResponse } from "../lib/topology"
import createMezoClient from "./mezoClient"

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

type MulticallResult = { status: "success" | "failure"; result?: unknown }

async function multicallInChunks(
  client: ReturnType<typeof createMezoClient>,
  contracts: readonly unknown[],
): Promise<MulticallResult[]> {
  const chunks = await Promise.all(
    chunkArray([...contracts], MULTICALL_CHUNK_SIZE).map(
      (chunk) =>
        client.multicall({
          contracts: chunk as never,
          allowFailure: true,
        }) as Promise<MulticallResult[]>,
    ),
  )
  return chunks.flat()
}

export async function computeGaugeTopology(
  chainId: SupportedChainId,
): Promise<GaugeTopologyResponse> {
  const contractAddresses =
    chainId === CHAIN_ID.mainnet ? CONTRACTS.mainnet : CONTRACTS.testnet
  const client = createMezoClient(chainId)

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
  const gaugeResults = await multicallInChunks(
    client,
    Array.from({ length: gaugeCount }, (_, index) => ({
      address: contractAddresses.boostVoter,
      abi: BOOST_VOTER_ABI,
      functionName: "gauges" as const,
      args: [BigInt(index)],
    })),
  )
  const gaugeAddresses = gaugeResults
    .map((result) =>
      result.status === "success"
        ? (result.result as Address | undefined)
        : undefined,
    )
    .filter((value): value is Address => !!value && value !== ZERO_ADDRESS)

  const bribeResults = await multicallInChunks(
    client,
    gaugeAddresses.map((gaugeAddress) => ({
      address: contractAddresses.boostVoter,
      abi: BOOST_VOTER_ABI,
      functionName: "gaugeToBribe" as const,
      args: [gaugeAddress],
    })),
  )

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
  const rewardLengthResults = await multicallInChunks(
    client,
    bribeAddresses.map((bribeAddress) => ({
      address: bribeAddress,
      abi: BRIBE_ABI,
      functionName: "rewardsListLength" as const,
    })),
  )

  const rewardTokenQueries: Array<{ bribeAddress: Address; index: number }> = []
  bribeAddresses.forEach((bribeAddress, index) => {
    const rewardsLength =
      rewardLengthResults[index]?.status === "success"
        ? Number(rewardLengthResults[index]?.result ?? 0n)
        : 0
    for (let rewardIndex = 0; rewardIndex < rewardsLength; rewardIndex += 1) {
      rewardTokenQueries.push({ bribeAddress, index: rewardIndex })
    }
  })

  const rewardTokenResults = await multicallInChunks(
    client,
    rewardTokenQueries.map((query) => ({
      address: query.bribeAddress,
      abi: BRIBE_ABI,
      functionName: "rewards" as const,
      args: [BigInt(query.index)],
    })),
  )

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
    new Set(Array.from(bribeToRewardTokens.values()).flat()),
  )
  const epochAmountQueries: Array<{
    bribeAddress: Address
    tokenAddress: Address
  }> = []
  for (const [bribeKey, tokens] of bribeToRewardTokens.entries()) {
    for (const tokenAddress of tokens) {
      epochAmountQueries.push({
        bribeAddress: bribeKey as Address,
        tokenAddress,
      })
    }
  }
  // Metadata and epoch amounts are independent reads.
  const [tokenMetadataResults, epochAmountResults] = await Promise.all([
    multicallInChunks(
      client,
      uniqueRewardTokens.flatMap((tokenAddress) => [
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
      ]),
    ),
    multicallInChunks(
      client,
      epochAmountQueries.map((query) => ({
        address: query.bribeAddress,
        abi: BRIBE_ABI,
        functionName: "tokenRewardsPerEpoch" as const,
        args: [query.tokenAddress, epochStart],
      })),
    ),
  ])
  const tokenMetadata = new Map<string, { symbol: string; decimals: number }>()
  uniqueRewardTokens.forEach((tokenAddress, index) => {
    const symbolResult = tokenMetadataResults[index * 2]
    const decimalsResult = tokenMetadataResults[index * 2 + 1]
    tokenMetadata.set(tokenAddress.toLowerCase(), {
      symbol:
        symbolResult?.status === "success"
          ? ((symbolResult.result as string | undefined) ?? "???")
          : "???",
      decimals:
        decimalsResult?.status === "success"
          ? Number(decimalsResult.result ?? 18)
          : 18,
    })
  })

  const bribeTokenToAmount = new Map<string, bigint>()
  epochAmountQueries.forEach((query, index) => {
    const amount =
      epochAmountResults[index]?.status === "success"
        ? ((epochAmountResults[index]?.result as bigint | undefined) ?? 0n)
        : 0n
    bribeTokenToAmount.set(
      `${query.bribeAddress.toLowerCase()}:${query.tokenAddress.toLowerCase()}`,
      amount,
    )
  })

  return {
    chainId,
    generatedAt: new Date().toISOString(),
    epochStart: epochStart.toString(),
    gauges: gaugeAddresses.map((gaugeAddress) => {
      const bribeAddress = gaugeToBribe.get(gaugeAddress.toLowerCase()) ?? null
      const tokens = bribeAddress
        ? (bribeToRewardTokens.get(bribeAddress.toLowerCase()) ?? [])
        : []
      return {
        gaugeAddress,
        bribeAddress,
        rewardTokens: tokens.map((tokenAddress) => {
          const meta = tokenMetadata.get(tokenAddress.toLowerCase())
          const amount = bribeAddress
            ? (bribeTokenToAmount.get(
                `${bribeAddress.toLowerCase()}:${tokenAddress.toLowerCase()}`,
              ) ?? 0n)
            : 0n
          return {
            tokenAddress,
            symbol: meta?.symbol ?? "???",
            decimals: meta?.decimals ?? 18,
            epochAmount: amount.toString(),
          }
        }),
      }
    }),
  }
}
