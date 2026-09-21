export { handler as GET, handler as OPTIONS }

import { fetchMezoGaugesLiquidity } from "@/lib/mezoGauges/liquidity"
import { MEZO_GAUGES_CORS_HEADERS } from "@/lib/mezoGauges/rpc"
import { mezoGaugesLiquiditySchema } from "@/lib/mezoGauges/schema"
import { createLogger } from "@repo/shared/logger"

const logger = createLogger("mezo-gauges-liquidity-api")

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
    logger.error({
      message: "Unable to build mezo gauges liquidity",
      error: error instanceof Error ? error.message : "unknown",
    })
    return Response.json(
      { error: "Unable to build liquidity" },
      { status: 502, headers: MEZO_GAUGES_CORS_HEADERS },
    )
  }
}
