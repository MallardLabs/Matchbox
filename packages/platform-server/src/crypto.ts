import {
  type ApiKeyKind,
  apiKeyDisplayPrefix,
  base62Alphabet,
  clientIdRandomLength,
  clientSecretDisplayPrefix,
  credentialPrefixLength,
  formatApiKey,
  formatClientId,
  formatClientSecret,
} from "@repo/platform-contracts/credentials"
import {
  base64UrlDecode,
  base64UrlEncode,
  utf8Encode,
} from "@repo/platform-contracts/encoding"
import type { EnvironmentKind } from "@repo/platform-contracts/network"

export { base64UrlDecode, base64UrlEncode }

const hexPattern = /^[0-9a-f]*$/

function toHex(bytes: Uint8Array): string {
  let hex = ""
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0")
  return hex
}

export function randomBytes(length: number): Uint8Array {
  if (!Number.isInteger(length) || length <= 0 || length > 65_536) {
    throw new Error("randomBytes length must be an integer in 1..65536")
  }
  return crypto.getRandomValues(new Uint8Array(length))
}

/** `bytes` of CSPRNG output as unpadded base64url. */
export function randomToken(bytes = 32): string {
  return base64UrlEncode(randomBytes(bytes))
}

/** Uniform base62 string via rejection sampling (no modulo bias). */
export function randomBase62(length: number): string {
  let output = ""
  while (output.length < length) {
    for (const byte of randomBytes(Math.max(length * 2, 16))) {
      // 248 = 62 * 4: accept only bytes that map uniformly.
      if (byte < 248) output += base62Alphabet[byte % 62]
      if (output.length === length) break
    }
  }
  return output
}

/** Uniform decimal digits (e.g. 6-digit email codes). */
export function randomDigits(length: number): string {
  let output = ""
  while (output.length < length) {
    for (const byte of randomBytes(Math.max(length * 2, 16))) {
      if (byte < 250) output += String(byte % 10)
      if (output.length === length) break
    }
  }
  return output
}

const hmacKeys = new Map<string, Promise<CryptoKey>>()

function hmacKey(pepper: string): Promise<CryptoKey> {
  const cached = hmacKeys.get(pepper)
  if (cached !== undefined) return cached
  const key = crypto.subtle.importKey(
    "raw",
    utf8Encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  hmacKeys.set(pepper, key)
  return key
}

/** HMAC-SHA256(pepper, value) as lower-case hex — the `*_hash` columns. */
export async function hmacHex(pepper: string, value: string): Promise<string> {
  if (pepper.length < 16) throw new Error("Pepper must be at least 16 chars")
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(pepper),
    utf8Encode(value),
  )
  return toHex(new Uint8Array(signature))
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", utf8Encode(value))
  return toHex(new Uint8Array(digest))
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", utf8Encode(value))
  return base64UrlEncode(new Uint8Array(digest))
}

/** Constant-time comparison of two hex digests (case-insensitive). */
export function timingSafeEqualHex(left: string, right: string): boolean {
  const a = left.toLowerCase()
  const b = right.toLowerCase()
  if (!hexPattern.test(a) || !hexPattern.test(b)) return false
  if (a.length !== b.length || a.length === 0) return false
  let difference = 0
  for (let index = 0; index < a.length; index++) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return difference === 0
}

/** Constant-time comparison for equal-length strings of any content. */
export function timingSafeEqualString(left: string, right: string): boolean {
  const a = utf8Encode(left)
  const b = utf8Encode(right)
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index++) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0)
  }
  return difference === 0
}

/** RFC 7636 S256: base64url(SHA-256(verifier)) === challenge. */
export async function verifyPkceS256(
  verifier: string,
  challenge: string,
): Promise<boolean> {
  return timingSafeEqualString(await sha256Base64Url(verifier), challenge)
}

// ---------------------------------------------------------------------------
// Credential generation (formats live in @repo/platform-contracts)
// ---------------------------------------------------------------------------

export type GeneratedCredential = {
  /** Full credential; show once, store only its HMAC. */
  value: string
  /** Unique DB lookup prefix (12 base62). */
  prefix: string
  /** Non-secret identifier for display. */
  displayPrefix: string
}

export function generateApiKey(
  kind: ApiKeyKind,
  environmentKind: EnvironmentKind,
): GeneratedCredential {
  const prefix = randomBase62(credentialPrefixLength)
  return {
    value: formatApiKey({
      kind,
      environmentKind,
      prefix,
      secret: randomToken(32),
    }),
    prefix,
    displayPrefix: apiKeyDisplayPrefix({ kind, environmentKind, prefix }),
  }
}

export function generateClientSecret(): GeneratedCredential {
  const prefix = randomBase62(credentialPrefixLength)
  return {
    value: formatClientSecret({ prefix, secret: randomToken(32) }),
    prefix,
    displayPrefix: clientSecretDisplayPrefix(prefix),
  }
}

export function generateClientId(environmentKind: EnvironmentKind): string {
  return formatClientId(environmentKind, randomBase62(clientIdRandomLength))
}

/** `mbx_` + 32 base64url characters (24 random bytes). */
export function generatePairwiseSubject(): string {
  return `mbx_${randomToken(24)}`
}

/** EIP-4361 nonce: alphanumeric, ≥ 8 chars. */
export function generateSiweNonce(): string {
  return randomBase62(24)
}

export function generateEmailCode(): string {
  return randomDigits(6)
}

/** Opaque bearer secret for sessions, auth codes and refresh tokens. */
export function generateOpaqueToken(): string {
  return randomToken(32)
}

export function generateRequestId(): string {
  return `req_${randomBase62(24)}`
}
