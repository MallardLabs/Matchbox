import type { z } from "zod"
import {
  base64UrlDecode,
  base64UrlEncode,
  parseJson,
  utf8Decode,
  utf8Encode,
} from "./encoding"

export type CursorCodec<Value> = {
  encode(value: Value): string
  /** Returns null for anything that is not a cursor this codec produced. */
  decode(cursor: string): Value | null
}

const maxCursorLength = 1024

/**
 * Opaque cursor codec: base64url(JSON(value)), validated with `schema` on
 * decode. Cursors are not signed; treat decoded values as untrusted input.
 */
export function createCursorCodec<Schema extends z.ZodType>(
  schema: Schema,
): CursorCodec<z.output<Schema>> {
  return {
    encode(value) {
      return base64UrlEncode(utf8Encode(JSON.stringify(value)))
    },
    decode(cursor) {
      if (cursor.length === 0 || cursor.length > maxCursorLength) return null
      const bytes = base64UrlDecode(cursor)
      if (bytes === null) return null
      const text = utf8Decode(bytes)
      if (text === null) return null
      const json = parseJson(text)
      if (!json.ok) return null
      const parsed = schema.safeParse(json.value)
      return parsed.success ? parsed.data : null
    },
  }
}
