import { useNetwork } from "@/contexts/NetworkContext"
import { WEEK } from "@/lib/academy/epoch"
import { deserializeActivityItem } from "@/lib/mezoActivity/normalize"
import type {
  MezoActivityApiResponse,
  MezoActivityItem,
} from "@/types/mezoActivity"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useQuery } from "@tanstack/react-query"

// The simulator needs two different fetches:
//
//   (a) Lock / extension events strictly INSIDE [fromTs, toTs]. Those are
//       one-shot points awarded at the moment of action.
//
//   (b) Vote / abstain events from the SUBGRAPH GENESIS through `toTs`.
//       Vote points are computed via epoch-snapshot replay, which needs the
//       full event history to determine each voter's active vote state at
//       the start of every epoch in the range — including votes set before
//       the range that are still active (votes are sticky on-chain until
//       a `reset` / `abstain` call).
//
// Both fetches chunk by week with internal page pagination (up to 4 pages of
// 1000 events per chunk = 4000 events/week ceiling). For (b) we walk backward
// from `toTs` and stop after a few consecutive empty chunks to avoid hammering
// the API past the subgraph's start block.

type UseAcademyActivityParams = {
  fromTimestamp: number
  toTimestamp: number
  enabled: boolean
  pageSize?: number
  maxPagesPerChunk?: number
  lockChunkWeeks?: number
  voteChunkWeeks?: number
  voteEmptyChunkStopAfter?: number
  voteMaxLookbackYears?: number
}

const LOCK_ACTION_TYPES = [
  "LOCK_CREATED",
  "LOCK_AMOUNT_INCREASED",
  "LOCK_EXTENDED",
  "LOCK_PERMANENT",
] as const

const VOTE_ACTION_TYPES = ["BOOST_VOTE", "BOOST_ABSTAIN"] as const

const NETWORK_BY_CHAIN: Record<number, "mainnet" | "testnet"> = {
  [CHAIN_ID.mainnet]: "mainnet",
  [CHAIN_ID.testnet]: "testnet",
}

async function fetchPage(args: {
  network: string
  from: number
  to: number
  page: number
  limit: number
  actionTypes: readonly string[]
}): Promise<MezoActivityApiResponse> {
  const params = new URLSearchParams()
  params.set("network", args.network)
  params.set("limit", String(args.limit))
  params.set("from", String(args.from))
  params.set("to", String(args.to))
  params.set("page", String(args.page))
  params.set("actionTypes", args.actionTypes.join(","))
  const res = await fetch(`/api/activity?${params.toString()}`, {
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(`Activity API failed: ${res.status}`)
  }
  const json = (await res.json()) as MezoActivityApiResponse
  if (!json.success) throw new Error("Activity API reported failure")
  return json
}

async function fetchChunk(args: {
  network: string
  from: number
  to: number
  pageSize: number
  maxPages: number
  actionTypes: readonly string[]
}): Promise<{
  data: MezoActivityItem[]
  pagesFetched: number
  truncated: boolean
}> {
  const out: MezoActivityItem[] = []
  let page = 0
  while (page < args.maxPages) {
    // eslint-disable-next-line no-await-in-loop
    const result = await fetchPage({
      network: args.network,
      from: args.from,
      to: args.to,
      page,
      limit: args.pageSize,
      actionTypes: args.actionTypes,
    })
    for (const item of result.data) out.push(deserializeActivityItem(item))
    if (!result.hasMore || result.data.length < args.pageSize) {
      return { data: out, pagesFetched: page + 1, truncated: false }
    }
    page += 1
  }
  return { data: out, pagesFetched: page, truncated: true }
}

export type AcademyData = {
  lockEvents: MezoActivityItem[]
  voteEvents: MezoActivityItem[]
  pagesFetched: number
  voteChunksFetched: number
  voteOldestTimestamp: number | null
  truncatedLockChunks: number
  truncatedVoteChunks: number
}

export function useAcademyActivity({
  fromTimestamp,
  toTimestamp,
  enabled,
  // Subgraph caps `first` at 1000 — dataSources will clamp regardless. Keep
  // the page size at the cap so we maximise per-request throughput.
  pageSize = 1000,
  // Vote chunks fill up fast when poke-driven Voted events dominate (each
  // boost refresh emits one). 12 pages × 1000 = 12k events per chunk.
  maxPagesPerChunk = 12,
  // Smaller vote chunks reduce the chance of any single chunk exceeding the
  // per-chunk page budget. Locks are sparse so a wider chunk is fine.
  lockChunkWeeks = 4,
  voteChunkWeeks = 2,
  voteEmptyChunkStopAfter = 6,
  voteMaxLookbackYears = 3,
}: UseAcademyActivityParams) {
  const { chainId, isNetworkReady } = useNetwork()
  const network = NETWORK_BY_CHAIN[chainId]

  return useQuery<AcademyData>({
    queryKey: [
      "academy-activity",
      network,
      fromTimestamp,
      toTimestamp,
      pageSize,
      maxPagesPerChunk,
      lockChunkWeeks,
      voteChunkWeeks,
    ],
    enabled:
      enabled &&
      isNetworkReady &&
      !!network &&
      Number.isFinite(fromTimestamp) &&
      Number.isFinite(toTimestamp) &&
      toTimestamp > fromTimestamp,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const lockEvents: MezoActivityItem[] = []
      const seenLockIds = new Set<string>()
      let pagesFetched = 0
      let truncatedLockChunks = 0

      const lockChunkSize = lockChunkWeeks * WEEK
      let lockCursor = fromTimestamp
      while (lockCursor < toTimestamp) {
        const chunkTo = Math.min(lockCursor + lockChunkSize, toTimestamp)
        // eslint-disable-next-line no-await-in-loop
        const chunk = await fetchChunk({
          network: network as string,
          from: lockCursor,
          to: chunkTo,
          pageSize,
          maxPages: maxPagesPerChunk,
          actionTypes: LOCK_ACTION_TYPES,
        })
        pagesFetched += chunk.pagesFetched
        for (const item of chunk.data) {
          if (seenLockIds.has(item.id)) continue
          seenLockIds.add(item.id)
          lockEvents.push(item)
        }
        if (chunk.truncated) truncatedLockChunks += 1
        lockCursor = chunkTo
      }

      const voteEvents: MezoActivityItem[] = []
      const seenVoteIds = new Set<string>()
      let voteChunksFetched = 0
      let truncatedVoteChunks = 0
      let consecutiveEmpty = 0
      const voteChunkSize = voteChunkWeeks * WEEK
      const hardFloor = Math.max(
        toTimestamp - voteMaxLookbackYears * 365 * 86_400,
        0,
      )
      let voteEnd = toTimestamp
      let oldestSeen: number | null = null
      while (voteEnd > hardFloor) {
        const chunkFrom = Math.max(voteEnd - voteChunkSize, hardFloor)
        // eslint-disable-next-line no-await-in-loop
        const chunk = await fetchChunk({
          network: network as string,
          from: chunkFrom,
          to: voteEnd,
          pageSize,
          maxPages: maxPagesPerChunk,
          actionTypes: VOTE_ACTION_TYPES,
        })
        voteChunksFetched += 1
        pagesFetched += chunk.pagesFetched
        if (chunk.truncated) truncatedVoteChunks += 1
        if (chunk.data.length === 0) {
          consecutiveEmpty += 1
          if (consecutiveEmpty >= voteEmptyChunkStopAfter) break
        } else {
          consecutiveEmpty = 0
          for (const item of chunk.data) {
            if (seenVoteIds.has(item.id)) continue
            seenVoteIds.add(item.id)
            voteEvents.push(item)
            if (oldestSeen === null || item.timestamp < oldestSeen) {
              oldestSeen = item.timestamp
            }
          }
        }
        voteEnd = chunkFrom
      }

      return {
        lockEvents,
        voteEvents,
        pagesFetched,
        voteChunksFetched,
        voteOldestTimestamp: oldestSeen,
        truncatedLockChunks,
        truncatedVoteChunks,
      }
    },
  })
}
