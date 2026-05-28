import { BLACKLISTED_SYSTEM_ACTORS } from "@/lib/academy/blacklistedActors"
import { WEEK, snapToThursdayUTC } from "@/lib/academy/epoch"
import { simulate } from "@/lib/academy/simulate"
import { fetchMezoActivity } from "@/lib/mezoActivity/dataSources"
import type { MezoActivityItem } from "@/types/mezoActivity"
import { CHAIN_ID, type SupportedChainId } from "@repo/shared/contracts"

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

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const url = new URL(request.url)
  const chainId = parseChainId(url.searchParams.get("network"))

  try {
    const now = Math.floor(Date.now() / 1000)
    const toTs = snapToThursdayUTC(now, "down")
    const fromTs = toTs - 8 * WEEK

    // 1. Fetch Lock track events strictly in range
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

    // 2. Fetch Vote track events walk backward
    const voteEvents: MezoActivityItem[] = []
    const seenVoteIds = new Set<string>()
    let consecutiveEmpty = 0
    const voteChunkSize = 2 * WEEK
    const hardFloor = Math.max(toTs - 3 * 365 * 86_400, 0) // 3 years max lookback
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

    const params = {
      budgetMezoWad: 1_000_000n * 10n ** 18n, // 1M default S0 budget
      weightNew: 2,
      weightExt: 1,
      weightBoost: 1,
      participationMultiplier: 2,
      mezoUsd: 0.05,
      rewardFloorMezoWad: 20n * 10n ** 18n,
    }

    const simResult = simulate(
      {
        lockEvents,
        voteEvents,
        blacklist,
      },
      params,
      fromTs,
      toTs,
    )

    const serializedRows = simResult.rows.map((row) => ({
      actor: row.actor,
      pointsWad: row.pointsWad.toString(),
      lockPointsWad: row.lockPointsWad.toString(),
      extensionPointsWad: row.extensionPointsWad.toString(),
      votePointsWad: row.votePointsWad.toString(),
      participationBonusWad: row.participationBonusWad.toString(),
      vePowerWad: row.vePowerWad.toString(),
      newLockCount: row.newLockCount,
      extensionCount: row.extensionCount,
      boostCount: row.boostCount,
      activeEpochs: row.activeEpochs,
      fullyParticipated: row.fullyParticipated,
      flagged: row.flagged,
    }))

    const serializedTotals = {
      pointsWad: simResult.totals.pointsWad.toString(),
      participants: simResult.totals.participants,
      boostCount: simResult.totals.boostCount,
      newLockCount: simResult.totals.newLockCount,
      extensionCount: simResult.totals.extensionCount,
      totalEpochs: simResult.totals.totalEpochs,
      fullParticipationCount: simResult.totals.fullParticipationCount,
      activeVoteAggregateWad:
        simResult.totals.activeVoteAggregateWad.toString(),
    }

    const response = {
      success: true,
      rows: serializedRows,
      totals: serializedTotals,
      meta: {
        fromTs,
        toTs,
        generatedAt: now,
      },
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=14400, stale-while-revalidate=3600",
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
