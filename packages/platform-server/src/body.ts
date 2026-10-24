import { parseJson } from "@repo/platform-contracts/encoding"
import { issuesFromZodError } from "@repo/platform-contracts/errors"
import type { Context } from "hono"
import type { z } from "zod"
import { PlatformError } from "./errors"

export const defaultMaxBodyBytes = 64 * 1024

export type BodyOptions = {
  maxBytes?: number
}

async function readBodyText(c: Context, maxBytes: number): Promise<string> {
  const declared = c.req.header("Content-Length")
  if (declared !== undefined && Number.parseInt(declared, 10) > maxBytes) {
    throw new PlatformError("invalid_request", {
      message: "Request body too large.",
    })
  }
  const text = await c.req.text()
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new PlatformError("invalid_request", {
      message: "Request body too large.",
    })
  }
  return text
}

/**
 * Reads and validates a JSON body. Throws `PlatformError("invalid_request")`
 * (400, with `issues`) for a wrong content type, oversize or malformed JSON,
 * or a schema mismatch.
 */
export async function jsonBody<Schema extends z.ZodType>(
  c: Context,
  schema: Schema,
  options: BodyOptions = {},
): Promise<z.output<Schema>> {
  const contentType = c.req.header("Content-Type") ?? ""
  if (!/^application\/json\b/i.test(contentType)) {
    throw new PlatformError("invalid_request", {
      message: "Expected application/json.",
    })
  }
  const text = await readBodyText(c, options.maxBytes ?? defaultMaxBodyBytes)
  const json = parseJson(text)
  if (!json.ok) {
    throw new PlatformError("invalid_request", { message: "Malformed JSON." })
  }
  const parsed = schema.safeParse(json.value)
  if (!parsed.success) {
    throw new PlatformError("invalid_request", {
      issues: issuesFromZodError(parsed.error),
    })
  }
  return parsed.data
}

export type FormBodyResult<Output> =
  | { ok: true; data: Output }
  | { ok: false; reason: "malformed" | "duplicate-parameter" | "invalid" }

/**
 * Reads an `application/x-www-form-urlencoded` body (OAuth endpoints) without
 * throwing, so callers can answer with RFC 6749 error bodies. Repeated
 * parameters are rejected (RFC 6749 §3.2).
 */
export async function formBody<Schema extends z.ZodType>(
  c: Context,
  schema: Schema,
  options: BodyOptions = {},
): Promise<FormBodyResult<z.output<Schema>>> {
  const contentType = c.req.header("Content-Type") ?? ""
  if (!/^application\/x-www-form-urlencoded\b/i.test(contentType)) {
    return { ok: false, reason: "malformed" }
  }
  let text: string
  try {
    text = await readBodyText(c, options.maxBytes ?? defaultMaxBodyBytes)
  } catch {
    return { ok: false, reason: "malformed" }
  }
  const params = new URLSearchParams(text)
  const values: Record<string, string> = {}
  for (const [key, value] of params) {
    if (key in values) return { ok: false, reason: "duplicate-parameter" }
    if (value.length > 0) values[key] = value
  }
  const parsed = schema.safeParse(values)
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, reason: "invalid" }
}

/** Validates query parameters (single-valued) or throws invalid_request. */
export function queryParams<Schema extends z.ZodType>(
  c: Context,
  schema: Schema,
): z.output<Schema> {
  const parsed = schema.safeParse(c.req.query())
  if (!parsed.success) {
    throw new PlatformError("invalid_request", {
      issues: issuesFromZodError(parsed.error),
    })
  }
  return parsed.data
}

/** Validates route params or throws not_found (a bad id cannot exist). */
export function pathParams<Schema extends z.ZodType>(
  c: Context,
  schema: Schema,
): z.output<Schema> {
  const parsed = schema.safeParse(c.req.param())
  if (!parsed.success) throw new PlatformError("not_found")
  return parsed.data
}
