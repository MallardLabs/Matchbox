import { z } from "zod"
import { type Freshness, parseFreshness } from "./parse"
import { envelopeSchema } from "./schema"

// Fetch + validate for the history endpoints. A missing or not-yet-wired
// endpoint (404/501/503) is "unavailable", which pages render as an explicit
// state rather than zeros.

export type HistoryNetwork = "mezo" | "mezo-testnet"

export type QueryValue =
  | string
  | number
  | bigint
  | readonly string[]
  | undefined

export class HistoryHttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "HistoryHttpError"
    this.status = status
  }
}

const UNAVAILABLE_STATUSES = new Set([404, 501, 503])

export function isUnavailableError(error: unknown): boolean {
  return (
    error instanceof HistoryHttpError && UNAVAILABLE_STATUSES.has(error.status)
  )
}

export function historyUrl(
  path: string,
  params: Record<string, QueryValue> = {},
): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      if (value.length > 0) search.set(key, value.join(","))
    } else {
      search.set(key, String(value))
    }
  }
  const query = search.toString()
  return query ? `${path}?${query}` : path
}

export type Envelope<T> = {
  network: string
  generatedAt: string
  freshness: Freshness
  data: T
}

export async function fetchHistory<S extends z.ZodType, T>(
  url: string,
  dataSchema: S,
  parse: (wire: z.infer<S>) => T,
  signal: AbortSignal,
): Promise<Envelope<T>> {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new HistoryHttpError(
      response.status,
      `History request failed (${response.status})`,
    )
  }
  const body = envelopeSchema(z.unknown()).parse(await response.json())
  return {
    network: body.network,
    generatedAt: body.generatedAt,
    freshness: parseFreshness(body.freshness),
    data: parse(dataSchema.parse(body.data)),
  }
}
