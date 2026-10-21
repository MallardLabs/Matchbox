import { z } from "zod"

// Minimal Neon serverless-HTTP client (the protocol `@neondatabase/serverless`
// `neon()` speaks): one POST per read-only batch, every value as text. Kept
// dependency-free so the Pro Worker needs no driver; rows are validated by
// the callers' zod schemas.

export type SqlQuery = { text: string; params: unknown[] }

export type SqlRow = Record<string, string | null>

export class WarehouseUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = "WarehouseUnavailableError"
  }
}

const resultSchema = z.object({
  fields: z.array(z.object({ name: z.string() })),
  rows: z.array(z.array(z.string().nullable())),
})
const batchSchema = z.object({ results: z.array(resultSchema) })

/** `{a,b}` with quoting, for `= ANY($n::text[])` parameters. */
export function pgArray(values: readonly string[]): string {
  return `{${values
    .map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",")}}`
}

function serialize(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return pgArray(value.map(String))
  if (typeof value === "bigint" || typeof value === "number") {
    return value.toString()
  }
  if (typeof value === "boolean") return value ? "true" : "false"
  return String(value)
}

export function sqlEndpoint(connectionString: string): string {
  const host = new URL(connectionString).hostname
  return `https://${host.replace(/^[^.]+\./, "api.")}/sql`
}

/** Builds `$n` placeholders as values are added, in order. */
export function sqlParams(): {
  params: unknown[]
  add: (value: unknown) => string
} {
  const params: unknown[] = []
  return {
    params,
    add: (value) => {
      params.push(value)
      return `$${params.length}`
    },
  }
}

/** Several reads in one HTTP round trip, in one read-only transaction. */
export async function queryBatch(
  connectionString: string,
  queries: readonly SqlQuery[],
  fetcher: typeof fetch = fetch,
): Promise<SqlRow[][]> {
  let response: Response
  try {
    response = await fetcher(sqlEndpoint(connectionString), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Neon-Connection-String": connectionString,
        "Neon-Raw-Text-Output": "true",
        "Neon-Array-Mode": "true",
        "Neon-Batch-Read-Only": "true",
        "Neon-Batch-Isolation-Level": "RepeatableRead",
      },
      body: JSON.stringify({
        queries: queries.map((query) => ({
          query: query.text,
          params: query.params.map(serialize),
        })),
      }),
    })
  } catch (error) {
    throw new WarehouseUnavailableError("Warehouse unreachable", error)
  }
  if (!response.ok) {
    throw new WarehouseUnavailableError(`Warehouse HTTP ${response.status}`)
  }
  const parsed = batchSchema.safeParse(await response.json())
  if (!parsed.success) {
    throw new WarehouseUnavailableError("Warehouse response malformed")
  }
  return parsed.data.results.map((result) =>
    result.rows.map((row) =>
      Object.fromEntries(
        result.fields.map((field, index) => [field.name, row[index] ?? null]),
      ),
    ),
  )
}
