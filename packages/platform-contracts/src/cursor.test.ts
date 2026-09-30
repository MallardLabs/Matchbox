import { describe, expect, it } from "vitest"
import { z } from "zod"
import { createCursorCodec } from "./cursor"
import {
  base64UrlDecode,
  base64UrlEncode,
  parseJson,
  utf8Encode,
} from "./encoding"

describe("base64url", () => {
  it("round-trips arbitrary bytes without padding", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255])
    const encoded = base64UrlEncode(bytes)
    expect(encoded).not.toMatch(/[+/=]/)
    expect(base64UrlDecode(encoded)).toEqual(bytes)
    expect(base64UrlEncode(new Uint8Array([]))).toBe("")
  })

  it("rejects malformed input", () => {
    expect(base64UrlDecode("a+b/")).toBeNull()
    expect(base64UrlDecode("abcde")).toBeNull()
    expect(base64UrlDecode("ab==")).toBeNull()
  })
})

describe("parseJson", () => {
  it("returns a result instead of throwing", () => {
    expect(parseJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } })
    expect(parseJson("{")).toEqual({ ok: false })
  })
})

describe("createCursorCodec", () => {
  const codec = createCursorCodec(
    z.object({ v: z.literal(1), at: z.string(), id: z.number() }),
  )

  it("round-trips values", () => {
    const cursor = codec.encode({ v: 1, at: "2026-09-30", id: 7 })
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(codec.decode(cursor)).toEqual({ v: 1, at: "2026-09-30", id: 7 })
  })

  it("returns null for foreign or tampered cursors", () => {
    expect(codec.decode("")).toBeNull()
    expect(codec.decode("!!!")).toBeNull()
    expect(codec.decode(base64UrlEncode(utf8Encode("not json")))).toBeNull()
    expect(
      codec.decode(base64UrlEncode(utf8Encode('{"v":2,"at":"x","id":1}'))),
    ).toBeNull()
    expect(
      codec.decode(base64UrlEncode(new Uint8Array([0xff, 0xfe]))),
    ).toBeNull()
    expect(codec.decode("a".repeat(2000))).toBeNull()
  })
})
