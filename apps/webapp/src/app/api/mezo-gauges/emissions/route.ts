export { handler as GET, handler as OPTIONS }

import { LAUNCH_EPOCH_START, MEZO_GAUGES } from "@/lib/mezoGauges/constants"
import { WEEK, epochStartFor } from "@/lib/mezoGauges/epochs"
import {
  MEZO_GAUGES_CORS_HEADERS,
  createMezoMainnetClient,
} from "@/lib/mezoGauges/rpc"
import { mezoGaugesEmissionsSchema } from "@/lib/mezoGauges/schema"
import { fetchThirdPartyRewardEvents } from "@/lib/mezoGauges/subgraph"
import {
  BRIBE_ABI,
  CONTRACTS,
  THIRD_PARTY_VOTER_ABI,
} from "@repo/shared/contracts"
import { createLogger } from "@repo/shared/logger"
import { getAddress, zeroAddress } from "viem"

const logger = createLogger("mezo-gauges-emissions-api")

const LISTED_BY_LOWER = new Map(
  Object.entries(MEZO_GAUGES).map(([address, config]) => [
    address.toLowerCase(),
    config.name,
  ]),
)

async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: MEZO_GAUGES_CORS_HEADERS,
    })
  }

  const sinceParam = new URL(request.url).searchParams.get("since")
  const since =
    sinceParam === null ? LAUNCH_EPOCH_START - 4 * WEEK : Number(sinceParam)
  if (!Number.isFinite(since) || since < 0) {
    return Response.json(
      { error: "Invalid since parameter" },
      { status: 400, headers: MEZO_GAUGES_CORS_HEADERS },
    )
  }

  try {
    const client = createMezoMainnetClient()
    const now = Math.floor(Date.now() / 1000)
    const currentEpochStart = epochStartFor(now)

    const events = await fetchThirdPartyRewardEvents({
      fromTs: since,
      toTs: now,
    })

    const byEpoch = new Map<number, Map<string, bigint>>()
    for (const event of events) {
      const epochStart = epochStartFor(event.timestamp)
      const gauge = event.gauge.toLowerCase()
      const epochMap = byEpoch.get(epochStart) ?? new Map()
      epochMap.set(gauge, (epochMap.get(gauge) ?? 0n) + event.amount)
      byEpoch.set(epochStart, epochMap)
    }

    const gaugeAddresses = Object.keys(MEZO_GAUGES).map((a) => getAddress(a))
    const voter = CONTRACTS.mainnet.thirdPartyVoter
    const currentBribes = await Promise.all(
      gaugeAddresses.map(async (gauge) => {
        const bribe = await client
          .readContract({
            address: voter,
            abi: THIRD_PARTY_VOTER_ABI,
            functionName: "gaugeToBribe",
            args: [gauge],
          })
          .catch(() => zeroAddress)
        if (bribe === zeroAddress) {
          return {
            gauge,
            bribe,
            rewards: [] as { token: string; amount: string }[],
          }
        }
        const rewardsLength = await client
          .readContract({
            address: bribe,
            abi: BRIBE_ABI,
            functionName: "rewardsListLength",
          })
          .catch(() => 0n)
        const tokens = await Promise.all(
          Array.from({ length: Number(rewardsLength) }, (_, i) =>
            client
              .readContract({
                address: bribe,
                abi: BRIBE_ABI,
                functionName: "rewards",
                args: [BigInt(i)],
              })
              .catch(() => zeroAddress),
          ),
        )
        const rewards = await Promise.all(
          tokens
            .filter((t) => t !== zeroAddress)
            .map(async (token) => ({
              token,
              amount: (
                await client
                  .readContract({
                    address: bribe,
                    abi: BRIBE_ABI,
                    functionName: "tokenRewardsPerEpoch",
                    args: [token, BigInt(currentEpochStart)],
                  })
                  .catch(() => 0n)
              ).toString(),
            })),
        )
        return { gauge, bribe, rewards }
      }),
    )

    return Response.json(
      mezoGaugesEmissionsSchema.parse({
        since,
        currentEpochStart,
        distributedByEpoch: [...byEpoch.entries()]
          .sort(([a], [b]) => a - b)
          .map(([epochStart, gauges]) => {
            const rows = [...gauges.entries()].map(([gauge, amount]) => ({
              gauge,
              name: LISTED_BY_LOWER.get(gauge) ?? gauge,
              listed: LISTED_BY_LOWER.has(gauge),
              amount: amount.toString(),
            }))
            const total = rows.reduce((sum, r) => sum + BigInt(r.amount), 0n)
            return {
              epochStart,
              total: total.toString(),
              gauges: rows,
            }
          }),
        currentEpochBribes: currentBribes,
      }),
      {
        headers: {
          ...MEZO_GAUGES_CORS_HEADERS,
          "Cache-Control": "public, s-maxage=300",
        },
      },
    )
  } catch (error) {
    logger.error({
      message: "Unable to build mezo gauges emissions",
      error: error instanceof Error ? error.message : "unknown",
    })
    return Response.json(
      { error: "Unable to build emissions" },
      { status: 502, headers: MEZO_GAUGES_CORS_HEADERS },
    )
  }
}
