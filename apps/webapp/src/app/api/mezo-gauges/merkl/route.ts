export { handler as GET, handler as OPTIONS }

import { findBlockAtOrBefore } from "@/lib/mezoGauges/blocks"
import { fetchMerklCampaigns, fetchMerklClaims } from "@/lib/mezoGauges/merkl"
import {
  MEZO_GAUGES_CORS_HEADERS,
  createMezoMainnetClient,
} from "@/lib/mezoGauges/rpc"
import { mezoGaugesMerklSchema } from "@/lib/mezoGauges/schema"

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
    const toBlock =
      at !== null ? (await findBlockAtOrBefore(client, at)).number : undefined
    const [campaigns, claims] = await Promise.all([
      fetchMerklCampaigns(),
      fetchMerklClaims({ client, toBlock }),
    ])
    return Response.json(mezoGaugesMerklSchema.parse({ campaigns, claims }), {
      headers: {
        ...MEZO_GAUGES_CORS_HEADERS,
        "Cache-Control": "public, s-maxage=300",
      },
    })
  } catch (error) {
    console.error("Unable to build mezo gauges merkl data", error)
    return Response.json(
      { error: "Unable to build merkl data" },
      { status: 502, headers: MEZO_GAUGES_CORS_HEADERS },
    )
  }
}
