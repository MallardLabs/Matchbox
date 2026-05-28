import { useNetwork } from "@/contexts/NetworkContext"
import type { LeaderboardRow, SimTotals } from "@/lib/academy/simulate"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useQuery } from "@tanstack/react-query"

const NETWORK_BY_CHAIN: Record<number, "mainnet" | "testnet"> = {
  [CHAIN_ID.mainnet]: "mainnet",
  [CHAIN_ID.testnet]: "testnet",
}

export type AcademyLeaderboardData = {
  rows: LeaderboardRow[]
  totals: SimTotals
  meta: {
    fromTs: number
    toTs: number
    generatedAt: number
  }
}

interface SerializedRow {
  actor: string
  pointsWad: string
  lockPointsWad: string
  extensionPointsWad: string
  votePointsWad: string
  participationBonusWad: string
  vePowerWad: string
  newLockCount: number
  extensionCount: number
  boostCount: number
  activeEpochs: number
  fullyParticipated: boolean
  flagged: boolean
}

interface SerializedTotals {
  pointsWad: string
  participants: number
  boostCount: number
  newLockCount: number
  extensionCount: number
  totalEpochs: number
  fullParticipationCount: number
  activeVoteAggregateWad: string
}

function deserializeRow(row: SerializedRow): LeaderboardRow {
  return {
    actor: row.actor as `0x${string}`,
    pointsWad: BigInt(row.pointsWad),
    lockPointsWad: BigInt(row.lockPointsWad),
    extensionPointsWad: BigInt(row.extensionPointsWad),
    votePointsWad: BigInt(row.votePointsWad),
    participationBonusWad: BigInt(row.participationBonusWad),
    vePowerWad: BigInt(row.vePowerWad),
    newLockCount: row.newLockCount,
    extensionCount: row.extensionCount,
    boostCount: row.boostCount,
    activeEpochs: row.activeEpochs,
    fullyParticipated: row.fullyParticipated,
    flagged: row.flagged,
    rewardMezoWad: 0n,
    apr: 0,
    aprBasisWad: 0n,
    culledBelowFloor: false,
  }
}

function deserializeTotals(totals: SerializedTotals): SimTotals {
  return {
    pointsWad: BigInt(totals.pointsWad),
    participants: totals.participants,
    boostCount: totals.boostCount,
    newLockCount: totals.newLockCount,
    extensionCount: totals.extensionCount,
    totalEpochs: totals.totalEpochs,
    fullParticipationCount: totals.fullParticipationCount,
    activeVoteAggregateWad: BigInt(totals.activeVoteAggregateWad),
    medianApr: 0,
    droppedCronEvents: 0,
    droppedBlacklistEvents: 0,
    voteSnapshots: totals.totalEpochs,
    culledBelowFloorCount: 0,
    redistributedMezoWad: 0n,
  }
}

export function useAcademyLeaderboard() {
  const { chainId, isNetworkReady } = useNetwork()
  const network = NETWORK_BY_CHAIN[chainId]

  return useQuery<AcademyLeaderboardData>({
    queryKey: ["academy-leaderboard", network],
    enabled: isNetworkReady && !!network,
    staleTime: 5 * 60 * 1000, // 5 min client-side staleTime
    queryFn: async () => {
      const res = await fetch(`/api/academy/leaderboard?network=${network}`)
      if (!res.ok) {
        throw new Error(`Failed to fetch leaderboard: ${res.statusText}`)
      }
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || "Failed to fetch leaderboard")
      }

      return {
        rows: data.rows.map(deserializeRow),
        totals: deserializeTotals(data.totals),
        meta: data.meta,
      }
    },
  })
}
