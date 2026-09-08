import { QUERY_PROFILES } from "@/config/queryProfiles"
import type { MezoGaugeRow } from "@/hooks/useMezoGauges"
import useMezoGauges from "@/hooks/useMezoGauges"
import {
  type GeckoTerminalNetwork,
  MEZO_GAUGES,
  type MezoGaugeIdentity,
  geckoNetworkFor,
  mezoGaugeAddresses,
} from "@/lib/mezoGauges"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import type { Address } from "viem"
import { getAddress } from "viem"
import { z } from "zod"

const remotePoolsResponseSchema = z.object({
  pools: z.array(
    z.object({
      gauge: z.string(),
      geckoNetwork: z.enum(["base", "eth"]),
      geckoPoolId: z.string(),
      venueName: z.string().nullable(),
      reserveUsd: z.number().nullable(),
      volume24hUsd: z.number().nullable(),
    }),
  ),
  timestamp: z.number(),
})

export type RemoteMezoPoolCard = {
  gauge: Address
  identity: MezoGaugeIdentity
  geckoNetwork: GeckoTerminalNetwork
  geckoPoolId: string
  venueName: string | null
  reserveUsd: number | null
  volume24hUsd: number | null
  mezo: MezoGaugeRow | undefined
}

async function fetchRemotePools(): Promise<
  Omit<RemoteMezoPoolCard, "mezo" | "identity">[]
> {
  const response = await fetch("/api/remote-pools", { cache: "no-store" })
  if (!response.ok) {
    throw new Error(`Failed to fetch remote MEZO pools: ${response.status}`)
  }
  const parsed = remotePoolsResponseSchema.parse(await response.json())
  return parsed.pools.map((pool) => ({
    ...pool,
    gauge: getAddress(pool.gauge),
  }))
}

export default function useRemoteMezoPools(): {
  pools: RemoteMezoPoolCard[]
  isLoading: boolean
  isError: boolean
} {
  const {
    data,
    isLoading: isLoadingVenue,
    isError: isVenueError,
  } = useQuery({
    queryKey: ["remote-mezo-pools"],
    queryFn: fetchRemotePools,
    ...QUERY_PROFILES.SHORT_CACHE,
  })
  const {
    rows,
    isLoading: isLoadingMezo,
    isError: isMezoError,
  } = useMezoGauges()

  const mezoByGauge = useMemo(() => {
    const map = new Map<string, MezoGaugeRow>()
    for (const row of rows ?? []) {
      map.set(row.gauge.toLowerCase(), row)
    }
    return map
  }, [rows])

  const pools = useMemo(() => {
    const venueByGauge = new Map(
      (data ?? []).map((pool) => [pool.gauge.toLowerCase(), pool]),
    )
    return mezoGaugeAddresses().flatMap((gauge) => {
      const identity = MEZO_GAUGES[gauge]
      if (!identity) return []
      const venue = venueByGauge.get(gauge.toLowerCase())
      return [
        {
          gauge,
          identity,
          geckoNetwork:
            venue?.geckoNetwork ?? geckoNetworkFor(identity.network),
          geckoPoolId: venue?.geckoPoolId ?? identity.geckoPoolId,
          venueName: venue?.venueName ?? null,
          reserveUsd: venue?.reserveUsd ?? null,
          volume24hUsd: venue?.volume24hUsd ?? null,
          mezo: mezoByGauge.get(gauge.toLowerCase()),
        },
      ]
    })
  }, [data, mezoByGauge])

  return {
    pools,
    isLoading: (isLoadingVenue && data === undefined) || isLoadingMezo,
    isError: isVenueError || isMezoError,
  }
}
