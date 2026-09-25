import {
  WEEK,
  epochIndexFor,
  epochStartFor,
  voteWindowCloseFor,
} from "@/lib/mezoGauges/epochs"
import { useEffect, useMemo, useState } from "react"

type VoteWindowCountdownResult = {
  epochIndex: number
  closesAt: number
  voteWindowClosed: boolean
  timeRemaining: string
}

function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return "0s"

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (days > 0) return `${days}d ${hours}h ${minutes}m ${secs}s`
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

/**
 * Ticks every second toward the current epoch's vote window close
 * (Wed 23:00 UTC). Once closed, counts down to the next epoch start
 * (Thu 00:00 UTC) and reports `voteWindowClosed`.
 */
export function useVoteWindowCountdown(): VoteWindowCountdownResult {
  const [currentTime, setCurrentTime] = useState(() =>
    Math.floor(Date.now() / 1000),
  )

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  return useMemo(() => {
    const epochStart = epochStartFor(currentTime)
    const closesAt = voteWindowCloseFor(epochStart)
    const voteWindowClosed = currentTime >= closesAt
    const target = voteWindowClosed ? epochStart + WEEK : closesAt

    return {
      epochIndex: epochIndexFor(epochStart),
      closesAt,
      voteWindowClosed,
      timeRemaining: formatTimeRemaining(Math.max(0, target - currentTime)),
    }
  }, [currentTime])
}
