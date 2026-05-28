import { useNetwork } from "@/contexts/NetworkContext"
import type { ActorProfile, LockDelta } from "@/lib/academy/actorProfile"
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

import type { MezoActivityApiItem } from "@/types/mezoActivity"

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

interface SerializedLockDelta {
  deltaVeWad: string
  amountAddedVeWad: string
  durationExtendedVeWad: string
  extensionPrevAmountWad: string | null
  extensionPrevDurationSec: string | null
  extensionPostDurationSec: string | null
  flagged: boolean
  postVeWad: string
}

interface SerializedEpochSlice {
  epochStart: number
  activeWeightWad: string
  newLocksAtEpoch: number
  extensionsAtEpoch: number
  boostActionsAtEpoch: number
  activeVotes: Array<{
    key: string
    gauge: string
    tokenId?: string
    weight: string
  }>
}

interface SerializedActorProfile {
  actor: string
  totalEpochs: number
  activeEpochs: number
  newLockCount: number
  extensionCount: number
  boostActionCount: number
  inRangeLocks: MezoActivityApiItem[]
  lockDeltaByEventId: Record<string, SerializedLockDelta>
  inRangeBoosts: MezoActivityApiItem[]
  preRangeBoosts: MezoActivityApiItem[]
  epochs: SerializedEpochSlice[]
  diagnostics: string[]
  blacklisted: boolean
  filtered: boolean
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

function deserializeProfile(p: SerializedActorProfile): ActorProfile {
  const lockDeltaByEventId = new Map<string, LockDelta>()
  if (p.lockDeltaByEventId) {
    for (const [eventId, delta] of Object.entries(p.lockDeltaByEventId)) {
      lockDeltaByEventId.set(eventId, {
        deltaVeWad: BigInt(delta.deltaVeWad),
        amountAddedVeWad: BigInt(delta.amountAddedVeWad),
        durationExtendedVeWad: BigInt(delta.durationExtendedVeWad),
        extensionPrevAmountWad: delta.extensionPrevAmountWad
          ? BigInt(delta.extensionPrevAmountWad)
          : null,
        extensionPrevDurationSec: delta.extensionPrevDurationSec
          ? BigInt(delta.extensionPrevDurationSec)
          : null,
        extensionPostDurationSec: delta.extensionPostDurationSec
          ? BigInt(delta.extensionPostDurationSec)
          : null,
        flagged: delta.flagged,
        postVeWad: BigInt(delta.postVeWad),
      })
    }
  }

  const epochs = p.epochs.map((epoch) => ({
    epochStart: epoch.epochStart,
    activeWeightWad: BigInt(epoch.activeWeightWad),
    newLocksAtEpoch: epoch.newLocksAtEpoch,
    extensionsAtEpoch: epoch.extensionsAtEpoch,
    boostActionsAtEpoch: epoch.boostActionsAtEpoch,
    activeVotes: epoch.activeVotes.map((v) => ({
      key: v.key,
      gauge: v.gauge as Address,
      tokenId: v.tokenId ? BigInt(v.tokenId) : undefined,
      weight: BigInt(v.weight),
    })),
  }))

  return {
    actor: p.actor as Address,
    totalEpochs: p.totalEpochs,
    activeEpochs: p.activeEpochs,
    newLockCount: p.newLockCount,
    extensionCount: p.extensionCount,
    boostActionCount: p.boostActionCount,
    inRangeLocks: p.inRangeLocks.map(deserializeActivityItem),
    lockDeltaByEventId,
    inRangeBoosts: p.inRangeBoosts.map(deserializeActivityItem),
    preRangeBoosts: p.preRangeBoosts.map(deserializeActivityItem),
    epochs,
    diagnostics: p.diagnostics,
    blacklisted: p.blacklisted,
    filtered: p.filtered,
  }
}

export function useAcademyActorProfile(actor: Address | null) {
  const { chainId, isNetworkReady } = useNetwork()
  const network = NETWORK_BY_CHAIN[chainId]

  return useQuery<AcademyActorProfileData>({
    queryKey: ["academy-actor-profile", network, actor],
    enabled: isNetworkReady && !!network && !!actor,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!actor) throw new Error("Missing actor address")
      const res = await fetch(
        `/api/academy/actor?actor=${actor}&network=${network}`,
      )
      if (!res.ok) {
        throw new Error(`Failed to fetch actor profile: ${res.statusText}`)
      }
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || "Failed to fetch actor profile")
      }

      return {
        profile: deserializeProfile(data.profile),
        row: data.row ? deserializeRow(data.row) : null,
      }
    },
  })
}
