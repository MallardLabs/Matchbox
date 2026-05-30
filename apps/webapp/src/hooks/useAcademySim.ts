import { useAcademyActivity } from "@/hooks/useAcademyActivity"
import { useBlacklist } from "@/hooks/useBlacklist"
import { computeActorProfile } from "@/lib/academy/actorProfile"
import { defaultAcademyParams as defaultParams } from "@/lib/academy/constants"
import {
  WEEK,
  enumerateEpochs,
  epochStartFor,
  snapToThursdayUTC,
} from "@/lib/academy/epoch"
import { type AcademyParams, simulate } from "@/lib/academy/simulate"
export { defaultParams }
import {
  DEFAULT_BUDGET_MEZO,
  DEFAULT_MEZO_USD,
  DEFAULT_PARTICIPATION_MULTIPLIER,
  DEFAULT_REWARD_FLOOR_MEZO,
  DEFAULT_WEIGHT_BOOST,
  DEFAULT_WEIGHT_EXT,
  DEFAULT_WEIGHT_NEW,
} from "@/lib/academy/constants"
import type { MezoActivityItem } from "@/types/mezoActivity"
import { useEffect, useMemo, useState } from "react"
import { type Address, parseUnits } from "viem"

const STORAGE_KEY = "mezo-academy-sim-v2"

type StoredState = {
  fromTs: number
  toTs: number
  params: Omit<AcademyParams, "budgetMezoWad" | "rewardFloorMezoWad"> & {
    budgetMezo: number
    rewardFloorMezo: number
  }
}

export function defaultRange(): { fromTs: number; toTs: number } {
  const now = Math.floor(Date.now() / 1000)
  const toTs = snapToThursdayUTC(now, "down")
  const fromTs = toTs - 8 * WEEK
  return { fromTs, toTs }
}

function loadStored(): {
  fromTs: number
  toTs: number
  params: AcademyParams
} {
  if (typeof window === "undefined") {
    return { ...defaultRange(), params: defaultParams() }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...defaultRange(), params: defaultParams() }
    const parsed = JSON.parse(raw) as StoredState
    return {
      fromTs: parsed.fromTs ?? defaultRange().fromTs,
      toTs: parsed.toTs ?? defaultRange().toTs,
      params: {
        budgetMezoWad: parseUnits(
          String(parsed.params?.budgetMezo ?? DEFAULT_BUDGET_MEZO),
          18,
        ),
        weightNew: parsed.params?.weightNew ?? DEFAULT_WEIGHT_NEW,
        weightExt: parsed.params?.weightExt ?? DEFAULT_WEIGHT_EXT,
        weightBoost: parsed.params?.weightBoost ?? DEFAULT_WEIGHT_BOOST,
        participationMultiplier:
          parsed.params?.participationMultiplier ??
          DEFAULT_PARTICIPATION_MULTIPLIER,
        mezoUsd: parsed.params?.mezoUsd ?? DEFAULT_MEZO_USD,
        rewardFloorMezoWad: parseUnits(
          String(parsed.params?.rewardFloorMezo ?? DEFAULT_REWARD_FLOOR_MEZO),
          18,
        ),
      },
    }
  } catch {
    return { ...defaultRange(), params: defaultParams() }
  }
}

export type EpochSummary = {
  epoch: number
  startTs: number
  newLocks: number
  extensions: number
  boostVotes: number
  total: number
}

function buildEpochSummaries(
  events: MezoActivityItem[],
  fromTs: number,
  toTs: number,
): EpochSummary[] {
  const epochs = enumerateEpochs(fromTs, toTs)
  const byEpoch = new Map<number, EpochSummary>()
  for (let i = 0; i < epochs.length; i += 1) {
    const startTs = epochs[i] as number
    byEpoch.set(startTs, {
      epoch: i,
      startTs,
      newLocks: 0,
      extensions: 0,
      boostVotes: 0,
      total: 0,
    })
  }
  for (const ev of events) {
    const epochStart = epochStartFor(ev.timestamp)
    const summary = byEpoch.get(epochStart)
    if (!summary) continue
    if (ev.actionType === "lockCreated") summary.newLocks += 1
    else if (ev.actionType === "lockExtended") summary.extensions += 1
    else if (ev.actionType === "boostVote") summary.boostVotes += 1
    summary.total += 1
  }
  return [...byEpoch.values()].sort((a, b) => a.startTs - b.startTs)
}

export function useAcademySim(opts: { enabled: boolean }) {
  const { enabled } = opts
  const [hydrated, setHydrated] = useState(false)
  const [fromTs, setFromTs] = useState<number>(defaultRange().fromTs)
  const [toTs, setToTs] = useState<number>(defaultRange().toTs)
  const [params, setParams] = useState<AcademyParams>(defaultParams())
  const [selectedActor, setSelectedActor] = useState<Address | null>(null)
  const blacklist = useBlacklist()

  useEffect(() => {
    const stored = loadStored()
    setFromTs(stored.fromTs)
    setToTs(stored.toTs)
    setParams(stored.params)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return
    const budgetMezo = Number(params.budgetMezoWad / 10n ** 12n) / 1e6
    const rewardFloorMezo = Number(params.rewardFloorMezoWad / 10n ** 12n) / 1e6
    const toStore: StoredState = {
      fromTs,
      toTs,
      params: {
        budgetMezo,
        weightNew: params.weightNew,
        weightExt: params.weightExt,
        weightBoost: params.weightBoost,
        participationMultiplier: params.participationMultiplier,
        mezoUsd: params.mezoUsd,
        rewardFloorMezo,
      },
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
  }, [hydrated, fromTs, toTs, params])

  const epochs = useMemo(() => enumerateEpochs(fromTs, toTs), [fromTs, toTs])

  const activity = useAcademyActivity({
    fromTimestamp: fromTs,
    toTimestamp: toTs,
    enabled,
  })

  const sim = useMemo(() => {
    if (!activity.data || !blacklist.hydrated) return null
    return simulate(
      {
        lockEvents: activity.data.lockEvents,
        voteEvents: activity.data.voteEvents,
        blacklist: blacklist.merged,
      },
      params,
      fromTs,
      toTs,
    )
  }, [
    activity.data,
    blacklist.hydrated,
    blacklist.merged,
    params,
    fromTs,
    toTs,
  ])

  const epochSummaries = useMemo(() => {
    if (!activity.data) return []
    const combined = [
      ...activity.data.lockEvents,
      ...activity.data.voteEvents.filter(
        (ev) => ev.timestamp >= fromTs && ev.timestamp <= toTs,
      ),
    ]
    return buildEpochSummaries(combined, fromTs, toTs)
  }, [activity.data, fromTs, toTs])

  const peakEpochTotal = useMemo(
    () => epochSummaries.reduce((m, e) => Math.max(m, e.total), 0),
    [epochSummaries],
  )

  const actorProfile = useMemo(() => {
    if (!selectedActor || !activity.data || !blacklist.hydrated) return null
    return computeActorProfile({
      actor: selectedActor,
      lockEvents: activity.data.lockEvents,
      voteEvents: activity.data.voteEvents,
      fromTs,
      toTs,
      blacklist: blacklist.merged,
    })
  }, [
    selectedActor,
    activity.data,
    blacklist.hydrated,
    blacklist.merged,
    fromTs,
    toTs,
  ])

  const actorRow = useMemo(() => {
    if (!selectedActor || !sim) return null
    const lower = selectedActor.toLowerCase()
    return sim.rows.find((r) => r.actor.toLowerCase() === lower) ?? null
  }, [selectedActor, sim])

  useEffect(() => {
    if (!selectedActor) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedActor(null)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [selectedActor])

  return {
    fromTs,
    toTs,
    setFromTs,
    setToTs,
    params,
    setParams,
    epochs,
    activity,
    blacklist,
    sim,
    epochSummaries,
    peakEpochTotal,
    selectedActor,
    setSelectedActor,
    actorProfile,
    actorRow,
    hydrated,
  }
}
