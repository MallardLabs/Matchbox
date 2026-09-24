export { handler as GET, handler as OPTIONS }

import {
  BASELINE,
  BASELINE_POST14D_TO,
  BASELINE_PRE14D_FROM,
} from "@/lib/mezoGauges/constants"
import { WEEK, epochStartFor } from "@/lib/mezoGauges/epochs"
import { MEZO_GAUGES_CORS_HEADERS } from "@/lib/mezoGauges/rpc"
import { mezoGaugesLocksSchema } from "@/lib/mezoGauges/schema"
import { fetchVeMezoLockCreations } from "@/lib/mezoGauges/subgraph"
import { createLogger } from "@repo/shared/logger"

const logger = createLogger("mezo-gauges-locks-api")

async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: MEZO_GAUGES_CORS_HEADERS,
    })
  }

  try {
    const now = Math.floor(Date.now() / 1000)
    const locks = await fetchVeMezoLockCreations({ fromTs: 0, toTs: now })

    const currentEpochStart = epochStartFor(now)
    const weekly: { epochStart: number; count: number }[] = []
    for (let i = 8; i >= 0; i--) {
      const start = currentEpochStart - i * WEEK
      const end = start + WEEK
      weekly.push({
        epochStart: start,
        count: locks.filter((l) => l.timestamp >= start && l.timestamp < end)
          .length,
      })
    }

    const pre14d = locks.filter(
      (l) =>
        l.timestamp >= BASELINE_PRE14D_FROM && l.timestamp < BASELINE.timestamp,
    ).length
    const post14d = locks.filter(
      (l) =>
        l.timestamp >= BASELINE.timestamp && l.timestamp < BASELINE_POST14D_TO,
    ).length

    return Response.json(
      mezoGaugesLocksSchema.parse({
        weekly,
        pre14d: {
          from: BASELINE_PRE14D_FROM,
          to: BASELINE.timestamp,
          count: pre14d,
        },
        post14d: {
          from: BASELINE.timestamp,
          to: BASELINE_POST14D_TO,
          count: post14d,
        },
        total: locks.length,
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
      message: "Unable to build mezo gauges locks",
      error: error instanceof Error ? error.message : "unknown",
    })
    return Response.json(
      { error: "Unable to build locks" },
      { status: 502, headers: MEZO_GAUGES_CORS_HEADERS },
    )
  }
}
