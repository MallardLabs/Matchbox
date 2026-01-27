import { getContractConfig } from "@/config/contracts"
import { useNetwork } from "@/contexts/NetworkContext"
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
  const { chainId } = useNetwork()
  const contracts = getContractConfig(chainId)

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
    let targetTimestamp = epochNext ? Number(epochNext) : 0

    // Fallback if contract data is missing or we are on mainnet where contract read might fail
    if (!targetTimestamp) {
      const now = new Date()
      // 0=Sun, 1=Mon, ..., 4=Thu
      const today = now.getUTCDay()
      let daysUntilThursday = 4 - today
      if (daysUntilThursday <= 0) daysUntilThursday += 7

      const target = new Date(now)
      target.setUTCDate(now.getUTCDate() + daysUntilThursday)
      target.setUTCHours(0, 0, 0, 0)

      // If we are currently on Thursday but before midnight? No, 00:00 is start of day.
      // If now is Thursday 01:00, target set to 00:00 is in past.
      // daysUntilThursday would be 0.
      // So checks:
      if (target.getTime() <= now.getTime()) {
        target.setUTCDate(target.getUTCDate() + 7)
      }

      targetTimestamp = Math.floor(target.getTime() / 1000)
    }

    const remaining = targetTimestamp - currentTime
    return formatTimeRemaining(Math.max(0, remaining))
  }, [epochNext, currentTime])

  return {
    epochNext,
    timeRemaining,
    isLoading,
  }
}
