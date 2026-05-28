import { getContractConfig } from "@/config/contracts"
import { useNetwork } from "@/contexts/NetworkContext"
import { useMemo } from "react"
import type { Address } from "viem"
import { useReadContracts } from "wagmi"

export function useBoostableTokenGauges(tokenIds: bigint[]) {
  const { chainId } = useNetwork()
  const config = useMemo(() => getContractConfig(chainId), [chainId])
  const unique = useMemo(() => {
    const set = new Set<string>()
    const ordered: bigint[] = []
    for (const id of tokenIds) {
      const key = id.toString()
      if (!set.has(key)) {
        set.add(key)
        ordered.push(id)
      }
    }
    return ordered
  }, [tokenIds])

  const { data, isLoading } = useReadContracts({
    contracts: unique.map((id) => ({
      address: config.boostVoter.address as Address,
      abi: config.boostVoter.abi,
      functionName: "boostableTokenIdToGauge" as const,
      args: [id] as const,
      chainId,
    })),
    query: {
      enabled: unique.length > 0,
      staleTime: Number.POSITIVE_INFINITY,
    },
  })

  const byTokenId = useMemo(() => {
    const map = new Map<string, Address>()
    if (!data) return map
    for (let i = 0; i < unique.length; i += 1) {
      const result = data[i]
      const idKey = unique[i]?.toString()
      if (!idKey) continue
      if (result?.status === "success" && result.result) {
        map.set(idKey, result.result as Address)
      }
    }
    return map
  }, [data, unique])

  return { byTokenId, isLoading }
}
