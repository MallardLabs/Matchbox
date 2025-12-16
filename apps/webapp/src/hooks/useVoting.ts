import { getContractConfig } from "@/config/contracts"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useMemo } from "react"
import type { Address, Hex } from "viem"
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi"

type VoteStateResult = {
  lastVoted: bigint | undefined
  usedWeight: bigint | undefined
  canVoteInCurrentEpoch: boolean
  hasVotedThisEpoch: boolean | undefined // undefined while loading
  isInVotingWindow: boolean
  epochNext: bigint | undefined
  isLoading: boolean
}

export function useVoteState(tokenId: bigint | undefined): VoteStateResult {
  const contracts = getContractConfig(CHAIN_ID.testnet)
  // Stabilize the timestamp to avoid refetches on every render
  // Round to nearest minute to reduce query key changes
  const now = useMemo(() => {
    const timestamp = Math.floor(Date.now() / 1000)
    // Round to nearest 60 seconds to stabilize the query
    return BigInt(Math.floor(timestamp / 60) * 60)
  }, [])

  const { data, isLoading: isLoadingLastVoted } = useReadContract({
    ...contracts.boostVoter,
    functionName: "lastVoted",
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: {
      enabled: tokenId !== undefined,
    },
  })

  const { data: usedWeight, isLoading: isLoadingUsedWeight } = useReadContract({
    ...contracts.boostVoter,
    functionName: "usedWeights",
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: {
      enabled: tokenId !== undefined,
    },
  })

  const { data: epochNextData, isLoading: isLoadingEpochNext } =
    useReadContract({
      ...contracts.boostVoter,
      functionName: "epochNext",
      args: [now],
    })

  const lastVoted = data as bigint | undefined
  const epochNext = epochNextData as bigint | undefined

  // Track overall loading state for vote-related data
  const isLoading =
    tokenId !== undefined
      ? isLoadingLastVoted || isLoadingEpochNext
      : isLoadingEpochNext

  // Contract check: epochStart(block.timestamp) <= lastVoted[_tokenId]
  // epochStart = epochNext - 604800 (7 days)
  const epochStart = epochNext !== undefined ? epochNext - 604800n : undefined

  // Use current time for voting window check (not the stabilized one)
  const currentTime = BigInt(Math.floor(Date.now() / 1000))

  // Determine voting state only when all data is loaded
  // Return undefined while loading to prevent flickering
  const hasVotedThisEpoch = useMemo(() => {
    if (tokenId === undefined) return undefined
    if (lastVoted === undefined || epochStart === undefined) return undefined
    return lastVoted >= epochStart
  }, [tokenId, lastVoted, epochStart])

  // Also check we're in the voting window (after first hour, before last hour)
  // epochVoteStart = epochStart + 1 hour
  // epochVoteEnd = epochNext - 1 hour
  const epochVoteStart =
    epochStart !== undefined ? epochStart + 3600n : undefined
  const epochVoteEnd = epochNext !== undefined ? epochNext - 3600n : undefined
  const isInVotingWindow =
    epochVoteStart !== undefined && epochVoteEnd !== undefined
      ? currentTime > epochVoteStart && currentTime <= epochVoteEnd
      : true

  const canVoteInCurrentEpoch = hasVotedThisEpoch === false && isInVotingWindow

  return {
    lastVoted,
    usedWeight: usedWeight as bigint | undefined,
    canVoteInCurrentEpoch,
    hasVotedThisEpoch,
    isInVotingWindow,
    epochNext,
    isLoading,
  }
}

type WriteHookResult = {
  hash: Hex | undefined
  isPending: boolean
  isConfirming: boolean
  isSuccess: boolean
  error: Error | null
}

type CreateBoostGaugeResult = WriteHookResult & {
  createGauge: (
    veBTCTokenId: bigint,
    bribeTokens?: Address[],
    bribeAmounts?: bigint[],
  ) => void
}

export function useCreateBoostGauge(): CreateBoostGaugeResult {
  const contracts = getContractConfig(CHAIN_ID.testnet)
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const createGauge = (
    veBTCTokenId: bigint,
    bribeTokens: Address[] = [],
    bribeAmounts: bigint[] = [],
  ) => {
    const { address, abi } = contracts.boostVoter
    const gaugeFactoryAddress = contracts.gaugeFactory.address

    if (!address || !gaugeFactoryAddress) {
      return
    }

    writeContract({
      address,
      abi,
      functionName: "createBoostGauge",
      args: [gaugeFactoryAddress, veBTCTokenId, bribeTokens, bribeAmounts],
    })
  }

  return {
    createGauge,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  }
}

type VoteOnGaugeResult = WriteHookResult & {
  vote: (
    veMEZOTokenId: bigint,
    gaugeAddresses: Address[],
    weights: bigint[],
  ) => void
}

export function useVoteOnGauge(): VoteOnGaugeResult {
  const contracts = getContractConfig(CHAIN_ID.testnet)
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const vote = (
    veMEZOTokenId: bigint,
    gaugeAddresses: Address[],
    weights: bigint[],
  ) => {
    const { address, abi } = contracts.boostVoter
    if (!address) return

    writeContract({
      address,
      abi,
      functionName: "vote",
      args: [veMEZOTokenId, gaugeAddresses, weights],
    })
  }

  return {
    vote,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  }
}

type ResetVoteResult = WriteHookResult & {
  reset: (veMEZOTokenId: bigint) => void
}

export function useResetVote(): ResetVoteResult {
  const contracts = getContractConfig(CHAIN_ID.testnet)
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const reset = (veMEZOTokenId: bigint) => {
    const { address, abi } = contracts.boostVoter
    if (!address) return

    writeContract({
      address,
      abi,
      functionName: "reset",
      args: [veMEZOTokenId],
    })
  }

  return {
    reset,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  }
}

type PokeBoostResult = WriteHookResult & {
  pokeBoost: (veBTCTokenId: bigint) => void
}

export function usePokeBoost(): PokeBoostResult {
  const contracts = getContractConfig(CHAIN_ID.testnet)
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const pokeBoost = (veBTCTokenId: bigint) => {
    const { address, abi } = contracts.boostVoter
    if (!address) return

    writeContract({
      address,
      abi,
      functionName: "pokeBoost",
      args: [veBTCTokenId],
    })
  }

  return {
    pokeBoost,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  }
}

type RefetchFn = () => Promise<unknown>

export function useBribeAddress(gaugeAddress: Address | undefined): {
  bribeAddress: Address | undefined
  hasBribe: boolean
  isLoading: boolean
  refetch: RefetchFn
} {
  const contracts = getContractConfig(CHAIN_ID.testnet)

  const { data, isLoading, refetch } = useReadContract({
    ...contracts.boostVoter,
    functionName: "gaugeToBribe",
    args: gaugeAddress ? [gaugeAddress] : undefined,
    query: {
      enabled: !!gaugeAddress,
    },
  })

  const bribeAddress = data as Address | undefined
  const hasBribe =
    bribeAddress !== undefined &&
    bribeAddress !== "0x0000000000000000000000000000000000000000"

  return {
    bribeAddress: hasBribe ? bribeAddress : undefined,
    hasBribe,
    isLoading,
    refetch,
  }
}

export type BribeIncentive = {
  tokenAddress: Address
  symbol: string
  decimals: number
  amount: bigint
}

const EPOCH_DURATION = 7 * 24 * 60 * 60 // 7 days in seconds

function getEpochStart(timestamp: number): bigint {
  return BigInt(Math.floor(timestamp / EPOCH_DURATION) * EPOCH_DURATION)
}

export function useBribeIncentives(bribeAddress: Address | undefined): {
  incentives: BribeIncentive[]
  isLoading: boolean
  refetch: RefetchFn
} {
  const { data: lengthData, isLoading: isLoadingLength } = useReadContract({
    address: bribeAddress,
    abi: [
      {
        inputs: [],
        name: "rewardsListLength",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
    ] as const,
    functionName: "rewardsListLength",
    query: {
      enabled: !!bribeAddress,
    },
  })

  const length = Number(lengthData ?? 0n)

  // Fetch reward token addresses
  const { data: rewardTokensData, isLoading: isLoadingTokens } =
    useReadContracts({
      contracts: Array.from({ length }, (_, i) => ({
        address: bribeAddress,
        abi: [
          {
            inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
            name: "rewards",
            outputs: [{ internalType: "address", name: "", type: "address" }],
            stateMutability: "view",
            type: "function",
          },
        ] as const,
        functionName: "rewards" as const,
        args: [BigInt(i)],
      })),
      query: {
        enabled: !!bribeAddress && length > 0,
      },
    })

  const tokenAddresses =
    rewardTokensData?.map((r) => r.result as Address).filter(Boolean) ?? []

  // Get current epoch start
  const currentEpochStart = getEpochStart(Math.floor(Date.now() / 1000))

  // Fetch token rewards for current epoch
  const { data: amountsData, isLoading: isLoadingAmounts } = useReadContracts({
    contracts: tokenAddresses.map((tokenAddress) => ({
      address: bribeAddress,
      abi: [
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
      ] as const,
      functionName: "tokenRewardsPerEpoch" as const,
      args: [tokenAddress, currentEpochStart],
    })),
    query: {
      enabled: tokenAddresses.length > 0,
    },
  })

  // Fetch token metadata (symbol and decimals)
  const {
    data: metadataData,
    isLoading: isLoadingMetadata,
    refetch,
  } = useReadContracts({
    contracts: tokenAddresses.flatMap((tokenAddress) => [
      {
        address: tokenAddress,
        abi: [
          {
            inputs: [],
            name: "symbol",
            outputs: [{ internalType: "string", name: "", type: "string" }],
            stateMutability: "view",
            type: "function",
          },
        ] as const,
        functionName: "symbol" as const,
      },
      {
        address: tokenAddress,
        abi: [
          {
            inputs: [],
            name: "decimals",
            outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
            stateMutability: "view",
            type: "function",
          },
        ] as const,
        functionName: "decimals" as const,
      },
    ]),
    query: {
      enabled: tokenAddresses.length > 0,
    },
  })

  const incentives: BribeIncentive[] = tokenAddresses.map(
    (tokenAddress, i) => ({
      tokenAddress,
      symbol: (metadataData?.[i * 2]?.result as string) ?? "???",
      decimals: Number(metadataData?.[i * 2 + 1]?.result ?? 18),
      amount: (amountsData?.[i]?.result as bigint) ?? 0n,
    }),
  )

  return {
    incentives: incentives.filter((i) => i.amount > 0n),
    isLoading:
      isLoadingLength ||
      isLoadingTokens ||
      isLoadingAmounts ||
      isLoadingMetadata,
    refetch,
  }
}

export function useTokenAllowance(
  tokenAddress: Address | undefined,
  spenderAddress: Address | undefined,
): {
  allowance: bigint | undefined
  isLoading: boolean
  refetch: RefetchFn
} {
  const { address: userAddress } = useAccount()

  const { data, isLoading, refetch } = useReadContract({
    address: tokenAddress,
    abi: [
      {
        inputs: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
        ],
        name: "allowance",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
    ] as const,
    functionName: "allowance",
    args:
      userAddress && spenderAddress ? [userAddress, spenderAddress] : undefined,
    query: {
      enabled: !!tokenAddress && !!spenderAddress && !!userAddress,
    },
  })

  return {
    allowance: data as bigint | undefined,
    isLoading,
    refetch,
  }
}

export function useApproveToken(): {
  approve: (tokenAddress: Address, spenderAddress: Address) => void
  hash: Hex | undefined
  isPending: boolean
  isConfirming: boolean
  isSuccess: boolean
  error: Error | null
  reset: () => void
} {
  const {
    writeContract,
    data: hash,
    isPending,
    error,
    reset,
  } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const approve = (tokenAddress: Address, spenderAddress: Address) => {
    writeContract({
      address: tokenAddress,
      abi: [
        {
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          name: "approve",
          outputs: [{ name: "", type: "bool" }],
          stateMutability: "nonpayable",
          type: "function",
        },
      ] as const,
      functionName: "approve",
      args: [spenderAddress, BigInt(2) ** BigInt(256) - BigInt(1)], // max approval
    })
  }

  return {
    approve,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  }
}

type AddIncentivesResult = WriteHookResult & {
  addIncentives: (
    gaugeAddress: Address,
    tokens: Address[],
    amounts: bigint[],
  ) => void
}

export function useBoostVoterAddress(): Address | undefined {
  const contracts = getContractConfig(CHAIN_ID.testnet)
  return contracts.boostVoter.address
}

export function useIsAllowlistedToken(tokenAddress: Address | undefined): {
  isAllowlisted: boolean | undefined
  isLoading: boolean
} {
  const contracts = getContractConfig(CHAIN_ID.testnet)

  const { data, isLoading } = useReadContract({
    ...contracts.boostVoter,
    functionName: "isWhitelistedToken",
    args: tokenAddress ? [tokenAddress] : undefined,
    query: {
      enabled: !!tokenAddress,
    },
  })

  return {
    isAllowlisted: data as boolean | undefined,
    isLoading,
  }
}

export type VoteAllocation = {
  gaugeAddress: Address
  weight: bigint
}

export function useVoteAllocations(
  tokenId: bigint | undefined,
  gaugeAddresses: Address[],
): {
  allocations: VoteAllocation[]
  isLoading: boolean
} {
  const contracts = getContractConfig(CHAIN_ID.testnet)

  const { data, isLoading } = useReadContracts({
    contracts: gaugeAddresses.map((gaugeAddress) => ({
      ...contracts.boostVoter,
      functionName: "votes",
      args: tokenId !== undefined ? [tokenId, gaugeAddress] : undefined,
    })),
    query: {
      enabled: tokenId !== undefined && gaugeAddresses.length > 0,
    },
  })

  const allocations: VoteAllocation[] = gaugeAddresses
    .map((gaugeAddress, i) => ({
      gaugeAddress,
      weight: (data?.[i]?.result as bigint) ?? 0n,
    }))
    .filter((a) => a.weight > 0n)

  return {
    allocations,
    isLoading,
  }
}

/**
 * Get vote allocations for multiple veMEZO tokens at once and aggregate them.
 * Returns both per-token allocations and aggregated allocations across all tokens.
 */
export function useAllVoteAllocations(
  tokenIds: bigint[],
  gaugeAddresses: Address[],
): {
  allocationsByToken: Map<string, VoteAllocation[]>
  aggregatedAllocations: VoteAllocation[]
  isLoading: boolean
} {
  const contracts = getContractConfig(CHAIN_ID.testnet)

  // Query votes for all tokenId + gauge combinations
  const { data, isLoading } = useReadContracts({
    contracts: tokenIds.flatMap((tokenId) =>
      gaugeAddresses.map((gaugeAddress) => ({
        ...contracts.boostVoter,
        functionName: "votes",
        args: [tokenId, gaugeAddress],
      })),
    ),
    query: {
      enabled: tokenIds.length > 0 && gaugeAddresses.length > 0,
    },
  })

  // Build allocations per token and aggregated
  const allocationsByToken = useMemo(() => {
    const map = new Map<string, VoteAllocation[]>()
    tokenIds.forEach((tokenId, tokenIndex) => {
      const tokenAllocations: VoteAllocation[] = []
      gaugeAddresses.forEach((gaugeAddress, gaugeIndex) => {
        const dataIndex = tokenIndex * gaugeAddresses.length + gaugeIndex
        const weight = (data?.[dataIndex]?.result as bigint) ?? 0n
        if (weight > 0n) {
          tokenAllocations.push({ gaugeAddress, weight })
        }
      })
      map.set(tokenId.toString(), tokenAllocations)
    })
    return map
  }, [data, tokenIds, gaugeAddresses])

  const aggregatedAllocations = useMemo(() => {
    const aggregatedWeights = new Map<string, bigint>()
    tokenIds.forEach((tokenId, tokenIndex) => {
      gaugeAddresses.forEach((gaugeAddress, gaugeIndex) => {
        const dataIndex = tokenIndex * gaugeAddresses.length + gaugeIndex
        const weight = (data?.[dataIndex]?.result as bigint) ?? 0n
        if (weight > 0n) {
          const gaugeKey = gaugeAddress.toLowerCase()
          const existing = aggregatedWeights.get(gaugeKey) ?? 0n
          aggregatedWeights.set(gaugeKey, existing + weight)
        }
      })
    })
    return Array.from(aggregatedWeights.entries()).map(
      ([gaugeKey, weight]) => ({
        gaugeAddress: gaugeAddresses.find(
          (g) => g.toLowerCase() === gaugeKey,
        ) as Address,
        weight,
      }),
    )
  }, [data, tokenIds, gaugeAddresses])

  return {
    allocationsByToken,
    aggregatedAllocations,
    isLoading,
  }
}

/**
 * Get used weights for multiple veMEZO tokens at once.
 * Returns both per-token weights and total across all tokens.
 */
export function useAllUsedWeights(tokenIds: bigint[]): {
  usedWeightsByToken: Map<string, bigint>
  totalUsedWeight: bigint
  isLoading: boolean
} {
  const contracts = getContractConfig(CHAIN_ID.testnet)

  const { data, isLoading } = useReadContracts({
    contracts: tokenIds.map((tokenId) => ({
      ...contracts.boostVoter,
      functionName: "usedWeights",
      args: [tokenId],
    })),
    query: {
      enabled: tokenIds.length > 0,
    },
  })

  const result = useMemo(() => {
    const usedWeightsByToken = new Map<string, bigint>()
    let totalUsedWeight = 0n
    tokenIds.forEach((tokenId, i) => {
      const weight = (data?.[i]?.result as bigint) ?? 0n
      usedWeightsByToken.set(tokenId.toString(), weight)
      totalUsedWeight += weight
    })
    return { usedWeightsByToken, totalUsedWeight }
  }, [data, tokenIds])

  return {
    ...result,
    isLoading,
  }
}

export function useAddIncentives(): AddIncentivesResult {
  const contracts = getContractConfig(CHAIN_ID.testnet)
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const addIncentives = (
    gaugeAddress: Address,
    tokens: Address[],
    amounts: bigint[],
  ) => {
    const { address, abi } = contracts.boostVoter
    if (!address) return

    writeContract({
      address,
      abi,
      functionName: "addBribes",
      args: [gaugeAddress, tokens, amounts],
    })
  }

  return {
    addIncentives,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  }
}

export type ClaimableBribe = {
  tokenId: bigint
  bribeAddress: Address
  gaugeAddress: Address
  rewards: {
    tokenAddress: Address
    symbol: string
    decimals: number
    earned: bigint
  }[]
}

export function useClaimableBribes(veMEZOTokenIds: bigint[]): {
  claimableBribes: ClaimableBribe[]
  totalClaimable: Map<
    Address,
    { symbol: string; decimals: number; amount: bigint }
  >
  isLoading: boolean
  refetch: RefetchFn
} {
  const contracts = getContractConfig(CHAIN_ID.testnet)

  // First, get the list of all gauges
  const { data: lengthData, isLoading: isLoadingLength } = useReadContract({
    ...contracts.boostVoter,
    functionName: "length",
  })

  const length = Number(lengthData ?? 0n)

  // Get all gauge addresses
  const { data: gaugeAddressesData, isLoading: isLoadingGauges } =
    useReadContracts({
      contracts: Array.from({ length }, (_, i) => ({
        ...contracts.boostVoter,
        functionName: "gauges",
        args: [BigInt(i)],
      })),
      query: {
        enabled: length > 0,
      },
    })

  const gaugeAddresses =
    gaugeAddressesData?.map((r) => r.result as Address).filter(Boolean) ?? []

  // Get bribe addresses for all gauges
  const { data: bribeAddressesData, isLoading: isLoadingBribes } =
    useReadContracts({
      contracts: gaugeAddresses.map((gaugeAddr) => ({
        ...contracts.boostVoter,
        functionName: "gaugeToBribe",
        args: [gaugeAddr],
      })),
      query: {
        enabled: gaugeAddresses.length > 0,
      },
    })

  // Build gauge -> bribe mapping
  const gaugeToBribe = new Map<string, Address>()
  gaugeAddresses.forEach((gauge, i) => {
    const bribe = bribeAddressesData?.[i]?.result as Address | undefined
    if (bribe && bribe !== "0x0000000000000000000000000000000000000000") {
      gaugeToBribe.set(gauge.toLowerCase(), bribe)
    }
  })

  const bribeAddresses = Array.from(new Set(gaugeToBribe.values()))

  // Get reward token list length for each bribe
  const { data: rewardLengthsData, isLoading: isLoadingRewardLengths } =
    useReadContracts({
      contracts: bribeAddresses.map((bribeAddr) => ({
        address: bribeAddr,
        abi: [
          {
            inputs: [],
            name: "rewardsListLength",
            outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function",
          },
        ] as const,
        functionName: "rewardsListLength" as const,
      })),
      query: {
        enabled: bribeAddresses.length > 0,
      },
    })

  // Build queries for all reward tokens
  const rewardTokenQueries: { bribeAddress: Address; index: number }[] = []
  bribeAddresses.forEach((bribeAddr, i) => {
    const length = Number(rewardLengthsData?.[i]?.result ?? 0n)
    for (let j = 0; j < length; j++) {
      rewardTokenQueries.push({ bribeAddress: bribeAddr, index: j })
    }
  })

  // Get all reward token addresses
  const { data: rewardTokensData, isLoading: isLoadingTokens } =
    useReadContracts({
      contracts: rewardTokenQueries.map((q) => ({
        address: q.bribeAddress,
        abi: [
          {
            inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
            name: "rewards",
            outputs: [{ internalType: "address", name: "", type: "address" }],
            stateMutability: "view",
            type: "function",
          },
        ] as const,
        functionName: "rewards" as const,
        args: [BigInt(q.index)],
      })),
      query: {
        enabled: rewardTokenQueries.length > 0,
      },
    })

  // Build bribe -> reward tokens mapping
  const bribeToRewardTokens = new Map<string, Address[]>()
  rewardTokenQueries.forEach((q, i) => {
    const token = rewardTokensData?.[i]?.result as Address | undefined
    if (token) {
      const existing =
        bribeToRewardTokens.get(q.bribeAddress.toLowerCase()) ?? []
      existing.push(token)
      bribeToRewardTokens.set(q.bribeAddress.toLowerCase(), existing)
    }
  })

  // Get all unique reward tokens
  const allRewardTokens = Array.from(
    new Set(Array.from(bribeToRewardTokens.values()).flat()),
  )

  // Get token metadata (symbol and decimals)
  const { data: tokenMetadataData, isLoading: isLoadingMetadata } =
    useReadContracts({
      contracts: allRewardTokens.flatMap((tokenAddr) => [
        {
          address: tokenAddr,
          abi: [
            {
              inputs: [],
              name: "symbol",
              outputs: [{ internalType: "string", name: "", type: "string" }],
              stateMutability: "view",
              type: "function",
            },
          ] as const,
          functionName: "symbol" as const,
        },
        {
          address: tokenAddr,
          abi: [
            {
              inputs: [],
              name: "decimals",
              outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
              stateMutability: "view",
              type: "function",
            },
          ] as const,
          functionName: "decimals" as const,
        },
      ]),
      query: {
        enabled: allRewardTokens.length > 0,
      },
    })

  // Build token metadata map
  const tokenMetadata = new Map<string, { symbol: string; decimals: number }>()
  allRewardTokens.forEach((token, i) => {
    const symbol = tokenMetadataData?.[i * 2]?.result as string | undefined
    const decimals = tokenMetadataData?.[i * 2 + 1]?.result as
      | number
      | undefined
    tokenMetadata.set(token.toLowerCase(), {
      symbol: symbol ?? "???",
      decimals: decimals ?? 18,
    })
  })

  // Now query earned amounts for each veMEZO token for each bribe/token combo
  const earnedQueries: {
    tokenId: bigint
    bribeAddress: Address
    gaugeAddress: Address
    tokenAddress: Address
  }[] = []
  for (const tokenId of veMEZOTokenIds) {
    for (const [gaugeKey, bribeAddr] of gaugeToBribe.entries()) {
      const rewardTokens =
        bribeToRewardTokens.get(bribeAddr.toLowerCase()) ?? []
      const gaugeAddr = gaugeAddresses.find(
        (g) => g.toLowerCase() === gaugeKey,
      ) as Address
      for (const tokenAddr of rewardTokens) {
        earnedQueries.push({
          tokenId,
          bribeAddress: bribeAddr,
          gaugeAddress: gaugeAddr,
          tokenAddress: tokenAddr,
        })
      }
    }
  }

  const {
    data: earnedData,
    isLoading: isLoadingEarned,
    refetch,
  } = useReadContracts({
    contracts: earnedQueries.map((q) => ({
      address: q.bribeAddress,
      abi: [
        {
          inputs: [
            { internalType: "address", name: "token", type: "address" },
            { internalType: "uint256", name: "tokenId", type: "uint256" },
          ],
          name: "earned",
          outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ] as const,
      functionName: "earned" as const,
      args: [q.tokenAddress, q.tokenId],
    })),
    query: {
      enabled: earnedQueries.length > 0 && veMEZOTokenIds.length > 0,
    },
  })

  // Build claimable bribes result
  const claimableBribesMap = new Map<string, ClaimableBribe>()
  earnedQueries.forEach((q, i) => {
    const earned = earnedData?.[i]?.result as bigint | undefined
    if (earned && earned > 0n) {
      const key = `${q.tokenId.toString()}-${q.bribeAddress.toLowerCase()}`
      const existing = claimableBribesMap.get(key)
      const meta = tokenMetadata.get(q.tokenAddress.toLowerCase())

      const rewardInfo = {
        tokenAddress: q.tokenAddress,
        symbol: meta?.symbol ?? "???",
        decimals: meta?.decimals ?? 18,
        earned,
      }

      if (existing) {
        existing.rewards.push(rewardInfo)
      } else {
        claimableBribesMap.set(key, {
          tokenId: q.tokenId,
          bribeAddress: q.bribeAddress,
          gaugeAddress: q.gaugeAddress,
          rewards: [rewardInfo],
        })
      }
    }
  })

  const claimableBribes = Array.from(claimableBribesMap.values())

  // Calculate totals across all tokens
  const totalClaimable = new Map<
    Address,
    { symbol: string; decimals: number; amount: bigint }
  >()
  for (const bribe of claimableBribes) {
    for (const reward of bribe.rewards) {
      const existing = totalClaimable.get(reward.tokenAddress)
      if (existing) {
        existing.amount += reward.earned
      } else {
        totalClaimable.set(reward.tokenAddress, {
          symbol: reward.symbol,
          decimals: reward.decimals,
          amount: reward.earned,
        })
      }
    }
  }

  return {
    claimableBribes,
    totalClaimable,
    isLoading:
      isLoadingLength ||
      isLoadingGauges ||
      isLoadingBribes ||
      isLoadingRewardLengths ||
      isLoadingTokens ||
      isLoadingMetadata ||
      isLoadingEarned,
    refetch,
  }
}

type ClaimBribesResult = WriteHookResult & {
  claimBribes: (
    tokenId: bigint,
    bribes: { bribeAddress: Address; tokens: Address[] }[],
  ) => void
}

export function useClaimBribes(): ClaimBribesResult {
  const contracts = getContractConfig(CHAIN_ID.testnet)
  const { writeContract, data: hash, isPending, error } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  })

  const claimBribes = (
    tokenId: bigint,
    bribes: { bribeAddress: Address; tokens: Address[] }[],
  ) => {
    const { address, abi } = contracts.boostVoter
    if (!address || bribes.length === 0) return

    const bribeAddresses = bribes.map((b) => b.bribeAddress)
    const tokens = bribes.map((b) => b.tokens)

    writeContract({
      address,
      abi,
      functionName: "claimBribes",
      args: [bribeAddresses, tokens, tokenId],
    })
  }

  return {
    claimBribes,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
  }
}
