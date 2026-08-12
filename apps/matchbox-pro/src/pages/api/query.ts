import { runStuartQuery } from "@/server/stuart"
import { createLogger } from "@repo/shared/logger"
import type { NextApiRequest, NextApiResponse } from "next"
import { ZodError } from "zod"

const logger = createLogger("matchbox-pro:query")

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse,
) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST")
    return response.status(405).json({ error: "Method not allowed" })
  }

  try {
    const result = await runStuartQuery(request.body, {
      ...(process.env.GROQ_API_KEY ? { apiKey: process.env.GROQ_API_KEY } : {}),
      ...(process.env.GROQ_MODEL ? { model: process.env.GROQ_MODEL } : {}),
      allowDemoFallback: process.env.STUART_DEMO_FALLBACK === "true",
      ...(process.env.MATCHBOX_DATA_BASE_URL
        ? { dataBaseUrl: process.env.MATCHBOX_DATA_BASE_URL }
        : {}),
      ...(process.env.MEZO_RPC_URLS
        ? {
            rpcUrls: process.env.MEZO_RPC_URLS.split(",")
              .map((url) => url.trim())
              .filter(Boolean),
          }
        : {}),
    })
    response.setHeader("Cache-Control", "no-store, max-age=0")
    return response.status(200).json(result)
  } catch (error) {
    logger.error({
      message: "Stuart Query request failed",
      error: error instanceof Error ? error.message : String(error),
    })
    if (error instanceof ZodError) {
      return response.status(400).json({ error: "Invalid Query request" })
    }
    return response.status(500).json({ error: "Stuart Query failed" })
  }
}
