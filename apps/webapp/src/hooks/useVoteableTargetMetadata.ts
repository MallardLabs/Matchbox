import { useMemo } from "react"
import type { Address } from "viem"
import { useReadContracts } from "wagmi"

const TARGET_METADATA_ABI = [
  {
    inputs: [],
    name: "name",
    outputs: [{ internalType: "string", name: "", type: "string" }],
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

export type VoteableTargetMetadata = {
  name?: string
  symbol?: string
}

export function useVoteableTargetMetadata(targetIds: Address[]) {
  const uniqueTargetIds = useMemo(
    () =>
      Array.from(new Set(targetIds.map((targetId) => targetId.toLowerCase()))),
    [targetIds],
  ) as Address[]

  const { data, isLoading } = useReadContracts({
    contracts: uniqueTargetIds.flatMap((targetId) => [
      {
        address: targetId,
        abi: TARGET_METADATA_ABI,
        functionName: "name" as const,
      },
      {
        address: targetId,
        abi: TARGET_METADATA_ABI,
        functionName: "symbol" as const,
      },
    ]),
    query: {
      enabled: uniqueTargetIds.length > 0,
    },
  })

  const metadata = useMemo(() => {
    const map = new Map<string, VoteableTargetMetadata>()

    uniqueTargetIds.forEach((targetId, index) => {
      const name = data?.[index * 2]?.result
      const symbol = data?.[index * 2 + 1]?.result
      const entry: VoteableTargetMetadata = {}

      if (typeof name === "string" && name.length > 0) {
        entry.name = name
      }
      if (typeof symbol === "string" && symbol.length > 0) {
        entry.symbol = symbol
      }

      map.set(targetId.toLowerCase(), entry)
    })

    return map
  }, [data, uniqueTargetIds])

  return {
    metadata,
    isLoading,
  }
}
