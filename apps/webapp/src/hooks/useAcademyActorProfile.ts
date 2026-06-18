import { useNetwork } from "@/contexts/NetworkContext"
import { useAcademyLeaderboard } from "@/hooks/useAcademyLeaderboard"
import {
  type ActorProfile,
  computeActorProfile,
} from "@/lib/academy/actorProfile"
import { BLACKLISTED_SYSTEM_ACTORS } from "@/lib/academy/blacklistedActors"
import type { LeaderboardRow } from "@/lib/academy/simulate"
import { deserializeActivityItem } from "@/lib/mezoActivity/normalize"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useQuery } from "@tanstack/react-query"
import type { Address } from "viem"

const NETWORK_BY_CHAIN: Record<number, "mainnet" | "testnet"> = {
  [CHAIN_ID.mainnet]: "mainnet",
  [CHAIN_ID.testnet]: "testnet",
}

export type AcademyActorProfileData = {
  profile: ActorProfile
  row: LeaderboardRow | null
}

export function useAcademyActorProfile(
  actor: Address | null,
  windowOverride?: { fromTs: number; toTs: number } | null,
) {
  const { chainId, isNetworkReady } = useNetwork()
  const network = NETWORK_BY_CHAIN[chainId]
  // Use the same window as the leaderboard the actor was opened from, so the
  // drawer's activity + row match the selected season.
  const { data: leaderboardData } = useAcademyLeaderboard(windowOverride)

  const fromTs = leaderboardData?.meta.fromTs
  const toTs = leaderboardData?.meta.toTs

  return useQuery<AcademyActorProfileData>({
    queryKey: ["academy-actor-profile", network, actor, fromTs, toTs],
    enabled: isNetworkReady && !!network && !!actor && !!fromTs && !!toTs,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!actor || !fromTs || !toTs) throw new Error("Missing parameters")

      const hardFloor = Math.max(toTs - 3 * 365 * 86_400, 0)

      // Fetch lock events and vote events in parallel for this single actor
      const lockUrl = `/api/activity?network=${network}&actor=${actor}&from=${fromTs}&to=${toTs}&actionTypes=LOCK_CREATED,LOCK_AMOUNT_INCREASED,LOCK_EXTENDED,LOCK_PERMANENT,LOCK_MERGED&limit=1000`
      const voteUrl = `/api/activity?network=${network}&actor=${actor}&from=${hardFloor}&to=${toTs}&actionTypes=BOOST_VOTE,BOOST_ABSTAIN,LOCK_TRANSFERRED&limit=1000`

      const [locksRes, votesRes] = await Promise.all([
        fetch(lockUrl).then((r) => r.json()),
        fetch(voteUrl).then((r) => r.json()),
      ])

      if (!locksRes.success || !votesRes.success) {
        throw new Error("Failed to fetch actor activity from API")
      }

      const lockEvents = (locksRes.data || []).map(deserializeActivityItem)
      const voteEvents = (votesRes.data || []).map(deserializeActivityItem)

      const profile = computeActorProfile({
        actor,
        lockEvents,
        voteEvents,
        fromTs,
        toTs,
        blacklist: new Set(BLACKLISTED_SYSTEM_ACTORS),
        includeOpenEpoch: true,
      })

      const lower = actor.toLowerCase()
      const row = leaderboardData?.rows.find(
        (r) => r.actor.toLowerCase() === lower,
      ) ?? {
        actor: actor,
        pointsWad: 0n,
        lockPointsWad: 0n,
        extensionPointsWad: 0n,
        votePointsWad: 0n,
        participationBonusWad: 0n,
        vePowerWad: 0n,
        newLockCount: 0,
        extensionCount: 0,
        boostCount: 0,
        activeEpochs: 0,
        fullyParticipated: false,
        flagged: false,
        rewardMezoWad: 0n,
        apr: 0,
        aprBasisWad: 0n,
        culledBelowFloor: false,
      }

      return {
        profile,
        row,
      }
    },
  })
}
