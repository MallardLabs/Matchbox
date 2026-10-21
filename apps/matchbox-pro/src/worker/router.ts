// Shared plumbing for the Pro Worker BFF. Each area registers its routes in
// its own file under ./routes so features can add endpoints independently.

export type WorkerEnv = {
  ASSETS?: {
    fetch: typeof fetch
  }
  BASE_RPC_URL?: string | undefined
  MEZO_RPC_URL?: string | undefined
  GROQ_API_KEY?: string | undefined
  GROQ_MODEL?: string | undefined
  MATCHBOX_API_ORIGIN?: string | undefined
}

export type ApiMethod = "GET" | "POST"

export type ApiContext = {
  request: Request
  url: URL
  env: WorkerEnv
  params: Record<string, string>
}

export type ApiRoute = {
  method: ApiMethod
  /** Exact path ("/api/health") or a pattern with `:name` segments. */
  path: string
  handler: (context: ApiContext) => Promise<Response>
}

export class ApiError extends Error {
  readonly status: number
  readonly publicMessage: string

  constructor(status: number, publicMessage: string, cause?: unknown) {
    super(publicMessage, { cause })
    this.status = status
    this.publicMessage = publicMessage
  }
}

// Per-isolate memo so back-to-back requests reuse one set of RPC reads. Only
// settled values are kept: Workers can't share in-flight I/O across requests.
const memo = new Map<string, { expires: number; value: unknown }>()

export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = memo.get(key)
  if (hit && hit.expires > Date.now()) return hit.value as T
  const value = await load()
  memo.set(key, { expires: Date.now() + ttlMs, value })
  return value
}

export function json(data: unknown, maxAgeSeconds?: number): Response {
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      ...(maxAgeSeconds
        ? { "cache-control": `public, max-age=${maxAgeSeconds}` }
        : { "cache-control": "no-store" }),
    },
  })
}

export function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  })
}

function matchPath(
  pattern: string,
  pathname: string,
): Record<string, string> | null {
  const patternParts = pattern.split("/")
  const pathParts = pathname.split("/")
  if (patternParts.length !== pathParts.length) return null
  const params: Record<string, string> = {}
  for (const [index, part] of patternParts.entries()) {
    const actual = pathParts[index] ?? ""
    if (part.startsWith(":")) {
      if (!actual) return null
      params[part.slice(1)] = decodeURIComponent(actual)
    } else if (part !== actual) {
      return null
    }
  }
  return params
}

export function createApiHandler(routes: ApiRoute[]) {
  return async function handleApiRequest(
    request: Request,
    env: WorkerEnv = {},
  ): Promise<Response | null> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith("/api/")) return null

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      })
    }

    for (const route of routes) {
      if (route.method !== request.method) continue
      const params = matchPath(route.path, url.pathname)
      if (!params) continue
      try {
        return await route.handler({ request, url, env, params })
      } catch (error) {
        if (error instanceof ApiError) {
          return errorResponse(error.status, error.publicMessage)
        }
        console.error(
          JSON.stringify({
            message: "Unhandled API error",
            path: url.pathname,
            error: error instanceof Error ? error.message : String(error),
          }),
        )
        return errorResponse(502, "Upstream data is unavailable right now.")
      }
    }
    return errorResponse(404, "Not found")
  }
}
