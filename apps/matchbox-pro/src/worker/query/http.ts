import type { StuartError } from "../../features/query/contract"

// Stuart's POST routes are same-origin only. They never carry the router's
// blanket `access-control-allow-origin: *`.

export type StuartErrorCode = StuartError["error"]["code"]

export class StuartHttpError extends Error {
  readonly status: number
  readonly code: StuartErrorCode
  readonly retryAfterSeconds: number | null

  constructor(
    status: number,
    code: StuartErrorCode,
    message: string,
    retryAfterSeconds: number | null = null,
  ) {
    super(message)
    this.status = status
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}

const BASE_HEADERS = {
  "content-type": "application/json",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  vary: "Origin",
} as const

export function stuartJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: BASE_HEADERS })
}

export function stuartError(error: StuartHttpError): Response {
  const body: StuartError = {
    error: {
      code: error.code,
      message: error.message,
      retryAfterSeconds: error.retryAfterSeconds,
    },
  }
  return new Response(JSON.stringify(body), {
    status: error.status,
    headers: {
      ...BASE_HEADERS,
      ...(error.retryAfterSeconds !== null
        ? { "retry-after": String(error.retryAfterSeconds) }
        : {}),
    },
  })
}

function hostOf(value: string): string | null {
  try {
    return new URL(value).host
  } catch {
    return null
  }
}

// Browsers always send Origin on a cross-site POST, and Sec-Fetch-Site on
// modern engines. Requests without either (curl, server-to-server) are not a
// CSRF vector and are allowed; rate limits still apply.
export function assertSameOrigin(
  request: Request,
  allowedOrigins: readonly string[],
): void {
  const fetchSite = request.headers.get("sec-fetch-site")
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new StuartHttpError(403, "forbidden_origin", "Origin not allowed.")
  }
  const origin = request.headers.get("origin")
  if (!origin) return
  const requestHost =
    request.headers.get("host") ?? hostOf(request.url) ?? undefined
  if (hostOf(origin) === requestHost) return
  if (allowedOrigins.includes(origin)) return
  throw new StuartHttpError(403, "forbidden_origin", "Origin not allowed.")
}

export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? ""
  if (!/^application\/json\b/i.test(contentType)) {
    throw new StuartHttpError(
      415,
      "unsupported_media_type",
      "Send application/json.",
    )
  }
  const declared = Number.parseInt(
    request.headers.get("content-length") ?? "",
    10,
  )
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new StuartHttpError(413, "payload_too_large", "Request is too large.")
  }
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new StuartHttpError(413, "payload_too_large", "Request is too large.")
  }
  try {
    const value: unknown = JSON.parse(text)
    return value
  } catch {
    throw new StuartHttpError(400, "invalid_request", "Body is not valid JSON.")
  }
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  )
}
