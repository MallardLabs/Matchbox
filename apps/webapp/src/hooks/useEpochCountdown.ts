import { getContractConfig } from "@/config/contracts"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useEffect, useMemo, useState } from "react"
import { useReadContract } from "wagmi"

type EpochCountdownResult = {
  epochNext: bigint | undefined
  timeRemaining: string
  isLoading: boolean
}

function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return "0s"

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)

  return parts.join(" ")
}

export function useEpochCountdown(): EpochCountdownResult {
  const contracts = getContractConfig(CHAIN_ID.testnet)
  const [currentTime, setCurrentTime] = useState(() =>
    Math.floor(Date.now() / 1000),
  )

  // Stabilize the timestamp for the contract call
  const now = useMemo(() => {
    const timestamp = Math.floor(Date.now() / 1000)
    return BigInt(Math.floor(timestamp / 60) * 60)
  }, [])

  const { data: epochNextData, isLoading } = useReadContract({
    ...contracts.boostVoter,
    functionName: "epochNext",
    args: [now],
  })

  const epochNext = epochNextData as bigint | undefined

  // Update current time every second for the countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const timeRemaining = useMemo(() => {
    if (epochNext === undefined) return "..."
    const remaining = Number(epochNext) - currentTime
    return formatTimeRemaining(Math.max(0, remaining))
  }, [epochNext, currentTime])

  return {
    epochNext,
    timeRemaining,
    isLoading,
  }
}
