import type { WireEnvelope, WireFreshness } from "../../features/history/schema"
import { ApiError } from "../router"

// Request parsing and response envelopes for the history routes. Errors are
// `{ error: <code>, message }` with high-level messages only.

export type HistoryErrorCode =
  | "invalid_address"
  | "invalid_request"
  | "unsupported_network"
  | "rpc_unavailable"
  | "warehouse_unavailable"

export class HistoryError extends ApiError {
  readonly code: HistoryErrorCode

  constructor(
    status: number,
    code: HistoryErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(status, message, cause)
    this.code = code
  }
}

export type CachePolicy =
  | { kind: "no-store" }
  | { kind: "private"; maxAge: number }
  | { kind: "shared"; sMaxAge: number; staleWhileRevalidate?: number }
  | { kind: "immutable" }

function cacheControl(policy: CachePolicy): string {
  switch (policy.kind) {
    case "no-store":
      return "no-store"
    case "private":
      return `private, max-age=${policy.maxAge}`
    case "shared":
      return policy.staleWhileRevalidate
        ? `public, max-age=0, s-maxage=${policy.sMaxAge}, stale-while-revalidate=${policy.staleWhileRevalidate}`
        : `public, max-age=0, s-maxage=${policy.sMaxAge}`
    case "immutable":
      return "public, max-age=31536000, s-maxage=31536000, immutable"
  }
}

const BASE_HEADERS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
}

export type HistoryNetworkParam = "mezo" | "mezo-testnet"

export function envelope<T>(
  network: HistoryNetworkParam,
  freshness: WireFreshness,
  data: T,
  policy: CachePolicy,
): Response {
  const body: WireEnvelope<T> = {
    network,
    generatedAt: new Date().toISOString(),
    freshness,
    data,
  }
  return new Response(JSON.stringify(body), {
    headers: { ...BASE_HEADERS, "cache-control": cacheControl(policy) },
  })
}

export function historyErrorResponse(error: HistoryError): Response {
  return new Response(
    JSON.stringify({ error: error.code, message: error.publicMessage }),
    {
      status: error.status,
      headers: { ...BASE_HEADERS, "cache-control": "no-store" },
    },
  )
}

/** Converts a handler's HistoryError into its JSON error response. */
export function withHistoryErrors<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args)
    } catch (error) {
      if (error instanceof HistoryError) return historyErrorResponse(error)
      if (error instanceof ApiError) {
        return historyErrorResponse(
          new HistoryError(
            error.status,
            error.status === 503 ? "rpc_unavailable" : "invalid_request",
            error.publicMessage,
          ),
        )
      }
      throw error
    }
  }
}

export const RPC_FRESHNESS: WireFreshness = {
  source: "rpc",
  indexedThroughBlock: null,
  indexedAt: null,
  headBlock: null,
  lagBlocks: null,
  lagSeconds: 0,
  state: "fresh",
}

export const UNAVAILABLE_FRESHNESS: WireFreshness = {
  source: "rpc",
  indexedThroughBlock: null,
  indexedAt: null,
  headBlock: null,
  lagBlocks: null,
  lagSeconds: null,
  state: "unavailable",
}

/** `mezo` (default) or the testnet, which has no history yet. */
export function parseNetwork(url: URL): HistoryNetworkParam {
  const raw = url.searchParams.get("network")
  if (raw === null || raw === "" || raw === "mezo" || raw === "mainnet") {
    return "mezo"
  }
  if (raw === "mezo-testnet" || raw === "testnet") return "mezo-testnet"
  throw new HistoryError(400, "unsupported_network", "Unsupported network.")
}

export function parseAddress(raw: string | undefined): `0x${string}` {
  if (!raw || !/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    throw new HistoryError(400, "invalid_address", "Invalid address.")
  }
  return raw.toLowerCase() as `0x${string}`
}

export function parseOptionalAddress(
  url: URL,
  name: string,
): `0x${string}` | undefined {
  const raw = url.searchParams.get(name)
  return raw ? parseAddress(raw) : undefined
}

export function parseInteger(
  url: URL,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = url.searchParams.get(name)
  if (raw === null || raw === "") return fallback
  if (!/^\d+$/.test(raw)) {
    throw new HistoryError(400, "invalid_request", `Invalid ${name}.`)
  }
  const value = Number(raw)
  if (value < min || value > max) {
    throw new HistoryError(400, "invalid_request", `Invalid ${name}.`)
  }
  return value
}

export function parseUint(url: URL, name: string): bigint | undefined {
  const raw = url.searchParams.get(name)
  if (raw === null || raw === "") return undefined
  if (!/^\d{1,78}$/.test(raw)) {
    throw new HistoryError(400, "invalid_request", `Invalid ${name}.`)
  }
  return BigInt(raw)
}

export function parseUintList(url: URL, name: string, max: number): bigint[] {
  const raw = url.searchParams.get(name)
  if (raw === null || raw === "") return []
  const parts = raw.split(",").map((part) => part.trim())
  if (parts.length > max || parts.some((part) => !/^\d{1,78}$/.test(part))) {
    throw new HistoryError(400, "invalid_request", `Invalid ${name}.`)
  }
  return parts.map((part) => BigInt(part))
}

export function parseList<T extends string>(
  url: URL,
  name: string,
  allowed: readonly T[],
): T[] {
  const raw = url.searchParams.get(name)
  if (raw === null || raw === "") return []
  const values = raw.split(",").map((part) => part.trim())
  const known = (value: string): value is T =>
    (allowed as readonly string[]).includes(value)
  const parsed = values.filter(known)
  if (parsed.length !== values.length) {
    throw new HistoryError(400, "invalid_request", `Invalid ${name}.`)
  }
  return parsed
}

/** Opaque cursor: base64url JSON. Malformed cursors are a 400. */
export function encodeCursor(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function decodeCursor(raw: string | null): unknown {
  if (raw === null || raw === "") return undefined
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/")
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch (error) {
    throw new HistoryError(400, "invalid_request", "Invalid cursor.", error)
  }
}
