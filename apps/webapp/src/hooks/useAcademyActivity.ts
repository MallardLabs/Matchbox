import { useNetwork } from "@/contexts/NetworkContext"
import { deserializeActivityItem } from "@/lib/mezoActivity/normalize"
import type {
  MezoActivityApiResponse,
  MezoActivityCursor,
  MezoActivityItem,
} from "@/types/mezoActivity"
import { CHAIN_ID } from "@repo/shared/contracts"
import { useQuery } from "@tanstack/react-query"

type UseAcademyActivityParams = {
  fromTimestamp: number
  toTimestamp: number
  enabled: boolean
  pageSize?: number
  maxPages?: number
}

const NETWORK_BY_CHAIN: Record<number, "mainnet" | "testnet"> = {
  [CHAIN_ID.mainnet]: "mainnet",
  [CHAIN_ID.testnet]: "testnet",
}

async function fetchPage(args: {
  network: string
  from: number
  to: number
  cursor?: MezoActivityCursor
  limit: number
}): Promise<MezoActivityApiResponse> {
  const params = new URLSearchParams()
  params.set("network", args.network)
  params.set("limit", String(args.limit))
  params.set("from", String(args.from))
  params.set("to", String(args.to))
  if (args.cursor) params.set("cursor", JSON.stringify(args.cursor))
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
  pagesFetched: number
  truncated: boolean
}

export function useAcademyActivity({
  fromTimestamp,
  toTimestamp,
  enabled,
  pageSize = 1000,
  maxPages = 10,
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
      maxPages,
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
      let cursor: MezoActivityCursor | undefined
      let pages = 0
      let truncated = false

      for (let i = 0; i < maxPages; i++) {
        const page = await fetchPage({
          network: network as string,
          from: fromTimestamp,
          to: toTimestamp,
          ...(cursor ? { cursor } : {}),
          limit: pageSize,
        })
        pages += 1
        for (const item of page.data) all.push(deserializeActivityItem(item))
        if (!page.nextCursor || page.data.length < pageSize) {
          cursor = undefined
          break
        }
        cursor = page.nextCursor
        if (i === maxPages - 1) truncated = true
      }

      return { events: all, pagesFetched: pages, truncated }
    },
  })
}
