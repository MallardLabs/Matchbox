export { handler as GET, handler as OPTIONS }

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const

function handler(request: Request): Response {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  return new Response(
    JSON.stringify({ success: false, error: "indexed academy is off" }),
    {
      status: 410,
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
    },
  )
}
