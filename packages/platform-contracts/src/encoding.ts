const encoder = new TextEncoder()
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false })

const base64UrlPattern = /^[A-Za-z0-9_-]*$/

export function utf8Encode(value: string): Uint8Array {
  return encoder.encode(value)
}

/** Decodes UTF-8, returning null for invalid byte sequences. */
export function utf8Decode(bytes: Uint8Array): string | null {
  try {
    return decoder.decode(bytes)
  } catch {
    return null
  }
}

/** Unpadded RFC 4648 §5 base64url. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")
}

/** Decodes unpadded base64url; returns null for malformed input. */
export function base64UrlDecode(value: string): Uint8Array | null {
  if (!base64UrlPattern.test(value) || value.length % 4 === 1) return null
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=")
  try {
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  } catch {
    return null
  }
}

export type JsonParseResult = { ok: true; value: unknown } | { ok: false }

/** Parses JSON text to `unknown` so callers must validate with zod. */
export function parseJson(text: string): JsonParseResult {
  try {
    const value: unknown = JSON.parse(text)
    return { ok: true, value }
  } catch {
    return { ok: false }
  }
}
