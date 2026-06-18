import {
  type ActorProfile,
  computeActorProfile,
} from "@/lib/academy/actorProfile"
import { BLACKLISTED_SYSTEM_ACTORS } from "@/lib/academy/blacklistedActors"
import { defaultAcademyParams } from "@/lib/academy/constants"
import { WEEK, resolveWindow } from "@/lib/academy/epoch"
import { simulate } from "@/lib/academy/simulate"
import { fetchMezoActivity } from "@/lib/mezoActivity/dataSources"
import { serializeActivityItem } from "@/lib/mezoActivity/normalize"
import type { MezoActivityItem } from "@/types/mezoActivity"
import { CHAIN_ID, type SupportedChainId } from "@repo/shared/contracts"
import { type Address, getAddress } from "viem"

export const config = {
  runtime: "edge",
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const

const LOCK_ACTION_TYPES = [
  "LOCK_CREATED",
  "LOCK_AMOUNT_INCREASED",
  "LOCK_EXTENDED",
  "LOCK_PERMANENT",
  "LOCK_MERGED",
] as const

const VOTE_ACTION_TYPES = [
  "BOOST_VOTE",
  "BOOST_ABSTAIN",
  "LOCK_TRANSFERRED",
] as const

function parseChainId(network: string | null): SupportedChainId {
  return network === "testnet" || network === "mezo-testnet"
    ? CHAIN_ID.testnet
    : CHAIN_ID.mainnet
}

async function fetchAllChunks(args: {
  chainId: SupportedChainId
  from: number
  to: number
  actionTypes: readonly string[]
  pageSize: number
  maxPages: number
}): Promise<MezoActivityItem[]> {
  const out: MezoActivityItem[] = []
  const seenIds = new Set<string>()
  let page = 0
  while (page < args.maxPages) {
    const result = await fetchMezoActivity({
      chainId: args.chainId,
      fromTimestamp: args.from,
      toTimestamp: args.to,
      page,
      limit: args.pageSize,
      actionTypes: args.actionTypes as string[],
    })
    for (const item of result.data) {
      if (seenIds.has(item.id)) continue
      seenIds.add(item.id)
      out.push(item)
    }
    if (!result.hasMore || result.data.length < args.pageSize) {
      break
    }
    page += 1
  }
  return out
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

function serializeProfile(profile: ActorProfile) {
  const serializedLockDeltaByEventId: Record<string, SerializedLockDelta> = {}
  for (const [eventId, delta] of profile.lockDeltaByEventId.entries()) {
    serializedLockDeltaByEventId[eventId] = {
      deltaVeWad: delta.deltaVeWad.toString(),
      amountAddedVeWad: delta.amountAddedVeWad.toString(),
      durationExtendedVeWad: delta.durationExtendedVeWad.toString(),
      extensionPrevAmountWad: delta.extensionPrevAmountWad
        ? delta.extensionPrevAmountWad.toString()
        : null,
      extensionPrevDurationSec: delta.extensionPrevDurationSec
        ? delta.extensionPrevDurationSec.toString()
        : null,
      extensionPostDurationSec: delta.extensionPostDurationSec
        ? delta.extensionPostDurationSec.toString()
        : null,
      flagged: delta.flagged,
      postVeWad: delta.postVeWad.toString(),
    }
  }

  const serializedEpochs = profile.epochs.map((epoch) => ({
    epochStart: epoch.epochStart,
    activeWeightWad: epoch.activeWeightWad.toString(),
    newLocksAtEpoch: epoch.newLocksAtEpoch,
    extensionsAtEpoch: epoch.extensionsAtEpoch,
    boostActionsAtEpoch: epoch.boostActionsAtEpoch,
    activeVotes: epoch.activeVotes.map((v) => ({
      key: v.key,
      gauge: v.gauge,
      tokenId: v.tokenId ? v.tokenId.toString() : undefined,
      weight: v.weight.toString(),
    })),
  }))

  return {
    actor: profile.actor,
    totalEpochs: profile.totalEpochs,
    activeEpochs: profile.activeEpochs,
    newLockCount: profile.newLockCount,
    extensionCount: profile.extensionCount,
    boostActionCount: profile.boostActionCount,
    inRangeLocks: profile.inRangeLocks.map(serializeActivityItem),
    lockDeltaByEventId: serializedLockDeltaByEventId,
    inRangeBoosts: profile.inRangeBoosts.map(serializeActivityItem),
    preRangeBoosts: profile.preRangeBoosts.map(serializeActivityItem),
    epochs: serializedEpochs,
    diagnostics: profile.diagnostics,
    blacklisted: profile.blacklisted,
    filtered: profile.filtered,
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const url = new URL(request.url)
  const chainId = parseChainId(url.searchParams.get("network"))
  const actorParam = url.searchParams.get("actor")

  if (!actorParam) {
    return new Response(
      JSON.stringify({ success: false, error: "Missing actor parameter" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS,
        },
      },
    )
  }

  let checksummedActor: Address
  try {
    checksummedActor = getAddress(actorParam.trim())
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid address" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS,
        },
      },
    )
  }

  try {
    const now = Math.floor(Date.now() / 1000)
    // Optional fixed window (unix seconds), used for per-semester point lookups.
    // Defaults to the rolling last-8-epoch window. Snapped to epoch boundaries.
    const hasExplicitTo = url.searchParams.has("to")
    const { fromTs, toTs: requestedToTs } = resolveWindow(
      url.searchParams.get("from"),
      url.searchParams.get("to"),
      now,
    )
    const toTs = hasExplicitTo ? Math.min(requestedToTs, now) : requestedToTs

    // Fetch Lock track events strictly in range
    const lockEvents: MezoActivityItem[] = []
    const lockChunkSize = 4 * WEEK
    let lockCursor = fromTs
    while (lockCursor < toTs) {
      const chunkTo = Math.min(lockCursor + lockChunkSize, toTs)
      const chunk = await fetchAllChunks({
        chainId,
        from: lockCursor,
        to: chunkTo,
        actionTypes: LOCK_ACTION_TYPES,
        pageSize: 1000,
        maxPages: 12,
      })
      lockEvents.push(...chunk)
      lockCursor = chunkTo
    }

    // Fetch Vote track events walk backward
    const voteEvents: MezoActivityItem[] = []
    const seenVoteIds = new Set<string>()
    let consecutiveEmpty = 0
    const voteChunkSize = 2 * WEEK
    const hardFloor = Math.max(toTs - 3 * 365 * 86_400, 0)
    let voteEnd = toTs
    while (voteEnd > hardFloor) {
      const chunkFrom = Math.max(voteEnd - voteChunkSize, hardFloor)
      const chunk = await fetchAllChunks({
        chainId,
        from: chunkFrom,
        to: voteEnd,
        actionTypes: VOTE_ACTION_TYPES,
        pageSize: 1000,
        maxPages: 12,
      })
      if (chunk.length === 0) {
        consecutiveEmpty += 1
        if (consecutiveEmpty >= 6) {
          break
        }
      } else {
        consecutiveEmpty = 0
        for (const ev of chunk) {
          if (seenVoteIds.has(ev.id)) continue
          seenVoteIds.add(ev.id)
          voteEvents.push(ev)
        }
      }
      voteEnd = chunkFrom
    }

    const blacklist = new Set(BLACKLISTED_SYSTEM_ACTORS)

    // Compute profile
    const actorProfile = computeActorProfile({
      actor: checksummedActor,
      lockEvents,
      voteEvents,
      fromTs,
      toTs,
      blacklist,
      includeOpenEpoch: hasExplicitTo,
    })

    // Compute row from simulate
    const params = defaultAcademyParams()

    const simResult = simulate(
      {
        lockEvents,
        voteEvents,
        blacklist,
      },
      params,
      fromTs,
      toTs,
      { includeOpenEpoch: hasExplicitTo },
    )

    const lowerActor = checksummedActor.toLowerCase()
    const row =
      simResult.rows.find((r) => r.actor.toLowerCase() === lowerActor) ?? null

    const serializedRow = row
      ? {
          actor: row.actor,
          pointsWad: row.pointsWad.toString(),
          lockPointsWad: row.lockPointsWad.toString(),
          extensionPointsWad: row.extensionPointsWad.toString(),
          votePointsWad: row.votePointsWad.toString(),
          participationBonusWad: row.participationBonusWad.toString(),
          rewardMezoWad: row.rewardMezoWad.toString(),
          vePowerWad: row.vePowerWad.toString(),
          newLockCount: row.newLockCount,
          extensionCount: row.extensionCount,
          boostCount: row.boostCount,
          activeEpochs: row.activeEpochs,
          fullyParticipated: row.fullyParticipated,
          flagged: row.flagged,
          culledBelowFloor: row.culledBelowFloor,
        }
      : null

    const response = {
      success: true,
      profile: serializeProfile(actorProfile),
      row: serializedRow,
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=300",
        ...CORS_HEADERS,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
    })
  }
}
