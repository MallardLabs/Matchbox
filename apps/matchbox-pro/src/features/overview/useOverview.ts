import {
  type HistoryResult,
  useWalletEarnings,
} from "@/features/history/useHistory"
import { claimGroups, sourcesForLock } from "@/features/locks/claims"
import { type LockView, isExpired } from "@/features/locks/lockModel"
import { useLockDetails } from "@/features/locks/useLockDetails"
import type { ClaimSource } from "@/features/rewards/claimSources"
import { useClaimSources } from "@/features/rewards/useClaimSources"
import { useClaimable } from "@/hooks/useClaimable"
import { useEpoch } from "@/hooks/useEpoch"
import { useVeBTCLocks, useVeMEZOLocks } from "@/hooks/useLocks"
import { usePersonalProjected } from "@/hooks/usePersonalProjected"
import { profileForGauge, useGaugeProfiles } from "@/hooks/useProfiles"
import { useBatchVoteState } from "@/hooks/useVoteState"
import { gaugeDisplayName } from "@/lib/overview"
import { calculateAnnualizedReturnBasisPoints } from "@/lib/rewardOptimizer"
import { useViewer } from "@/lib/viewer"
import { useCallback, useMemo } from "react"
import { type ChartEpoch, walletChartEpochs } from "./earnings"
import { type LocksState, claimableValue, projectedValue } from "./heroValues"

export type { LocksState } from "./heroValues"

/** Everything the signed-in (or watched) Overview shows, from live reads. */
export function useOverview() {
  const { viewer } = useViewer()
  const mezo = useVeMEZOLocks()
  const btc = useVeBTCLocks()
  const epoch = useEpoch()
  const { data: profiles } = useGaugeProfiles()
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000))

  const veMezoIds = useMemo(
    () => mezo.locks.map((lock) => lock.tokenId),
    [mezo.locks],
  )
  const veBtcIds = useMemo(
    () => btc.locks.map((lock) => lock.tokenId),
    [btc.locks],
  )
  const details = useLockDetails(veMezoIds, veBtcIds)
  // Per-bribe rows only name the boost gauges; the claim sources (all three
  // voters, one per lock) carry the amounts and the claim calls.
  const claimable = useClaimable(veMezoIds)
  const claimSources = useClaimSources()
  const projected = usePersonalProjected(veMezoIds)
  const { voteStateMap } = useBatchVoteState(veMezoIds)
  const earnings = useWalletEarnings(viewer.address, 6)
  const earningsData = earnings.data
  const chartEpochs = useMemo(
    () => (earningsData ? walletChartEpochs(earningsData) : undefined),
    [earningsData],
  )
  const history: HistoryResult<ChartEpoch[]> = {
    ...earnings,
    data: chartEpochs,
  }

  const gaugeName = useCallback(
    (gauge: string) => gaugeDisplayName(profiles, gauge),
    [profiles],
  )
  const { sources } = claimSources
  const groups = useMemo(
    () => claimGroups(sources, claimable.rows, gaugeName),
    [claimable.rows, gaugeName, sources],
  )
  const claims = {
    sources,
    groups,
    tokens: claimSources.tokens,
    usdMicro: claimSources.usdMicro,
    unpriced: claimSources.unpriced > 0,
    incomplete: claimSources.incomplete,
  }

  const nowKey = nowSeconds / 60n
  const locks = useMemo<LockView[]>(() => {
    const now = nowKey * 60n
    const veBtc: LockView[] = btc.locks.map((lock) => {
      const id = lock.tokenId.toString()
      const key = `veBTC-${id}`
      const gauge = details.gaugeByVeBtc.get(id) ?? null
      return {
        key,
        kind: "veBTC",
        id,
        tokenId: lock.tokenId,
        amount: lock.amount,
        votingPower: lock.votingPower,
        unboostedVotingPower: lock.unboostedVotingPower,
        end: lock.end,
        isPermanent: lock.isPermanent,
        expired: isExpired(lock, now),
        hasActiveVotes: details.hasActiveVotes.get(key),
        votedThisEpoch: false,
        gauge,
        profile: gauge ? (profileForGauge(profiles, gauge) ?? null) : null,
        claimable: lockClaimable(sources, "veBTC", lock.tokenId),
      }
    })
    const veMezo: LockView[] = mezo.locks.map((lock) => {
      const id = lock.tokenId.toString()
      const key = `veMEZO-${id}`
      return {
        key,
        kind: "veMEZO",
        id,
        tokenId: lock.tokenId,
        amount: lock.amount,
        votingPower: lock.votingPower,
        unboostedVotingPower: null,
        end: lock.end,
        isPermanent: lock.isPermanent,
        expired: isExpired(lock, now),
        hasActiveVotes: details.hasActiveVotes.get(key),
        votedThisEpoch: voteStateMap.get(id)?.hasVotedThisEpoch === true,
        gauge: null,
        profile: null,
        claimable: lockClaimable(sources, "veMEZO", lock.tokenId),
      }
    })
    return [...veBtc, ...veMezo]
  }, [
    btc.locks,
    details.gaugeByVeBtc,
    details.hasActiveVotes,
    mezo.locks,
    nowKey,
    profiles,
    sources,
    voteStateMap,
  ])

  const locksState: LocksState =
    mezo.isLoading || btc.isLoading
      ? "loading"
      : (mezo.error ?? btc.error)
        ? "error"
        : locks.length === 0
          ? "empty"
          : "ready"

  const veMezoPower = mezo.locks.reduce(
    (sum, lock) => sum + lock.votingPower,
    0n,
  )
  const veBtcPower = btc.locks.reduce((sum, lock) => sum + lock.votingPower, 0n)
  const apyBasisPoints = calculateAnnualizedReturnBasisPoints({
    epochRewardMicroUsd: projected.projectedMicro,
    votingPowers: veMezoPower > 0n ? [veMezoPower] : [],
    assetPriceMicroUsd: projected.assetPriceMicroUsd,
  })

  const claimableLive = claimableValue({
    locksState,
    sources: claimSources,
  })
  const projectedLive = projectedValue({
    locksState,
    veMezoLocks: veMezoIds.length,
    isLoading: projected.isLoading,
    failed: Boolean(projected.error) || !projected.mezoPrice,
    usdMicro: projected.projectedMicro,
  })

  const unvoted = locks.filter(
    (lock) =>
      lock.kind === "veMEZO" &&
      !lock.expired &&
      lock.votingPower > 0n &&
      !lock.votedThisEpoch,
  )

  return {
    viewer,
    epoch,
    nowSeconds,
    locks,
    locksState,
    claims,
    claimable: claimableLive,
    projected: projectedLive,
    apyBasisPoints,
    votingPower:
      veMezoPower > 0n
        ? { kind: "veMEZO" as const, amount: veMezoPower }
        : veBtcPower > 0n
          ? { kind: "veBTC" as const, amount: veBtcPower }
          : null,
    unvoted,
    history,
    /** Some realized USD is a lower bound while prices retry. */
    historyPartial: earningsData?.partial === true,
    refetch: async () => {
      await Promise.all([
        mezo.refetch(),
        btc.refetch(),
        details.refetch(),
        claimable.refetch(),
      ])
      claimSources.refetch()
    },
  }
}

export type Overview = ReturnType<typeof useOverview>

function lockClaimable(
  sources: ClaimSource[],
  kind: LockView["kind"],
  tokenId: bigint,
): LockView["claimable"] {
  const own = sourcesForLock(sources, { kind, tokenId })
  if (own.length === 0) return null
  return {
    usdMicro: own.reduce((sum, source) => sum + source.usdMicro, 0n),
    unpriced: own.some((source) => source.unpriced > 0),
  }
}
