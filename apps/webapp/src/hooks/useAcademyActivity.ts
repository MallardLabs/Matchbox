import type { MezoActivityItem } from "@/types/mezoActivity"
import { useQuery } from "@tanstack/react-query"

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

export type AcademyData = {
  lockEvents: MezoActivityItem[]
  voteEvents: MezoActivityItem[]
  pagesFetched: number
  voteChunksFetched: number
  voteOldestTimestamp: number | null
  truncatedLockChunks: number
  truncatedVoteChunks: number
}

export type FetchProgress = {
  phase: "idle" | "locks" | "votes" | "done"
  lockEventsFetched: number
  voteEventsFetched: number
  lockChunksDone: number
  voteChunksDone: number
  totalLockChunks: number
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

const EMPTY_ACTIVITY: AcademyData = {
  lockEvents: [],
  voteEvents: [],
  pagesFetched: 0,
  voteChunksFetched: 0,
  voteOldestTimestamp: null,
  truncatedLockChunks: 0,
  truncatedVoteChunks: 0,
}

export function useAcademyActivity(_params: UseAcademyActivityParams) {
  const query = useQuery<AcademyData>({
    queryKey: ["academy-activity", "disabled"],
    enabled: false,
    queryFn: async () => EMPTY_ACTIVITY,
  })

  return { ...query, progress: INITIAL_PROGRESS }
}
