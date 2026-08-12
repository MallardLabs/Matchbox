import { refreshProposal } from "@repo/matchbox-mcp"
import { createLogger } from "@repo/shared/logger"
import type { NextApiRequest, NextApiResponse } from "next"
import { ZodError } from "zod"

const logger = createLogger("matchbox-pro:proposal-refresh")

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse,
): Promise<void> {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST")
    response.status(405).json({ error: "Method not allowed" })
    return
  }

  try {
    const result = await refreshProposal(request.body, {
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
    response.status(200).json(result)
  } catch (error) {
    logger.error({
      message: "Proposal refresh failed",
      error: error instanceof Error ? error.message : String(error),
    })
    response
      .status(error instanceof ZodError ? 400 : 500)
      .json({ error: "Proposal refresh failed" })
  }
}
