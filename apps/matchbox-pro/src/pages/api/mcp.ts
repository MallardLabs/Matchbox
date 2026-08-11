import {
  MCP_PROTOCOL_VERSION,
  handleStatelessMcpRequest,
} from "@repo/matchbox-mcp/transport"
import type { NextApiRequest, NextApiResponse } from "next"

function originAllowed(request: NextApiRequest): boolean {
  const origin = request.headers.origin
  if (!origin) return true
  const configured = (process.env.MATCHBOX_MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  const defaults = [
    "http://127.0.0.1:3002",
    "http://localhost:3002",
    "https://pro.matchbox.markets",
  ]
  return [...defaults, ...configured].includes(origin)
}

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse,
) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST")
    return response.status(405).end()
  }
  if (!originAllowed(request)) {
    return response.status(403).json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32000, message: "Origin is not allowed" },
    })
  }

  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === "string") headers.set(name, value)
    else if (Array.isArray(value)) headers.set(name, value.join(", "))
  }
  const result = await handleStatelessMcpRequest({
    body: request.body,
    headers,
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
  response.setHeader("Content-Type", "application/json; charset=utf-8")
  response.setHeader("Cache-Control", "no-store, max-age=0")
  response.setHeader("MCP-Protocol-Version", MCP_PROTOCOL_VERSION)
  return response.status(result.status).json(result.body)
}
