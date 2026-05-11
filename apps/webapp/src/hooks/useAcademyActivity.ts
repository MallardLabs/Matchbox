import { useNetwork } from "@/contexts/NetworkContext"
import { WEEK } from "@/lib/academy/epoch"
import { deserializeActivityItem } from "@/lib/mezoActivity/normalize"
import type {
  MezoActivityApiResponse,
  MezoActivityItem,
} from "@/types/mezoActivity"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useQuery } from "@tanstack/react-query"

type UseAcademyActivityParams = {
  fromTimestamp: number
  toTimestamp: number
  enabled: boolean
  pageSize?: number
  maxPagesPerChunk?: number
  chunkWeeks?: number
}

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
}): Promise<MezoActivityApiResponse> {
  const params = new URLSearchParams()
  params.set("network", args.network)
  params.set("limit", String(args.limit))
  params.set("from", String(args.from))
  params.set("to", String(args.to))
  params.set("page", String(args.page))
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

export type AcademyActivityResult = {
  events: MezoActivityItem[]
  chunksFetched: number
  pagesFetched: number
  truncatedChunks: number
}

export function useAcademyActivity({
  fromTimestamp,
  toTimestamp,
  enabled,
  pageSize = 1000,
  maxPagesPerChunk = 4,
  chunkWeeks = 1,
}: UseAcademyActivityParams) {
  const { chainId, isNetworkReady } = useNetwork()
  const network = NETWORK_BY_CHAIN[chainId]

  return useQuery<AcademyActivityResult>({
    queryKey: [
      "academy-activity",
      network,
      fromTimestamp,
      toTimestamp,
      pageSize,
      maxPagesPerChunk,
      chunkWeeks,
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
      const all: MezoActivityItem[] = []
      const seen = new Set<string>()
      let chunksFetched = 0
      let pagesFetched = 0
      let truncatedChunks = 0

      const chunkSize = chunkWeeks * WEEK
      let cursor = fromTimestamp
      while (cursor < toTimestamp) {
        const chunkFrom = cursor
        const chunkTo = Math.min(cursor + chunkSize, toTimestamp)

        let page = 0
        while (page < maxPagesPerChunk) {
          // eslint-disable-next-line no-await-in-loop
          const result = await fetchPage({
            network: network as string,
            from: chunkFrom,
            to: chunkTo,
            page,
            limit: pageSize,
          })
          pagesFetched += 1
          for (const item of result.data) {
            if (seen.has(item.id)) continue
            seen.add(item.id)
            all.push(deserializeActivityItem(item))
          }
          if (!result.hasMore || result.data.length < pageSize) break
          page += 1
          if (page === maxPagesPerChunk) {
            truncatedChunks += 1
          }
        }
        chunksFetched += 1
        cursor = chunkTo
      }

      return {
        events: all,
        chunksFetched,
        pagesFetched,
        truncatedChunks,
      }
    },
  })
}
