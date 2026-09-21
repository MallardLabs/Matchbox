export { handler as GET, handler as OPTIONS }

import { findBlockAtOrBefore } from "@/lib/mezoGauges/blocks"
import {
  MEZO_GAUGES_CORS_HEADERS,
  createMezoMainnetClient,
} from "@/lib/mezoGauges/rpc"
import { buildParticipationSnapshot } from "@/lib/mezoGauges/snapshot"
import { createLogger } from "@repo/shared/logger"

const logger = createLogger("mezo-gauges-snapshot-api")

async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: MEZO_GAUGES_CORS_HEADERS,
    })
  }

  const atParam = new URL(request.url).searchParams.get("at")
  const at = atParam === null ? null : Number(atParam)
  if (atParam !== null && (!Number.isFinite(at) || (at ?? 0) <= 0)) {
    return Response.json(
      { error: "Invalid at parameter" },
      { status: 400, headers: MEZO_GAUGES_CORS_HEADERS },
    )
  }

  try {
    const client = createMezoMainnetClient()
    const blockNumber =
      at !== null ? (await findBlockAtOrBefore(client, at)).number : undefined
    const snapshot = await buildParticipationSnapshot({ client, blockNumber })
    return Response.json(snapshot, {
      headers: {
        ...MEZO_GAUGES_CORS_HEADERS,
        "Cache-Control":
          at !== null
            ? "public, s-maxage=31536000, immutable"
            : "public, s-maxage=60",
      },
    })
  } catch (error) {
    logger.error({
      message: "Unable to build mezo gauges snapshot",
      error: error instanceof Error ? error.message : "unknown",
    })
    return Response.json(
      { error: "Unable to build snapshot" },
      { status: 502, headers: MEZO_GAUGES_CORS_HEADERS },
    )
  }
}
