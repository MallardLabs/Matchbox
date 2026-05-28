import { useNetwork } from "@/contexts/NetworkContext"
import { WEEK } from "@/lib/academy/epoch"
import { deserializeActivityItem } from "@/lib/mezoActivity/normalize"
import type {
  MezoActivityApiResponse,
  MezoActivityItem,
} from "@/types/mezoActivity"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useQuery } from "@tanstack/react-query"
import { useCallback, useRef, useState } from "react"

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
  "LOCK_MERGED",
] as const

// LOCK_TRANSFERRED rides with the vote stream — the simulator's epoch
// replay needs to interleave transfers with Voted/Abstained events so that
// a transfer between the seller's last manual vote and the next manual
// re-vote clears the sticky weight at the correct snapshot.
const VOTE_ACTION_TYPES = [
  "BOOST_VOTE",
  "BOOST_ABSTAIN",
  "LOCK_TRANSFERRED",
] as const

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
  order?: "asc" | "desc"
}): Promise<MezoActivityApiResponse> {
  const params = new URLSearchParams()
  params.set("network", args.network)
  params.set("limit", String(args.limit))
  params.set("from", String(args.from))
  params.set("to", String(args.to))
  params.set("page", String(args.page))
  params.set("actionTypes", args.actionTypes.join(","))
  if (args.order === "asc") params.set("order", "asc")
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

// Pre-flight: ask the subgraph for the SINGLE oldest event in the vote-track
// action set anywhere in the supported lookback window. Used to tighten the
// expected-vote-chunks estimate so the progress bar's denominator isn't the
// pessimistic 3-year max. Returns null when no event exists (very fresh
// subgraph or wrong network), and the caller falls back to the max bound.
async function fetchOldestVoteEventTimestamp(args: {
  network: string
  from: number
  to: number
}): Promise<number | null> {
  try {
    const res = await fetchPage({
      network: args.network,
      from: args.from,
      to: args.to,
      page: 0,
      limit: 1,
      actionTypes: VOTE_ACTION_TYPES,
      order: "asc",
    })
    const first = res.data[0]
    if (!first?.timestamp) return null
    const n = Number(first.timestamp)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
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

// Live counters surfaced to the UI while the queryFn is running. `phase`
// drives the progress bar's label: `idle` before kickoff, `locks` during the
// lock-chunk loop, `votes` during the vote-chunk loop, `done` when finished.
// `totalLockChunks` is exact; `voteChunksDone` is unbounded (we stop the
// vote loop only when we hit consecutive empties) so we render an
// indeterminate bar during the vote phase.
export type FetchProgress = {
  phase: "idle" | "locks" | "votes" | "done"
  lockEventsFetched: number
  voteEventsFetched: number
  lockChunksDone: number
  voteChunksDone: number
  totalLockChunks: number
  // Upper bound + refined estimate for the vote-chunk denominator.
  // `expectedVoteChunks` starts as the 3-year max and tightens after the
  // pre-flight oldest-event query resolves. The vote loop can still exit
  // early via the consecutive-empty heuristic; when that happens the bar
  // animates from wherever it is to 100% via the phase flip to "done".
  expectedVoteChunks: number
}

const INITIAL_PROGRESS: FetchProgress = {
  phase: "idle",
  lockEventsFetched: 0,
  voteEventsFetched: 0,
  lockChunksDone: 0,
  voteChunksDone: 0,
  totalLockChunks: 0,
  expectedVoteChunks: 0,
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

  // Live progress is held in React state so the UI can re-render between
  // chunk fetches. We funnel the setter through a ref so the queryFn closure
  // can call the latest setter without becoming a useQuery dep (which would
  // re-trigger the query on every progress tick).
  const [progress, setProgress] = useState<FetchProgress>(INITIAL_PROGRESS)
  const updateProgress = useCallback(
    (
      patch: Partial<FetchProgress> | ((prev: FetchProgress) => FetchProgress),
    ) => {
      setProgress((prev) =>
        typeof patch === "function" ? patch(prev) : { ...prev, ...patch },
      )
    },
    [],
  )
  const progressRef = useRef(updateProgress)
  progressRef.current = updateProgress

  const query = useQuery<AcademyData>({
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
      const totalLockChunks = Math.max(
        1,
        Math.ceil((toTimestamp - fromTimestamp) / lockChunkSize),
      )
      const voteChunkSize = voteChunkWeeks * WEEK
      const hardFloor = Math.max(
        toTimestamp - voteMaxLookbackYears * 365 * 86_400,
        0,
      )
      // Initial pessimistic upper bound — the most chunks we'd scan if the
      // subgraph had a vote event all the way back at the 3-year hardFloor.
      // We add `voteEmptyChunkStopAfter` to account for the trailing empty
      // chunks the loop scans BEFORE deciding to stop (otherwise the bar
      // hits 100% while the loop is still doing its empty-chunk grace
      // window and the events counter keeps ticking).
      const maxVoteChunks = Math.max(
        1,
        Math.ceil((toTimestamp - hardFloor) / voteChunkSize),
      )

      // Reset counters at the start of every fresh fetch so a re-run (range
      // change, network swap) starts from zero rather than continuing the
      // previous run's totals.
      progressRef.current({
        phase: "locks",
        lockEventsFetched: 0,
        voteEventsFetched: 0,
        lockChunksDone: 0,
        voteChunksDone: 0,
        totalLockChunks,
        expectedVoteChunks: maxVoteChunks,
      })

      // Pre-flight (fire and forget — don't block the lock loop on this).
      // Tightens expectedVoteChunks once the subgraph reports the oldest
      // vote-track event timestamp it has indexed. If the call fails we keep
      // the maxVoteChunks pessimistic bound.
      void fetchOldestVoteEventTimestamp({
        network: network as string,
        from: hardFloor,
        to: toTimestamp,
      }).then((oldest) => {
        if (oldest === null) return
        const span = Math.max(0, toTimestamp - oldest)
        // Real chunks executed ≈ chunks-with-data + the empty-stop grace
        // window the loop scans before deciding nothing's left. Without the
        // +empty term the bar hits 100% while the loop is still scanning
        // those trailing empty chunks and the events counter keeps ticking.
        const chunksWithData = Math.max(1, Math.ceil(span / voteChunkSize))
        const refined = Math.min(
          maxVoteChunks,
          chunksWithData + voteEmptyChunkStopAfter,
        )
        progressRef.current((prev) => ({
          ...prev,
          expectedVoteChunks: refined,
        }))
      })

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
        progressRef.current((prev) => ({
          ...prev,
          lockEventsFetched: lockEvents.length,
          lockChunksDone: prev.lockChunksDone + 1,
        }))
      }

      const voteEvents: MezoActivityItem[] = []
      const seenVoteIds = new Set<string>()
      let voteChunksFetched = 0
      let truncatedVoteChunks = 0
      let consecutiveEmpty = 0
      // voteChunkSize / hardFloor are defined above next to maxVoteChunks.
      let voteEnd = toTimestamp
      let oldestSeen: number | null = null
      progressRef.current({ phase: "votes" })
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
        progressRef.current((prev) => ({
          ...prev,
          voteEventsFetched: voteEvents.length,
          voteChunksDone: prev.voteChunksDone + 1,
        }))
      }

      progressRef.current({ phase: "done" })
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

  return { ...query, progress }
}
