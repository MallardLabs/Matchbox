import { DEFAULT_GROQ_MODEL } from "@/server/groq"
import { MCP_PROTOCOL_VERSION } from "@repo/matchbox-mcp/transport"
import type { NextApiRequest, NextApiResponse } from "next"

export default function handler(
  request: NextApiRequest,
  response: NextApiResponse,
) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET")
    return response.status(405).end()
  }
  response.setHeader("Cache-Control", "no-store, max-age=0")
  return response.status(200).json({
    status: "ok",
    service: "stuart-query",
    mcpProtocolVersion: MCP_PROTOCOL_VERSION,
    groq: {
      configured: Boolean(process.env.GROQ_API_KEY),
      model: process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL,
    },
  })
}
