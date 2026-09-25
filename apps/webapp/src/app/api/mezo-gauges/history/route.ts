export { handler as GET, handler as OPTIONS }

import { findBlockAtOrBefore } from "@/lib/mezoGauges/blocks"
import { BASELINE } from "@/lib/mezoGauges/constants"
import { epochClosesSinceLaunch } from "@/lib/mezoGauges/epochs"
import {
  MEZO_GAUGES_CORS_HEADERS,
  createMezoMainnetClient,
} from "@/lib/mezoGauges/rpc"
import { mezoGaugesHistorySchema } from "@/lib/mezoGauges/schema"
import { buildParticipationSnapshot } from "@/lib/mezoGauges/snapshot"

async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: MEZO_GAUGES_CORS_HEADERS,
    })
  }

  try {
    const client = createMezoMainnetClient()
    const now = Math.floor(Date.now() / 1000)
    const closes = epochClosesSinceLaunch(now)

    const timestamps = [BASELINE.timestamp, ...closes]
    const entries = await Promise.all(
      timestamps.map(async (ts, index) => {
        const block = await findBlockAtOrBefore(client, ts)
        const snapshot = await buildParticipationSnapshot({
          client,
          blockNumber: block.number,
        })
        return {
          kind: index === 0 ? ("baseline" as const) : ("epochClose" as const),
          at: ts,
          snapshot,
        }
      }),
    )

    return Response.json(mezoGaugesHistorySchema.parse({ entries }), {
      headers: {
        ...MEZO_GAUGES_CORS_HEADERS,
        "Cache-Control": entries.every((entry) =>
          entry.snapshot.gauges.every((gauge) => gauge.status === "ok"),
        )
          ? "public, s-maxage=300"
          : "no-store",
      },
    })
  } catch (error) {
    console.error("Unable to build mezo gauges history", error)
    return Response.json(
      { error: "Unable to build history" },
      { status: 502, headers: MEZO_GAUGES_CORS_HEADERS },
    )
  }
}
