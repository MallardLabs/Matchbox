import { useNetwork } from "@/contexts/NetworkContext"
import { useAcademySemester } from "@/hooks/useAcademySemester"
import type { LeaderboardRow, SimTotals } from "@/lib/academy/simulate"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useQuery } from "@tanstack/react-query"

const NETWORK_BY_CHAIN: Record<number, "mainnet" | "testnet"> = {
  [CHAIN_ID.mainnet]: "mainnet",
  [CHAIN_ID.testnet]: "testnet",
}

const STORAGE_PREFIX = "mezo-academy-leaderboard-v1"
const STORAGE_MAX_AGE_MS = 5 * 60 * 1000
const LIVE_REFRESH_MS = 30 * 1000

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

interface ApiLeaderboardResponse {
  success: boolean
  error?: string
  rows: SerializedRow[]
  totals: SerializedTotals
  meta: AcademyLeaderboardData["meta"]
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

function deserializeLeaderboard(
  data: ApiLeaderboardResponse,
): AcademyLeaderboardData {
  return {
    rows: data.rows.map(deserializeRow),
    totals: deserializeTotals(data.totals),
    meta: data.meta,
  }
}

// Cache is keyed by network AND window so a rolling-window payload is never shown
// for a semester window (or vice-versa). `windowKey` is `${fromTs}-${toTs}` for a
// fixed semester window, or "rolling" for the default last-8-epoch window.
function storageKey(network: "mainnet" | "testnet", windowKey: string) {
  return `${STORAGE_PREFIX}:${network}:${windowKey}`
}

function readStoredLeaderboard(
  network: "mainnet" | "testnet" | undefined,
  windowKey: string,
): AcademyLeaderboardData | undefined {
  if (!network || typeof window === "undefined") return undefined

  try {
    const raw = window.localStorage.getItem(storageKey(network, windowKey))
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as {
      savedAt: number
      payload: ApiLeaderboardResponse
    }
    if (
      !parsed.savedAt ||
      Date.now() - parsed.savedAt > STORAGE_MAX_AGE_MS ||
      !parsed.payload?.success
    ) {
      return undefined
    }
    return deserializeLeaderboard(parsed.payload)
  } catch {
    return undefined
  }
}

function writeStoredLeaderboard(
  network: "mainnet" | "testnet",
  windowKey: string,
  payload: ApiLeaderboardResponse,
) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(
      storageKey(network, windowKey),
      JSON.stringify({ savedAt: Date.now(), payload }),
    )
  } catch {
    // Ignore quota/private-mode failures; HTTP and React Query caches still work.
  }
}

export function useAcademyLeaderboard(
  windowOverride?: { fromTs: number; toTs: number } | null,
) {
  const { chainId, isNetworkReady } = useNetwork()
  const network = NETWORK_BY_CHAIN[chainId]

  // windowOverride semantics:
  //  - object    → pin this fixed window (e.g. a selected season, or the banner).
  //  - null      → caller is still resolving its window; wait, don't fetch.
  //  - undefined → fall back to the auto-resolved current season (rolling if none),
  //                resolved here so consumers that share it stay on one window.
  const { data: semester, isLoading: semesterLoading } = useAcademySemester()
  const waiting = windowOverride === null
  const resolved =
    windowOverride ??
    (semester ? { fromTs: semester.fromTs, toTs: semester.toTs } : null)
  const win = resolved ? { from: resolved.fromTs, to: resolved.toTs } : null
  const isLiveWindow = !!win && win.to > Math.floor(Date.now() / 1000)
  const windowKey = win ? `${win.from}-${win.to}` : "rolling"

  return useQuery<AcademyLeaderboardData>({
    queryKey: ["academy-leaderboard", network, windowKey],
    // An explicit window fetches immediately; a null override waits; otherwise
    // wait for the auto-resolve so we don't fetch rolling then refetch.
    enabled:
      isNetworkReady &&
      !!network &&
      !waiting &&
      (windowOverride !== undefined || !semesterLoading),
    staleTime: 15 * 1000,
    refetchInterval: isLiveWindow ? LIVE_REFRESH_MS : false,
    refetchIntervalInBackground: false,
    initialData: () => readStoredLeaderboard(network, windowKey),
    initialDataUpdatedAt: () => {
      const stored = readStoredLeaderboard(network, windowKey)
      return stored?.meta.generatedAt ? stored.meta.generatedAt * 1000 : 0
    },
    queryFn: async () => {
      if (!network) throw new Error("Unsupported network")

      const windowParams = win ? `&from=${win.from}&to=${win.to}` : ""
      const asOf = Math.floor(Date.now() / LIVE_REFRESH_MS)
      // Apply the reward-floor filter only for semesters that require it (Semester 0).
      // No-floor semesters (Semester 1+) show all participants.
      const qualifiedOnly = semester?.requireFloor !== false ? "1" : "0"
      const res = await fetch(
        `/api/academy/leaderboard?network=${network}${windowParams}&qualifiedOnly=${qualifiedOnly}&asOf=${asOf}`,
      )
      if (!res.ok) {
        throw new Error(`Failed to fetch leaderboard: ${res.statusText}`)
      }
      const data = (await res.json()) as ApiLeaderboardResponse
      if (!data.success) {
        throw new Error(data.error || "Failed to fetch leaderboard")
      }

      writeStoredLeaderboard(network, windowKey, data)
      return deserializeLeaderboard(data)
    },
  })
}
