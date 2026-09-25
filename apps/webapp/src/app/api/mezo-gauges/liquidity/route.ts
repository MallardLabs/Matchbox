export { handler as GET, handler as OPTIONS }

import { fetchMezoGaugesLiquidity } from "@/lib/mezoGauges/liquidity"
import { MEZO_GAUGES_CORS_HEADERS } from "@/lib/mezoGauges/rpc"
import { mezoGaugesLiquiditySchema } from "@/lib/mezoGauges/schema"

async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: MEZO_GAUGES_CORS_HEADERS,
    })
  }

  try {
    const venues = await fetchMezoGaugesLiquidity()
    return Response.json(mezoGaugesLiquiditySchema.parse({ venues }), {
      headers: {
        ...MEZO_GAUGES_CORS_HEADERS,
        "Cache-Control": "public, s-maxage=300",
      },
    })
  } catch (error) {
    console.error("Unable to build mezo gauges liquidity", error)
    return Response.json(
      { error: "Unable to build liquidity" },
      { status: 502, headers: MEZO_GAUGES_CORS_HEADERS },
    )
  }
}
