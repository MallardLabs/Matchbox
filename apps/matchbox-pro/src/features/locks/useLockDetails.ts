import { getContractConfig } from "@/lib/contracts"
import { useNetwork } from "@/lib/network"
import { QUERY_PROFILES } from "@/lib/queryProfiles"
import { useMemo } from "react"
import { type Address, isAddressEqual, zeroAddress } from "viem"
import { useReadContracts } from "wagmi"

export type LockDetails = {
  /** Escrow `voted` flag keyed by `${kind}-${tokenId}`; absent until read. */
  hasActiveVotes: Map<string, boolean>
  /** veBTC token id → the boost gauge it backs. */
  gaugeByVeBtc: Map<string, Address>
  refetch: () => Promise<void>
}

/** Per-lock escrow and voter reads the lock cards need beyond `locked()`. */
export function useLockDetails(
  veMezoIds: bigint[],
  veBtcIds: bigint[],
): LockDetails {
  const { chainId } = useNetwork()
  const contracts = getContractConfig(chainId)

  const votedRead = useReadContracts({
    contracts: [
      ...veMezoIds.map((tokenId) => ({
        ...contracts.veMEZO,
        functionName: "voted" as const,
        args: [tokenId] as const,
      })),
      ...veBtcIds.map((tokenId) => ({
        ...contracts.veBTC,
        functionName: "voted" as const,
        args: [tokenId] as const,
      })),
    ],
    query: {
      ...QUERY_PROFILES.SHORT_CACHE,
      enabled: veMezoIds.length + veBtcIds.length > 0,
    },
  })

  const gaugeRead = useReadContracts({
    contracts: veBtcIds.map((tokenId) => ({
      ...contracts.boostVoter,
      functionName: "boostableTokenIdToGauge" as const,
      args: [tokenId] as const,
    })),
    query: { ...QUERY_PROFILES.LONG_CACHE, enabled: veBtcIds.length > 0 },
  })

  const hasActiveVotes = useMemo(() => {
    const map = new Map<string, boolean>()
    const ids = [...veMezoIds, ...veBtcIds]
    const kinds = [
      ...veMezoIds.map(() => "veMEZO"),
      ...veBtcIds.map(() => "veBTC"),
    ]
    ids.forEach((tokenId, index) => {
      const result = votedRead.data?.[index]?.result
      if (typeof result === "boolean") {
        map.set(`${kinds[index]}-${tokenId}`, result)
      }
    })
    return map
  }, [veBtcIds, veMezoIds, votedRead.data])

  const gaugeByVeBtc = useMemo(() => {
    const map = new Map<string, Address>()
    veBtcIds.forEach((tokenId, index) => {
      const result = gaugeRead.data?.[index]?.result
      if (typeof result === "string" && !isAddressEqual(result, zeroAddress)) {
        map.set(tokenId.toString(), result)
      }
    })
    return map
  }, [gaugeRead.data, veBtcIds])

  return {
    hasActiveVotes,
    gaugeByVeBtc,
    refetch: async () => {
      await Promise.all([votedRead.refetch(), gaugeRead.refetch()])
    },
  }
}
