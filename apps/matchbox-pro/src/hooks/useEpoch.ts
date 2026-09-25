import { getContractConfig } from "@/lib/contracts"
import { useNetwork } from "@/lib/network"
import { QUERY_PROFILES } from "@/lib/queryProfiles"
import { useEffect, useState } from "react"
import { useReadContract } from "wagmi"

const EPOCH_LENGTH_SECONDS = 604800n

function compactRemaining(seconds: number): string {
  if (seconds <= 0) return "0s"
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  const secs = seconds % 60
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

export function useEpoch() {
  const { chainId } = useNetwork()
  const contracts = getContractConfig(chainId)
  // Minute-rounded so consumers mounted together share one cached read.
  const [nowArg] = useState(() => BigInt(Math.floor(Date.now() / 60_000) * 60))
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))

  const { data, isLoading } = useReadContract({
    ...contracts.boostVoter,
    functionName: "epochNext",
    args: [nowArg],
    query: QUERY_PROFILES.SHORT_CACHE,
  })
  const epochNext = typeof data === "bigint" ? data : undefined
  const epochStart =
    epochNext !== undefined ? epochNext - EPOCH_LENGTH_SECONDS : undefined

  const remaining = epochNext ? Number(epochNext) - now : 0
  const tickMs = remaining > 3600 ? 30_000 : 1_000

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Math.floor(Date.now() / 1000))
    }, tickMs)
    return () => window.clearInterval(id)
  }, [tickMs])

  return {
    epochNext,
    epochStart,
    remainingSeconds: Math.max(0, remaining),
    label: epochNext ? compactRemaining(Math.max(0, remaining)) : "—",
    isLoading,
  }
}
